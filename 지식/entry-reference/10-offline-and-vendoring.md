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

> 관련: [[01-setup.md]](./01-setup.md) (의존성), [[06-init-options.md]](./06-init-options.md) (비활성 기능 옵션), 메모리 `editor-cdn-dependency-risk`.
