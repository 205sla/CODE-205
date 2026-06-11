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
| 등록 API | `src/routes/online.js` | 인증된 `/api/online/projects` 요청 |
| 등록 서비스 | `src/services/onlineProjectService.js` | 입력 검증, 3개 제한, 소유자 조회 |
| DB | `src/db/schema.sql`, `src/db/init.js` | `sync_projects` 멱등 생성 |
| WS 연결 | `src/realtime/wsServer.js` | `/sync` Upgrade, 첫 join 검증 |
| 방 상태 | `src/realtime/roomManager.js` | forming/locked, 슬롯, LWW 병합 |
| 진입점 | `src/server.js` | Express와 WebSocket이 공유하는 HTTP 서버 |

## HTTP API

모든 엔드포인트는 `requireAuth`를 사용한다.

- `GET /api/online/projects`: 현재 사용자의 등록 목록
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

입장 후 지원 메시지는 `ping`, `set`, `resync`다. 서버는 `roster`, `slot`,
`state`, `patch`, `pong`, `error`를 보낸다.

## 방과 상태 규칙

- 등록별 forming 방은 하나만 유지한다.
- 정원이 차면 locked가 되고 이후 플레이어는 새 forming 방으로 들어간다.
- locked 방에서 이탈한 슬롯은 비워 두며 새 플레이어로 채우지 않는다.
- 방의 마지막 연결이 나가면 방과 메모리 스냅샷을 폐기한다.
- 변수와 리스트는 마지막으로 받은 값이 이기는 LWW 방식이다.
- 서버 스냅샷은 재접속/엔진 교체 시 `resync` 부트스트랩에 사용한다.
- `$확장프로그램`, `$유저번호`는 클라이언트 로컬 값이므로 서버가 무시한다.

## 검증

```powershell
node --test tests/online.test.js
npm test
```

`tests/online.test.js`는 방 잠금, 오버플로 새 방, 빈 슬롯 유지, LWW 병합,
소유자 ID 조회, 등록 제한, WebSocket 클라이언트 두 개의 패치 전달을 검증한다.

확장 실사이트 스모크는 별도 비공개 확장 저장소에서 실행한다. 운영 배포 후에는
HTTP 상태와 별도로 `/sync`의 WebSocket Upgrade와 join 응답을 확인한다.
