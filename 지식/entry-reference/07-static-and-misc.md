# 07. STATIC JS & 기타

원본: [api/2024-03-05-static.md](https://github.com/entrylabs/docs/blob/master/source/entryjs/api/2024-03-05-static.md)

`static.js`는 `window.EntryStatic` 변수에 다양한 정적 설정값(폰트·색상·블록 카테고리 등)을 부여하는 설정 파일입니다. EntryJS **본체 로드 전에** 반드시 로드되어 있어야 하며, 그렇지 않으면 블록 카테고리가 비어 나타납니다.

실제 엔트리에서 사용 중인 static.js: https://github.com/entrylabs/entryjs/blob/develop/extern/util/static.js

> **우리 프로젝트**: `public/lib/entry-js/extern/util/static.js`에 번들. `public/editor.html`에서 `entry.min.js` 앞에 `<script>` 태그로 로드.

## 주요 설정값

### `EntryStatic.fontFamily`

워크스페이스 기본 폰트.

```js
EntryStatic.fontFamily = "NanumGothic, 'Nanum Gothic'";  // 기본값
```

### `EntryStatic.fontOffsetY`

블록 내부 텍스트 렌더 시 Y 오프셋. 폰트가 블록 중앙에 정렬되도록.

```js
EntryStatic.fontOffsetY = -2.5;  // 기본값
```

### `EntryStatic.heightLetter`

블록 내 텍스트 영역 높이 계산 기준 문자.

```js
EntryStatic.heightLetter = 'M';  // 기본값
```

### `EntryStatic.messageMaxLength`

신호(메시지) 블록 이름 변경 시 허용 최대 길이.

```js
EntryStatic.messageMaxLength = 10;  // 기본값
```

### `EntryStatic.variableBlockList`

오브젝트 파일 내보내기 시 **포함할 변수 블록** 목록.

```js
EntryStatic.variableBlockList = [
    'get_variable', 'change_variable', 'set_variable',
    'show_variable', 'hide_variable',
    'value_of_index_from_list', 'add_value_to_list',
    'remove_value_from_list', 'insert_value_to_list',
    'change_value_list_index', 'length_of_list',
    'is_included_in_list', 'show_list', 'hide_list',
];
```

### `EntryStatic.messageBlockList`

오브젝트 파일 내보내기 시 포함할 신호 블록.

```js
EntryStatic.messageBlockList = ['when_message_cast', 'message_cast', 'message_cast_wait'];
```

### `EntryStatic.getAllBlocks`

워크스페이스에서 사용 가능한 **모든 블록과 카테고리 정의**. 이 값이 비어 있으면 블록 메뉴가 비게 됩니다.

[원본 소스 참조](https://github.com/entrylabs/entryjs/blob/b69246f0581b62794128a736f52c08cb2a13b423/extern/util/static.js#L180-L642)

> **우리 프로젝트**: 기본 카테고리 전체를 `static.js`에 포함하되, 런타임에 `banCategory('ai_utilize')` 등으로 불필요한 카테고리를 숨김.

### `EntryStatic.fonts`

사용자가 그림판/텍스트 상자에서 선택 가능한 폰트 목록.

[원본 소스 참조](https://github.com/entrylabs/entryjs/blob/b69246f0581b62794128a736f52c08cb2a13b423/extern/util/static.js#L843-L1007)

### `EntryStatic.colorSet`

블록 카테고리별 색상 테마. 교육적 일관성과 디자인 통일을 위해 커스터마이즈 가능.

[원본 소스 참조](https://github.com/entrylabs/entryjs/blob/b69246f0581b62794128a736f52c08cb2a13b423/extern/util/static.js#L1009-L1113)

### `EntryStatic.getDefaultFontFamily`

언어 설정(`Lang.type`, `Lang.fallbackType`)에 따라 폰트 패밀리를 반환하는 함수.

```js
EntryStatic.getDefaultFontFamily = function () {
    const localLang = Lang || {};
    const langType = localLang.type || localLang.fallbackType || 'en';
    switch (langType) {
        default:
            return "NanumGothic, 'Nanum Gothic', 나눔고딕, NanumGothicWeb, " +
                   "'맑은 고딕', 'Malgun Gothic', Dotum";
    }
};
```

---

## 관련 API 요약 (원본 `api/2024-02-29-data.md`)

이벤트 API 사용 패턴은 [02-core-api.md](./02-core-api.md)로 통합. 여기에서는 미수록 내용(Util 페이지)을 보충.

원본 `api/2024-03-05-util.md`는 **현재 비어 있습니다** (FAQ 페이지도 동일). 엔트리 공식이 해당 페이지를 향후 채울 계획.

---

## Entry의 전역 Namespace (실전 참고)

`entry.min.js`가 로드된 후 사용 가능한 주요 전역:

| 이름 | 설명 |
|---|---|
| `Entry` | 네임스페이스. 모든 공개 API의 루트 |
| `Entry.engine` | 실행 엔진. `toggleRun()`, `toggleStop()`, `state` |
| `Entry.container` | 오브젝트 저장소. `objects_` 배열, `addObject(data)` |
| `Entry.stage` | 스테이지 렌더러. `canvas`, `objects` |
| `Entry.scene` | 장면 관리 |
| `Entry.variableContainer` | 변수·리스트·신호·함수 저장소 |
| `Entry.playground` | 블록 조립소. `blockMenu`(카테고리 관리) |
| `Entry.stateManager` | undo/redo 관리자 |
| `Entry.toast` | 토스트 알림 (alert/warning/success) |
| `Entry.Dialog` | 말풍선 Dialog API (작품 내부 대사 출력) |
| `Entry.isTurbo` | 터보 모드 토글 (boolean). `true`면 한 틱당 반복 블록을 시간 예산 내에서 최대한 실행 |
| `Entry.FPS` | 현재 프레임레이트 (기본 60) |
| `Entry.tickTime` | `Math.floor(1000 / Entry.FPS)` — 한 틱당 ms |
| `Entry.defaultPath` | 엔트리 mediaFile 접두 경로 |
| `Entry.mediaFilePath` | 이미지 media path |

> **우리 프로젝트**: 이 모든 전역이 `public/lib/entry-js/dist/entry.min.js`가 로드된 뒤 `window.Entry`로 노출됩니다. `editor.js`는 이 API 표면 위에서 동작.

---

## FAQ (원본 `etc/2024-02-29-faq.md`)

현재 공식 FAQ는 빈 페이지입니다. 자주 부딪히는 실전 이슈:

### Q. `Entry.init` 호출 후 블록 메뉴가 비어 있음
A. `EntryStatic.getAllBlocks`가 로드되기 전에 `Entry.init`이 실행된 경우. `static.js`를 `entry.min.js` **앞에** `<script>`로 배치.

### Q. `Entry.loadProject()`가 조용히 실패
A. 전달한 project JSON에 `objects`가 배열이 아니거나, scene id가 object.scene과 불일치. `Entry.getStartProject()`로 기본 구조를 얻어 베이스로 쓰는 것을 권장.

### Q. 이미지가 404로 안 보임
A. fileurl이 서버에서 접근 가능한 URL인지 확인. `.ent` 내부 `temp/...` 상대경로를 그대로 쓰면 `Entry.defaultPath` 기준으로 해석되므로 브라우저 상대경로 처리와 불일치 가능. [04-file-format.md](./04-file-format.md) 참고.

### Q. 엔트리 파이썬 모드 전환 시 블록이 사라짐
A. Python ↔ Block 상호 변환은 파싱 결과를 덮어쓰므로, 변환 후 잘못된 구문이 있으면 블록이 소실될 수 있습니다. 변환 전 Undo 스택 활용 또는 사용자에게 확인 유도.

### Q. 터보 모드를 켰는데 실행 속도가 변하지 않음
A. 터보는 **반복 블록(`repeat_basic`, `repeat_while_true` 등)이 있는 경우에만** 효과를 보입니다. 반복문 없이 블록 몇 개를 순차 실행하는 코드는 한 틱 내에 이미 끝나므로 차이가 없음.

### Q. `entity.font` 값이 `"undefinedpx "`로 나옴
A. 엔트리 엔진 기본 출력. 런타임 문제 없음. 글상자를 실제로 사용할 때 Entry가 적절한 값으로 채움.
