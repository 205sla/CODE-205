'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
    MIN_INTERVAL_MS,
    performStatusCheck,
    normalizeConfig,
    readEnvFile,
    redactId,
    readHistoryFile,
    writeHistoryFile,
    _test,
} = require('../src/services/entryCvMonitor');

describe('entryCvMonitor config', () => {
    it('loads local env files without exposing secrets in public config', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-cv-env-'));
        const file = path.join(dir, 'monitor.env');
        fs.writeFileSync(file, [
            'ENTRY_MONITOR_ENABLED=true',
            'ENTRY_MONITOR_PROJECT_ID=abcdef0123456789abcdef01',
            'ENTRY_MONITOR_ID=test-monitor-user',
            "ENTRY_MONITOR_PASSWORD='secret-password'",
            'ENTRY_MONITOR_INTERVAL_MINUTES=1',
        ].join('\n'));

        const parsed = readEnvFile(file);
        assert.equal(parsed.values.ENTRY_MONITOR_PASSWORD, 'secret-password');

        const config = normalizeConfig({ ENTRY_MONITOR_ENV_FILE: file });
        assert.equal(config.enabled, true);
        assert.equal(config.accountConfigured, true);
        assert.equal(config.projectIdRedacted, 'abcdef...ef01');
        assert.equal(config.intervalMs, MIN_INTERVAL_MS);
        assert.equal(config.intervalMs, 60 * 60 * 1000);
        assert.equal(config.password, undefined);
        assert.equal(config.id, undefined);

        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('redacts ids before exposing monitor state', () => {
        assert.equal(redactId('abcdef0123456789abcdef01'), 'abcdef...ef01');
        assert.equal(redactId('abc'), '<configured>');
        assert.equal(redactId(''), '');
    });
});

describe('entryCvMonitor history', () => {
    it('writes and reads history records', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-cv-history-'));
        const file = path.join(dir, 'history.json');
        const history = [
            { checkedAt: '2026-06-05T05:00:00.000Z', status: 'DOWN', ok: false },
            { checkedAt: '2026-06-05T05:10:00.000Z', status: 'UNKNOWN', ok: false },
        ];

        writeHistoryFile(file, history);
        assert.deepEqual(readHistoryFile(file), history);

        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('entryCvMonitor socket helpers', () => {
    it('encodes masked client frames and parses server text frames', () => {
        const clientFrame = _test.encodeClientFrame(0x1, '40');
        const decodedClientFrame = _test.readWebSocketFrame(clientFrame);
        assert.equal(decodedClientFrame.opcode, 0x1);
        assert.equal(decodedClientFrame.payload.toString('utf8'), '40');
        assert.equal(decodedClientFrame.remaining.length, 0);

        const payload = Buffer.from('42["welcome"]');
        const serverFrame = Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
        const decodedServerFrame = _test.readWebSocketFrame(serverFrame);
        assert.equal(decodedServerFrame.opcode, 0x1);
        assert.equal(decodedServerFrame.payload.toString('utf8'), '42["welcome"]');
        assert.equal(decodedServerFrame.remaining.length, 0);
    });
});

describe('entryCvMonitor status checks', () => {
    it('uses the Node socket probe path when global WebSocket is unavailable', async () => {
        let socketProbeOptions;
        const fetchImpl = async (url) => {
            if (url === 'https://playentry.org/ws/new') {
                return new Response('<meta name="csrf-token" content="csrf-token">', {
                    headers: { 'set-cookie': '_csrf=csrf-cookie; Path=/' },
                });
            }
            if (url === 'https://playentry.org/graphql') {
                return new Response(JSON.stringify({
                    data: {
                        cloudServerInfo: {
                            url: 'https://cloud.playentry.org',
                            query: 'monitor-query',
                        },
                    },
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }
            throw new Error(`Unexpected URL: ${url}`);
        };

        const record = await performStatusCheck({
            projectId: 'abcdef0123456789abcdef01',
            projectIdRedacted: 'abcdef...ef01',
            engineIoVersion: '3',
            type: '',
            timeoutMs: 6000,
        }, {
            fetchImpl,
            WebSocketImpl: undefined,
            socketProbe: async (options) => {
                socketProbeOptions = options;
                return {
                    ok: true,
                    socketStatus: 'welcome',
                    reason: 'welcome',
                    elapsedMs: 12,
                };
            },
        });

        assert.equal(record.status, 'UP');
        assert.equal(record.ok, true);
        assert.equal(record.projectId, 'abcdef...ef01');
        assert.equal(socketProbeOptions.url, 'https://cloud.playentry.org');
        assert.equal(socketProbeOptions.query, 'monitor-query');
        assert.equal(socketProbeOptions.engineIoVersion, '3');
    });

    it('signs in before fetching cloud server info when credentials are configured', async () => {
        const graphqlOperations = [];
        let signInCookie = '';
        let cloudCookie = '';
        const fetchImpl = async (url, options = {}) => {
            if (url === 'https://playentry.org/ws/new') {
                return new Response('<meta name="csrf-token" content="csrf-token">', {
                    headers: { 'set-cookie': '_csrf=csrf-cookie; Path=/' },
                });
            }
            if (url === 'https://playentry.org/graphql') {
                const body = JSON.parse(options.body);
                if (body.query.includes('SIGNIN_BY_USERNAME')) {
                    graphqlOperations.push('signin');
                    signInCookie = options.headers.cookie;
                    return new Response(JSON.stringify({
                        data: {
                            signinByUsername: {
                                id: 'user-id',
                                username: 'monitor-user',
                                nickname: 'Monitor',
                            },
                        },
                    }), {
                        status: 200,
                        headers: {
                            'content-type': 'application/json',
                            'set-cookie': 'connect.sid=session-cookie; Path=/; HttpOnly',
                        },
                    });
                }
                if (body.query.includes('GET_CLOUD_SERVER_INFO')) {
                    graphqlOperations.push('cloudServerInfo');
                    cloudCookie = options.headers.cookie;
                    return new Response(JSON.stringify({
                        data: {
                            cloudServerInfo: {
                                url: 'https://cloud.playentry.org',
                                query: 'monitor-query',
                            },
                        },
                    }), {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    });
                }
            }
            throw new Error(`Unexpected URL: ${url}`);
        };

        const record = await performStatusCheck({
            projectId: 'abcdef0123456789abcdef01',
            projectIdRedacted: 'abcdef...ef01',
            entryId: 'monitor-user',
            entryPassword: 'monitor-password',
            engineIoVersion: '3',
            type: '',
            timeoutMs: 6000,
        }, {
            fetchImpl,
            WebSocketImpl: undefined,
            socketProbe: async () => ({
                ok: false,
                socketStatus: 'timeout',
                reason: 'No welcome before 6000ms.',
                elapsedMs: 6000,
            }),
        });

        assert.deepEqual(graphqlOperations, ['signin', 'cloudServerInfo']);
        assert.match(signInCookie, /_csrf=csrf-cookie/);
        assert.match(cloudCookie, /_csrf=csrf-cookie/);
        assert.match(cloudCookie, /connect\.sid=session-cookie/);
        assert.equal(record.status, 'DOWN');
        assert.equal(record.loginStatus, 'authenticated');
    });

    it('reports cloud server authorization failures without leaking project ids', async () => {
        const fetchImpl = async (url) => {
            if (url === 'https://playentry.org/ws/new') {
                return new Response('<meta name="csrf-token" content="csrf-token">', {
                    headers: { 'set-cookie': '_csrf=csrf-cookie; Path=/' },
                });
            }
            if (url === 'https://playentry.org/graphql') {
                return new Response(JSON.stringify({
                    data: { cloudServerInfo: null },
                    errors: [
                        {
                            statusCode: 403,
                            extensions: {
                                data: {
                                    reason: 'not authorized',
                                    id: 'abcdef0123456789abcdef01',
                                },
                            },
                        },
                    ],
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }
            throw new Error(`Unexpected URL: ${url}`);
        };

        const record = await performStatusCheck({
            projectId: 'abcdef0123456789abcdef01',
            projectIdRedacted: 'abcdef...ef01',
            engineIoVersion: '3',
            type: '',
            timeoutMs: 6000,
        }, {
            fetchImpl,
            WebSocketImpl: undefined,
            socketProbe: async () => {
                throw new Error('socket probe should not run');
            },
        });

        assert.equal(record.status, 'UNKNOWN');
        assert.equal(record.loginStatus, 'anonymous');
        assert.match(record.reason, /status=403/);
        assert.match(record.reason, /reason=not authorized/);
        assert.doesNotMatch(record.reason, /abcdef0123456789abcdef01/);
    });
});
