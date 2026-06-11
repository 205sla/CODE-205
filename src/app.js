// Express 앱 팩토리.
// - server.js는 createApp() + listen만 담당.
// - 테스트는 createApp({ sessionStore: new MemoryStore(), disableRateLimit: true })로 격리.
//
// 기본 동작은 production과 동일 (SQLite 세션 store, rate-limit 활성).

'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const {
    PUBLIC_DIR,
    DB_PATH, SESSION_SECRET, SESSION_COOKIE_SECURE,
    isEditorScope,
} = require('./config');

const seoRouter = require('./routes/seo');
const problemsRouter = require('./routes/problems');
const spritesRouter = require('./routes/sprites');
const exportRouter = require('./routes/export');
const authRouter = require('./routes/auth');
const meRouter = require('./routes/me');
const createStatusRouter = require('./routes/status');
const createOnlineRouter = require('./routes/online');
const { errorHandler } = require('./routes/_respond');

function defaultSessionStore() {
    return new SQLiteStore({
        db: path.basename(DB_PATH),
        dir: path.dirname(DB_PATH),
        table: 'sessions',
    });
}

/**
 * @param {object} [opts]
 * @param {object} [opts.sessionStore]    express-session store (테스트는 MemoryStore 권장)
 * @param {boolean} [opts.disableRateLimit] 테스트에서 rate-limit 우회 (rateLimit.skip이 검사)
 * @returns {express.Express}
 */
function createApp(opts = {}) {
    // DB 부트스트랩 — 스키마 멱등 적용. SQLiteStore가 같은 파일을 잡기 전에 호출.
    require('./db/init').getDb();

    const app = express();
    app.set('trust proxy', 1);
    app.locals.entryCvMonitor = opts.entryCvMonitor || null;

    if (opts.disableRateLimit) {
        app.set('disableRateLimit', true);
    }

    // ─────── 보안 미들웨어 (CSP path 분기) ───────
    // - editor.html과 그 자원(/lib/*)은 CSP 비활성: Entry 런타임이 inline script/style·eval 사용
    // - 나머지 페이지·API는 strict CSP: 외부 도메인 일절 미허용 (XSS 방어)
    // - COEP는 Entry 임베드 자원 호환을 위해 전역 비활성 유지
    const STRICT_CSP_DIRECTIVES = {
        'default-src': ["'self'"],
        'script-src':  ["'self'"],
        'style-src':   ["'self'"],
        'img-src':     ["'self'", 'data:'],
        'font-src':    ["'self'"],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri':    ["'self'"],
        'form-action': ["'self'"],
        'object-src':  ["'none'"],
    };

    const helmetStrict = helmet({
        contentSecurityPolicy: { directives: STRICT_CSP_DIRECTIVES },
        crossOriginEmbedderPolicy: false,
    });
    const helmetEditor = helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    });

    // isEditorScope는 config.js가 단일 source of truth — 테스트도 같은 함수 참조.
    app.use((req, res, next) => {
        if (isEditorScope(req.path)) return helmetEditor(req, res, next);
        helmetStrict(req, res, next);
    });

    // 바디 파서 — 글로벌은 30KB 안전선만 적용.
    //   - /api/export       : 라우트가 자체 25MB 처리 (이 미들웨어 통과 X)
    //   - /api/me/submissions: 라우트가 자체 100KB express.json 사용 (me.js 참조)
    //   - 그 외              : 30KB
    app.use((req, res, next) => {
        if (req.path === '/api/export') return next();
        if (req.path.startsWith('/api/me/submissions')) return next();
        express.json({ limit: '30kb' })(req, res, next);
    });

    // 정적 파일
    app.use(express.static(PUBLIC_DIR));

    // clean URL: /merge → public/merge.html (엔트리 작품 합치기 도구)
    //   - editor scope가 아니므로 위 helmet 분기에서 strict CSP가 적용됨
    //   - 합치기 처리는 전량 클라이언트 사이드 — 서버는 정적 페이지만 서빙
    app.get('/merge', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'merge.html'));
    });
    app.get('/Status', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'status.html'));
    });
    app.get('/online', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'online.html'));
    });

    // 세션 (커스텀 store 주입 가능)
    app.use(session({
        store: opts.sessionStore || defaultSessionStore(),
        name: 'code205.sid',
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: SESSION_COOKIE_SECURE,
            maxAge: 7 * 24 * 60 * 60 * 1000,
        },
    }));

    // 라우터
    app.use('/', seoRouter);
    app.use('/api/problems', problemsRouter);
    app.use('/api/sprites', spritesRouter);
    app.use('/api/export', exportRouter);
    app.use('/api/auth', authRouter);
    app.use('/api/me', meRouter);
    app.use('/api/status', createStatusRouter());
    app.use('/api/online', createOnlineRouter());

    // 모든 라우터 뒤 — next(e) 또는 throw된 에러를 일괄 처리.
    // AuthError는 status 매핑, UNIQUE 제약은 409, 그 외는 500.
    app.use(errorHandler);

    return app;
}

module.exports = createApp;
