# 엔트리 실시간 변수/리스트 상태 모니터

`code.205.kr/Status`에서 Entry 실시간 변수/리스트 서버 상태를 보여주고, CODE 205 서버가 1시간마다 검사한 결과를 JSON 기록으로 남기는 기능이다.

이 기능의 목표는 “엔트리 서버에 부담을 주지 않는 상태 관찰”이다. 부하 테스트, 연속 재시도, 대량 리스트 쓰기/읽기 검증은 하지 않는다.

## 화면과 API

| 항목 | 위치 |
|---|---|
| 상태 페이지 | `/Status`, `public/status.html` |
| 상태 페이지 스타일 | `public/css/status.css` |
| 상태 페이지 스크립트 | `public/js/status.js` |
| 상태 API | `/api/status/entry-cv`, `src/routes/status.js` |
| 모니터 서비스 | `src/services/entryCvMonitor.js` |
| 서버 시작 연결 | `src/server.js` |
| 라우트 등록 | `src/app.js` |

`/Status` 화면은 60초마다 `/api/status/entry-cv`를 읽어 화면을 갱신한다. 이 갱신은 CODE 205 서버의 저장된 스냅샷만 읽으며, Entry 서버에 새 검사를 강제로 보내지 않는다.

## 동작 과정

1. `src/server.js`가 `createEntryCvMonitor()`로 모니터 인스턴스를 만들고 `createApp({ entryCvMonitor })`에 넘긴다.
2. 서버가 `listen`된 뒤 `entryCvMonitor.start()`가 호출되어 예약 검사를 시작한다.
3. 모니터는 `process.env`와 로컬 env 파일을 합쳐 설정을 읽는다. 실제 계정 정보는 Git에 넣지 않고 서버의 외부 env 파일에 둔다.
4. 검사 주기는 `ENTRY_MONITOR_INTERVAL_MINUTES`를 읽되, 코드에서 최소 1시간으로 강제한다.
5. 예약기는 마지막 기록 시간과 설정 주기를 기준으로 다음 검사 시각을 계산한다. 실패해도 즉시 반복 재시도하지 않고 다음 1시간 주기를 기다린다.
6. 검사 시 Entry 로그인 세션을 만들기 위해 `https://playentry.org/ws/new`에서 CSRF 토큰과 쿠키를 얻는다.
7. GraphQL `signinByUsername`으로 모니터 계정 로그인을 시도한다.
8. 같은 쿠키 세션으로 GraphQL `cloudServerInfo(id)`를 호출해 실시간 서버 URL과 쿼리 토큰을 얻는다.
9. URL은 `/cv/` WebSocket 주소로 바꾸고, `EIO`, `transport=websocket`, `type`, `q` 값을 붙인다.
10. WebSocket/Engine.IO 연결을 열고 Socket.IO `welcome` 이벤트를 기다린다.
11. 결과를 `UP`, `DOWN`, `UNKNOWN` 중 하나로 분류하고 기록 파일에 저장한다.
12. `/api/status/entry-cv`는 최신 기록, 최근 기록 목록, 다음 검사 예정 시각, 공개 가능한 설정만 반환한다.

## 상태 분류

| 상태 | 의미 |
|---|---|
| `UP` | WebSocket 연결이 열리고 Socket.IO `welcome` 이벤트를 받았다. |
| `DOWN` | 연결 오류, 타임아웃, `welcome` 이전 종료, Socket.IO 오류가 발생했다. |
| `UNKNOWN` | 설정 누락, 프로젝트 접근 권한 문제, 로그인/GraphQL 단계 실패처럼 실시간 서버 상태를 판단하기 전 단계에서 막혔다. |

현재 구현은 `UNKNOWN`을 장애로 단정하지 않는다. 예를 들어 모니터 계정 로그인이 성공해도 `cloudServerInfo`가 `403 not authorized`를 반환하면 프로젝트 접근 권한 문제일 수 있으므로 실시간 서버 장애로 분류하지 않는다.

## 설정과 기록

