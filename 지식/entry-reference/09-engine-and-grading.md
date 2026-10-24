# 09. Entry 엔진 상태머신 & 자동 채점

> 엔트리 공식 문서에 명시되지 않은 **`Entry.engine`의 내부 상태머신**과, 그 위에서 동작하는 CODE 205의 **자동 채점 흐름**을 정리합니다. `entry.min.js` 역공학 + `public/js/editor.js` 실제 구현 기준. 채점 버그를 디버깅하거나 채점 엔진을 건드릴 때 먼저 읽으세요.

---

## 1. `Entry.engine` 상태머신

`entry.min.js` 내부에서 엔진 상태는 4개 문자열 상수로 관리됩니다 (minify 전 변수명 기준):

| 상수 | 값 | 의미 |
|---|---|---|
| `p` | `"stop"` | 정지 (스냅샷 복원 완료, 실행 가능 상태) |
| `y` | `"stopping"` | **정지 진행 중** (toggleStop이 await 중인 과도 상태) |
| `f` | `"pause"` | 일시정지 |
| `g` | `"run"` | 실행 중 |

상태 확인은 `Entry.engine.isState(s)` → 내부적으로 `this.state.indexOf(s) > -1`.

```js
Entry.engine.state            // 현재 상태 문자열
Entry.engine.isState("stop")  // true/false
```

### 핵심: `toggleStop()`은 **비동기**다

`Entry.engine.toggleStop()`은 generator 기반 async 함수입니다. 호출하면:

1. **동기적으로** `state = "stopping"` 설정 + `dispatchEvent("beforeStop")`
2. `await Promise.all(this.execPromises)` — 실행 중이던 블록 스레드들이 끝나길 대기
3. cleanup: 엔티티·변수·리스트 스냅샷 복원, 스레드 종료, 사운드 정지, 타이머 정리 등
4. **마지막에** `state = "stop"` 설정 + `dispatchEvent("stop")`

즉 `toggleStop()` 호출 직후의 `state`는 `"stop"`이 아니라 **`"stopping"`**이며, 진짜 `"stop"`이 되기까지 한 틱 이상 걸립니다.

### `toggleRun()`의 분기

`Entry.engine.toggleRun()`은:

```
if (state === "pause")  → togglePause() 후 리턴
...
if (state === "stop")   → 엔티티/변수/리스트 takeSnapshot()
                          + fireEvent("start")      ← 스크립트 실행 트리거
state = "run"
```

**중요**: `takeSnapshot()` + `fireEvent("start")`는 **`state === "stop"` 분기 안에서만** 실행됩니다. 만약 `state === "stopping"`(아직 정지 진행 중)일 때 `toggleRun()`을 호출하면, 이 분기를 통째로 건너뛰고 `state = "run"`만 설정합니다 → **스크립트가 실제로 실행되지 않음**.

---

## 2. 이 상태머신이 만든 실제 버그 (2026-05, 수정 완료)

**증상**: 사용자가 작품을 ▶로 실행해 둔 상태에서 "테스트하기"/"제출하기"를 누르면 **첫 번째 테스트 케이스가 무조건 오답** 처리.

**원인**:
- 채점 첫 케이스의 `engineInternalStop()`이 `toggleStop()`을 호출 → `state = "stopping"`(비동기, 아직 안 끝남)
- 곧바로 `engineInternalRun()`이 `toggleRun()` 호출 → `state === "stopping"`이라 `fireEvent("start")` 분기 skip → 스크립트 미실행
- 폴링 루프가 "실행할 블록 없음(no executors)"을 즉시 감지 → 빈 출력으로 채점 → 오답

**수정** (`public/js/editor.js`의 `waitForEngineStop()`): 채점 시작 전과 각 케이스 사이에 **`state === "stop"`이 될 때까지 폴링 대기**.

