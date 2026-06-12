# Entry Online

Entry 작품의 `$` 접두 변수와 리스트를 같은 방의 플레이어 사이에서 실시간
동기화하는 기능이다. CODE 205는 작품 등록, 방 매칭, WebSocket 중계와 재동기화
스냅샷을 담당하고 Chrome 확장이 Entry 런타임을 읽고 쓴다.

## 사용자 흐름

1. 로그인 사용자가 `/online`에서 Entry 작품 ID와 방 인원 2~8명을 등록한다.
2. 작품은 `$입장("CODE 205 아이디")`를 호출한다.
3. 등록 레코드별 forming 방이 도착 순서로 채워진다.
4. 정원이 차면 방이 잠기고 슬롯 1부터 N까지 배정된다.
5. `$나가기` 또는 작품 정지 시 연결을 닫는다.

계정당 등록은 최대 3개이며 같은 계정은 같은 Entry 작품을 중복 등록할 수 없다.
다른 계정은 같은 작품을 각각 등록할 수 있고, 방 풀은 `sync_projects.id`로
분리된다.

## 코드 위치

| 영역 | 위치 | 책임 |
|---|---|---|
| 등록 화면 | `public/online.html`, `public/js/online/` | 작품 목록, 등록, 삭제, 사용법 |
| 등록 API | `src/routes/online.js` | 인증된 작품 등록·사용량 요청 |
| 등록 서비스 | `src/services/onlineProjectService.js` | 입력 검증, 3개 제한, 소유자 조회 |
| DB | `src/db/schema.sql`, `src/db/init.js` | `sync_projects`, `sync_usage` 멱등 생성·마이그레이션 |
| WS 연결 | `src/realtime/wsServer.js` | `/sync` Upgrade, 첫 join 검증 |
| 방 상태 | `src/realtime/roomManager.js` | forming/locked, 슬롯, LWW 병합 |
| 사용량 | `src/realtime/usageMeter.js` | 작품별 트래픽 메모리 누적·SQLite 배치 반영 |
| 진입점 | `src/server.js` | Express와 WebSocket이 공유하는 HTTP 서버 |

## HTTP API

모든 엔드포인트는 `requireAuth`를 사용한다.

- `GET /api/online/projects`: 현재 사용자의 등록 목록
- `GET /api/online/usage`: 작품별 누적 사용량과 등록 해제 이력을 포함한 계정 총합
- `POST /api/online/projects`: `{ entryProjectId, roomSize }`
- `DELETE /api/online/projects/:id`: 현재 사용자의 등록 삭제

응답에는 CODE 205 `ownerId`를 포함하지만 내부 호환용 token 컬럼은 노출하지
않는다.

## WebSocket 계약

클라이언트는 `wss://code.205.kr/sync`에 연결하고 10초 안에 첫 메시지로 다음을
보낸다.

```json
{
  "type": "join",
  "projectId": "entry_project_id",
  "ownerId": "code205_id"
}
```

서버는 작품 ID와 CODE 205 사용자명을 함께 조회한다. 일치하는 등록이 없으면
`REGISTRATION_NOT_FOUND`를 보내고 연결을 닫는다. 바이너리 메시지는 거부하며
최대 payload는 64KiB다.

연결별 애플리케이션 메시지는 1초에 30개까지 허용한다. 초과하면
`RATE_LIMITED`를 보내고 연결을 닫는다. 입장 후 지원 메시지는 `ping`, `set`,
`resync`다. 서버는 `roster`, `slot`,
`state`, `patch`, `pong`, `error`를 보낸다.

서버는 25초마다 WebSocket ping을 보내 죽은 연결을 정리한다. 잠긴 방의
비정상 단절은 15초 동안 슬롯별 `resumeToken`을 보관하며, 같은 클라이언트가
토큰으로 돌아올 때만 기존 슬롯을 복구한다. 정상 `$나가기`, 작품 정지,
engine 교체는 close code 1000으로 즉시 퇴장하므로 예약을 만들지 않는다.