`.env.template`에 공개 가능한 설정 이름만 남겨 둔다.

```txt
ENTRY_MONITOR_ENABLED=false
ENTRY_MONITOR_PROJECT_ID=
ENTRY_MONITOR_ID=
ENTRY_MONITOR_NICKNAME=
ENTRY_MONITOR_PASSWORD=
ENTRY_MONITOR_INTERVAL_MINUTES=60
ENTRY_MONITOR_TIMEOUT_MS=6000
ENTRY_MONITOR_EIO=3
ENTRY_MONITOR_TYPE=
ENTRY_MONITOR_HISTORY_LIMIT=144
ENTRY_MONITOR_LOG_PATH=./db/entry-cv-status.json
```

운영 서버의 실제 계정 정보는 저장소 밖 로컬 env 파일에 둔다.

```txt
/home/ubuntu/.entry-cv-monitor/code205-entry-cv-monitor.env
```

운영 서버의 기본 상태 기록 파일은 다음 위치다.

```txt
/home/ubuntu/CODE-205/db/entry-cv-status.json
```

기록에는 검사 시각, 상태, 이유, 소요 시간 같은 메타데이터만 저장한다. Entry 계정 비밀번호, 쿠키, `cloudServerInfo.query` 토큰은 저장하거나 API로 노출하지 않는다. 프로젝트 ID도 공개 API에서는 축약해 표시한다.

## 개발하면서 확인한 사실

- 실제 실시간 변수/리스트 기능은 로그인된 사용자 맥락으로 다루는 것이 맞다.
- Entry GraphQL 호출은 CSRF 토큰과 쿠키 쌍이 필요하다.
- `cloudServerInfo(id)`는 프로젝트별 실시간 서버 URL과 쿼리 토큰을 돌려준다.
- 로그인 성공과 프로젝트 접근 가능 여부는 별개다. 로그인된 모니터 계정이어도 대상 작품 권한이 없으면 `cloudServerInfo`에서 `403 not authorized`가 날 수 있다.
- Oracle 서버의 Node 20 환경에서는 전역 `WebSocket`이 없을 수 있다. 그래서 모니터 서비스에는 Node 내장 `net`, `tls`, `crypto` 기반의 최소 WebSocket 프로브가 포함되어 있다.
- EntryJS 계열 Socket.IO 호환성을 위해 기본 Engine.IO 버전은 `3`으로 둔다.
- 실시간 리스트는 항목이 15개 이상이면 서버가 정상이어도 오류가 날 수 있다. 정기 상태 모니터는 이 증상만으로 서버 장애를 판단하면 안 된다.
- 정기 모니터는 대량 리스트 검증보다 연결과 `welcome` 이벤트 확인을 우선한다.
- `/Status`의 수동 새로고침 버튼은 화면 데이터를 다시 읽을 뿐, 1시간 제한을 우회하는 검사 버튼이 아니다.

## 추가 검증 필요

- 모니터 계정이 대상 테스트 작품에 접근 가능하도록 만든 뒤 `cloudServerInfo`가 정상 응답하는지 확인한다.
- 프로젝트 소유자, 공동 작업자, 공개 사용자, 익명 사용자 각각에서 `cloudServerInfo` 권한 차이를 분리 확인한다.
- Entry 실시간 자료형 서버가 복구되었을 때 `welcome` 이벤트가 실제로 들어오는지 확인한다.
- 만약 나중에 쓰기/읽기 검증을 추가한다면 테스트 리스트 항목 수는 14개 이하로 유지하고, 검사 후 정리해야 한다.
- 기록 보존 기간과 압축 정책을 운영 기준에 맞춰 확정한다.

## 검증 명령

```powershell
node --test tests\entryCvMonitor.test.js tests\status.routes.test.js tests\csp.test.js
npm test
rg -q --hidden --glob '!.git' "비밀번호나 실제 계정 식별 문자열" .
```

운영 서버에서 상태만 확인할 때는 로컬 API를 읽는다.

```bash
curl -sf http://127.0.0.1:3000/api/status/entry-cv
```
