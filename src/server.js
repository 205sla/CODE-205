// CODE 205 서버 진입점.
// 책임: createApp + listen만. 미들웨어·라우터 구성은 src/app.js, 비즈니스 로직은 src/services·src/routes.

const createApp = require('./app');
const { PORT } = require('./config');
const { createEntryCvMonitor } = require('./services/entryCvMonitor');

const entryCvMonitor = createEntryCvMonitor();
const app = createApp({ entryCvMonitor });

app.listen(PORT, () => {
    entryCvMonitor.start();
    console.log('Entry Editor running at http://localhost:' + PORT);
});
