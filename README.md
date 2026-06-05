# CODE 205

블록 코딩 기반 알고리즘 문제 풀이 플랫폼입니다.
좌측 패널에서 문제 지문을 읽고, 우측 에디터로 블록을 조립하여 풀이합니다.
제출 시 브라우저에서 테스트 케이스를 자동 채점합니다.

🌐 **Live**: [https://code.205.kr](https://code.205.kr) (Beta)

> **상표**: "205"®는 대한민국 특허청에 출원된 등록 상표입니다 (출원번호 40-2023-0165693). 상표 및 3rd-party 라이선스 정보는 [NOTICE.md](NOTICE.md)를 참고하세요.
>
> **Attribution**: 이 프로젝트는 [entrylabs/entryjs](https://github.com/entrylabs/entryjs) (Apache License 2.0)를 런타임 엔진으로 사용합니다. Entry Labs의 공식 서비스가 아닙니다.

## 실행 방법

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속 (Windows는 `server.bat` 더블클릭, 기본 포트 3005).

> 반드시 HTTP 서버를 통해 접속해야 합니다. `index.html`을 직접 더블클릭하면 브라우저 보안 정책 때문에 동작하지 않습니다.

### 요구 사항
- Node.js ≥ 20 (`better-sqlite3@12`가 Node 20+ 필요)
- 서버에 native addon 빌드용 `build-essential` + `python3-dev` (회원 기능을 위한 SQLite 의존)

### 환경 변수 (선택)
`.env.template`을 `.env`로 복사 후 필요 시 override:
- `PORT` (기본 3000)
- `SITE_URL` (기본 `https://code.205.kr`)
- `DB_PATH` (기본 `./db/data.db`)
- `SESSION_SECRET` (production은 `openssl rand -base64 48`로 강한 값 권장)
- `SESSION_COOKIE_SECURE` (HTTPS 뒤에서 `true`)

## 화면 구성

### 메인 화면
- 문제 목록을 카드로 표시, 난이도를 별(0~5)로 표시
- 해결한 문제는 초록 테두리 + "✓ 해결" 배지로 구분
- 상단 "학습 시작하기" 영역에 sample / tutorial 카테고리 노출
- 난이도·해결 여부 필터 패널, localStorage에 상태 보존
- 헤더 우측: 비로그인 시 "로그인" + "가입" 버튼, 로그인 시 "닉네임 ▾" 드롭다운(프로필·로그아웃)

### 에디터 화면
- 좌측: 문제 설명 패널 (Markdown 렌더링, 드래그로 크기 조절)
- 우측: 엔트리 블록 코딩 워크스페이스 + 스테이지
- 상단 헤더: 블록/파이썬 모드 전환, 실행취소/다시실행, 초기화, 내 컴퓨터에 저장하기, 테스트/제출, 로그인 사용자 드롭다운
- 풀었던 문제 재진입 시 "이전에 푼 코드를 불러오시겠어요?" 확인 모달

### 회원 페이지
- `/signup.html` — 가입 폼 (아이디·비밀번호·출생연도 필수, 이메일·표시이름 선택). 14세 이상만 가입 가능
- `/login.html` — 로그인 폼
- `/profile.html` — 6개 섹션:
  1. 기본 정보 (이메일·표시이름 변경)
  2. 풀이 통계 (총 N/M + 난이도별 그리드)
  3. 내가 푼 코드 (자동 저장된 정답 목록, 클릭 = 에디터 진입)
  4. 비밀번호 변경
  5. 풀이 데이터 초기화 (solved + 코드 일괄 삭제)
  6. 계정 삭제 (CASCADE로 모든 회원 데이터 정리)

### 정적 페이지
- `/contribute.html` — 문제 기여 가이드
- `/merge` — 엔트리 작품(.ent) 합치기 도구 (클라이언트 사이드)
- `/privacy.html` — 개인정보 처리방침 (회원 데이터 수집·보유·삭제 정책)
- `/terms.html` — 이용약관

## 주요 기능

### 작품 합치기 (`/merge`)
- 여러 엔트리 작품(`.ent`)을 하나로 합치는 도구. **처리는 전량 브라우저(클라이언트 사이드)** — 파일이 서버로 업로드되지 않아 안전하고 서버 부하 0
- 각 작품의 장면(scene) ID를 난수화해 충돌을 막고, 오브젝트·변수·리스트를 재귀 병합. `대답`·`초시계` 등 특수 변수는 중복 제거
- 파일당 50MB · 전체 150MB · 최대 10개. 합친 결과 `머지.ent`를 다운로드 → playentry.org 오프라인 작품 불러오기로 사용
- 진행률은 **바이트 가중 + 단계별**로 표시(수집 82% → 후처리 88% → 압축 100%), gzip은 스트리밍으로 세분 진행
- 기타 설정: "리메이크 표시 지우기", "대답·초시계 숨기기". 병합 엔진은 `extensions/entry-merge-extension` 로직 이식, 순수 함수는 `tests/merge.test.js`로 검증

### 회원 시스템 (선택)
- **비회원으로도 핵심 기능 그대로 이용 가능**. 회원 가입은 추가 가치(서버 동기화·코드 보관·통계)를 위한 선택
- 가입 정책: username 영문·숫자·_ 3~20자 (대소문자 구분 없이 lowercase로 정규화 — `User123`/`USER123`이 별개 계정으로 가입되는 사칭 차단), 비밀번호 8자 이상 + 영문 + 숫자, 14세 이상
- **비밀번호는 bcrypt(cost 10) 해시로만 저장**. 평문 미보관, 운영자도 조회 불가. 분실 시 복구 미제공 — 안전한 곳에 보관 필수
- 세션 쿠키 `code205.sid` — `httpOnly` + `sameSite=lax` + `secure`(HTTPS) + 7일
- Rate-limit (IP 기준): login 10회/15분, signup 5회/1시간
- 가입 폼에 "엔트리(playentry.org) 계정과 다른 비밀번호 사용" 강조 안내

### 풀이 기록 동기화 (회원)
- 정답 통과 시 problem_id가 서버 `solutions` 테이블에 자동 등록
- 페이지 로드 시 localStorage(`entry:solved`) ↔ 서버 양방향 자동 병합
- 비회원은 기존대로 localStorage만 사용 (강제 로그인 X)

### 정답 코드 자동 저장 + 복원 (회원)
- 정답 통과(submit + allPass) 시 `Entry.exportProject` 결과(JSON, ≤100KB)를 `submissions` 테이블에 자동 저장 (문제당 최신 1개, 덮어쓰기)
- 풀었던 문제 재진입 시 "내 풀이 불러오기 / 처음부터 시작" 확인 모달
- 프로필 "내가 푼 코드" 행 클릭 = 해당 문제의 에디터로 즉시 이동 → 모달 자동 트리거
- 모든 회원 데이터는 프로필 페이지에서 직접 수정·삭제 가능. 계정 삭제 시 외래키 CASCADE로 자동 정리

### 채점 시스템
- **로컬 채점**: 모든 채점은 브라우저에서 실행 (서버 부하 없음)
- **테스트하기**: 공개 케이스로 풀이 검증 (케이스 이름, 실패 상세 공개)
- **제출하기**: 숨김 케이스로 최종 평가 (케이스 이름, 실패 상세 비공개)
- **화면 차단 모달**: 채점 중 전체 화면을 가리고 진행 현황만 표시
- **⏹ 채점 중단** 버튼으로 즉시 취소 가능
- **전체 통과 시**: 해당 문제 id가 localStorage + (회원이면) 서버에 기록 + "🏠 문제 선택으로" 버튼 노출
- **시간 초과 감지**: 무한 반복 등 타임아웃 시 오답 처리 (기본 5초, 케이스별 설정 가능)
- **오류 감지**: 실행 중 경고(빨간색 블록) 발생 시 오류 처리
- **채점 중 보호**: 키보드 입력 차단, 엔진 시작/정지 버튼 차단

### 입출력 지원
| 입력 방식 | 출력 방식 |
|----------|----------|
| 없음 (고정 출력) | 말하기 (`say`) |
| 변수 (`setup.variables`) | 변수 최종값 (`expected.variables`) |
| 리스트 (`setup.lists`) | 리스트 최종값 (`expected.lists`) |
| 묻고 기다리기 (`대답`) | 복합 (say + 변수 + 리스트) |

### 파이썬 모드 호환
- 블록/파이썬 양쪽 모드에서 동일하게 채점
- 파이썬 모드의 변수/리스트 하드코딩 문제를 자동 재적용으로 해결

### 묻고 기다리기 자동 응답
- `tests.json`에 `"대답": "값"` 설정 시 채점 중 자동 입력
- 캔버스 기반 입력 필드를 감지하여 `Entry.container.setInputValue()` 호출

### 에디터 기능
- **실행취소/다시실행**: 헤더 버튼 + Ctrl+Z / Ctrl+Shift+Z
- **초기화**: 프로젝트를 원래 상태로 복원 (확인 다이얼로그 포함)
- **블록/파이썬 모드 전환**: 헤더 버튼
- **스프라이트 카탈로그**: 로컬 번들 SVG/PNG 스프라이트, 문제별 필터링. "오브젝트 추가하기" 팝업에 마스코트 **205봇**(idle/walk-1/walk-2/hello 4개 모양 묶음)이 포함됨
- **내 컴퓨터에 저장하기**: 현재 작품을 `.ent` 파일로 다운로드
  - 서버가 자산(이미지·소리)을 엔트리 공식 포맷(`temp/<aa>/<bb>/(image|thumb|sound)/<hash>.<ext>`)으로 재번들
  - SVG는 `sharp`로 PNG 래스터 + 96px 썸네일도 함께 번들 (엔트리 업로드 파이프라인 호환)
  - 다운로드한 `.ent`를 `playentry.org` → 작품 만들기 → 파일 → 오프라인 작품 불러오기로 업로드 가능

### 비활성화된 기능
알고리즘 플랫폼에 불필요하거나 서버 의존적인 기능을 비활성화:
- 블록 카테고리: 데이터 분석, 인공지능, 확장, 하드웨어
- 나만의 보관함, 오브젝트 내보내기, 블록 이미지 저장
- 모양/소리 편집기 (목록은 유지)
- 팝업 파일 올리기/새로 그리기/글상자/검색

## 디렉터리 구조

```
CODE-205/
├── src/                          # 백엔드 (모듈 분리)
│   ├── server.js                 # 진입점 (createApp + listen)
│   ├── app.js                    # Express 앱 팩토리
│   ├── config.js                 # 환경변수·상수
│   ├── db/
│   │   ├── init.js               # better-sqlite3 싱글톤
│   │   ├── schema.sql            # users / solutions / submissions / schema_version
│   │   └── userScoped.js         # user_id FK 테이블 공용 헬퍼 (행 수·일괄 삭제)
│   ├── routes/
│   │   ├── _respond.js           # fail() + errorHandler 응답 헬퍼
│   │   ├── seo.js                # /sitemap.xml
│   │   ├── problems.js           # /api/problems/*
│   │   ├── sprites.js            # /api/sprites
│   │   ├── export.js             # /api/export
│   │   ├── auth.js               # /api/auth/{signup,login,logout,me}
│   │   └── me.js                 # /api/me/{,solved,submissions,password}
│   ├── services/
│   │   ├── problemService.js
│   │   ├── spriteService.js
│   │   ├── assetService.js
│   │   ├── userService.js
│   │   ├── authService.js        # 검증 + bcrypt + AuthError
│   │   ├── solutionService.js
│   │   └── submissionService.js
│   └── middleware/
│       ├── auth.js               # requireAuth / optionalAuth
│       └── rateLimit.js          # login / signup limiter
├── ecosystem.config.js           # PM2 프로세스 정의
├── package.json                  # scripts: start / test
├── .env.template                 # 환경변수 템플릿
├── PROBLEM_GUIDE.md              # 문제 출제 가이드라인
├── .github/workflows/
│   └── deploy.yml                # CI: 테스트 통과 시 자동 배포
├── problems/                     # 문제 데이터 (NNN/ 3자리 0패딩, 100문제)
│   └── NNN/
│       ├── meta.json             # 제목, 난이도, 카테고리(sample/tutorial), sprites
│       ├── description.md        # Markdown 문제 설명
│       ├── tests.json            # 테스트/채점 케이스
│       ├── project.ent           # 기본 프로젝트 (선택)
│       └── solution.txt          # 모범답안 파이썬 (권장)
├── public/
│   ├── index.html                # 메인 화면
│   ├── editor.html               # Entry 블록 코딩 에디터
│   ├── login.html / signup.html  # 회원 인증 폼
│   ├── profile.html              # 프로필 페이지 (6섹션)
│   ├── contribute.html / privacy.html / terms.html
│   ├── merge.html                # 작품 합치기 도구 (/merge, 클라이언트 사이드)
│   ├── css/
│   │   ├── common.css            # 정적 페이지 공통 (헤더·푸터·user-menu)
│   │   ├── auth.css              # 로그인·가입 폼
│   │   ├── profile.css           # 프로필 카드·통계 그리드
│   │   ├── index.css / editor.css / contribute.css / merge.css
│   ├── js/
│   │   ├── common-header.js      # 헤더 user-menu 동적 주입
│   │   ├── common-footer.js      # disclaimer 푸터
│   │   ├── auth-page.js          # signup/login 폼 처리
│   │   ├── profile-page.js       # 프로필 4섹션 통합
│   │   ├── solved-sync.js        # localStorage ↔ 서버 양방향 병합
│   │   ├── submission-sync.js    # 정답 코드 저장·복원
│   │   ├── index.js              # 메인 화면 스크립트
│   │   ├── editor.js             # 에디터 통합 로직
│   │   ├── editor-pure.js        # 순수 함수 (테스트 대상)
│   │   └── merge/                # 작품 합치기: pako·tar·merge-engine·merge-app
│   ├── sprites/                  # 로컬 스프라이트 카탈로그
│   └── lib/                      # Entry 라이브러리 (로컬 번들, ~64MB)
├── db/                           # 런타임 SQLite 파일 (gitignored)
├── logs/                         # PM2 출력 로그 (gitignored, pm2-logrotate로 회전)
└── tests/                        # node:test 단위·통합 테스트 (224개)
    ├── format.test.js / lists.test.js / markdown.test.js / evaluate.test.js
    ├── userService.test.js / authService.test.js / auth.routes.test.js
    ├── solutionService.test.js / submissionService.test.js
    ├── me.routes.test.js
    ├── db.init.test.js          # 스키마 마이그레이션 baseline 검증
    ├── csp.test.js
    └── merge.test.js          # 작품 합치기 엔진·라우트
```

## 프로젝트 지식

프로젝트 전용 구현/운영 지식은 [`지식/`](지식/README.md)에 정리합니다.

- EntryJS API와 `.ent` 포맷 참고: [`지식/entry-reference/`](지식/entry-reference/README.md)
- 기능별 설계와 구현 메모: [`지식/기능/`](지식/기능/README.md)
- 운영 서버, PM2, DB, 장애 대응: [`지식/운영/`](지식/운영/README.md)
- 문제 제작 내부 메모: [`지식/문제제작/`](지식/문제제작/README.md)

공개 기여자 문서인 `PROBLEM_GUIDE.md`와 라이선스/상표 안내인 `NOTICE.md`는 외부 링크 보존을 위해 루트에 둡니다.

## 문제 추가

`PROBLEM_GUIDE.md`에 상세한 출제 가이드라인이 있습니다.

간단 요약:

1. `problems/NNN/` 디렉터리 생성 (3자리 0패딩)
2. `meta.json` 작성: `{ "title": "제목", "difficulty": 2 }`
3. `description.md` 작성: 문제 설명 / 입력 / 출력 / 예시 / 힌트
4. `tests.json` 작성: `test` (공개) + `submit` (숨김) 케이스
5. `project.ent` (선택): playentry.org에서 내보낸 기본 프로젝트
6. `solution.txt` (권장): 모범답안 파이썬 코드 — 리뷰·검증용

**서버 재시작 불필요** — 파일 추가/수정 후 브라우저 새로고침으로 즉시 반영.

## API

### 문제·자산
| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/problems` | 전체 문제 목록 `[{id, title, difficulty, category}]` |
| `GET /api/problems/:id/meta` | 문제 제목 + 설명 |
| `GET /api/problems/:id/tests?mode=test\|submit` | 테스트 케이스 |
| `GET /api/problems/:id/has-tests` | 테스트 존재 여부 |
| `GET /api/problems/:id` | 프로젝트 데이터 (`.ent`에서 추출, fileurl 자동 리라이트) |
| `GET /api/problems/:id/asset/*` | `.ent` 내부 자산 온디맨드 서빙 (tar에서 꺼냄) |
| `GET /api/sprites` | 전체 스프라이트 카탈로그 |
| `GET /api/sprites?problem=N` | 문제별 스프라이트 필터링 |
| `POST /api/export` | 현재 작품 JSON을 받아 엔트리 호환 `.ent`로 재번들 (내 컴퓨터에 저장하기) |

### 인증 (`/api/auth/*`)
| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/auth/signup` | 가입 + 자동 로그인. body: `{ username, password, birthYear, email?, displayName? }` |
| `POST /api/auth/login` | 로그인. body: `{ username, password }` |
| `POST /api/auth/logout` | 세션 종료 |
| `GET /api/auth/me` | 현재 사용자 정보 또는 `{ user: null }` |

### 회원 본인 데이터 (`/api/me/*`, requireAuth)
| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/me` | 현재 사용자 정보 (alias) |
| `PATCH /api/me` | 이메일·표시이름 부분 갱신 |
| `POST /api/me/password` | 비밀번호 변경 (현재 비밀번호 재확인) |
| `DELETE /api/me` | 계정 삭제 (비밀번호 재확인) — solutions·submissions 자동 정리 |
| `GET /api/me/solved` | 풀이 ID 배열 |
| `POST /api/me/solved/:id` | 풀이 등록 (멱등) |
| `DELETE /api/me/solved/:id` | 단건 제거 |
| `DELETE /api/me/solved` | **전체 일괄 삭제** |
| `GET /api/me/submissions` | 제출 미리보기 목록 (코드 본문 제외, code_size만) |
| `GET /api/me/submissions/:id` | 단건 전체 코드 |
| `POST /api/me/submissions/:id` | 코드 저장 (덮어쓰기, 100KB 한도) |
| `DELETE /api/me/submissions/:id` | 단건 제거 |
| `DELETE /api/me/submissions` | **전체 일괄 삭제** |

## 개발

### 테스트

순수 함수와 모든 인증·데이터 라우트가 Node 내장 `node:test`로 단위·통합 테스트되어 있습니다.

```bash
npm test
```

**224개 테스트** (이전 210 + 작품 합치기 신규 14)가 통과해야 배포 가능.

### CI/CD 파이프라인

`main` 브랜치 push 또는 `workflow_dispatch` 수동 트리거 시 GitHub Actions 실행 (`.github/workflows/deploy.yml`):

```
push → [ test ] ──(needs: test)──▶ [ deploy ] ──▶ [ health check ] → live
       npm ci                       git pull                HTTP 200 확인
       224 tests                    npm install --omit=dev
       ~15초                        pm2 startOrReload ecosystem.config.js
                                    pm2 save
                                    ~10초
```

- **총 소요**: ~25초
- **동시 배포 방지**: `concurrency: deploy-production`
- **SSH 인증**: 전용 ed25519 배포 키 (GitHub Secrets `DEPLOY_KEY`)
- **롤백**: `git revert <commit> && git push` → 자동 재배포

### 운영 인프라

| 계층 | 구성 | 비고 |
|------|------|------|
| 컴퓨트 | Oracle Cloud ARM A1 Flex (2 OCPU / 12 GB) | Always Free |
| OS | Ubuntu 22.04 LTS | |
| Node | 20 LTS (NodeSource) | better-sqlite3 native addon |
| 빌드 도구 | build-essential + python3-dev | native 모듈 컴파일용 |
| DB | SQLite (better-sqlite3) | `db/data.db`, WAL 모드 |
| 세션 store | connect-sqlite3 | 같은 DB 파일 안 sessions 테이블 |
| 리버스 프록시 | Nginx 1.18 (gzip, rate limit) | TLS 종료 |
| SSL | Let's Encrypt + certbot | 60일 자동 갱신 |
| 프로세스 관리 | PM2 6 + `ecosystem.config.js` | `min_uptime`/`max_restarts`/`restart_delay`로 시작 실패 무한 루프 방어 |
| 로그 회전 | `pm2-logrotate` 모듈 | `logs/entry-*.log` 10MB 단위 + 7개 retain + 매일 자정 |
| 모니터링 | PM2 logs, Nginx access/error logs | — |
| 예산 | OCI Budget $1, alert at 1% | 1원 과금 즉시 이메일 |

## 보안

### 애플리케이션 레이어
- **XSS 방어**: 모든 문자열은 `escapeHtml`/`renderMarkdown`을 거쳐 렌더링. 사용자 입력, 문제 이름, 오류 메시지 포함
- **자동 XSS 회귀 테스트** 5종 (`npm test`)
- **CSP (Content Security Policy)**: 정적 페이지에 strict 정책 적용
  - `default-src 'self'`, 외부 도메인 일절 미허용, `'unsafe-inline'`/`'unsafe-eval'` 부재
  - `frame-ancestors 'none'` (clickjacking 방어), `object-src 'none'` (plugin 차단)
  - editor.html과 `/lib/*`은 Entry 런타임 호환을 위해 비활성 (path 기반 분기)
- **비밀번호 저장**: bcrypt cost 10 해시. 평문 미보관, 운영자도 조회 불가
- **세션 쿠키**: `httpOnly` (XSS 방어) + `sameSite=lax` (CSRF 방어) + `secure` (HTTPS 전용) + 7일
- **Rate-limit**: 가입·로그인 엔드포인트에 IP 기준 횟수 제한
- **입력 검증**: 모든 사용자 입력은 형식·길이 검증 후 prepared statement로 처리. SQL 인젝션 차단
- **Path Traversal 차단**: `isValidId` 정규식(`/^\d+$/`)으로 숫자 문제 id만 허용 → `../` 조작 불가
- **전체 삭제 시**: 데이터베이스 외래키 ON DELETE CASCADE로 회원 탈퇴 시 풀이·제출 데이터 모두 즉시 정리

### Nginx 서버 하드닝
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options:    nosniff
X-Frame-Options:           SAMEORIGIN
Referrer-Policy:           strict-origin-when-cross-origin
Server:                    nginx                       (버전 은닉)
```

- **Rate Limiting**
  - 일반: 30 req/s per IP, burst 100
  - API: 10 req/s per IP, burst 30
  - 초과 시 HTTP 429 Too Many Requests
  - DDoS / 크롤러로 인한 대역폭 고갈 방지

### 시스템 레이어
- **SSH 강화**
  - Password 인증 비활성화 (키 인증 전용)
  - `fail2ban` — 5회 실패 시 10분 자동 차단
  - 승인된 키 2개만 (개인 + GitHub Actions 배포 전용)
- **방화벽**
  - OCI Security List: 22/80/443만 공개
  - iptables: 동일 포트 외 전부 REJECT
- **TLS 1.2 / 1.3만 허용** (SSLv3, TLS 1.0/1.1 차단)
- **불필요 서비스 비활성화**: `rpcbind` (NFS 미사용, CVE-2017-8779 등 공격면 제거)
- **최소 권한 실행**: Node.js가 `root`가 아닌 `ubuntu` 유저로 동작

### 비밀 관리
- SSH 개인키, 배포 키: `.gitignore`로 커밋 차단 (`*.key`, `*.pem`, `deploy-key*`)
- GitHub Secrets로 CI 크레덴셜 주입 (`DEPLOY_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`)
- Actions 로그에는 `***`로 마스킹되어 출력
- `SESSION_SECRET`: production 서버의 `.env`에 강한 무작위 값으로만 보관 (저장소 외부)

## 기술 스택

- **Frontend**: EntryJS v4.0.22 (엔트리 블록 코딩 엔진)
- **Backend**: Node.js ≥ 20 + Express + helmet + express-session + express-rate-limit
- **DB**: SQLite (better-sqlite3, WAL 모드) + connect-sqlite3 세션 store
- **인증**: bcryptjs (cost 10) + 세션 쿠키 (httpOnly + sameSite=lax + secure)
- **Entry 라이브러리**: entry-js, entry-tool, entry-paint, entry-lms, sound-editor, legacy-video
- **테스트**: `node:test` (내장) + TAP + 임시 파일 DB 격리 + MemoryStore
- **CI/CD**: GitHub Actions → SSH deploy
- **오프라인 대응**: Entry 관련 라이브러리는 `public/lib/`에 로컬 번들링. jQuery, React 등 범용 라이브러리만 CDN 사용.
