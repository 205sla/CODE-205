// 공용 설정·상수. server.js·라우터·서비스가 require.
// 파일이 src/ 내부에 있으므로 __dirname은 src/ — 저장소 루트는 한 단계 위.

const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PROBLEMS_DIR = path.join(ROOT_DIR, 'problems');
const SPRITES_CATALOG = path.join(PUBLIC_DIR, 'sprites', 'catalog.json');
const DEV_SESSION_SECRET = 'dev-only-insecure-secret-change-me';

const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || 'https://code.205.kr';

// .ent 내보내기 시 썸네일 긴 변 최대 픽셀 (Entry 기본 export와 동일 스케일).
const THUMB_MAX_PX = 96;

// ─────── DB / Session (Phase 2) ───────
// DB_PATH는 src/db/init.js가 사용. 상대 경로면 ROOT_DIR 기준으로 풀어준다.
const DB_PATH_RAW = process.env.DB_PATH || './db/data.db';
const DB_PATH = path.isAbsolute(DB_PATH_RAW)
    ? DB_PATH_RAW
    : path.join(ROOT_DIR, DB_PATH_RAW);

// SESSION_SECRET은 Phase 2-2에서 express-session에 주입.
// 개발 편의를 위해 default를 두지만, production에서는 .env로 반드시 override.
const SESSION_SECRET = process.env.SESSION_SECRET || DEV_SESSION_SECRET;
const SESSION_COOKIE_SECURE = process.env.SESSION_COOKIE_SECURE === 'true';

function validateProductionConfig(env = process.env) {
    if (env.NODE_ENV !== 'production') return;

    const secret = env.SESSION_SECRET || '';
    if (secret === DEV_SESSION_SECRET || Buffer.byteLength(secret, 'utf8') < 32) {
        throw new Error(
            'SESSION_SECRET must be set to an independent random value of at least 32 bytes.'
        );
    }
    if (env.SESSION_COOKIE_SECURE !== 'true') {
        throw new Error('SESSION_COOKIE_SECURE=true is required in production.');
    }
}

// ─────── CSP scope (Phase 4 정리) ───────
// Editor 자원은 CSP 비활성, 정적 페이지·API는 strict CSP — 분기를 한 곳에서.
// app.js와 csp.test.js가 같은 정의 참조해 회귀 위험 차단.
const EDITOR_SCOPE_PATHS = ['/editor.html'];
const EDITOR_SCOPE_PREFIXES = ['/lib/'];
function isEditorScope(reqPath) {
    if (EDITOR_SCOPE_PATHS.indexOf(reqPath) !== -1) return true;
    for (let i = 0; i < EDITOR_SCOPE_PREFIXES.length; i++) {
        if (reqPath.startsWith(EDITOR_SCOPE_PREFIXES[i])) return true;
    }
    return false;
}

module.exports = {
    ROOT_DIR,
    PUBLIC_DIR,
    PROBLEMS_DIR,
    SPRITES_CATALOG,
    PORT,
    SITE_URL,
    THUMB_MAX_PX,
    DB_PATH,
    SESSION_SECRET,
    SESSION_COOKIE_SECURE,
    validateProductionConfig,
    EDITOR_SCOPE_PATHS,
    EDITOR_SCOPE_PREFIXES,
    isEditorScope,
};
