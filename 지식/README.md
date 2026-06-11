# CODE 205 지식

이 폴더는 `code.205.kr` / `apps/MYentry` 프로젝트에만 해당하는 구현, 운영, 검증 지식을 보관한다.

공개 사용자 안내는 루트 문서나 `public/` 화면에 둔다. 이 폴더는 개발자와 운영자가 기능 구조, 서버 설정, 장애 원인, 검증 방법을 다시 찾기 쉽게 남기는 곳이다.

## 분류

| 위치 | 용도 |
|---|---|
| `entry-reference/` | CODE 205에서 쓰는 EntryJS API, 파일 포맷, 엔진, vendoring 참고문서 |
| `기능/` | 기능별 설계, 구현 메모, 서버/API/프런트 연결 방식 |
| `운영/` | 배포, PM2, SQLite, 서버 설정, 예약 작업, 상태 기록 위치 |
| `문제제작/` | 문제 출제, `.ent` 제작, 테스트 케이스, 스프라이트 관련 지식 |

## 현재 핵심 문서

- [EntryJS 참고문서](entry-reference/README.md)
- [엔트리 실시간 변수/리스트 상태 모니터](기능/entry-cloud-variable-status.md)
- [Entry Online](기능/entry-online.md)
- [운영 지식](운영/README.md)
- [문제제작 지식](문제제작/README.md)

## 배치 규칙

- CODE 205의 파일 경로, API, DB 스키마, PM2 설정, 화면 동작처럼 프로젝트 전용 내용은 이 폴더에 둔다.
- ENTRY 전체에 공통인 작업 규칙, 검증 정책, 로컬 Entry 서버 사용법은 `../../../_docs`에 둔다.
- 확장 프로그램이나 upstream 기여처럼 다른 영역에 속한 지식은 해당 영역의 `지식` 폴더에 둔다.
- 비밀번호, 세션 쿠키, `cloudServerInfo.query` 같은 민감값은 문서에 저장하지 않는다. 필요한 경우 “로컬 env 파일에 저장”처럼 위치와 원칙만 적는다.