```js
function waitForEngineStop() {
    return new Promise(function (resolve) {
        if (!window.Entry || !Entry.engine) return resolve();
        if (Entry.engine.state === 'stop') return resolve();
        if (Entry.engine.state === 'run') {
            // 실행 중이면 정지 트리거 (internal 플래그로 가드 우회)
            GradingState.engine.internal = true;
            try {
                var p = Entry.engine.toggleStop();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            } catch (e) {}
            finally { GradingState.engine.internal = false; }
        }
        var attempts = 0;
        var iv = setInterval(function () {
            if (!window.Entry || !Entry.engine || Entry.engine.state === 'stop' || attempts > 200) {
                clearInterval(iv);
                resolve();
            }
            attempts++;
        }, 20);  // 20ms × 최대 200회 = 4초 상한
    });
}
```

**교훈**: 엔진을 정지→실행 토글할 때는 **반드시 `state === "stop"`을 확인한 뒤** `toggleRun()`을 호출할 것. `toggleStop()` 직후 동기적으로 `toggleRun()`하면 안 됨.

---

## 3. CODE 205 채점 흐름 (`public/js/editor.js`)

### GradingState — 모든 채점 상태 한 곳에 모음

```js
var GradingState = {
    problemId: null,       // 채점 대상 문제 (없으면 자유모드)
    isRunning: false,      // runAllTests 진입~체인 완료까지 true (사용자 입력 차단)
    cancelled: false,      // "채점 중단" 클릭 시 true
    currentCancel: null,   // 현재 케이스 취소 콜백
    engine: {
        origStop: null,    // 원본 Entry.engine.toggleStop
        origRun: null,     // 원본 Entry.engine.toggleRun
        internal: false    // 채점 코드가 엔진을 제어 중일 때 true (가드 우회)
    },
    prevTurbo: null        // 채점 전 사용자의 Entry.isTurbo 값
};
```

### 엔진 제어 가드 — 채점 중 사용자 ▶/■ 무시

`installEngineGuard()`가 `Entry.engine.toggleStop/toggleRun`을 래핑:

```js
Entry.engine.toggleStop = function () {
    // 채점 중(isRunning)인데 채점 코드가 부른 게 아니면(internal=false) 무시
    if (GradingState.isRunning && !GradingState.engine.internal) return;
    return GradingState.engine.origStop.apply(this, arguments);
};
```

채점 코드는 `engineInternalStop()`/`engineInternalRun()`으로 `internal=true`를 세우고 엔진을 제어 → 가드를 우회. 사용자의 키보드/버튼 입력은 `isRunning` 동안 차단.

### 한 케이스의 실행 (`runSingleTest`)

1. `engineInternalStop()` — 깨끗한 상태에서 시작
2. `installTestHooks(testCase)` — `Entry.Dialog`(say/think 출력 캡처) + `Entry.toast`(경고 캡처) 후킹, 채점용 대기 가속 설치
3. `applyTestSetup(setup)` — 변수·리스트 초기값 주입
4. `engineInternalRun()` — 실행
5. `applyTestSetup(setup)` **재호출** — 파이썬 모드는 `toggleRun()` 중 code→block 변환하며 변수를 덮어쓰므로 재주입 필요
6. 폴링(`setInterval`): cancelled / 경고 발생 / 모든 executor 종료(no more work) / 타임아웃 중 하나까지
7. settle 대기(`POST_STOP_CAPTURE_DELAY_MS`) → 상태 캡처 → `evaluateTest` → resolve

### 전체 흐름 (`runAllTests`)

```js
GradingState.isRunning = true;
Entry.isTurbo = true;                  // 채점 중 터보 ON (루프 많은 풀이 타임아웃 방지)
var chain = waitForEngineStop();       // ★ 시작 전 엔진 완전 정지 보장
cases.forEach(function (tc, idx) {
    chain = chain
        .then(() => runSingleTest(tc))
        .then(saveResult)
        .then(() => waitForEngineStop());  // ★ 케이스 사이에도 drain
});
chain.then(() => {
    GradingState.isRunning = false;
    restoreTurboState();               // 사용자 원래 isTurbo 복원
    // submit + 전체통과 시에만 "문제 선택으로" 버튼 노출 + 정답 저장
});
```

### 타이밍 상수 (`CONFIG`)

