# 운영 지식

CODE 205 운영 서버, 배포, 프로세스 관리, DB, 예약 작업, 상태 기록 지식을 둔다.

## 현재 운영 기준

- GitHub 저장소: `205sla/CODE-205`
- 운영 브랜치: `main`
- 서버 진입점: `../src/server.js`
- Express 앱 팩토리: `../src/app.js`
- 설정: `../src/config.js`
- DB 초기화: `../src/db/init.js`
- DB 스키마: `../src/db/schema.sql`
- PM2 설정: `../ecosystem.config.js`
- 회원/문제 DB 기본 위치: `../db/data.db`
- 서버 로그 위치: `../logs/`
- 엔트리 실시간 상태 기록: `../db/entry-cv-status.json`
- 자동 배포: `../.github/workflows/deploy.yml`

`main` push 시 GitHub Actions가 `npm test`를 통과한 뒤 SSH로 운영 서버에서
소스를 fast-forward하고, 운영 의존성 설치, PM2 재시작과 HTTP 상태 확인을
수행한다.

## 예약 작업

- 엔트리 실시간 변수/리스트 상태 모니터는 `../src/server.js`에서 서버가 listen된 뒤 시작한다.
- 기본 주기는 1시간이며, 더 짧은 값으로 설정해도 코드에서 최소 1시간으로 제한한다.
- 상태 페이지는 `/api/status/entry-cv`의 저장된 스냅샷만 읽는다. 페이지 새로고침이나 버튼 클릭이 Entry 서버 직접 호출을 늘리지 않는다.

## Entry Online WebSocket

Node HTTP 서버가 Express와 `/sync` WebSocket Upgrade를 함께 처리한다.
2026-06-11 확인한 운영 Nginx는 공통 `location /`에서 Upgrade 헤더를 전달하고
`proxy_read_timeout 300s`를 사용한다. 별도 `/sync` location을 둘 경우에는
다음과 같은 설정이 필요하다.

```nginx
location /sync {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 300s;
}
```

실제 Nginx 설정과 인증 정보는 저장소 밖에서 관리한다. 적용 전 현재 설정을
백업하고 `sudo nginx -t`를 통과시킨다.

배포 후에는 HTTP 상태와 별도로 `wss://code.205.kr/sync`에 연결해 `join`
메시지에 `roster` 또는 `slot` 응답이 오는지 확인한다.

Entry Online 사용량은 `sync_usage`에 작품·일자별로 저장된다. 애플리케이션
메시지는 메모리에 누적한 뒤 10초마다 배치 반영되므로 장애 직전 최대 한 주기의
수치는 유실될 수 있다. 조회는 로그인 후 `GET /api/online/usage`를 사용한다.

## 새 운영 문서 작성 규칙

- 실제 배포 명령, PM2 프로세스명, 환경 변수명, 기록 파일 위치를 정확히 적는다.
- 장애 대응 문서는 증상, 확인 명령, 원인, 복구 절차 순서로 적는다.
- 서버에서 민감값이 필요한 작업은 저장 위치와 권한만 적고 실제 값은 적지 않는다.
- 공개되면 안 되는 값은 문서가 아니라 서버 외부 env 파일에 둔다.
