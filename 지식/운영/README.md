# 운영 지식

CODE 205 운영 서버, 자동 배포, 프로세스 관리와 외부 프록시 설정을 기록한다.

## 현재 기준

- GitHub 저장소: `205sla/CODE-205`
- 운영 브랜치: `main`
- 서버 진입점: `src/server.js`
- PM2 설정: `ecosystem.config.js`
- DB 기본 위치: `db/data.db`
- 자동 배포: `.github/workflows/deploy.yml`

`main` push 시 GitHub Actions가 `npm test`를 통과한 뒤 SSH로 운영 서버에서
`git pull --ff-only origin main`, 운영 의존성 설치, PM2 재시작과 HTTP 상태
확인을 수행한다.

## Entry Online WebSocket

Node HTTP 서버가 Express와 `/sync` WebSocket Upgrade를 함께 처리한다.
운영 Nginx에는 다음과 같은 Upgrade 프록시가 필요하다.

```nginx
location /sync {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 75s;
}
```

실제 설정 파일과 인증 정보는 저장소 밖에서 관리한다. 적용 전 현재 설정을
백업하고 `sudo nginx -t`를 통과시킨다.

배포 후에는 HTTP 200만 확인하지 말고 `wss://code.205.kr/sync`에 연결해
`join` 메시지에 `roster` 또는 `slot` 응답이 오는지 확인한다.
