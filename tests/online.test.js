'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const session = require('express-session');
const { WebSocket } = require('ws');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code205-online-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const createApp = require('../src/app');
const { getDb, closeDb } = require('../src/db/init');
const onlineProjectService = require('../src/services/onlineProjectService');
const { createRoomManager } = require('../src/realtime/roomManager');
const { createUsageMeter } = require('../src/realtime/usageMeter');
const { attachWsServer } = require('../src/realtime/wsServer');

function fakeClient() {
    return {
        readyState: 1,
        messages: [],
        send(raw) {
            this.messages.push(JSON.parse(raw));
        },
    };
}

function project(registrationId = 1, roomSize = 2) {
    return {
        registrationId,
        projectId: '6659abcdef1234567890abcd',
        roomSize,
    };
}

describe('roomManager', () => {
    it('정원이 차면 도착 순서로 슬롯을 부여하고 방을 잠근다', () => {
        const manager = createRoomManager({ idFactory: () => 'room-1' });
        const a = fakeClient();
        const b = fakeClient();

        manager.join(a, project());
        assert.equal(a.messages.some((message) => message.type === 'slot'), false);

        manager.join(b, project());
        assert.equal(a.messages.find((message) => message.type === 'slot').slot, 1);
        assert.equal(b.messages.find((message) => message.type === 'slot').slot, 2);

        const snapshot = manager.getSnapshot();
        assert.equal(snapshot.length, 1);
        assert.equal(snapshot[0].state, 'locked');
        assert.deepEqual(snapshot[0].slots, [1, 2]);
    });

    it('잠긴 방 다음 참가자는 거부하지 않고 새 forming 방으로 보낸다', () => {
        let nextId = 0;
        const manager = createRoomManager({ idFactory: () => 'room-' + (++nextId) });
        const a = fakeClient();
        const b = fakeClient();
        const c = fakeClient();

        manager.join(a, project());
        manager.join(b, project());
        manager.join(c, project());

        const snapshot = manager.getSnapshot();
        assert.equal(snapshot.length, 2);
        assert.equal(snapshot[0].state, 'locked');
        assert.equal(snapshot[1].state, 'forming');
        assert.equal(snapshot[1].connected, 1);
        assert.equal(c.messages.some((message) => message.type === 'error'), false);
    });

    it('잠긴 방의 이탈 슬롯은 비워 두고 새 참가자로 채우지 않는다', () => {
        let nextId = 0;
        const manager = createRoomManager({ idFactory: () => 'room-' + (++nextId) });
        const a = fakeClient();
        const b = fakeClient();
        const c = fakeClient();

        manager.join(a, project());
        manager.join(b, project());
        manager.leave(a);
        manager.join(c, project());

        const snapshot = manager.getSnapshot();
        const locked = snapshot.find((room) => room.state === 'locked');
        const forming = snapshot.find((room) => room.state === 'forming');
        assert.deepEqual(locked.slots, [2]);
        assert.equal(forming.connected, 1);
        assert.equal(c.messages.some((message) => message.type === 'slot'), false);

        const roster = b.messages.filter((message) => message.type === 'roster').at(-1);
        assert.deepEqual(roster.slots, [
            { slot: 1, connected: false },
            { slot: 2, connected: true },
        ]);
    });

    it('방의 마지막 참가자가 나가면 방을 폐기한다', () => {
        const manager = createRoomManager({ idFactory: () => 'room-1' });
        const a = fakeClient();
        const b = fakeClient();
        manager.join(a, project());
        manager.join(b, project());

        manager.leave(a);
        assert.equal(manager.getSnapshot().length, 1);
        manager.leave(b);
        assert.equal(manager.getSnapshot().length, 0);
    });

    it('비정상 단절은 짧은 유예 동안 같은 잠긴 방과 슬롯으로 복귀시킨다', () => {
        let nextToken = 0;
        const manager = createRoomManager({
            idFactory: () => 'room-1',
            resumeTokenFactory: () => 'resume-' + (++nextToken),
            resumeGraceMs: 1000,
        });
        const a = fakeClient();
        const b = fakeClient();
        const resumed = fakeClient();
        manager.join(a, project());
        manager.join(b, project());

        const slot = a.messages.find((message) => message.type === 'slot');
        manager.leave(a, { allowResume: true });
        assert.equal(manager.getSnapshot()[0].reserved, 1);

        const result = manager.resume(resumed, project(), slot.resumeToken);
        assert.equal(result.resumed, true);
        assert.equal(result.slot, 1);
        assert.equal(result.roomId, slot.roomId);
        assert.equal(
            resumed.messages.find((message) => message.type === 'slot').slot,
            1
        );
        assert.equal(manager.getSnapshot()[0].reserved, 0);
    });

    it('변수와 리스트를 LWW로 머지하고 resync에 최신 전체 상태를 보낸다', () => {
        const manager = createRoomManager({ idFactory: () => 'room-1' });
        const a = fakeClient();
        const b = fakeClient();
        manager.join(a, project());
        manager.join(b, project());

        manager.handleMessage(a, {
            type: 'set',
            vars: [{ id: 'score', name: '$점수', value: 1 }],
            lists: [{ id: 'items', name: '$목록', array: ['a'] }],
        });
        assert.equal(b.messages.find((message) => message.type === 'patch').vars[0].value, 1);

        manager.handleMessage(b, {
            type: 'set',
            vars: [
                { id: 'score', name: '$점수', value: 2 },
                { id: 'status', name: '$확장프로그램', value: 99 },
                { id: 'slot', name: '$유저번호', value: 7 },
            ],
        });
        manager.handleMessage(a, { type: 'resync' });

        const snapshot = manager.getSnapshot()[0];
        assert.equal(snapshot.vars[0].value, 2);
        assert.equal(snapshot.vars.some((item) => item.name === '$확장프로그램'), false);
        assert.equal(snapshot.vars.some((item) => item.name === '$유저번호'), false);

        const state = a.messages.filter((message) => message.type === 'state').at(-1);
        assert.equal(state.vars[0].value, 2);
        assert.deepEqual(state.lists[0].array, ['a']);
    });
});

