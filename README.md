# CODE 205

블록 코딩 기반 알고리즘 문제 풀이 플랫폼입니다. 좌측에서 문제를 읽고 우측 EntryJS 에디터에서 블록 또는 파이썬 모드로 풀이하며, 브라우저에서 테스트와 제출 채점을 실행합니다.

🌐 **서비스**: [https://code.205.kr](https://code.205.kr) (Beta)

> **상표**: "205"®는 대한민국 특허청에 출원된 등록 상표입니다(출원번호 40-2023-0165693). 상표 및 제3자 라이선스는 [NOTICE.md](NOTICE.md)를 참고하세요.
>
> **Attribution**: [entrylabs/entryjs](https://github.com/entrylabs/entryjs)(Apache License 2.0)를 런타임 엔진으로 사용합니다. Entry Labs의 공식 서비스가 아닙니다.

## 현재 배포 구조

CODE 205의 사용자-facing 사이트는 GitHub Pages용 완전 정적 산출물로 빌드됩니다.

- 문제 목록·설명·테스트·초기 프로젝트: 빌드 시 `/data/` 아래 정적 JSON과 공유 자산으로 변환
- 채점: 브라우저에서 실행
- 클리어 기록: `localStorage['entry:solved']`에만 저장
- 작품 합치기와 `.ent` 내보내기: 브라우저에서 처리
- 회원가입·로그인·프로필·기기 간 동기화: 제공하지 않음
- 상태 모니터: 정적 사이트에서 제공하지 않음

기존 Express/SQLite/PM2 소스는 과거 구현 기록과 회귀 테스트를 위해 `src/`, `db/`, `ecosystem.config.js`에 남아 있지만 배포에는 사용하지 않습니다. 기존 회원정보·세션·서버 클리어 기록·제출 코드는 별도 백업 없이 삭제했으며, Oracle VM은 다른 용도로 유지합니다.

### Entry 서비스와의 분리

CODE 205는 EntryJS 오픈소스 엔진과 필요한 이미지·소리·라이브러리를 자체 정적 파일로 배포합니다. 실행 중 playentry.org API, CDN, 로그인 또는 작품 서버를 사용하지 않으며, 문제 프로젝트에도 외부 HTTP 자산 URL을 허용하지 않습니다.

- 사용하지 않는 `entry-lms`, `socket.io-client`는 원본 저장소에는 보존하지만 Pages 산출물에서는 제외
- EntryJS가 초기화 시 요구하는 `legacy-video` 어댑터는 로컬로 포함하되, 기능은 비활성화하고 외부 모델 요청은 차단
- 편집기 시작 전에 네트워크 가드를 설치해 다른 origin으로 향하는 Fetch, XHR, WebSocket, EventSource, Beacon 차단
- 모든 Pages HTML에 `connect-src 'self'`를 포함한 Content Security Policy 삽입
- 외부 실행 스크립트·스타일과 외부 프로젝트 자산이 다시 들어오면 정적 빌드 테스트 실패

따라서 Entry 공식 서비스가 중단되어도 현재 CODE 205 기능은 자체 정적 자산과 호스팅이 유지되는 동안 계속 실행할 수 있습니다. 다만 GitHub Pages·사용자 도메인·브라우저 저장소는 별도 운영 의존성이고, EntryJS 자체는 계속 보존·유지보수해야 하는 로컬 런타임 의존성입니다.

## 로컬 실행

요구 사항: Node.js 20 이상.

```bash
npm ci
npm run build:pages
npm run preview:pages
```

브라우저에서 `http://127.0.0.1:4173`에 접속합니다. `_site/`는 빌드 산출물이므로 Git에 커밋하지 않습니다.

과거 서버 구현을 로컬 회귀 검증할 때만 다음 명령을 사용합니다. 운영 배포 경로는 없습니다.

```bash
npm start
```

## 주요 기능

### 문제 풀이와 로컬 채점

- 문제 100개와 난이도·해결 여부 필터
- 블록/파이썬 모드
- 공개 테스트와 제출 테스트
- 말하기, 변수, 리스트, 묻고 기다리기 자동 응답 지원
- 무한 반복 타임아웃과 실행 오류 감지
- 제출 전체 통과 시 현재 브라우저의 클리어 목록에 문제 ID 추가

클리어 기록은 동일한 `https://code.205.kr` origin에서 유지됩니다. 다른 브라우저·기기와 동기화되지 않으며 사이트 데이터 삭제 시 복구할 수 없습니다.

정적 호스팅에서는 테스트 데이터와 채점 로직이 브라우저에 전달되고 `localStorage`도 사용자가 수정할 수 있습니다. 따라서 이 구성은 학습용 자기점검에는 적합하지만, 클리어 인증·순위·부정행위 방지가 필요한 서비스에는 적합하지 않습니다.

### `.ent` 내보내기

현재 프로젝트와 same-origin 이미지·소리 자산을 브라우저에서 Entry 호환 gzip tar로 묶습니다.

- 서버 업로드 없음
- SVG 원본과 PNG 래스터 이미지 생성
- 96px PNG 썸네일 생성
- 결과물을 `code205-YYYYMMDD-HHMMSS.ent`로 다운로드

내보낸 파일은 playentry.org의 “오프라인 작품 불러오기”에서 실제 동작하는 것을 수동 확인했습니다. 내보내기 형식을 변경할 때는 같은 절차로 다시 검증합니다.

### 작품 합치기

`/merge/`에서 여러 `.ent` 파일을 브라우저 안에서 병합합니다.

- 파일당 50MB, 전체 150MB, 최대 10개
- 장면 ID 충돌 방지
- 오브젝트·변수·리스트 재귀 병합
- 대답·초시계 중복 제거
- gzip tar 결과 다운로드

## 정적 빌드

`tools/build-pages.js`가 다음 작업을 수행합니다.

1. `public/`을 `_site/`로 복사
2. 서버 전용 회원·상태 파일과 사용하지 않는 온라인 서비스 라이브러리를 Pages 산출물에서 제외
3. `problems/NNN/project.ent`의 `project.json`과 자산 추출
4. 자산을 SHA-256 이름의 `/data/assets/` 공유 풀로 중복 제거
5. 문제별 `problem.json`, `tests.json`, `project.json` 생성
6. `/data/problems.json`, `sitemap.xml`, `.nojekyll` 생성
7. `/merge/`, `/Status` 및 이전 회원 URL의 호환 페이지 생성
8. 모든 HTML에 same-origin Content Security Policy 삽입
9. 2026년 7월 31일까지 모든 HTML에 서비스 전환 공지 삽입

산출물 개요:

```text
_site/
├── index.html
├── editor.html
├── merge/
│   └── index.html
├── data/
│   ├── problems.json
│   ├── problems/001/{problem,tests,project}.json
│   └── assets/<sha256>.<ext>
├── sprites/
├── images/
├── lib/
├── css/
└── js/
```

정적 런타임 경로:

| 경로 | 내용 |
| --- | --- |
| `/data/problems.json` | 문제 목록 |
| `/data/problems/NNN/problem.json` | 메타데이터·설명·스프라이트 제한·테스트 존재 여부 |
| `/data/problems/NNN/tests.json` | 공개·제출 테스트 |
| `/data/problems/NNN/project.json` | 빌드 시 추출된 Entry 프로젝트 |
| `/data/assets/*` | 문제 간 중복 제거된 프로젝트 자산 |
| `/sprites/catalog.json` | 로컬 스프라이트 카탈로그 |

`solution.txt`와 원본 `.ent`는 정적 사이트에 배포하지 않습니다.

## GitHub Pages 배포

`.github/workflows/pages.yml`:

```text
main push
  → npm ci
  → npm test
  → npm run build:pages
  → upload-pages-artifact
  → deploy-pages
```

저장소 Settings → Pages의 Source를 **GitHub Actions**로 설정하고 custom domain을 `code.205.kr`로 별도 등록해야 합니다. Actions 기반 Pages 배포에서는 산출물의 `CNAME` 파일이 무시되므로 빌드에서 생성하지 않습니다. 자세한 동작은 [GitHub의 custom domain 설정 문서](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)를 기준으로 합니다.

앱 자산 경로가 `/data`, `/lib`, `/css`처럼 origin 루트 기준이므로 `https://<account>.github.io/<repository>/` 형태의 프로젝트 URL은 시험 주소로 사용할 수 없습니다. 로컬 `npm run preview:pages` 또는 origin 루트에 배포되는 별도 시험 도메인에서 검증합니다. 저장소 Pages 설정에 custom domain이 등록되면 기본 `github.io` 주소는 커스텀 도메인으로 리디렉션될 수 있습니다.

DNS를 변경하기 전에 GitHub 계정의 Pages 설정에서 도메인 소유권을 TXT 레코드로 검증하고, 저장소의 custom domain 등록을 먼저 완료합니다. 검증 TXT 레코드는 전환 후에도 유지합니다.

Oracle 배포 워크플로와 `DEPLOY_HOST`, `DEPLOY_KEY`, `DEPLOY_USER` 비밀정보는 제거합니다. `pre-pages-migration` 태그는 전환 이전 소스의 식별 기준일 뿐, 삭제한 회원·제출 데이터를 복구하지 않습니다. Pages 전환 후에도 Oracle 인스턴스 자체는 다른 용도로 유지합니다.

### 정적 호스팅의 보안 헤더 제약

빌드가 모든 HTML에 meta CSP를 삽입해 외부 연결과 외부 실행 자산을 제한합니다. 다만 meta CSP는 응답 헤더 CSP와 완전히 같지 않고 `frame-ancestors`를 적용할 수 없으며, HSTS 같은 응답 헤더도 설정하지 못합니다. 편집기는 EntryJS 동작을 위해 `unsafe-eval`과 `blob:` 스크립트를 허용합니다. GitHub의 **Enforce HTTPS**를 활성화하고, 강한 프레임 차단이나 더 엄격한 응답 헤더가 필요하면 헤더를 제어할 수 있는 CDN 또는 다른 정적 호스팅 계층을 사용해야 합니다.

## 문제 추가

1. `problems/NNN/` 디렉터리를 만듭니다.
2. `meta.json`, `description.md`, `tests.json`을 작성합니다.
3. 필요하면 `project.ent`와 검토용 `solution.txt`를 추가합니다.
4. 정적 빌드와 테스트를 실행합니다.

```bash
npm run build:pages
npm test
npm run preview:pages
```

자세한 작성 규칙은 [PROBLEM_GUIDE.md](PROBLEM_GUIDE.md)를 참고하세요.

## 테스트

```bash
npm test
```

기존 서버 회귀 테스트와 함께 다음 정적 빌드 보장을 검사합니다.

- 문제 100개 산출
- 모든 문제 데이터 파일 존재
- `project.json`의 자산 참조 무결성과 외부 HTTP 자산 부재
- 사용하지 않는 Entry 온라인 서비스 번들의 Pages 산출물 제외와 필수 로컬 어댑터 보존
- 모든 HTML의 same-origin CSP와 편집기 네트워크 가드
- 외부 실행 스크립트·스타일 부재
- Pages HTML·앱 JS의 서버 API 호출 잔재 없음
- HTML의 로컬 스크립트·스타일 참조 무결성
- 서버·DB·비밀정보·`solution.txt`의 Pages 산출물 유출 방지
- Oracle 배포 워크플로와 SSH 연결 정보 부재
- `.nojekyll`, `/merge/`, 이전 URL 안내 페이지 존재 및 무효한 `CNAME` 산출물 부재
- 사이트맵 문제 URL 완전성

## 디렉터리

```text
CODE-205/
├── .github/workflows/
│   └── pages.yml              # GitHub Pages 빌드·배포
├── problems/                  # 문제 원본(SSOT)
├── public/                    # 정적 프런트 원본
├── tools/
│   ├── build-pages.js         # Pages 산출물 생성
│   └── serve-pages.js         # 로컬 정적 미리보기
├── tests/
├── src/                       # 과거 Express 백엔드(배포하지 않음)
├── db/                        # 로컬 테스트용 SQLite 위치(gitignored)
├── ecosystem.config.js        # 과거 PM2 설정(배포하지 않음)
└── _site/                     # 생성 산출물(gitignored)
```

프로젝트별 구현·운영 기록은 [지식/](지식/README.md)에 보관합니다.
