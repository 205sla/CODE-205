# 01. 설치·구조·실행

원본: `source/entryjs/started/*.md` ([installation](https://github.com/entrylabs/docs/blob/master/source/entryjs/started/2024-02-29-installation.md) · [structure](https://github.com/entrylabs/docs/blob/master/source/entryjs/started/2024-02-29-structure.md) · [run](https://github.com/entrylabs/docs/blob/master/source/entryjs/started/2024-03-05-run.md) · [example](https://github.com/entrylabs/docs/blob/master/source/entryjs/started/2024-05-03-example.md))

## EntryJS 개요

EntryJS는 블록 기반 프로그래밍 교육을 위한 JavaScript 라이브러리입니다. 현재 IIFE(single-file bundle) 방식으로 배포되며, 특정 릴리즈는 `v3.YYYYMMDD.buildNumber` 태그로 [entrylabs/entryjs/tags](https://github.com/entrylabs/entryjs/tags)에서 받을 수 있습니다.

> **우리 프로젝트**: `public/lib/entry-js/dist/entry.min.js`에 번들된 버전 사용. 네트워크/CDN 의존 없음.

## 프로젝트 기본 구조 (원본 저장소 기준)

| 폴더 | 설명 |
|---|---|
| `src` | 소스 폴더 |
| `extern` | 외부 파일 (static.js, CanvasInput, lang 등) |
| `dist` | 출력(빌드 결과) 폴더 |
| `images` | 이미지 |
| `example` | 예제 |

### `src` 하위

| 폴더 | 설명 |
|---|---|
| `class` | EntryJS의 기본 동작 소스 |
| `command` | EntryJS Command 소스 (Undo/Redo) |
| `core` | 기본 동작 소스 |
| `css` | EntryJS 스타일 소스 |
| `extensions` | EntryJS 확장 기능 |
| `playground` | 블록 조립소 소스 |
| `util` | EntryJS Util 소스 |

### `src/class` 주요 파일

| 파일 | 설명 |
|---|---|
| `hardware/` | 하드웨어 소스 ← 우리 미사용 |
| `learning/` | AI 소스 ← 우리 미사용 |
| `container.js` | 오브젝트 리스트 소스 |
| `engine.js` | 엔진 소스 (`Entry.engine`) |
| `entity.js` | 엔티티 소스 |
| `function.js` | 함수 소스 |
| `playground.js` | 블록 조립소 소스 (`Entry.playground`) |
| `scene.js` | 장면 소스 (`Entry.scene`) |
| `stage.js` | 실행 화면 소스 (`Entry.stage`) |
| `variable_container.js` | 변수 관련 소스 (`Entry.variableContainer`) |

## 필수 의존성

EntryJS 단독으로는 작동하지 않습니다. HTML에서 아래 순서로 로드되어야 합니다.

```html
<!-- 스타일시트 -->
<link href="lib/entry-tool/dist/entry-tool.css" rel="stylesheet" />
<link href="lib/entry-js/dist/entry.css" rel="stylesheet" />

<!-- 언어 -->
<script src="lib/entry-js/extern/lang/ko.js"></script>

<!-- 의존성 라이브러리들 -->
<script src="lib/lodash/dist/lodash.min.js"></script>
<script src="js/ws/locales.js"></script>
<script src="js/react18/react.production.min.js"></script>
<script src="js/react18/react-dom.production.min.js"></script>
<script src="lib/PreloadJS/lib/preloadjs-0.6.0.min.js"></script>
<script src="lib/EaselJS/lib/easeljs-0.8.0.min.js"></script>
<script src="lib/SoundJS/lib/soundjs-0.6.0.min.js"></script>
<script src="lib/SoundJS/lib/flashaudioplugin-0.6.0.min.js"></script>
<script src="lib/jquery/jquery.min.js"></script>
<script src="lib/jquery-ui/ui/minified/jquery-ui.min.js"></script>
<script src="lib/velocity/velocity.min.js"></script>
<script src="lib/codemirror/lib/codemirror.js"></script>
<script src="lib/codemirror/addon/hint/show-hint.js"></script>
<script src="lib/codemirror/addon/lint/lint.js"></script>
<script src="lib/codemirror/addon/selection/active-line.js"></script>
<script src="lib/codemirror/mode/javascript/javascript.js"></script>
<script src="lib/codemirror/addon/hint/javascript-hint.js"></script>
<script src="js/ws/jshint.js"></script>
<script src="lib/fuzzy/lib/fuzzy.js"></script>
<script src="js/ws/python.js"></script>
<script src="lib/socket.io-client/socket.io.js"></script>
<script src="lib/entry-js/extern/util/filbert.js"></script>
<script src="lib/entry-js/extern/util/CanvasInput.js"></script>
<script src="lib/entry-js/extern/util/ndgmr.Collision.js"></script>
<script src="lib/entry-js/extern/util/handle.js"></script>
<script src="lib/entry-js/extern/util/bignumber.min.js"></script>
<script src="lib/components-webfontloader/webfontloader.js"></script>
<script src="lib/entry-lms/dist/assets/app.js"></script>

<!-- EntryStatic 설정 -->
<script src="lib/entry-js/extern/util/static.js"></script>

<!-- Entry 도구 패키지 -->
<script src="lib/entry-tool/dist/entry-tool.js"></script>
<script src="lib/entry-paint/dist/static/js/entry-paint.js"></script>
<script src="external/sound/sound-editor.js"></script>

<!-- EntryJS 본체 -->
<script src="lib/entry-js/dist/entry.min.js"></script>
```

> **우리 프로젝트**: 위 스택 전부를 `public/lib/` 하위에 포함. `public/editor.html` 참고.

## 기본 실행 패턴

```html
<body>
  <div id="entryContainer"></div>
  <script>
    document.addEventListener("DOMContentLoaded", function () {
      var initOption = {
        type: 'workspace',
        textCodingEnable: true,
      };
      Entry.creationChangedEvent = new Entry.Event(window);
      Entry.init(document.getElementById('entryContainer'), initOption);
      Entry.loadProject();
    });
  </script>
</body>
```

단계:
1. DOM에 컨테이너 엘리먼트 준비
2. `Entry.creationChangedEvent = new Entry.Event(window)` — 필수 초기화
3. `Entry.init(container, options)` — EntryJS 실체화
4. `Entry.loadProject(project?)` — 인자 없으면 기본 프로젝트(엔트리봇), 있으면 해당 프로젝트 로드

> **우리 프로젝트**: `public/js/editor.js`의 `$(document).ready(...)` 내부에서 이 패턴을 따라가며, 문제 모드/자유모드 분기로 `loadProject` 인자를 결정합니다. 기본 프로젝트는 엔트리봇 대신 **205봇**(`bot205DefaultProject()`)으로 교체되어 있습니다.

## 공식 예제 저장소

- Base Example: https://github.com/entrylabs/example/tree/main/base
- StackBlitz 바로 실행: https://stackblitz.com/github/entrylabs/example/tree/main/base

> **우리 프로젝트**: `Entry.exportProject` / `Entry.loadProject` 라운드트립은 `server.js`의 `/api/export` 와 `/api/problems/:id` 엔드포인트가 담당합니다. (자세한 것은 [04-file-format.md](./04-file-format.md) 참고)

## 문제 해결

- 실행 중 문제가 발생하면 먼저 **콘솔 로그** 확인.
- 의존성 로드 순서가 중요합니다. 특히 `EaselJS` → `SoundJS` → `Entry`. 순서가 틀리면 스테이지 렌더 실패.
- `EntryStatic`이 `entry.min.js` **이전에** 로드되지 않으면 블록 카테고리가 비어있게 나타납니다.
