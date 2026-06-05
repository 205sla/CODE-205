# 06. Init Options

원본: [typedef/2024-03-11-init-options.md](https://github.com/entrylabs/docs/blob/master/source/entryjs/typedef/2024-03-11-init-options.md)

`Entry.init(container, options)` 호출 시 전달하는 옵션 객체. 워크스페이스의 기본 동작·가시 기능을 결정합니다.

## 전체 옵션 목록

| 프로퍼티 | 타입 | 기본값 | 설명 | 우리 값 |
|---|---|---|---|---|
| `type` | `'workspace'` \| `'minimize'` | — | entryjs 표시 형식 | `'workspace'` |
| `libDir` | string | `'/lib'` | 써드파티 라이브러리 저장소 위치 | `'lib/entry-js'` |
| `entryDir` | string | `'/@entrylabs/entry'` | 엔트리 mediaFile asset 위치 | `''` |
| `defaultDir` | string | — | 기본 assets 위치 | 미설정 |
| `soundDir` | string | — | sound 파일 경로 | 미설정 |
| `baseUrl` | string | — | API블록/AI블록 호출 원본 API 주소 | 미설정 (해당 블록 미사용) |
| `fonts` | Array | — | 웹폰트 정보 | 미설정 |
| `objectAddable` | boolean | `true` | 오브젝트 추가 가능 여부 | 기본값 |
| `objectEditable` | boolean | `true` | 오브젝트 수정 가능 여부. `false`면 `objectAddable`도 `false`가 됨 | 기본값 |
| `objectdeletable` | boolean | `true` | 오브젝트 삭제 가능 여부 | 기본값 |
| `soundeditable` | boolean | `true` | 소리 수정 가능 여부 | 기본값 |
| `pictureeditable` | boolean | `true` | 모양 수정 가능 여부 | 기본값 |
| `sceneEditable` | boolean | `true` | 장면 수정 가능 여부 | 기본값 |
| `functionEnable` | boolean | `true` | 함수 기능 사용 여부 | 기본값 |
| `messageEnable` | boolean | `true` | 신호 기능 사용 여부 | 기본값 |
| `variableEnable` | boolean | `true` | 변수 기능 사용 여부 | 기본값 |
| `listEnable` | boolean | `true` | 리스트 기능 사용 여부 | 기본값 |
| `isForLecture` | boolean | `false` | 강의용 프로젝트 여부 | 기본값 |
| `textCodingEnable` | boolean | `true` | 엔트리 파이썬 사용 여부 | ✅ `true` |
| `blockSaveImageEnable` | boolean | `true` | 블록 이미지로 저장 메뉴 가능 여부 | ❌ `false` |
| **`hardwareEnable`** | boolean | `true` | 하드웨어 블록 카테고리 | ❌ `false` (우리 미사용) |
| **`expansionDisable`** | boolean | `true` | 확장 블록 (날씨·번역 등) 가능 여부 | ✅ `true` (우리 미사용) |
| **`aiLearningEnable`** | boolean | `true` | AI 학습 사용 여부 | ❌ `false` (우리 미사용) |
| **`aiUtilizeDisable`** | boolean | `true` | 인공지능 활용 블록 가능 여부 | ✅ `true` (우리 미사용) |

> 필드명 주의: `expansionDisable`과 `aiUtilizeDisable`은 이름이 "Disable"이면서 값 `true`가 "비활성화"를 의미합니다. 이는 엔트리 원본 네이밍이 혼란스러운 부분 — `true`가 일반적으로 "활성"을 뜻하지만 여기서는 "끈다"는 뜻. 반면 `hardwareEnable`, `aiLearningEnable`은 직관적(`true`=켠다).

## 우리 프로젝트의 초기화 (`public/js/editor.js:~108`)

```js
var initOption = {
    libDir: 'lib/entry-js',
    entryDir: '',
    type: 'workspace',
    textCodingEnable: true,

    // 알고리즘 학습 플랫폼이라 쓰지 않는 기능들을 모두 꺼둠:
    hardwareEnable: false,       // 하드웨어 블록 카테고리
    backpackDisable: true,       // 나만의 보관함 (서버 필요)
    exportObjectEnable: false,   // 오브젝트 내보내기 (우클릭 메뉴)
    blockSaveImageEnable: false, // 블록 이미지로 저장 (우클릭 메뉴)
    aiLearningEnable: false,     // 인공지능 학습 블록
    aiUtilizeDisable: true,      // 인공지능 활용 블록
    expansionDisable: true,      // 확장 블록 (날씨/번역 등, 서버 API 필요)
};
Entry.creationChangedEvent = new Entry.Event(window);
Entry.init(document.getElementById('workspace'), initOption);
```

### 공식 문서에 없는 우리의 추가 옵션

| 프로퍼티 | 값 | 설명 |
|---|---|---|
| `backpackDisable` | `true` | 나만의 보관함 UI 비활성 (엔트리 공식 문서 미기재, 실제 엔진 인식) |
| `exportObjectEnable` | `false` | 오브젝트 우클릭 → 파일 내보내기 숨김 |

### 추가 비활성화 — 카테고리 `ban`

초기화 옵션만으로는 일부 카테고리가 완전히 숨지 않습니다. `editor.js:banUnusedCategories`에서 다음을 추가로 숨김:

```js
['analysis', 'ai_utilize', 'expansion', 'arduino'].forEach(cat =>
    Entry.getMainWS().blockMenu.banCategory(cat)
);
```

- `analysis` — 데이터분석
- `ai_utilize` — 인공지능 활용
- `expansion` — 확장 블록
- `arduino` — 하드웨어 (아두이노)

## 주의사항

- `Entry.init`은 한 번만 호출해야 합니다. 재호출 시 DOM/이벤트 리스너가 중복됩니다.
- `Entry.creationChangedEvent = new Entry.Event(window)`는 **init 전에 반드시** 세팅. 누락 시 일부 이벤트가 발화되지 않음.
- init 후 `Entry.loadProject(...)`가 이어져야 워크스페이스에 실제 내용이 표시됩니다.