## 방과 상태 규칙

- 등록별 forming 방은 하나만 유지한다.
- 정원이 차면 locked가 되고 이후 플레이어는 새 forming 방으로 들어간다.
- locked 방에서 이탈한 슬롯은 비워 두며 새 플레이어로 채우지 않는다.
- 방의 마지막 연결과 재접속 예약이 모두 사라지면 방과 메모리 스냅샷을 폐기한다.
- 변수와 리스트는 마지막으로 받은 값이 이기는 LWW 방식이다.
- 서버 스냅샷은 초기 입장과 동일 슬롯 재접속 부트스트랩에 사용한다.
- `$확장프로그램`, `$유저번호`는 클라이언트 로컬 값이므로 서버가 무시한다.

## 사용량 집계

`sync_usage`는 `owner_user_id + entry_project_id + day`를 기본키로 사용한다.
`connections`, `messages_in/out`, `bytes_in/out`을 메모리에 누적하고 기본
10초마다 UPSERT한다. 등록을 삭제해도 같은 계정·작품의 과거 사용량은 유지된다.
`GET /api/online/usage`는 작품별 `usage` 배열과 전체 `total`을 함께 반환한다.
`/online`은 현재 등록한 작품 카드 아래에 작품별 사용량을 표시하고, 별도 총합에는
등록 해제한 작품의 과거 기록도 계속 포함한다.

## 보류한 하드닝

- `projectId + ownerId`는 공개 작품에서 방 풀을 선택하는 값이며 비밀 인증값이
  아니다. 현재는 익명 공개 참여 모델을 유지한다. 비공개 방이 필요해지면 작품에
  노출되는 고정 token 대신 만료되는 입장 티켓이나 별도 방 코드를 설계한다.
- 최대 동시 연결 수, 계정별 방 수, 방의 변수 키 수와 리스트 원소 수 상한은
  사용량 지표와 실제 서버 부하를 확인한 뒤 추가한다.
- 브리지 메시지는 같은 페이지의 다른 스크립트가 관찰할 수 있다. 공개 작품
  데이터라는 현재 위협 모델에서는 유지하되 민감 데이터 동기화 용도로 확대하지
  않는다.

## 검증

```powershell
node --test tests/online.test.js
npm test
```

`tests/online.test.js`는 방 잠금, 오버플로 새 방, 빈 슬롯 유지, LWW 병합,
동일 슬롯 재접속, 사용량 합산/API, 메시지 빈도 제한, 예외 격리와 WebSocket
클라이언트 두 개의 패치 전달을 검증한다. `tests/db.init.test.js`는 v4 운영
DB를 v5로 올릴 때 기존 등록을 보존하고 `sync_usage`를 만드는지 확인한다.

확장 실사이트 스모크는 별도 비공개 확장 저장소에서 실행한다. 운영 배포 후에는
HTTP 상태와 별도로 `/sync`의 WebSocket Upgrade와 join 응답을 확인한다.

## Chrome Web Store 릴리스 연동

확장 새 버전을 제출하기 전에 서버 구현과 공개 설명이 일치하는지 확인한다.
다음 항목이 바뀌면 비공개 확장 저장소의 제출 가이드와
`privacy-policy/EntryOnline.html`도 함께 갱신한다.

- join/set/resync 메시지 필드, payload 상한 또는 빈도 제한
- 작품 등록 식별 방식, 방 공개 범위 또는 재접속 정책
- 수집하는 사용량·로그 항목과 실제 저장·삭제 조건
- 동기화 데이터의 저장 위치, 보유 기간 또는 외부 전송 대상

서버 계약 변경은 가능한 한 이전 스토어 버전과 호환되게 먼저 배포한다. 배포 후
`/online` 등록·사용량 화면과 `wss://code.205.kr/sync` join을 확인한 다음
확장 릴리스를 제출한다. 공개 샘플 작품은 심사 기간 동안 문서에 적힌 CODE 205
아이디로 등록 상태를 유지한다.
