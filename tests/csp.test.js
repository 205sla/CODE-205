'use strict';

// CSP 분기 통합 테스트.
// - 정적 페이지: Content-Security-Policy 헤더에 strict 정책
// - editor.html / /lib/*: CSP 헤더 없음 (Entry 런타임 호환)

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const session = require('express-session');

// 다른 테스트와 DB 격리
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code205-csp-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const createApp = require('../src/app');
const { closeDb } = require('../src/db/init');

let server;
let baseUrl;

before(async () => {
    const app = createApp({
        sessionStore: new session.MemoryStore(),
        disableRateLimit: true,
    });
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeDb(process.env.DB_PATH);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
});

async function head(p) {
    return fetch(baseUrl + p, { method: 'GET' });
}

describe('정적 페이지 strict CSP', () => {
    const STRICT_PAGES = [
        '/',
        '/contribute.html',
        '/privacy.html',
        '/terms.html',
        '/login.html',
        '/signup.html',
        '/profile.html',
        '/online',
    ];
    STRICT_PAGES.forEach((p) => {
        it(p + ' → CSP 헤더 + strict 정책', async () => {
            const r = await head(p);
            assert.equal(r.status, 200);
            const csp = r.headers.get('content-security-policy');
            assert.ok(csp, p + '에 CSP 헤더가 있어야 함');
            // 핵심 directive 존재 검사 (helmet 정렬 순서에 의존하지 않음)
            assert.match(csp, /default-src 'self'/);
            assert.match(csp, /script-src 'self'/);
            assert.match(csp, /style-src 'self'/);
            assert.match(csp, /frame-ancestors 'none'/);
            assert.match(csp, /object-src 'none'/);
            // unsafe 키워드는 절대 없어야 함
            assert.doesNotMatch(csp, /'unsafe-inline'/);
            assert.doesNotMatch(csp, /'unsafe-eval'/);
        });
    });
});

describe('editor 영역 CSP 비활성', () => {
    it('/editor.html → CSP 헤더 없음', async () => {
        const r = await head('/editor.html');
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('content-security-policy'), null);
    });

    it('/lib/ 자원 → CSP 헤더 없음', async () => {
        // 실존 자원 하나 호출 (404여도 헤더는 검사)
        const r = await head('/lib/entry-js/dist/entry.min.js');
        // 파일 존재 여부와 무관하게 정적 미들웨어를 거치며 헤더만 검사
        assert.equal(r.headers.get('content-security-policy'), null);
    });
});

describe('/api/* 응답에도 strict CSP 헤더 포함 (API JSON엔 무해)', () => {
    it('/api/auth/me → CSP 헤더 있음', async () => {
        const r = await head('/api/auth/me');
        assert.equal(r.status, 200); // 비로그인이라도 user:null 정상
        const csp = r.headers.get('content-security-policy');
        assert.ok(csp);
        assert.match(csp, /default-src 'self'/);
    });
});

describe('CSP 외 보안 헤더 (helmet 기본값)', () => {
    it('X-Content-Type-Options: nosniff', async () => {
        const r = await head('/');
        assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    });
    it('Referrer-Policy 설정됨', async () => {
        const r = await head('/');
        assert.ok(r.headers.get('referrer-policy'));
    });
});
