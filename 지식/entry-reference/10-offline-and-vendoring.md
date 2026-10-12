# 10. 오프라인화 & 외부 라이브러리 Vendoring

> 에디터(`public/editor.html`)가 의존하던 외부 CDN 스크립트를 **전부 로컬 번들(vendoring)** 한 작업의 배경·구조·검증 방법. 메모리 원칙 "완전 오프라인 동작"의 실제 구현. 2026-05 CDN 장애 분석 포함.

---

## 1. 한 줄 요약

에디터가 `playentry.org/lib/*`·`unpkg.com`에서 런타임 로드하던 **범용 라이브러리 20개**를 `public/lib/vendor/` 아래로 번들 → 외부 요청 0건, 완전 오프라인 동작.

---

## 2. 왜 했나 — 2026-05-29 CDN 장애

**증상**: 에디터 진입 시 작업영역이 **빈 흰 화면** + 좌측 문제 패널이 **"문제를 불러오는 중..."에서 멈춤**. 로컬·라이브(`code.205.kr`) 동시 발생.

**원인**: playentry.org가 `/lib/` 경로 구조를 **평탄화**하면서 editor.html이 참조하던 URL이 404가 됨:

| 라이브러리 | 깨진 경로 | 신규 경로 |
|---|---|---|
| lodash | `/lib/lodash/dist/lodash.min.js` | `/lib/lodash/lodash.min.js` |
| jQuery UI | `/lib/jquery-ui/ui/minified/jquery-ui.min.js` | `/lib/jquery-ui/jquery-ui.min.js` |
| JSHint | `/js/jshint.js` | **완전히 사라짐** (SPA 404 폴백 HTML 반환) |

**왜 치명적이었나**: `entry.min.js`는 lodash를 **webpack external 전역**으로 씁니다. 번들 안에 `e.exports=_` (전역 `_`를 그대로 재노출) 패턴이 있어서, CDN lodash가 404면 `_`가 `undefined` → 모든 `_.map`/`_.filter` 호출이 크래시 → **`Entry.init()` 전체 실패** → 작업영역 미렌더 + `$(document).ready` 내부 초기화 중단으로 문제 로딩도 멈춤.