describe('onlineProjectService', () => {
    function memoryDbWithUser() {
        const db = getDb({ path: ':memory:' });
        db.prepare(`
            INSERT INTO users (username, password_hash, birth_year, created_at)
            VALUES ('owner', 'hash', 2000, 1)
        `).run();
        return db;
    }

    it('CODE 205 ID와 Entry 작품 ID로 등록 작품을 찾는다', () => {
        const db = memoryDbWithUser();
        const created = onlineProjectService.createProject(1, {
            entryProjectId: '6659ABCDEF1234567890ABCD',
            roomSize: 4,
        }, {
            db,
            tokenFactory: () => 'test-token-1234567890',
        });

        assert.equal(created.entryProjectId, '6659abcdef1234567890abcd');
        assert.equal(created.roomSize, 4);
        assert.equal(created.ownerId, 'owner');
        assert.equal(created.token, undefined);
        assert.equal(
            onlineProjectService.findByOwner(
                created.entryProjectId,
                'OWNER',
                { db }
            ).id,
            created.id
        );
        assert.equal(
            onlineProjectService.findByOwner(created.entryProjectId, 'other_owner', { db }),
            null
        );
    });

    it('사용자당 3개 한도와 같은 작품 중복 등록을 차단한다', () => {
        const db = memoryDbWithUser();
        onlineProjectService.createProject(1, {
            entryProjectId: '111111111111111111111111',
            roomSize: 2,
        }, { db });

        assert.throws(
            () => onlineProjectService.createProject(1, {
                entryProjectId: '111111111111111111111111',
                roomSize: 3,
            }, { db }),
            (error) => error.code === 'DUPLICATE_PROJECT' && error.status === 409
        );

        onlineProjectService.createProject(1, {
            entryProjectId: '222222222222222222222222',
            roomSize: 3,
        }, { db });
        onlineProjectService.createProject(1, {
            entryProjectId: '333333333333333333333333',
            roomSize: 8,
        }, { db });

        assert.throws(
            () => onlineProjectService.createProject(1, {
                entryProjectId: '444444444444444444444444',
                roomSize: 2,
            }, { db }),
            (error) => error.code === 'PROJECT_LIMIT' && error.status === 409
        );
    });

    it('작품별 연결, 메시지, 바이트 사용량을 합산한다', () => {
        const db = memoryDbWithUser();
        const created = onlineProjectService.createProject(1, {
            entryProjectId: '555555555555555555555555',
            roomSize: 2,
        }, { db });
        const registered = onlineProjectService.findByOwner(
            created.entryProjectId,
            'owner',
            { db }
        );
        const meter = createUsageMeter({
            db,
            flushIntervalMs: 0,
            now: () => Date.UTC(2026, 5, 11),
        });

        meter.recordConnection(registered);
        meter.recordInbound(registered, 120);
        meter.recordInbound(registered, 30);
        meter.recordOutbound(registered, 250);
        assert.equal(meter.flush(), 1);

        const expected = [{
            entryProjectId: created.entryProjectId,
            connections: 1,
            messagesIn: 2,
            messagesOut: 1,
            bytesIn: 150,
            bytesOut: 250,
            totalMessages: 3,
            totalBytes: 400,
            firstDay: '2026-06-11',
            lastDay: '2026-06-11',
        }];
        assert.deepEqual(onlineProjectService.listUsage(1, { db }), expected);
        assert.deepEqual(onlineProjectService.summarizeUsage(expected), {
            projects: 1,
            connections: 1,
            messagesIn: 2,
            messagesOut: 1,
            bytesIn: 150,
            bytesOut: 250,
            totalMessages: 3,
            totalBytes: 400,
        });

        assert.equal(
            onlineProjectService.deleteProject(1, created.id, { db }),
            true
        );
        assert.deepEqual(
            onlineProjectService.listUsage(1, { db }),
            expected,
            '등록 해제 후에도 작품 사용량은 유지되어야 한다'
        );
    });
});

