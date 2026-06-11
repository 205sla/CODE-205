# EntryJS 참고 문서 (CODE 205 정리본)

**엔트리(Entry)는 도메인 종속 지식이다.** 파일 포맷·엔진 동작·데이터 스키마·런타임 특이점 대부분은 일반(학습 데이터) 지식이 아니라 공식 문서·소스·역공학으로만 얻어지며, 세션이 바뀌면 다시 도출해야 하는 비싼 정보다. 따라서 이 폴더가 **Entry 도메인 지식의 정식 단일 저장소**다. Entry 기능을 구현·디버깅하기 전에 반드시 여기(+ `C:\Users\young\prg\ENTRY\entryjs` 클론)를 먼저 참조하고, 새로 알아낸 동작은 반드시 여기에 기록한다. (메모리 `Entry editor development principles` 원칙 #3)

## 지식 등급 (출처·신뢰도)

문서는 두 층으로 나뉜다. 각 문서 상단/표의 "원본" 열에 출처를 표기한다.

| 등급 | 문서 | 출처 | 신뢰도·주의 |
|---|---|---|---|
| **A. 공식 미러** | 01–07 | entrylabs/docs (2024 기준) | 공식 문서 기반. 안정적이나 **작성 시점 고정** — 최신 Entry와 다를 수 있음 |
| **B. 역공학·실측** | 08–10 | `entry.min.js` 분석 / 샘플 파일 / 브라우저 검증 / 우리 구현 | **버전 종속·오류 가능**. 반드시 출처·Entry 버전·검증 방법을 함께 기록. 신뢰 전 현재 Entry로 재확인 |

> B 등급(역공학) 사실은 **틀릴 수 있다**. 예: 이번에 발견한 `playentry.org/js/jshint.js`는 404가 아니라 SPA HTML을 200으로 반환했고, lodash 경로가 예고 없이 바뀌었다. 단정 전 항상 현재 동작으로 재검증할 것.

## 제외한 범위

우리 플랫폼은 **블록 코딩 기반 알고리즘 문제 풀이**에 집중하고 **오프라인 우선·무계정·네트워크 차단** 원칙을 따르므로, 아래 영역은 의도적으로 제외했습니다.

| 제외 범주 | 사유 |
|---|---|
| 하드웨어 블록 (`guide/entry-hw`, `hwDownload`, `openHardWare*Manager`) | `hardwareEnable: false` |
| 인공지능 블록 (`blocks/ai-block`, `api/ml`, `openAIUtilize*Manager`, `sttSubmitted`) | `aiLearningEnable: false`, `aiUtilizeDisable: true` |
| 확장 블록 — 날씨·번역·뉴스·공공API 등 (`blocks/expansion-block`, `openExpansionBlockManager`) | `expansionDisable: true` |
| 데이터분석 테이블 (`openTableManager`) | 알고리즘 문제 풀이와 무관 |
| 백팩 (`backpack`, `*BackPack*`) | 서버 계정 필요 — `backpackDisable: true` |
| 소셜·경진대회·행사 기능 | `playentry.org` 고유 기능, 우리와 무관 |

## 문서 구성

| 파일 | 내용 | 원본 |
|---|---|---|
| [01-setup.md](./01-setup.md) | EntryJS 설치·의존성·프로젝트 구조·기본 실행 | `started/*` |
| [02-core-api.md](./02-core-api.md) | `Entry.init`·`loadProject`·`exportProject`·StateManager·Toast·Playground API | `api/2024-02-29-api.md` |
| [03-events.md](./03-events.md) | 프로젝트·블록·모양·소리·오브젝트·함수 이벤트 목록 (AI/HW/확장 제외) | `api/2024-02-29-event.md` |
| [04-file-format.md](./04-file-format.md) | `.ent` 파일 포맷 — tar 레이아웃, fileId 규칙, 압축 옵션 | `file/2024-07-24-ent.md` |
| [05-data-schemas.md](./05-data-schemas.md) | Project / Object / Scene / Variable / Message / Function / Table / Interface 스키마 | `typedef/*` |
| [06-init-options.md](./06-init-options.md) | `Entry.init(container, options)`의 options 전체 — 우리 기본값 포함 | `typedef/2024-03-11-init-options.md` |
| [07-static-and-misc.md](./07-static-and-misc.md) | `static.js` (폰트·색상·블록 카테고리), 기타 팁 | `api/2024-03-05-static.md` |
| [08-eo-format.md](./08-eo-format.md) | `.eo`(단일 오브젝트) 파일 포맷 — "다량 모양 업로더"용 생성 명세 | 역공학 (표본 분석) |
| [08b-eo-generator-prompt.md](./08b-eo-generator-prompt.md) | 위 명세로 Chrome 확장(다량 모양 업로더)을 만들 AI에게 줄 프롬프트 | — |
| [08c-eo-format-errata.md](./08c-eo-format-errata.md) | `.eo` 명세 정정문 (imageType png/svg 한정·SVG 3파일·regX 소수점·BMP 미지원) | 역공학 (정상 표본) |
| [09-engine-and-grading.md](./09-engine-and-grading.md) | `Entry.engine` 상태머신(stop/stopping/run/pause)·toggleStop 비동기 race·자동 채점 흐름 | 역공학 + 우리 구현 |
| [10-offline-and-vendoring.md](./10-offline-and-vendoring.md) | 에디터 외부 CDN 20개 로컬 vendoring·2026-05 CDN 장애·오프라인 검증법 | 우리 구현 |

## 우리 프로젝트에서의 현재 적용 현황

요약만 표로. 상세 구현은 각 문서에서 우리 코드 링크로 표시.

| 기능 | 파일 | 요약 |
|---|---|---|
| `Entry.init` | `public/js/editor.js:~108` | `libDir`, `textCodingEnable`, `hardwareEnable:false`, `backpackDisable:true`, `aiLearningEnable:false`, `aiUtilizeDisable:true`, `expansionDisable:true` |
| `Entry.loadProject` | `public/js/editor.js:~148,185,349` | 자유모드·reset·fallback 세 지점 |
| `Entry.exportProject` + `.ent` 재번들 | `public/js/editor.js:initExport`, `server.js:/api/export` | 클라이언트 JSON 수집 → 서버가 tar+gzip 재번들 |
| `.ent` import & 자산 온디맨드 서빙 | `server.js:/api/problems/:id`, `:id/asset/*` | fileurl 자동 리라이트 + tar 내부 자산 서빙 |
| StateManager (undo/redo) | `public/js/editor.js:initUndoRedo` | 헤더 버튼 ↔ `Entry.stateManager` 동기화 |
| 터보 모드 | `public/js/editor.js:runAllTests` | 채점 중에만 `Entry.isTurbo = true` |
| 엔진 제어 가드 | `public/js/editor.js:installEngineGuard` | 채점 중 사용자 ▶/■ 클릭 무시 → [09](./09-engine-and-grading.md) |
| 엔진 정지 대기 | `public/js/editor.js:waitForEngineStop` | 채점 전·케이스 사이 `state==="stop"` 폴링 (toggleStop 비동기 race 방지) → [09](./09-engine-and-grading.md) |
| 외부 라이브러리 vendoring | `public/lib/vendor/`, `public/editor.html` | CDN 스크립트 20개 로컬 번들 → 외부 의존 0건 → [10](./10-offline-and-vendoring.md) |

## 관리 규칙 (체계적 유지)

**새 Entry 지식을 알아낼 때마다 이 폴더에 추가하는 것이 원칙.** 머릿속·커밋 메시지·PR에만 남기지 말 것 — 다음 세션은 그것들을 못 본다.

### A 등급 (공식 미러, 01–07) 갱신
- 엔트리 공식 문서가 갱신되면 필요 시 함께 업데이트.
- 원본 URL 규칙: `https://raw.githubusercontent.com/entrylabs/docs/master/source/<relative-path>.md`
- 다시 동기화하려면: `gh api repos/entrylabs/docs/contents/source/entryjs/...`

### B 등급 (역공학·실측, 08+) 추가·갱신
새 문서를 추가하거나 기존 문서에 사실을 더할 때 다음을 반드시 포함:
1. **출처** — 어디서 알아냈나 (`entry.min.js`의 어느 패턴 / 어떤 샘플 파일 / 브라우저 네트워크·콘솔 / 우리 코드 동작)
2. **Entry 버전·날짜** — 역공학 정보는 버전 종속. entry-js 버전 또는 관찰 날짜 명기
3. **검증 방법** — 어떻게 확인했나 (재현 가능하도록). "추정"인지 "검증됨"인지 구분
4. **우리 코드 링크** — 해당 동작을 쓰는 `public/...`·`src/...` 위치
5. **README 인덱스 등록** — "문서 구성" 표 + 필요 시 "적용 현황" 표에 추가

### 작성 후 체크
- [ ] 새 문서가 "문서 구성" 표에 링크됨
- [ ] B 등급이면 출처·버전·신뢰도 표기됨
- [ ] 큰 발견이면 메모리에도 포인터 (예: `editor-cdn-dependency-risk`)
- [ ] 단정적 서술 전, 현재 Entry로 재확인했는가