**1차 복구** (PR #6): editor.html의 lodash·jquery-ui URL을 신규 경로로 갱신 → 긴급 복구. 하지만 나머지 18개도 같은 취약점이 남음.

**근본 수정** (PR #7): 20개 전부 로컬 vendoring → 외부 의존 제거.

> **핵심 교훈**: playentry.org URL은 **버전이 안 박혀 있어**(`/lib/lodash/lodash.min.js`) 그쪽이 경로/버전을 바꾸면 우리가 통째로 깨진다. 외부 CDN 의존은 우리 서비스 가용성을 남의 손에 맡기는 것.

---

## 3. 의존 인벤토리 (vendoring 대상 20개)

`public/lib/vendor/` 아래 구조 + 버전. **모두 화석 버전 — 올리면 Entry가 깨진다.**

| 분류 | 파일 | 버전 | 용도 | 끊기면 |
|---|---|---|---|---|
| createjs | preloadjs / easeljs / soundjs / flashaudioplugin | 0.6.0 / 0.8.0 / 0.6.0 | 캔버스 렌더·사운드 | 무대 렌더 전체 실패 |
| **lodash** | lodash.min.js | 4.17.x | 전역 `_` (webpack external) | **에디터 전체 크래시** |
| **jQuery** | jquery.min.js | **1.9.1** | 전역 `$` | **에디터 전체 크래시** |
| jQuery UI | jquery-ui.min.js | 1.10.4 | 블록 드래그·정렬 | 드래그 불가 |
| Velocity | velocity.min.js | 1.2.3 | 애니메이션 | 애니메이션 깨짐 |
| CodeMirror | codemirror.js + addon 5개 | 5.12.0 | 파이썬 모드 텍스트 에디터 | 파이썬 모드 깨짐 |
| JSHint | jshint.js | **2.9.5 (cdnjs)** | 코드 린트 (보조) | 린트만 저하 |
| fuzzy | fuzzy.js | — | 블록 검색 자동완성 | 검색 저하 |
| python | python.js | — | CodeMirror Python mode + Entry 연동 | 파이썬 모드 깨짐 |
| socket.io | socket.io.js | — | 실시간 협업 소켓 | (우리 미사용) |
| React | react / react-dom .production.min.js | **18.3.1** | entry-tool UI 패널(팝업·페인트·소리) | 팝업·편집기 깨짐 |

**출처**: jshint·react를 제외하면 전부 playentry.org가 주는 바이트를 그대로 복사 (패치 빌드 리스크 0).
- **JSHint**: `playentry.org/js/jshint.js`가 이미 죽어(SPA HTML 반환) cdnjs 2.9.5로 대체. era(jQuery 1.9 시절)에 맞는 표준 버전. `window.JSHINT` 전역 제공.
- **React**: unpkg `@18`은 매번 최신 18.x로 해석되므로 `@18.3.1`로 고정 다운로드.

### 디렉터리 구조

```
public/lib/vendor/
├── createjs/{preloadjs,easeljs,soundjs,flashaudioplugin}-*.min.js
├── lodash/lodash.min.js
├── jquery/jquery.min.js
├── jquery-ui/jquery-ui.min.js
├── velocity/velocity.min.js
├── codemirror/lib/codemirror.js
├── codemirror/addon/{hint/show-hint,hint/javascript-hint,lint/lint,selection/active-line}.js
├── codemirror/mode/javascript/javascript.js
├── jshint/jshint.js
├── fuzzy/fuzzy.js
├── python/python.js
├── socket.io-client/socket.io.js
└── react/{react,react-dom}.production.min.js
```

---

## 4. 무엇이 이미 안전했나 (vendoring 불필요)

스크립트 태그만 로컬로 바꾸면 되는 이유 — Entry 런타임은 추가 외부 호출을 거의 안 함:

| 항목 | 확인 |
|---|---|
| Entry 내부 에셋·워커 | `window.PUBLIC_PATH_FOR_ENTRYJS = 'lib/entry-js/dist/'` (로컬 상대경로). `new Worker(getEntryjsPath()...)`도 이 로컬 경로에서 로드 |
| Entry API baseUrl | `baseUrl = location.origin \|\| "https://playentry.org"` — 브라우저에선 항상 우리 도메인. playentry는 죽은 fallback |
| 서버(src/) | playentry.org 등 외부 호출 **전혀 없음**. export.js의 playentry 언급은 주석뿐 |
| 에디터 CSS | entry CSS 3종 + common/editor 모두 로컬 |
| 폰트 | NanumGothic은 `@font-face` 없이 시스템 폰트 fallback. 외부 로딩 없음 |
| 정적 페이지 자산 | index·contribute 등의 외부 참조는 `<a href>`/canonical뿐, 런타임 의존 아님 |

### 남은 외부 호출 leak (비치명적, 비활성 기능)

| 출처 | 트리거 조건 |
|---|---|
| `io("play04.play-entry.com:7000")` | 하드웨어 소켓. `localhost`에선 `io("localhost:7000")` 분기 + `hardwareEnable:false`로 비활성. 운영에서도 연결 실패는 비치명적(async catch) |
| 하드웨어 벤더 URL (robotis 등) | 하드웨어 블록 메타데이터일 뿐 — 비활성 |
| 동적 `createElement("script")` 4곳 | 확장/AI/하드웨어 동적 로딩 — 전부 init 옵션으로 비활성 |

---

## 5. 오프라인화 검증 방법 (유일한 진짜 기준)

**스크립트 태그만 보고 "다 됐다" 하면 안 됨.** 런타임 leak(소켓·동적 주입)을 놓친다.

1. preview/브라우저로 `/editor.html?problem=1` 로드
2. **DevTools 네트워크 탭 → 외부 도메인(playentry.org·unpkg.com·cdnjs) 요청이 0건인지 확인** ← 이게 핵심
3. 전역 정의 확인: `window._`·`jQuery.ui`·`createjs`·`React`·`CodeMirror`·`JSHINT`·`Entry`
4. `Entry.engine.state === "stop"`, 작업영역 렌더(`#workspace` 자식 > 0), 문제 설명 로드
5. 파이썬 모드 전환 → `.CodeMirror` 인스턴스 생성 확인
6. 콘솔 에러 0
7. (강력) DevTools를 **Offline**로 두고 새로고침 → 에디터가 끝까지 뜨면 진짜 오프라인 달성
8. `npm test` 회귀 없음

---

## 6. 유지보수 주의사항

- **버전 절대 올리지 말 것**: jQuery 1.9.1·CodeMirror 5.12·createjs 0.6 등은 Entry가 빌드된 시점 기준. 최신으로 올리면 Entry가 깨진다.
- **Entry 라이브러리를 추가/업글할 때**: 새 의존이 생기면 반드시 vendor에 넣고, editor.html에 `<script src="https://...">`(외부 절대경로)가 **다시 생기지 않게** 할 것. 외부 절대경로 1개라도 들어오면 오프라인 원칙이 깨진다.
- **vendor 파일은 git 커밋 대상** (gitignore 제외 아님). 기존 entry-js와 동일 정책.
- **다운로드 시 함정**: playentry의 죽은 경로는 404 대신 **SPA HTML(`<!DOCTYPE html>...`)을 200으로 반환**한다. 크기만 보면 정상처럼 보이니, 받은 파일의 **첫 바이트가 `<!DOCTYPE`/`<html`인지 반드시 확인**. (jshint가 이 함정에 걸렸음.)

---

## 7. 벤더된 EntryJS 사본의 버전 기준 (갱신 이력)

`public/lib/entry-js/`는 업스트림이나 npm을 참조하지 않는 **바이트 사본**(git 추적 769파일)이다.
장점은 CDN 독립이고, 대가는 **업스트림 버그픽스를 자동으로 받지 못한다**는 것이다.
재벤더링할 때마다 아래 표에 어떤 커밋·릴리스 기준인지 남긴다.

| 벤더링 시점 | 기준 | 확인 방법 |
| --- | --- | --- |
| 2026-04-14 (현행) | 4월 빌드 (npm `@entrylabs/entry` 4.0.20 계열) | 아래 심볼 대조 |

### 2026-07-31 실측 — 4.56.0 대비 격차

playentry.org 실서비스에는 7월 수정(EntryJS 4.56.0)이 배포됐지만, 우리 사본에는 없다.

| 심볼 | 실서비스 번들 | 우리 사본 |
| --- | --- | --- |
| `sanitizeCoordinate` (변수 좌표 ±10000 clamp) | 있음 | **0건** |
| `runWithScrollPreserved` (모양·소리 목록 스크롤 보존) | 있음 | **0건** |
| `_bindInputFieldFullScreenChange` (전체화면 대답 입력) | 있음 | **0건** |
| `codingboxv2` (신규 하드웨어) | 있음 | **0건** |

7월 수정만 빠진 게 아니다. **5월 29일 prototype pollution Stored XSS 픽스(`668c3d6f8`, 6월 2일
PR #3073으로 머지)도 없다** — 번들의 해당 함수가 정규화 없는 옛 형태다.

```
$ grep -o 'ilterReservedKeywords[^}]*}' public/lib/entry-js/dist/entry.min.js
ilterReservedKeywords",value:function(t){return e._reservedKeywords.has(t)?"":t}}
                                              ^ 배열/객체를 String() 으로 정규화하는 단계가 없음
```

업스트림 현재 코드는 `typeof param === 'object'`일 때 `String(param)`으로 정규화한 뒤 조회한다.
정규화가 없으면 `["__proto__"]` 같은 배열을 파라미터로 넘겨 예약어 필터를 우회할 수 있다.
CODE 205는 에디터를 문제 풀이용으로 쓰고 작성자 본인만 자기 블록을 실행하므로 저장형 XSS의
전달 경로(남의 작품을 열어보는 흐름)가 약하지만, **재벤더링 시 가장 먼저 확인할 항목**이다. — 문제 100개(변수 335개)의 좌표를 전수 실측한 결과 clamp 한계
`±10000`을 넘는 값이 0건이고, merge 엔진의 숨김 좌표 `2050`도 한계 안쪽이다. 즉 재벤더링해도
데이터 측 동작 변화가 없다.

**언제 문제가 되나**: 좌표로 변수 표시창을 화면 밖에 숨긴 **외부 작품**을 에디터로 열 때.
playentry.org에서는 clamp돼 화면에 나타나지만 우리 에디터에서는 숨은 채로 보인다 —
"code.205.kr에서만 다르게 보인다"의 원인이 될 수 있다. 우리가 만든 문제는 이 기법을 쓰지 않는다.

**해소 조건**: 이 사본은 바이트 복사라 자동 갱신 경로가 없다. 업스트림 수정을 받으려면 수동
재벤더링이 필요하고, 그때 아래 두 항목을 확인한다.

1. **`runWithScrollPreserved`가 우리 CSS와 겹칠 수 있다.** `public/css/editor.css:440-447`이
   모양·소리 패널을 `width:250px !important; overflow-y:auto`로 덮어쓴다. 업스트림 유틸은
   `.rcs-inner-container`의 `scrollTop`만 보존하므로, 스크롤 소유권이 우리 CSS로 넘어가 있으면
   수정 효과가 안 날 수 있다. 정적 CSS 분석으로는 확정되지 않았고 **브라우저 확인이 필요**하다.
2. 위 표에 기준 커밋을 반드시 기록한다.

전체 변경 목록과 판정 근거: [`upstream/지식/entryjs-4.56.0-2026-07-update.md`](../../../../upstream/지식/entryjs-4.56.0-2026-07-update.md)

> 관련: [[01-setup.md]](./01-setup.md) (의존성), [[06-init-options.md]](./06-init-options.md) (비활성 기능 옵션), 메모리 `editor-cdn-dependency-risk`.

## 8. CODE 205 안에 임베드한 편집기의 분할선 보정 (2026-10-13)

**등급 B · 현행 2026-04-14 벤더 사본 · 소스 분석과 Chromium 재현으로 확인.**

벤더 `Entry.PropertyPanel._initializeSplitter`는 `clientX`를 그대로 `canvasWidth`에
넣는다. CODE 205에서는 문제 패널 때문에 워크스페이스가 오른쪽으로 이동해 있어,
왼쪽으로 당겨도 실행 영역이 최대 640px로 커지거나 그 크기에 고정됐다.
또한 벤더 CSS의 `.entry { min-width:1024px }`와 호스트의 `overflow:hidden`이
겹쳐 1280px 창에서도 오른쪽 112px이 잘렸다.

보정은 [editor-layout.js](../../public/js/editor-layout.js)에 둔다. Entry 초기화 뒤
해당 손잡이의 기존 `mousedown/touchstart`만 해제하고 Pointer Events로 교체한다.
너비는 **드래그 시작 너비 + clientX 이동량**으로 계산한다. 매 이동마다
`Entry.resizeElement`를 호출해 실행 화면, 캔버스, 오브젝트 목록, 블록 영역과
좌표 캐시를 함께 갱신하며, `interfaceState`의 다른 필드는 보존한다.
최소 크기 아래로 당겨 실행 영역을 접고 손잡이를 클릭해 다시 여는 동작도 유지한다.

[editor.css](../../public/css/editor.css)와 레이아웃 모듈이 현재 블록 메뉴 너비와
블록 작업 영역 최소 240px을 고려해 실행 영역과 문제 패널의 최대 너비를 제한한다.
기본 블록 탭의 최소 워크스페이스는 877px(실행 영역 324 + 메뉴 313 + 작업 영역 240)이다.
창이 이보다 좁으면 워크스페이스에 가로 스크롤을 제공한다. `ResizeObserver`는
창 크기, 문제 패널, 프로젝트 로드, 모양/소리/속성 탭으로 인한 레이아웃 변화를 반영한다.

검증:

- `node --test tests/editor-layout.test.js`: 9개 통과. 실제 설치한 이벤트 핸들러의
  좌표 보정, 드래그 취소/포커스 이탈, 상태 보존, 접기/펼치기와 너비 제한을 검사한다.
- 전체 테스트 275개 통과, `npm run build:pages` 성공.
- Chromium에서 1600·1280·1024·768px 창, 두 분할선, 문제/자유 모드,
  모양 탭, 최대 크기 후 축소, 접기/펼치기, 크기 조절 후 블록 드롭을 확인했다.
  `pointermove` 중간 단계마다 캔버스·목록·버튼·블록 영역의 너비와 높이를 측정했다.
  [브라우저 검증 기록](../../../../_review/code205-splitter-20261013/fixed-browser-checks.json).

`public/lib/entry-js` 번들은 수정하지 않았다. 재벤더링 시 손잡이 이벤트와 DOM 클래스,
`Entry.resizeElement`, `CANVAS_*` 상수의 호환성을 이 검증으로 다시 확인한다.