describe('Entry Online HTTP + WebSocket integration', () => {
    let server;
    let wsLayer;
    let baseUrl;
    let wsUrl;

    before(async () => {
        const app = createApp({
            sessionStore: new session.MemoryStore(),
            disableRateLimit: true,
        });
        server = http.createServer(app);
        wsLayer = attachWsServer(server);
        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = 'http://127.0.0.1:' + port;
                wsUrl = 'ws://127.0.0.1:' + port + '/sync';
                resolve();
            });
        });
    });

    after(async () => {
        await new Promise((resolve) => wsLayer.close(resolve));
        await new Promise((resolve) => server.close(resolve));
        closeDb(process.env.DB_PATH);
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* WAL lock */ }
    });

    async function call(method, urlPath, body, cookieIn = '') {
        const headers = {};
        if (cookieIn) headers.Cookie = cookieIn;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetch(baseUrl + urlPath, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const setCookies = response.headers.getSetCookie?.() || [];
        const cookie = setCookies.length
            ? setCookies.map((item) => item.split(';')[0]).join('; ')
            : cookieIn;
        const text = await response.text();
        let parsed = text;
        try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
        return { status: response.status, body: parsed, cookie };
    }

    async function signup(username) {
        return call('POST', '/api/auth/signup', {
            username,
            password: 'abcd1234',
            birthYear: 2000,
        });
    }

    function connectClient(join) {
        const socket = new WebSocket(wsUrl);
        const messages = [];
        const waiters = [];

        socket.on('message', (raw) => {
            const message = JSON.parse(raw.toString());
            messages.push(message);
            for (const waiter of [...waiters]) {
                if (waiter.predicate(message)) {
                    clearTimeout(waiter.timer);
                    waiters.splice(waiters.indexOf(waiter), 1);
                    waiter.resolve(message);
                }
            }
        });

        function waitFor(predicate, timeoutMs = 2000) {
            const existing = messages.find(predicate);
            if (existing) return Promise.resolve(existing);
            return new Promise((resolve, reject) => {
                const waiter = {
                    predicate,
                    resolve,
                    timer: setTimeout(() => {
                        waiters.splice(waiters.indexOf(waiter), 1);
                        reject(new Error('Timed out waiting for WebSocket message.'));
                    }, timeoutMs),
                };
                waiters.push(waiter);
            });
        }

        const ready = new Promise((resolve, reject) => {
            socket.once('open', () => {
                socket.send(JSON.stringify(join));
                resolve();
            });
            socket.once('error', reject);
        });

        return { socket, messages, waitFor, ready };
    }

    it('/online은 strict CSP 페이지로 제공된다', async () => {
        const response = await fetch(baseUrl + '/online');
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
        const body = await response.text();
        assert.match(body, /온라인 멀티플레이 작품 등록/);
        assert.match(body, /서버 사용량 총합/);
        assert.match(body, /online-usage\.js/);
    });

    it('등록 API는 인증, 중복, 3개 한도와 삭제를 적용한다', async () => {
        const unauthorized = await call('GET', '/api/online/projects');
        assert.equal(unauthorized.status, 401);

        const account = await signup('onlineapi');
        const ids = [
            'aaaaaaaaaaaaaaaaaaaaaaaa',
            'bbbbbbbbbbbbbbbbbbbbbbbb',
            'cccccccccccccccccccccccc',
        ];

        const first = await call('POST', '/api/online/projects', {
            entryProjectId: ids[0],
            roomSize: 2,
        }, account.cookie);
        assert.equal(first.status, 201);
        assert.equal(first.body.project.ownerId, 'onlineapi');
        assert.equal(first.body.project.token, undefined);

        const duplicate = await call('POST', '/api/online/projects', {
            entryProjectId: ids[0],
            roomSize: 3,
        }, account.cookie);
        assert.equal(duplicate.status, 409);
        assert.equal(duplicate.body.error, 'DUPLICATE_PROJECT');

        for (const id of ids.slice(1)) {
            const created = await call('POST', '/api/online/projects', {
                entryProjectId: id,
                roomSize: 4,
            }, account.cookie);
            assert.equal(created.status, 201);
        }

        const overLimit = await call('POST', '/api/online/projects', {
            entryProjectId: 'dddddddddddddddddddddddd',
            roomSize: 2,
        }, account.cookie);
        assert.equal(overLimit.status, 409);
        assert.equal(overLimit.body.error, 'PROJECT_LIMIT');

        const list = await call('GET', '/api/online/projects', undefined, account.cookie);
        assert.equal(list.body.projects.length, 3);

        const removed = await call(
            'DELETE',
            '/api/online/projects/' + first.body.project.id,
            undefined,
            account.cookie
        );
        assert.equal(removed.status, 200);
        assert.equal(removed.body.removed, true);
    });

    it('두 클라이언트를 매칭하고 patch를 전달하며 오버플로를 새 방에 배정한다', async () => {
        const account = await signup('onlinews');
        const created = await call('POST', '/api/online/projects', {
            entryProjectId: 'eeeeeeeeeeeeeeeeeeeeeeee',
            roomSize: 2,
        }, account.cookie);
        const credentials = {
            type: 'join',
            projectId: created.body.project.entryProjectId,
            ownerId: 'onlinews',
        };

        const a = connectClient(credentials);
        const b = connectClient(credentials);
        await Promise.all([a.ready, b.ready]);
        const [slotA, slotB] = await Promise.all([
            a.waitFor((message) => message.type === 'slot'),
            b.waitFor((message) => message.type === 'slot'),
        ]);
        assert.deepEqual([slotA.slot, slotB.slot].sort(), [1, 2]);
        assert.equal(slotA.roomId, slotB.roomId);

        a.socket.send(JSON.stringify({
            type: 'set',
            vars: [{ id: 'score', name: '$점수', value: 7 }],
        }));
        const patch = await b.waitFor((message) => message.type === 'patch');
        assert.equal(patch.vars[0].value, 7);

        const c = connectClient(credentials);
        await c.ready;
        await c.waitFor((message) => message.type === 'roster' && message.state === 'forming');
        const d = connectClient(credentials);
        await d.ready;
        const [slotC, slotD] = await Promise.all([
            c.waitFor((message) => message.type === 'slot'),
            d.waitFor((message) => message.type === 'slot'),
        ]);
        assert.equal(slotC.roomId, slotD.roomId);
        assert.notEqual(slotC.roomId, slotA.roomId);

        for (const client of [a, b, c, d]) client.socket.close();
    });

    it('같은 Entry 작품도 CODE 205 등록 계정별로 다른 방 풀을 사용한다', async () => {
        const firstOwner = await signup('ownerone');
        const secondOwner = await signup('ownertwo');
        const sharedProjectId = 'ffffffffffffffffffffffff';

        await call('POST', '/api/online/projects', {
            entryProjectId: sharedProjectId,
            roomSize: 2,
        }, firstOwner.cookie);
        await call('POST', '/api/online/projects', {
            entryProjectId: sharedProjectId,
            roomSize: 2,
        }, secondOwner.cookie);

        const firstPair = [
            connectClient({ type: 'join', projectId: sharedProjectId, ownerId: 'ownerone' }),
            connectClient({ type: 'join', projectId: sharedProjectId, ownerId: 'ownerone' }),
        ];
        const secondPair = [
            connectClient({ type: 'join', projectId: sharedProjectId, ownerId: 'ownertwo' }),
            connectClient({ type: 'join', projectId: sharedProjectId, ownerId: 'ownertwo' }),
        ];
        await Promise.all([...firstPair, ...secondPair].map((client) => client.ready));

        const firstSlots = await Promise.all(
            firstPair.map((client) => client.waitFor((message) => message.type === 'slot'))
        );
        const secondSlots = await Promise.all(
            secondPair.map((client) => client.waitFor((message) => message.type === 'slot'))
        );
        assert.equal(firstSlots[0].roomId, firstSlots[1].roomId);
        assert.equal(secondSlots[0].roomId, secondSlots[1].roomId);
        assert.notEqual(firstSlots[0].roomId, secondSlots[0].roomId);

        for (const client of [...firstPair, ...secondPair]) client.socket.close();
    });

    it('비정상 단절 클라이언트가 기존 방과 슬롯으로 재접속한다', async () => {
        const account = await signup('resumeowner');
        const created = await call('POST', '/api/online/projects', {
            entryProjectId: 'abababababababababababab',
            roomSize: 2,
        }, account.cookie);
        const credentials = {
            type: 'join',
            projectId: created.body.project.entryProjectId,
            ownerId: 'resumeowner',
        };
        const a = connectClient(credentials);
        const b = connectClient(credentials);
        await Promise.all([a.ready, b.ready]);
        const [slotA, slotB] = await Promise.all([
            a.waitFor((message) => message.type === 'slot'),
            b.waitFor((message) => message.type === 'slot'),
        ]);

        a.socket.terminate();
        await b.waitFor(
            (message) => message.type === 'roster' && message.connected === 1
        );
        const resumed = connectClient({
            ...credentials,
            resumeToken: slotA.resumeToken,
        });
        await resumed.ready;
        const resumedSlot = await resumed.waitFor(
            (message) => message.type === 'slot'
        );

        assert.equal(resumedSlot.resumed, true);
        assert.equal(resumedSlot.roomId, slotA.roomId);
        assert.equal(resumedSlot.slot, slotA.slot);
        assert.notEqual(resumedSlot.slot, slotB.slot);
        b.socket.close();
        resumed.socket.close();
    });

    it('등록되지 않은 CODE 205 ID 연결을 거부한다', async () => {
        const bad = connectClient({
            type: 'join',
            projectId: 'eeeeeeeeeeeeeeeeeeeeeeee',
            ownerId: 'missing_owner',
        });
        await bad.ready;
        const error = await bad.waitFor((message) => message.type === 'error');
        assert.equal(error.code, 'REGISTRATION_NOT_FOUND');
        bad.socket.close();
    });

    it('작품 소유자가 누적 WebSocket 사용량을 조회한다', async () => {
        const account = await signup('usageowner');
        const created = await call('POST', '/api/online/projects', {
            entryProjectId: '121212121212121212121212',
            roomSize: 2,
        }, account.cookie);
        const client = connectClient({
            type: 'join',
            projectId: created.body.project.entryProjectId,
            ownerId: 'usageowner',
        });
        await client.ready;
        await client.waitFor((message) => message.type === 'roster');
        client.socket.send(JSON.stringify({ type: 'ping' }));
        await client.waitFor((message) => message.type === 'pong');
        wsLayer.usageMeter.flush();

        const response = await call(
            'GET',
            '/api/online/usage',
            undefined,
            account.cookie
        );
        assert.equal(response.status, 200);
        assert.equal(response.body.usage.length, 1);
        assert.equal(response.body.usage[0].connections, 1);
        assert.ok(response.body.usage[0].messagesIn >= 2);
        assert.ok(response.body.usage[0].messagesOut >= 2);
        assert.ok(response.body.usage[0].totalBytes > 0);
        client.socket.close();

        const removed = await call(
            'DELETE',
            '/api/online/projects/' + created.body.project.id,
            undefined,
            account.cookie
        );
        assert.equal(removed.body.removed, true);

        const afterDelete = await call(
            'GET',
            '/api/online/usage',
            undefined,
            account.cookie
        );
        assert.equal(afterDelete.body.usage.length, 1);
        assert.equal(afterDelete.body.total.projects, 1);
        assert.equal(
            afterDelete.body.total.totalBytes,
            response.body.usage[0].totalBytes
        );
    });
});

