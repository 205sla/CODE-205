# 실시간 리스트/변수 서버 상태 기능

목표는 CODE 205의 24시간 서버에서 Entry 클라우드 변수/리스트 서버 상태를 주기적으로 확인하고, 현재 상태와 기록을 웹에서 볼 수 있게 하는 것이다.

## 확인된 Entry 연결 방식

EntryJS의 클라우드 변수 확장은 `socket.io-client`로 서버에 연결한다.

- 참고 위치: `../../../../upstream/entryjs-develop/src/extensions/CloudVariable.js`
- socket path: `/cv`
- query: `{ type, q }`
- transport: `websocket`
- 주요 이벤트: `welcome`, `connect_error`, `disconnect`, `check`, `action`, `create`

## CODE 205에 넣을 위치

| 영역 | 권장 위치 |
|---|---|
| 주기 프로브 | `src/services/cvMonitorService.js` |
| 상태 API | `src/routes/cvStatus.js` |
| DB 기록 | `src/db/schema.sql` migration |
| 상태 화면 | `public/cv-status.html`, `public/js/cv-status.js` |
| 워커 시작 | `src/server.js` |

`createApp()` 안에서 워커를 시작하지 않는다. 테스트에서 앱을 만들 때 타이머가 켜지는 것을 피하기 위해 실제 24시간 모니터는 `server.js`에서만 시작한다.

## 상태 단계

1. 연결 체크: `/cv` websocket 연결이 제한 시간 안에 열리는지 확인한다.
2. 프로토콜 체크: `welcome` 이벤트를 받는지 확인한다.
3. 기능 체크: 모니터 전용 변수/리스트 대상으로 `action` ack가 돌아오는지 확인한다.

## 운영 주의점

- 사용자 프로젝트의 변수나 리스트를 테스트 대상으로 쓰지 않는다.
- 모니터 전용 `url`, `type`, `query` 값을 환경 변수로 분리한다.
- 처음 주기는 30초 또는 60초가 적당하다.
- 최근 기록은 일정 기간 이후 정리하는 보존 정책을 둔다.
- 장애 판단은 단발 실패가 아니라 연속 실패 기준으로 잡는다.

## 필요한 환경 변수 초안

```txt
CV_MONITOR_ENABLED=false
CV_MONITOR_URL=
CV_MONITOR_TYPE=
CV_MONITOR_QUERY=
CV_MONITOR_INTERVAL_SEC=60
CV_MONITOR_TIMEOUT_MS=5000
CV_MONITOR_RETENTION_DAYS=30
```