| 상수 | 기본값 | 용도 |
|---|---|---|
| `DEFAULT_TEST_TIMEOUT_MS` | 5000 | 케이스별 타임아웃 (testcase.timeout으로 개별 override 가능) |
| `GRADING_BLOCK_DELAY_MS` | 10 | 채점 중 시간 지정 말하기·생각하기·기다리기의 최대 예약 대기 시간 |
| `GRADING_POLL_INTERVAL_MS` | 100 | 엔진 완료/타임아웃 폴링 주기 |
| `POST_STOP_CAPTURE_DELAY_MS` | 300 | 엔진 종료 후 say/think·setValue 정착 대기 |
| `POST_CAPTURE_EVAL_DELAY_MS` | 50 | 상태 캡처 후 evaluateTest 전 대기 |

---

## 4. 채점 중 출력 캡처 메커니즘

### 채점용 대기 가속 (2026-10-24)

38번 구구단 2단의 정답은 1초 말하기를 9번 실행하므로 기본 5초 제한에서 시간 초과가 발생했다. 64번 구구단 N단과 여러 줄 출력 문제도 같은 원인이 있다.

`public/js/grading-timing.js`가 케이스마다 `dialog_time`·`wait_second` 블록 실행 함수를 임시로 감싼다. 해당 블록의 동기 실행 중에만 `Entry.engine.setTimeout` 또는 `Entry.TimeWaitManager.add`로 예약하는 유한한 양수 대기를 최대 10ms로 제한한다. 엔진 프레임 간격에 따라 실제 경과 시간은 더 길 수 있다. 다른 블록의 타이머와 채점기의 실제 5초 제한은 유지한다.

`runSingleTest.finish()`의 후킹 복원 경로에서 정답·오답·시간 초과·런타임 경고·채점 중단 모두 원래 블록 함수로 되돌린다. 프로젝트의 블록 값과 파이썬 소스는 수정하지 않으므로 일반 ▶ 실행과 내보내기는 원래 시간을 유지한다. 실제 시간이 정답에 영향을 주는 문제의 `fastDelays: false` 설정은 [문제 작성 가이드](../../PROBLEM_GUIDE.md#타임아웃)를 참고한다.

### 출력과 상태 수집

- **say/think/yell 출력**: `Entry.Dialog`를 래핑해 `sayLog[]`에 누적. `expected.say` 배열과 부분 일치 비교.
- **경고/오류**: `Entry.toast.warning`/`alert`를 래핑해 첫 경고를 에러 신호로 캡처 (런타임 에러 = 오답).
- **묻고 기다리기 자동 응답**: `setup.variables["대답"]`이 있으면 폴링 루프에서 `Entry.container.inputValue.complete === false`일 때 `Entry.container.setInputValue(answer)`로 자동 입력 (canvas 입력이라 DOM이 아님).
- **변수/리스트 최종값**: 실행 후 `Entry.variableContainer`에서 스냅샷 → `expected.variables`/`expected.lists`와 비교.

---

## 5. 디버깅 체크리스트

| 증상 | 의심 지점 |
|---|---|
| 첫 케이스만 오답, 나머지 정답 | `waitForEngineStop` 누락 / 엔진이 `stopping`에서 run됨 (§2) |
| 모든 케이스 타임아웃 | `Entry.isTurbo`가 채점 중 false / 무한 루프 풀이 |
| 출력이 항상 빈 배열 | `Entry.Dialog` 후킹 실패 / `fireEvent("start")` 안 됨 (스크립트 미실행) |
| 묻고 기다리기에서 멈춤 | `setup.variables["대답"]` 누락 / `setInputValue` 타이밍 |
| 채점 후 사용자 ▶ 안 됨 | `isRunning`이 false로 안 풀림 / 가드 해제 실패 |
| 파이썬 모드에서만 오답 | `applyTestSetup` 재호출 누락 (toggleRun이 변수 덮어씀) |

> 우리 코드 참조: `public/js/editor.js`의 `runAllTests` / `runSingleTest` / `waitForEngineStop` / `installEngineGuard` / `installTestHooks`.
