'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const session = require('express-session');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code205-status-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const createApp = require('../src/app');
const { closeDb } = require('../src/db/init');

let server;
let baseUrl;
let fakeMonitor;

before(async () => {
    fakeMonitor = {
        starts: 0,
        start() { this.starts += 1; },
        getSnapshot() {
            return {
                checkedAt: '2026-06-05T05:00:00.000Z',
                running: false,
                nextCheckAt: '2026-06-05T05:10:00.000Z',
                monitor: {
                    enabled: true,
                    configured: true,
                    projectId: '6a2254...4a57',
                    accountConfigured: true,
                    nicknameConfigured: true,
                    intervalMs: 3600000,
                    timeoutMs: 6000,
                    engineIoVersion: '3',
                    type: '',
                    loginMode: 'session-pending',
                    historyLimit: 144,
                },
                latest: {
                    checkedAt: '2026-06-05T05:00:00.000Z',
                    status: 'DOWN',
                    ok: false,
                    elapsedMs: 6004,
                    reason: 'No welcome before 6000ms.',
                },
                history: [
                    {
                        checkedAt: '2026-06-05T05:00:00.000Z',
                        status: 'DOWN',
                        ok: false,
                        elapsedMs: 6004,
                        reason: 'No welcome before 6000ms.',
                    },
                ],
            };
        },
    };

    const app = createApp({
        sessionStore: new session.MemoryStore(),
        disableRateLimit: true,
        entryCvMonitor: fakeMonitor,
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
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
});

async function get(urlPath) {
    return await fetch(baseUrl + urlPath);
}

describe('Status page', () => {
    it('/Status serves the Entry status page', async () => {
        const res = await get('/Status');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /text\/html/);
        const html = await res.text();
        assert.match(html, /엔트리 실시간 변수\/리스트 서버/);
        assert.match(html, /\/js\/status\.js/);
        assert.equal(fakeMonitor.starts, 0);
    });
});

describe('GET /api/status/entry-cv', () => {
    it('returns a redacted monitor snapshot', async () => {
        const res = await get('/api/status/entry-cv');
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        const body = await res.json();
        assert.equal(body.latest.status, 'DOWN');
        assert.equal(body.monitor.projectId, '6a2254...4a57');
        assert.equal(body.monitor.accountConfigured, true);
        assert.equal(body.monitor.password, undefined);
        assert.equal(body.monitor.id, undefined);
    });
});
