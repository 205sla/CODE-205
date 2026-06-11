# 02. 핵심 API

원본: [api/2024-02-29-api.md](https://github.com/entrylabs/docs/blob/master/source/entryjs/api/2024-02-29-api.md) · [api/2024-02-29-data.md (이벤트 사용법)](https://github.com/entrylabs/docs/blob/master/source/entryjs/api/2024-02-29-data.md)

## 프로젝트

### `Entry.init(container, options)`

EntryJS를 초기화하고 워크스페이스를 페이지에 불러옵니다.

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `container` | DOM | EntryJS가 로드될 HTML 컨테이너 |
| `options` | [InitOptions](./06-init-options.md) | 초기화 옵션 |

```js
Entry.init(document.getElementById('workspace'), { type: 'workspace' });
```

### `Entry.loadProject(project?)`

저장된 프로젝트 데이터를 현재 작업 환경에 적용. 인자 없이 호출하면 **기본(엔트리봇) 프로젝트**가 로드됩니다.

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `project` | [ProjectData](./05-data-schemas.md#project-data) | 로드할 프로젝트 (선택) |

```js
Entry.loadProject();
// 또는
Entry.loadProject(project);
```

> **우리 프로젝트**: `codyDefaultProject` → `bot205DefaultProject`로 교체. `public/js/editor.js`의 `bot205DefaultProject()` 헬퍼가 `Entry.getStartProject()`를 베이스로 `objects`만 205봇으로 치환해 반환.

### `Entry.exportProject()`

현재 작업 중인 프로젝트를 JSON으로 반환. 반환값은 [ProjectData](./05-data-schemas.md#project-data).

```js
const project = Entry.exportProject();
```

내부 동작:
```js
Entry.exportProject = function (e) {
    e = e || {};
    if (!Entry.engine.isState('stop')) Entry.engine.toggleStop();
    e.objects            = Entry.container.toJSON();
    e.scenes             = Entry.scene.toJSON();
    e.variables          = Entry.variableContainer.getVariableJSON();
    e.messages           = Entry.variableContainer.getMessageJSON();
    e.functions          = Entry.variableContainer.getFunctionJSON();
    e.tables             = /* DataTable */.getTableJSON();
    e.speed              = Entry.FPS;
    e.interface          = Entry.captureInterfaceState();
    e.expansionBlocks    = Entry.expansionBlocks;
    e.aiUtilizeBlocks    = Entry.aiUtilizeBlocks;
    e.hardwareLiteBlocks = Entry.hardwareLiteBlocks;
    e.externalModules    = /* mod */.moduleList;
    e.externalModulesLite= /* mod */.moduleListLite;
    return e;
};
```

> **우리 프로젝트**: `editor.js:initExport()`가 호출 → POST `/api/export` → 서버가 tar 번들 + gzip → 다운로드 트리거.

### `Entry.clearProject()`

프로젝트의 모든 데이터를 비우고 초기화. 설정·데이터·작업 내용 전체 제거.

```js
Entry.clearProject();
```

> **우리 프로젝트**: reset 버튼 핸들러에서 사용 (`editor.js:initReset`).

### `Entry.getStartProject(mediaFilePath?)`

기본(시작) 프로젝트를 반환. 반환값은 [ProjectData](./05-data-schemas.md#project-data).

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `mediaFilePath` | string | 미디어 파일 경로 접두사 (선택) |

```js
const startProject = Entry.getStartProject('/assets');
```

> **우리 프로젝트**: `bot205DefaultProject()`에서 base로 사용. scenes/variables/flags 등 엔진 기본값을 물려받은 뒤 `objects`만 교체.

### `Entry.captureInterfaceState()` / `Entry.loadInterfaceState(state)`

워크스페이스의 UI 상태(메뉴 너비, 스테이지 너비, 선택된 오브젝트 등)를 직렬화/복원.

```js
const state = Entry.captureInterfaceState();
// ... 나중에
Entry.loadInterfaceState(state);
```

### `Entry.launchFullScreen()` / `Entry.exitFullScreen()`

HTML5 Fullscreen API 래퍼. 스테이지 전체화면 진입/탈출.

## 이벤트

### `Entry.addEventListener(eventName, callback)`

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `eventName` | string | 감지할 이벤트 이름 |
| `callback` | function | 콜백. 이벤트별 추가 인자를 받을 수 있음 |

```js
Entry.addEventListener('run',  () => console.log('시작됨'));
Entry.addEventListener('stop', () => console.log('정지됨'));
```

### `Entry.dispatchEvent(eventName, ...args)`

수동으로 이벤트 발생. 추가 인자는 리스너에 그대로 전달.

```js
Entry.dispatchEvent('customEvent', arg1, arg2);
```

### `Entry.removeEventListener(eventName, callback)` / `removeAllEventListener(eventName)`

등록 해제. `removeEventListener`는 **정확히 같은 콜백 참조**를 넘겨야 합니다.

사용 가능한 이벤트 전체 목록은 [03-events.md](./03-events.md) 참고.

> **우리 프로젝트**: `editor.js`에서 여러 곳에서 사용. 특히 Undo/Redo 버튼이 `Entry.dispatchEvent('undo')` / `'redo'`로 엔진에 위임.

## StateManager (Undo/Redo)

```js
Entry.stateManager.canUndo();     // boolean
Entry.stateManager.canRedo();     // boolean
Entry.stateManager.undo();        // 1회
Entry.stateManager.undo(3);       // 3회
Entry.stateManager.redo();        // 1회
Entry.stateManager.getUndoStack(); // 현재 스택
Entry.stateManager.clear();       // 이력 초기화
```

> **우리 프로젝트**: `editor.js:initUndoRedo`가 헤더 버튼 ↔ `stateManager`를 바인딩. 채점 중에는 전역 키보드 가드로 Ctrl+Z/Y가 무효화됨.

## Playground — 블록 메뉴 가시성 제어

특정 블록 또는 카테고리를 **숨기거나 다시 표시**할 때 사용.

### 특정 블록 숨기기/표시

`isNotFor` 속성을 기준으로 걸러냅니다.

```js
Entry.playground.blockMenu.banClass('message');    // 메시지 블록들 숨김
Entry.playground.blockMenu.unbanClass('message');  // 표시
```

`doNotAlign=true`를 두 번째 인자로 주면 즉시 다시 그리지 않습니다.

### 카테고리 전체 숨기기/표시

```js
Entry.playground.blockMenu.banCategory('start');    // '시작' 카테고리 숨김
Entry.playground.blockMenu.unbanCategory('start');
```

> **우리 프로젝트**: `editor.js`의 `banUnusedCategories()` 헬퍼가 `['analysis', 'ai_utilize', 'expansion', 'arduino']`를 `banCategory`로 감춤 → 데이터분석/AI활용/확장/하드웨어 블록 메뉴에서 제거.

## Toast — 사용자 알림

엔트리가 제공하는 비동기 화면 알림(토스트).

```js
Entry.toast.alert('경고 제목',   '이것은 경고입니다.', false);   // 빨강
Entry.toast.warning('경고 제목', '주의가 필요합니다.', false);   // 노랑
Entry.toast.success('성공 제목', '작업 완료!',        false);   // 초록
```

세 번째 인자 `isNotAutoDispose`가 `true`면 자동 사라짐이 비활성화됩니다. `false`/미지정 시 ~5초 후 자동 닫힘.

> **우리 프로젝트**: 채점 러너가 `Entry.toast.*` 호출을 감지해 **경고 메시지를 캡처**(`editor.js:installTestHooks`)하여 테스트 실패 이유로 사용. 실제 UI 토스트는 채점 중 보이지 않게 가려짐.

## 기타 유틸

### `Entry.getKeyCodeMap()`

키코드 → 문자 매핑 객체. 키보드 이벤트 커스텀 처리용.

### `Entry.getUpTime()`

`Entry.init` 이후 경과 시간 (ms).

### `Entry.isDefaultProject(project)`

주어진 프로젝트가 `getStartProject()` 결과와 동일한지.

### `Entry.isMobile()`

현재 환경이 모바일인지 (UserAgent 기반).

## 이벤트 처리 패턴 (원본 `api/2024-02-29-data.md` 요약)

```js
function myEventHandler(args) {
    console.log('이벤트 발생!', args);
}

Entry.addEventListener('customEvent', myEventHandler);
Entry.dispatchEvent('customEvent', '매개변수1', '매개변수2');
Entry.removeEventListener('customEvent', myEventHandler);
Entry.removeAllEventListener('customEvent');
```

- 이벤트 리스너 등록·해제·발생은 순수 `EventEmitter` 패턴과 동일.
- `removeEventListener`는 **정확히 같은 함수 참조**로만 해제됩니다. 익명함수를 바로 등록하면 해제 불가.
