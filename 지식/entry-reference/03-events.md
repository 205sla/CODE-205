# 03. 이벤트 목록

원본: [api/2024-02-29-event.md](https://github.com/entrylabs/docs/blob/master/source/entryjs/api/2024-02-29-event.md)

**이 문서에서 제외한 카테고리** (우리 플랫폼 미사용): 데이터분석 / 확장블록 / 하드웨어 / 인공지능 / 백팩.

사용법: `Entry.addEventListener(eventName, callback)` — 상세는 [02-core-api.md](./02-core-api.md#이벤트) 참고.

---

## 프로젝트 이벤트

| 이벤트 | 발생 시점 | 콜백 인자 |
|---|---|---|
| `beforeStop` | 프로젝트 실행 중지 **직전** | — |
| `blockExecute` | 블록 실행 **시작** 시 | `view` (object) — 실행 중 블록의 view |
| `blockExecuteEnd` | 블록 실행 **종료** 시 | — |
| `dispatchEventDidTogglePause` | 일시정지 / 다시시작 토글 | — |
| `dispatchEventDidToggleStop` | `정지하기` 클릭 (stop 이벤트 이후) | — |
| `run` | `시작하기` 클릭 | — |
| `stageMouseMove` | 스테이지 위 마우스 이동 | — |
| `stageMouseOut` | 스테이지 밖으로 마우스 이탈 | — |
| `stop` | `정지하기` 클릭 | — |
| `toggleFullScreen` | 전체화면 토글 | — |
| `windowResized` | 워크스페이스 리사이즈 | `e` (Event) |
| `workspaceChangeMode` | 워크스페이스 모드 변경 (엔트리 파이썬 ↔ 블록) | — |

> **활용 예**: 우리 채점 러너는 `run` / `stop` 이벤트를 감시하지 않고 직접 `Entry.engine.toggleRun`/`toggleStop`을 호출하지만, `run`/`stop`은 외부 분석 도구 연동에 유용합니다.

## 코드 조립소 이벤트

| 이벤트 | 발생 시점 | 콜백 인자 |
|---|---|---|
| `commentVisibleChanged` | 주석을 열거나 닫을 때 | — |
| `saveBlockImages` | 블록 `이미지로 저장하기` 클릭 | `image` (json) — 이미지 데이터 |
| `textEdited` | 블록 텍스트 수정 | — |

> **우리 프로젝트**: `blockSaveImageEnable: false`로 `saveBlockImages`는 발생하지 않습니다.

## 공통 팝업 이벤트

| 이벤트 | 발생 시점 |
|---|---|
| `dismissModal` | 팝업을 닫을 때 |

## 모양 이벤트

| 이벤트 | 발생 시점 | 콜백 인자 |
|---|---|---|
| `downloadPicture` | 모양탭 `PC에 저장` 클릭 | — |
| `openPictureImport` | 그림판 `모양 가져오기` 클릭 | — |
| `openPictureManager` | 모양탭 `모양 추가하기` 클릭 | — |
| `pictureNameChanged` | 모양 이름 변경 | 모양 json |
| `pictureSelected` | 특정 모양 선택 | 모양 json, 삭제여부(boolean) |
| `saveCanvasImage` | 그림판 저장 | 이미지 json |

> **중요**: `openPictureManager`/`openSpriteManager`/`openSoundManager`는 엔트리가 **팝업 UI를 직접 띄우지 않습니다**. 각 이벤트를 수신해서 개발자가 커스텀 팝업을 열어야 합니다. 우리 프로젝트는 `EntryTool.Popup`으로 sprite/picture 선택기를 구현 (`editor.js:initEntryPopup`).

## 소리 이벤트

| 이벤트 | 발생 시점 | 콜백 인자 |
|---|---|---|
| `downloadSound` | 소리탭 `PC에 저장` 클릭 | — |
| `endLoading` | 로딩 종료 (사운드 로드 완료 등) | — |
| `openSoundManager` | 소리탭 `소리 추가하기` 클릭 | — |
| `removeSound` | 소리 삭제 | 소리 json |
| `soundLoaded` | 소리 파일 로드 완료 | — |
| `soundSelected` | 소리 선택 | 소리 json, 오브젝트 json |
| `soundUnselected` | 소리 선택 해제 | — |
| `startLoading` | 로딩 시작 | — |

## 오브젝트 이벤트

| 이벤트 | 발생 시점 | 콜백 인자 |
|---|---|---|
| `exportObject` | `오브젝트 파일 내보내기` | 오브젝트 json |
| `openSpriteManager` | `오브젝트 추가하기` 클릭 | — |
| `removeObject` | 오브젝트 삭제 | 오브젝트 json |

> **우리 프로젝트**: `exportObjectEnable: false`로 `exportObject`는 발생하지 않습니다.

## 함수 이벤트

| 이벤트 | 발생 시점 |
|---|---|
| `removeFunctionsStart` | 함수 블록 삭제 직전 |
| `removeFunctionsEnd` | 함수 블록 삭제 직후 |

## 변수 이벤트

| 이벤트 | 발생 시점 |
|---|---|
| `openExportListModal` | `리스트 내보내기` 클릭 |
| `openImportListModal` | `리스트 불러오기` 클릭 |

## 기타 이벤트

| 이벤트 | 발생 시점 | 콜백 인자 |
|---|---|---|
| `EntryBeforeUnload` | 페이지 닫힘·새로고침 직전 | — |
| `keyPressed` | 워크스페이스에서 키보드 누름 (keydown) | `e` (KeyboardEvent) |
| `keyUpped` | 워크스페이스에서 키보드 뗌 (keyup) | `e` (KeyboardEvent) |
| `loadComplete` | 프로젝트 로드 완료 | — |
| `loadStart` | 프로젝트 이미지 로드 시작 | — |
| `onPopupClose` | 스테이지 전체화면 모드 종료 | — |

> **우리 프로젝트**: `loadComplete`를 구독하면 "프로젝트 로드 완료 후 워크스페이스 크기 맞추기" 같은 후처리에 안전. 현재는 `setTimeout($(window).trigger('resize'), RESIZE_AFTER_INIT_MS)`로 우회 중.

---

## 이벤트 수신 전형적 패턴

```js
// 1. 등록
function onProjectRun() {
  console.log('run');
  // 이 안에서 또 다른 이벤트 발송 가능
}
Entry.addEventListener('run', onProjectRun);

// 2. 해제 (정확히 같은 함수 참조)
Entry.addEventListener('stop', () => {
  Entry.removeEventListener('run', onProjectRun);
});

// 3. 한꺼번에 모두 해제
Entry.removeAllEventListener('run');
```

## `dispatchEvent`로 엔진 조작

일부 UI 동작은 **이벤트 발송으로만 엔진에 전달**됩니다. 대표적으로 Undo/Redo:

```js
Entry.dispatchEvent('undo');
Entry.dispatchEvent('redo');
```

> **우리 프로젝트**: `editor.js:initUndoRedo`에서 사용. `stateManager.undo()`를 직접 불러도 되지만, `dispatchEvent`는 내부적으로 stateManager + UI 갱신을 함께 트리거.
