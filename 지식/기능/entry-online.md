# Entry Online (이관·제거됨)

> 이 기능은 **독립 서비스로 분리**되어 CODE 205(`apps/MYentry`)에서는 **제거**되었다.
> 2026-06 디커미션. 운영 위치 = `https://online.205.kr` (repo `205sla/entry-online`, 로컬 `apps/entry-online`).

## 무슨 일이 있었나

Entry 작품의 `$` 변수·리스트를 같은 방 플레이어끼리 실시간 동기화하던 `/online`·`/sync`(WebSocket)
기능을 부하·책임 분리를 위해 별도 서비스 **Entry Online**으로 이관했다. 기존 사용자가 신규
확장(→`wss://online.205.kr/sync`)으로 전환된 것을 확인한 뒤, CODE 205에서 관련 코드(등록
라우트·WS 서버·방 관리·사용량·등록 화면·테스트)를 제거했다.

## CODE 205에 남은 것 (의도적 보존)

- DB 테이블 `sync_projects`·`sync_usage`는 **드롭하지 않고 보존**한다(과거 데이터, 코드가 안 쓰는
  무해한 사장 상태). `src/db/schema.sql` 정의도 그대로 둔다.
- `ws` 의존성은 **유지** — `src/services/entryCvMonitor.js`가 playentry 클라우드 변수 모니터에
  WebSocket 클라이언트로 사용한다. 제거 금지.

## 이관 후 위치 (`apps/entry-online`)

| 영역 | 위치 |
|---|---|
| 등록 화면·API | `public/online.*`, `src/routes/online.js`, `src/services/onlineProjectService.js` |
| WS·방·사용량 | `src/realtime/{wsServer,roomManager,usageMeter}.js` |
| 설계 SSOT | `_docs/entry-online-sync-plan.md` |

> 디커미션 절차 원본: `_docs/entry-online-verify-and-decommission.md` §2.
