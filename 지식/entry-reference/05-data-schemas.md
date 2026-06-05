# 05. 데이터 스키마

원본: `source/entryjs/typedef/*.md`

우리 플랫폼이 직접 읽거나 쓰는 JSON 스키마. `Entry.exportProject()` 반환값, `.ent`의 `project.json`, 그리고 `Entry.loadProject(project)` 입력이 모두 이 형식.

---

## Project Data

[`typedef/2024-03-15-project-data.md`](https://github.com/entrylabs/docs/blob/master/source/entryjs/typedef/2024-03-15-project-data.md)

EntryJS 워크스페이스에서 작업한 **프로젝트 전체**를 표현하는 JSON. 블록·오브젝트·변수·장면 등 프로젝트 복원에 필요한 모든 요소 포함.

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `speed` | number | 작품 실행 속도 (FPS) |
| `objects` | [Object Data](#object-data)[] | 오브젝트 목록 |
| `variables` | [Variable Data](#variable-data)[] | 변수 목록 |
| `messages` | [Message Data](#message-data)[] | 신호 목록 |
| `functions` | [Function Data](#function-data)[] | 사용자 정의 함수 목록 |
| `scenes` | [Scene Data](#scene-data)[] | 장면 목록 |
| `interface` | [Interface State](#interface-state) | UI 상태 |
| `tables` | [Table Data](#table-data)[] | 데이터 테이블 (우리 미사용) |
| `learning` | ID | 학습 모델 ID (우리 미사용) |
| `aiUtilizeBlocks` | string[] | AI 블록 목록 (우리 미사용) |
| `expansionBlocks` | string[] | 확장 블록 목록 (우리 미사용) |
| `hardwareLiteBlocks` | string[] | 브라우저 하드웨어 블록 (우리 미사용) |

### 엔트리 공식 출력에만 나타나는 추가 필드

엔트리 사이트 내보내기 결과에는 플랫폼 메타데이터도 포함될 수 있습니다. 엔진 로드에는 **필수가 아니며**, 없어도 프로젝트는 정상 로드됩니다.

`externalModules`, `externalModulesLite`, `likeCnt`, `visit`, `isopen`, `name`, `isPracticalCourse`, `parent`, `origin`, `user`, `recentLikeCnt`, `childCnt`, `comment`

---

## Object Data

[`typedef/2024-03-15-object-data.md`](https://github.com/entrylabs/docs/blob/master/source/entryjs/typedef/2024-03-15-object-data.md)

프로젝트 내 **개별 오브젝트**(스프라이트/글상자)의 상태·위치·모양·블록 스크립트를 모두 담습니다.

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `id` | Object ID | 오브젝트 ID |
| `name` | string | 오브젝트 이름 |
| `text` | string | 글상자 내용 (objectType='textBox'일 때) |
| `objectType` | `'sprite'` \| `'textBox'` | 오브젝트 유형 |
| `scene` | Scene ID | 소속 장면 ID |
| `lock` | boolean | 오브젝트 잠금 여부 |
| `rotateMethod` | `'free'` \| `'vertical'` \| `'none'` | 회전 방식 |
| `entity` | [Entity](#entity) | 엔티티 정보 (좌표·크기·회전 등) |
| `script` | string / nested array | 블록 스크립트 (런타임에서는 중첩 배열, 문서상으로는 string) |
| `sprite` | [Sprite](#sprite) | 스프라이트 정보 (pictures/sounds 배열) |
| `selectedPictureId` | Picture ID | 현재 활성화된 모양의 ID |

### Entity

원본에는 별도 페이지가 없지만, `Entry.exportProject` 출력과 엔트리 공식 `.ent`에서 관찰되는 스키마는 다음과 같습니다.

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `x` | number | 스테이지 x 좌표 |
| `y` | number | 스테이지 y 좌표 |
| `regX` | number | 회전·스케일 기준점 x (보통 이미지 중앙 = width/2) |
| `regY` | number | 회전·스케일 기준점 y (보통 height/2) |
| `scaleX` | number | 가로 배율 |
| `scaleY` | number | 세로 배율 |
| `rotation` | number | 회전 각도 (도) |
| `direction` | number | 진행 방향 (기본 90) |
| `width` | number | 오브젝트 표시 너비 |
| `height` | number | 오브젝트 표시 높이 |
| `font` | string | 글상자용 폰트 문자열 (예: `"undefinedpx "` — 엔진 기본) |
| `visible` | boolean | 표시 여부 |

### Sprite

`object.sprite`. 정식 typedef 페이지는 없으며, 실제 구조는 다음과 같습니다.

```ts
{
  pictures: Picture[],     // 모양 배열
  sounds:   Sound[]        // 소리 배열
}
```

### Picture

엔트리 공식 `.ent`와 런타임 출력에서 관찰되는 모양 필드:

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `id` | Picture ID | 모양 ID (보통 4~8자 짧은 해시) |
| `name` | string | 사용자 표시 이름 |
| `filename` | string | 32자 fileId (확장자 없음, [04-file-format.md](./04-file-format.md)) |
| `fileurl` | string | 원본 이미지 경로 |
| `thumbUrl` | string | 썸네일 경로 (없으면 엔진이 fileurl로 fallback) |
| `imageType` | `'svg'` \| `'png'` \| … | 파일 형식 |
| `dimension` | `{width, height, scaleX?, scaleY?}` | 원본 크기 (scaleX/Y는 엔트리 공식 출력에만 나타남, 필수 아님) |

### Sound

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `id` | Sound ID | 소리 ID |
| `name` | string | 사용자 표시 이름 |
| `filename` | string | 32자 fileId |
| `fileurl` | string | 파일 경로 |
| `duration` | number | 길이 (초) |
| `ext` | string | 확장자 (`".mp3"` 등) |

---

## Scene Data

[`typedef/2024-03-15-scene-data.md`](https://github.com/entrylabs/docs/blob/master/source/entryjs/typedef/2024-03-15-scene-data.md)

프로젝트의 모든 장면(Scene) 메타정보.

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `id` | Scene ID | 장면 ID |
| `name` | string | 장면 이름 |

> 기본 프로젝트는 장면 1개(`id: '7dwq'`, `name: '장면 1'`)로 시작. 각 Object의 `scene` 필드가 여기에 매핑.

---

## Variable Data

[`typedef/2024-03-15-variable-data.md`](https://github.com/entrylabs/docs/blob/master/source/entryjs/typedef/2024-03-15-variable-data.md)

프로젝트 내 모든 변수의 상태·속성.

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `id` | Variable ID | 변수 ID |
| `variableType` | `'variable'` \| `'list'` \| `'timer'` \| `'answer'` \| `'slide'` | 변수 유형 |
| `name` | string | 변수명 |
| `value` | string | 현재 값 |
| `minValue` | number | 최솟값 (slide용) |
| `maxValue` | number | 최댓값 (slide용) |
| `visible` | boolean | 캔버스 표시 여부 |
| `x` | number | 캔버스 표시 x |
| `y` | number | 캔버스 표시 y |
| `width` | number | 넓이 |
| `height` | number | 높이 |
| `isCloud` | boolean | 공유변수 여부 (우리 미지원) |
| `object` | Object ID | 지역 변수 소속 오브젝트 ID |
| `array` | `[{data}]` | 리스트형일 때 값 배열 |

### 기본 변수 (엔진이 자동 포함)

| variableType | id 예시 | 용도 |
|---|---|---|
| `'timer'` | `'brih'` | 초시계 |
| `'answer'` | `'1vu8'` | `묻고 답 기다리기` 블록의 응답 저장소 |

---

## Message Data

[`typedef/2024-03-15-message-data.md`](https://github.com/entrylabs/docs/blob/master/source/entryjs/typedef/2024-03-15-message-data.md)

프로젝트 내 신호(메시지) 정보.

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `id` | Message ID | 신호 ID |
| `name` | string | 신호명 |

---

## Function Data

[`typedef/2024-03-15-function-data.md`](https://github.com/entrylabs/docs/blob/master/source/entryjs/typedef/2024-03-15-function-data.md)

사용자 정의 함수 정보.

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `id` | Function ID | 함수 ID |
| `content` | string | 함수 블록 스크립트 |
| `type` | `'normal'` \| `'value'` | 함수 타입 — `normal`: 기본, `value`: 값 반환 |
| `useLocalVariables` | boolean | 지역 변수 사용 여부 |
| `localVariables` | Local Variable Data | 지역 변수 데이터 |

---

## Table Data (참고만)

[`typedef/2024-03-15-table-data.md`](https://github.com/entrylabs/docs/blob/master/source/entryjs/typedef/2024-03-15-table-data.md)

데이터 테이블(엔트리의 `자료` 카테고리). **우리 플랫폼은 해당 블록 메뉴를 `ban`하여 사용하지 않습니다.**

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `id` | Table ID | 테이블 ID |
| `name` | string | 테이블 이름 |
| `fields` | string[] | 컬럼 데이터 |
| `data` | Table data[] | 테이블 데이터 |
| `origin` | Origin data[] | 원본 데이터 |
| `chart` | Chart data | 차트 데이터 |
| `summary` | string | 요약 |

---

## Interface State

[`typedef/2024-03-15-interface-state.md`](https://github.com/entrylabs/docs/blob/master/source/entryjs/typedef/2024-03-15-interface-state.md)

워크스페이스 UI 상태.

| 프로퍼티 | 타입 | 설명 |
|---|---|---|
| `canvasWidth` | number | 스테이지 영역 너비 |
| `menuWidth` | number | 블록 메뉴 영역 너비 |
| `object` | Object ID | 현재 선택 중인 오브젝트 ID |

> `Entry.captureInterfaceState()`로 획득 가능. `Entry.loadInterfaceState(state)`로 복원.

---

## 우리 `bot205DefaultProject()` 구조 참고

`public/js/editor.js`의 헬퍼가 생성하는 JSON:

```jsonc
{
  "category": "기타",
  "scenes":   [{ "name": "장면 1", "id": "7dwq" }],
  "variables": [
    { "name": "타이머", "id": "brih", "variableType": "timer", /* … */ },
    { "name": "대답",   "id": "1vu8", "variableType": "answer", /* … */ }
  ],
  "objects": [{
    "id": "bot205", "name": "205봇",
    "script": [[]],
    "selectedPictureId": "bot205-idle",
    "objectType": "sprite", "rotateMethod": "free",
    "scene": "7dwq",
    "sprite": {
      "sounds": [],
      "pictures": [
        { "id": "bot205-idle",   "fileurl": "/images/mascot/bot205-idle.svg",   "thumbUrl": "/images/mascot/bot205-idle.svg",   "name": "205봇_서기",   "imageType": "svg", "dimension": { "width": 200, "height": 240 } },
        { "id": "bot205-walk-1", "fileurl": "/images/mascot/bot205-walk-1.svg", "thumbUrl": "/images/mascot/bot205-walk-1.svg", "name": "205봇_걷기1", "imageType": "svg", "dimension": { "width": 200, "height": 240 } },
        { "id": "bot205-walk-2", "fileurl": "/images/mascot/bot205-walk-2.svg", "thumbUrl": "/images/mascot/bot205-walk-2.svg", "name": "205봇_걷기2", "imageType": "svg", "dimension": { "width": 200, "height": 240 } },
        { "id": "bot205-hello",  "fileurl": "/images/mascot/bot205-hello.svg",  "thumbUrl": "/images/mascot/bot205-hello.svg",  "name": "205봇_인사",   "imageType": "svg", "dimension": { "width": 200, "height": 240 } }
      ]
    },
    "entity": {
      "x": 0, "y": 0,
      "regX": 100, "regY": 120,
      "scaleX": 0.5, "scaleY": 0.5,
      "rotation": 0, "direction": 90,
      "width": 200, "height": 240,
      "visible": true
    },
    "lock": false, "active": true
  }],
  "expansionBlocks": [],
  "aiUtilizeBlocks": [],
  "speed": 60
}
```

Entry.getStartProject()를 베이스로 받은 뒤 `objects`만 교체.