describe('Entry Online WebSocket hardening', () => {
    function meterStub() {
        return {
            recordConnection() {},
            recordInbound() {},
            recordOutbound() {},
            flush() {},
            close() {},
        };
    }

    async function startLayer(options) {
        const server = http.createServer();
        const layer = attachWsServer(server, {
            usageMeter: meterStub(),
            heartbeatIntervalMs: 0,
            ...options,
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const url = 'ws://127.0.0.1:' + server.address().port + '/sync';
        return {
            server,
            layer,
            url,
            async close() {
                await new Promise((resolve) => layer.close(resolve));
                await new Promise((resolve) => server.close(resolve));
            },
        };
    }

    function waitForMessage(socket, predicate, timeoutMs = 2000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('Timed out waiting for message.')),
                timeoutMs
            );
            socket.on('message', (raw) => {
                const message = JSON.parse(raw.toString());
                if (!predicate(message)) return;
                clearTimeout(timer);
                resolve(message);
            });
        });
    }

    it('연결별 메시지 빈도 초과를 오류로 닫는다', async () => {
        const running = await startLayer({
            messageRateLimit: 2,
            findByOwner: () => ({
                id: 1,
                owner_user_id: 1,
                entry_project_id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
                room_size: 2,
            }),
        });
        const socket = new WebSocket(running.url);
        await new Promise((resolve) => socket.once('open', resolve));
        socket.send(JSON.stringify({
            type: 'join',
            projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            ownerId: 'owner',
        }));
        await waitForMessage(socket, (message) => message.type === 'roster');
        socket.send(JSON.stringify({ type: 'ping' }));
        await waitForMessage(socket, (message) => message.type === 'pong');
        const limited = waitForMessage(
            socket,
            (message) => message.code === 'RATE_LIMITED'
        );
        socket.send(JSON.stringify({ type: 'ping' }));
        assert.equal((await limited).code, 'RATE_LIMITED');
        socket.close();
        await running.close();
    });

    it('등록 조회 예외를 연결 내부 오류로 격리한다', async () => {
        const errors = [];
        const running = await startLayer({
            findByOwner: () => {
                throw new Error('database unavailable');
            },
            onError: (error) => errors.push(error.message),
        });
        const socket = new WebSocket(running.url);
        await new Promise((resolve) => socket.once('open', resolve));
        const internal = waitForMessage(
            socket,
            (message) => message.code === 'INTERNAL'
        );
        socket.send(JSON.stringify({
            type: 'join',
            projectId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            ownerId: 'owner',
        }));
        assert.equal((await internal).code, 'INTERNAL');
        assert.deepEqual(errors, ['database unavailable']);
        socket.close();
        await running.close();
    });
});
