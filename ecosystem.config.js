// PM2 프로세스 정의. 진입점(src/server.js) 경로와 환경 변수의 단일 소스.
// 배포 스크립트는 pm2 startOrReload ecosystem.config.js 로 이 파일을 로드한다.
//
// 로그 회전은 서버에 pm2-logrotate 모듈을 한 번 설치해두면 자동:
//   pm2 install pm2-logrotate
//   pm2 set pm2-logrotate:max_size 10M
//   pm2 set pm2-logrotate:retain 7

module.exports = {
    apps: [
        {
            name: 'entry',
            script: 'src/server.js',
            cwd: __dirname,
            node_args: '--env-file=/etc/code205.env',
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            // 메모리 누수 방어선 (큰 .ent 업로드 시 일시 폭증할 수 있음)
            max_memory_restart: '512M',
            exec_mode: 'fork',
            autorestart: true,

            // 시작 실패 시 무한 재시작 루프 방지.
            // 10초 안에 죽으면 비정상으로 간주하고, 10번 연속 실패 시 정지.
            min_uptime: '10s',
            max_restarts: 10,
            restart_delay: 5000,

            // 명시적 로그 경로 — 회전·추적·디스크 사용량 가시화.
            error_file: 'logs/entry-error.log',
            out_file:   'logs/entry-out.log',
            merge_logs: true,
            time:       true,
        },
    ],
};
