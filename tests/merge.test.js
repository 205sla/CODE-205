'use strict';

// 작품 합치기(/merge) 테스트.
//  1) merge-engine.js 순수 함수 단위 테스트 (브라우저 의존 없는 로직)
//  2) /merge 라우트 + strict CSP 통합 테스트

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const session = require('express-session');

// 다른 테스트와 DB 격리 (createApp이 DB를 부트스트랩하므로 require 전에 설정)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code205-merge-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const engine = require('../public/js/merge/merge-engine.js');
const createApp = require('../src/app');
const { closeDb } = require('../src/db/init');

// ──────────────────────────────────────────────────────────
describe('merge-engine 순수 함수', () => {
    it('formatBytes — B/KB/MB 단위', () => {
        assert.equal(engine.formatBytes(512), '512 B');
        assert.equal(engine.formatBytes(1536), '1.5 KB');
        assert.equal(engine.formatBytes(5 * 1048576), '5.0 MB');
    });

    it('deepEqual — 원시·배열·객체 깊은 비교', () => {
        assert.ok(engine.deepEqual({ a: [1, 2], b: { c: 3 } }, { a: [1, 2], b: { c: 3 } }));
        assert.ok(!engine.deepEqual({ a: 1 }, { a: 1, b: 2 }));
        assert.ok(!engine.deepEqual([1, 2, 3], [1, 2]));
        assert.ok(engine.deepEqual(7, 7));
        assert.ok(!engine.deepEqual(7, '7'));
    });

    it('mergeDicts — 새 키 추가', () => {
        const t = { a: 1 };
        engine.mergeDicts(t, { b: 2 });
        assert.deepEqual(t, { a: 1, b: 2 });
    });

    it('mergeDicts — 중첩 dict 재귀 병합', () => {
        const t = { obj: { x: 1 } };
        engine.mergeDicts(t, { obj: { y: 2 } });
        assert.deepEqual(t, { obj: { x: 1, y: 2 } });
    });

    it('mergeDicts — 배열은 중복 제거 후 합집합', () => {
        const t = { list: [{ id: 1 }, { id: 2 }] };
        engine.mergeDicts(t, { list: [{ id: 2 }, { id: 3 }] });
        assert.deepEqual(t.list, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it('mergeDicts — 스칼라 충돌 시 리스트로 변환', () => {
        const t = { name: 'A' };
        engine.mergeDicts(t, { name: 'B' });
        assert.deepEqual(t.name, ['A', 'B']);
        // 같은 값 재병합은 중복 추가 안 함
        engine.mergeDicts(t, { name: 'B' });
        assert.deepEqual(t.name, ['A', 'B']);
    });

    it('processSingleProject — scene id 난수화 + 참조/스크립트 치환', () => {
        const used = new Set();
        const proj = {
            scenes: [{ id: 'oldScene' }],
            objects: [{ scene: 'oldScene', script: '[{"params":["oldScene"]}]' }],
        };
        engine.processSingleProject(proj, used);

        const newId = proj.scenes[0].id;
        assert.notEqual(newId, 'oldScene');
        assert.equal(newId.length, 4);
        assert.equal(proj.objects[0].scene, newId);           // scene 참조 갱신
        assert.ok(!proj.objects[0].script.includes('oldScene')); // 스크립트 내 치환
        assert.ok(proj.objects[0].script.includes(newId));
        assert.ok(used.has(newId));                            // 전역 used에 등록
    });

    it('processSingleProject — globalUsedIds로 파일 간 id 충돌 방지', () => {
        const used = new Set();
        const ids = new Set();
        for (let i = 0; i < 50; i++) {
            const p = { scenes: [{ id: 's' + i }], objects: [] };
            engine.processSingleProject(p, used);
            ids.add(p.scenes[0].id);
        }
        assert.equal(ids.size, 50); // 50개 모두 고유
    });

    it('dedupSpecialVariables — timer/answer 중복 제거, 일반 변수 유지', () => {
        const merged = {
            variables: [
                { variableType: 'timer', id: 'a' },
                { variableType: 'answer', id: 'b' },
                { variableType: 'timer', id: 'c' },   // 중복 → 제거
                { variableType: 'variable', name: 'x' },
                { variableType: 'variable', name: 'x' }, // 일반 변수는 중복이어도 유지
            ],
        };
        engine.dedupSpecialVariables(merged);
        const timers = merged.variables.filter(v => v.variableType === 'timer');
        const answers = merged.variables.filter(v => v.variableType === 'answer');
        const vars = merged.variables.filter(v => v.variableType === 'variable');
        assert.equal(timers.length, 1);
        assert.equal(answers.length, 1);
        assert.equal(vars.length, 2);
    });

    it('hideTimerAnswerVariables — timer/answer만 x,y=2050', () => {
        const merged = {
            variables: [
                { variableType: 'timer', x: 0, y: 0 },
                { variableType: 'variable', x: 10, y: 20 },
            ],
        };
        engine.hideTimerAnswerVariables(merged);
        assert.deepEqual(
            [merged.variables[0].x, merged.variables[0].y], [2050, 2050]);
        assert.deepEqual(
            [merged.variables[1].x, merged.variables[1].y], [10, 20]); // 일반 변수 그대로
    });

    it('applyMetadata — 기본은 205 계정 ID 유지', () => {
        const m = {};
        engine.applyMetadata(m, false);
        assert.equal(m.name, '머지');
        assert.equal(m.parent, '678b8711133715065e4548c7');
        assert.equal(m.origin, '678b8711133715065e4548c7');
        assert.equal(m.user, '56136825dadc91e1235b460d');
    });

    it('applyMetadata — clearRemake면 lineage 비움', () => {
        const m = {};
        engine.applyMetadata(m, true);
        assert.equal(m.name, '머지');
        assert.equal(m.parent, '');
        assert.equal(m.origin, '');
        assert.equal(m.user, '');
    });
});

// ──────────────────────────────────────────────────────────
describe('/merge 라우트', () => {
    let server, baseUrl;

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

    it('GET /merge → 200 + merge.html 본문', async () => {
        const r = await fetch(baseUrl + '/merge');
        assert.equal(r.status, 200);
        const html = await r.text();
        assert.match(html, /id="dropZone"/);
        assert.match(html, /작품 합치기/);
        // 광고/외부 홍보가 없어야 함
        assert.doesNotMatch(html, /도구\.엔트리\.org/);
        assert.doesNotMatch(html, /Chrome Extension/);
    });

    it('GET /merge → strict CSP (editor 예외 아님)', async () => {
        const r = await fetch(baseUrl + '/merge');
        const csp = r.headers.get('content-security-policy');
        assert.ok(csp, '/merge에 CSP 헤더가 있어야 함');
        assert.match(csp, /default-src 'self'/);
        assert.match(csp, /script-src 'self'/);
        assert.doesNotMatch(csp, /'unsafe-inline'/);
        assert.doesNotMatch(csp, /'unsafe-eval'/);
    });
});
