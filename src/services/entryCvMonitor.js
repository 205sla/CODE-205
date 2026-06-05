'use strict';

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const tls = require('tls');

const { ROOT_DIR } = require('../config');

const MIN_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_HISTORY_LIMIT = 144;

function parseBool(value) {
    return value === true || value === 'true' || value === '1' || value === 'yes';
}

function parsePositiveInt(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

function stripQuotes(value) {
    const trimmed = String(value || '').trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed;
}

function readEnvFile(filePath) {
    if (!filePath) return { values: {}, error: '' };
    try {
        const text = fs.readFileSync(filePath, 'utf8');
        const values = {};
        for (const rawLine of text.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
            if (!match) continue;
            values[match[1]] = stripQuotes(match[2]);
        }
        return { values, error: '' };
    } catch (error) {
        return { values: {}, error: error.message || String(error) };
    }
}

function redactId(value) {
    const text = String(value || '');
    if (!text) return '';
    if (text.length <= 10) return '<configured>';
    return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function normalizeConfig(env = process.env) {
    const defaultEnvFile = path.join(os.homedir(), '.entry-cv-monitor', 'code205-entry-cv-monitor.env');
    const envFile = env.ENTRY_MONITOR_ENV_FILE || (fs.existsSync(defaultEnvFile) ? defaultEnvFile : '');
    const file = readEnvFile(envFile);
    const get = (name, fallback = '') => {
        if (env[name] !== undefined && env[name] !== '') return env[name];
        if (file.values[name] !== undefined && file.values[name] !== '') return file.values[name];
        return fallback;
    };

    const intervalMinutes = parsePositiveInt(get('ENTRY_MONITOR_INTERVAL_MINUTES', '10'), 10);
    const intervalMs = Math.max(intervalMinutes * 60 * 1000, MIN_INTERVAL_MS);
    const timeoutMs = Math.min(
        Math.max(parsePositiveInt(get('ENTRY_MONITOR_TIMEOUT_MS', DEFAULT_TIMEOUT_MS), DEFAULT_TIMEOUT_MS), 1000),
        30000
    );
    const projectId = get('ENTRY_MONITOR_PROJECT_ID', '');

    const logPathRaw = get('ENTRY_MONITOR_LOG_PATH', path.join(ROOT_DIR, 'db', 'entry-cv-status.json'));

    return {
        enabled: parseBool(get('ENTRY_MONITOR_ENABLED', 'false')),
        projectId,
        projectIdRedacted: redactId(projectId),
        accountConfigured: Boolean(get('ENTRY_MONITOR_ID', '') && get('ENTRY_MONITOR_PASSWORD', '')),
        nicknameConfigured: Boolean(get('ENTRY_MONITOR_NICKNAME', '')),
        intervalMs,
        timeoutMs,
        engineIoVersion: get('ENTRY_MONITOR_EIO', '3'),
        type: get('ENTRY_MONITOR_TYPE', ''),
        historyLimit: parsePositiveInt(get('ENTRY_MONITOR_HISTORY_LIMIT', DEFAULT_HISTORY_LIMIT), DEFAULT_HISTORY_LIMIT),
        logPath: path.isAbsolute(logPathRaw) ? logPathRaw : path.join(ROOT_DIR, logPathRaw),
        envFileConfigured: Boolean(envFile),
        envFileError: file.error,
        loginMode: get('ENTRY_MONITOR_LOGIN_MODE', 'session-pending'),
    };
}

function readHistoryFile(logPath) {
    try {
        const payload = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        const list = Array.isArray(payload) ? payload : payload.history;
        if (!Array.isArray(list)) return [];
        return list.filter((item) => item && typeof item === 'object');
    } catch {
        return [];
    }
}

function writeHistoryFile(logPath, history) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const tmp = `${logPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ history }, null, 2));
    fs.renameSync(tmp, logPath);
}

function makeSocketUrl(baseUrl, query, type, engineIoVersion) {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
    url.pathname = '/cv/';
    url.searchParams.set('EIO', engineIoVersion);
    url.searchParams.set('transport', 'websocket');
    if (type) url.searchParams.set('type', type);
    url.searchParams.set('q', query);
    return url.toString();
}

function parseSocketIoEvent(packet) {
    if (!packet.startsWith('42')) return null;
    try {
        const decoded = JSON.parse(packet.slice(2));
        if (Array.isArray(decoded)) return { name: decoded[0], args: decoded.slice(1) };
    } catch {
        return null;
    }
    return null;
}

function eventPacket(name, ...args) {
    return `42${JSON.stringify([name, ...args])}`;
}

function makeWebSocketAccept(key) {
    return crypto.createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
}

function encodeClientFrame(opcode, payload = '') {
    const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
    const payloadLength = payloadBuffer.length;
    let headerLength = 2;
    if (payloadLength >= 126 && payloadLength <= 65535) headerLength = 4;
    if (payloadLength > 65535) headerLength = 10;

    const frame = Buffer.alloc(headerLength + 4 + payloadLength);
    frame[0] = 0x80 | opcode;
    if (payloadLength < 126) {
        frame[1] = 0x80 | payloadLength;
    } else if (payloadLength <= 65535) {
        frame[1] = 0x80 | 126;
        frame.writeUInt16BE(payloadLength, 2);
    } else {
        frame[1] = 0x80 | 127;
        frame.writeUInt32BE(0, 2);
        frame.writeUInt32BE(payloadLength, 6);
    }

    const mask = crypto.randomBytes(4);
    mask.copy(frame, headerLength);
    for (let index = 0; index < payloadLength; index += 1) {
        frame[headerLength + 4 + index] = payloadBuffer[index] ^ mask[index % 4];
    }
    return frame;
}

function readWebSocketFrame(buffer) {
    if (buffer.length < 2) return null;
    const first = buffer[0];
    const second = buffer[1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let payloadLength = second & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
        if (buffer.length < offset + 2) return null;
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
    } else if (payloadLength === 127) {
        if (buffer.length < offset + 8) return null;
        const high = buffer.readUInt32BE(offset);
        const low = buffer.readUInt32BE(offset + 4);
        if (high > 0x1fffff) throw new Error('WebSocket frame is too large.');
        payloadLength = high * 2 ** 32 + low;
        offset += 8;
    }

    let mask;
    if (masked) {
        if (buffer.length < offset + 4) return null;
        mask = buffer.subarray(offset, offset + 4);
        offset += 4;
    }

    if (buffer.length < offset + payloadLength) return null;
    const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
    if (mask) {
        for (let index = 0; index < payload.length; index += 1) {
            payload[index] ^= mask[index % 4];
        }
    }

    return {
        opcode,
        payload,
        remaining: buffer.subarray(offset + payloadLength),
    };
}

function connectWebSocket(socketUrl, timeoutMs) {
    const parsed = new URL(socketUrl);
    const isSecure = parsed.protocol === 'wss:';
    const port = Number(parsed.port || (isSecure ? 443 : 80));
    const requestPath = `${parsed.pathname || '/'}${parsed.search || ''}`;
    const key = crypto.randomBytes(16).toString('base64');
    const expectedAccept = makeWebSocketAccept(key);

    return new Promise((resolve, reject) => {
        let settled = false;
        let buffer = Buffer.alloc(0);
        let timer;
        const socket = isSecure
            ? tls.connect({ host: parsed.hostname, port, servername: parsed.hostname })
            : net.connect({ host: parsed.hostname, port });

        const fail = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            reject(error);
        };

        timer = setTimeout(() => {
            fail(new Error(`WebSocket handshake timed out after ${timeoutMs}ms.`));
        }, timeoutMs);

        socket.on(isSecure ? 'secureConnect' : 'connect', () => {
            socket.write([
                `GET ${requestPath} HTTP/1.1`,
                `Host: ${parsed.host}`,
                'Upgrade: websocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Version: 13',
                `Sec-WebSocket-Key: ${key}`,
                'Origin: https://playentry.org',
                '',
                '',
            ].join('\r\n'));
        });

        socket.on('data', (chunk) => {
            if (settled) return;
            buffer = Buffer.concat([buffer, chunk]);
            const headerEnd = buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) return;

            const headerText = buffer.subarray(0, headerEnd).toString('utf8');
            const lines = headerText.split(/\r\n/);
            const statusLine = lines.shift() || '';
            const headers = new Map();
            for (const line of lines) {
                const colon = line.indexOf(':');
                if (colon === -1) continue;
                headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
            }

            if (!/^HTTP\/1\.[01] 101\b/.test(statusLine)) {
                fail(new Error(`WebSocket handshake failed: ${statusLine || 'no status line'}.`));
                return;
            }
            if (headers.get('sec-websocket-accept') !== expectedAccept) {
                fail(new Error('WebSocket handshake failed: invalid accept key.'));
                return;
            }

            settled = true;
            clearTimeout(timer);
            socket.removeAllListeners('data');
            socket.removeAllListeners('error');
            resolve({ socket, remaining: buffer.subarray(headerEnd + 4) });
        });

        socket.on('error', fail);
        socket.on('close', () => {
            fail(new Error('WebSocket handshake socket closed.'));
        });
    });
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function getCsrfContext(fetchImpl, timeoutMs) {
    const response = await fetchWithTimeout(fetchImpl, 'https://playentry.org/ws/new', {}, timeoutMs);
    const html = await response.text();
    const csrfCookie = (response.headers.get('set-cookie') || '').match(/_csrf=([^;]+)/)?.[1] || '';
    const csrfToken = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1] || '';
    if (!csrfCookie || !csrfToken) {
        throw new Error('Failed to obtain Entry CSRF context.');
    }
    return { csrfCookie, csrfToken };
}

async function fetchCloudServerInfo(projectId, fetchImpl, timeoutMs) {
    const { csrfCookie, csrfToken } = await getCsrfContext(fetchImpl, timeoutMs);
    const response = await fetchWithTimeout(fetchImpl, 'https://playentry.org/graphql', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
            cookie: `_csrf=${csrfCookie}`,
            origin: 'https://playentry.org',
            referer: `https://playentry.org/ws/${projectId}`,
        },
        body: JSON.stringify({
            query: 'query GET_CLOUD_SERVER_INFO($id: ID!) { cloudServerInfo(id: $id) { url query } }',
            variables: { id: projectId },
        }),
    }, timeoutMs);
    const payload = await response.json();
    if (!response.ok || payload.errors || !payload.data?.cloudServerInfo) {
        throw new Error('Failed to fetch cloudServerInfo.');
    }
    return payload.data.cloudServerInfo;
}

async function probeSocket({ url, query, type, engineIoVersion, timeoutMs, WebSocketImpl }) {
    const startedAt = Date.now();
    const socketUrl = makeSocketUrl(url, query, type, engineIoVersion);

    return await new Promise((resolve) => {
        let done = false;
        let ws;
        const finish = (result) => {
            if (done) return;
            done = true;
            try { ws?.close(); } catch { /* noop */ }
            resolve({
                elapsedMs: Date.now() - startedAt,
                ...result,
            });
        };

        const timer = setTimeout(() => {
            finish({ ok: false, socketStatus: 'timeout', reason: `No welcome before ${timeoutMs}ms.` });
        }, timeoutMs);

        try {
            ws = new WebSocketImpl(socketUrl);
        } catch (error) {
            clearTimeout(timer);
            finish({ ok: false, socketStatus: 'constructor-error', reason: error.message });
            return;
        }

        ws.addEventListener('message', ({ data }) => {
            const packet = String(data);
            if (packet.startsWith('0')) {
                ws.send('40');
                return;
            }
            if (packet === '2') {
                ws.send('3');
                return;
            }
            if (packet.startsWith('44')) {
                clearTimeout(timer);
                finish({ ok: false, socketStatus: 'socketio-error', reason: packet.slice(2) });
                return;
            }

            const event = parseSocketIoEvent(packet);
            if (!event) return;
            if (event.name === 'check') {
                ws.send(eventPacket('imAlive', event.args[0]));
            } else if (event.name === 'welcome') {
                clearTimeout(timer);
                finish({ ok: true, socketStatus: 'welcome', reason: 'welcome' });
            } else if (event.name === 'changeMode') {
                clearTimeout(timer);
                finish({ ok: false, socketStatus: 'changeMode', reason: JSON.stringify(event.args) });
            }
        });

        ws.addEventListener('error', () => {
            clearTimeout(timer);
            finish({ ok: false, socketStatus: 'websocket-error', reason: 'WebSocket error event.' });
        });

        ws.addEventListener('close', (event) => {
            clearTimeout(timer);
            finish({ ok: false, socketStatus: 'closed', reason: `code=${event.code} reason=${event.reason || ''}` });
        });
    });
}

async function probeSocketWithNodeClient({ url, query, type, engineIoVersion, timeoutMs }) {
    const startedAt = Date.now();
    const socketUrl = makeSocketUrl(url, query, type, engineIoVersion);
    let connection;

    try {
        connection = await connectWebSocket(socketUrl, timeoutMs);
    } catch (error) {
        return {
            ok: false,
            socketStatus: 'handshake-error',
            reason: error.message || String(error),
            elapsedMs: Date.now() - startedAt,
        };
    }

    return await new Promise((resolve) => {
        let done = false;
        let frameBuffer = connection.remaining || Buffer.alloc(0);
        const { socket } = connection;

        const finish = (result) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { socket.write(encodeClientFrame(0x8)); } catch { /* noop */ }
            socket.destroy();
            resolve({
                elapsedMs: Date.now() - startedAt,
                ...result,
            });
        };

        const sendText = (text) => {
            socket.write(encodeClientFrame(0x1, text));
        };

        const handlePacket = (packet) => {
            if (packet.startsWith('0')) {
                sendText('40');
                return;
            }
            if (packet === '2') {
                sendText('3');
                return;
            }
            if (packet.startsWith('44')) {
                finish({ ok: false, socketStatus: 'socketio-error', reason: packet.slice(2) });
                return;
            }

            const event = parseSocketIoEvent(packet);
            if (!event) return;
            if (event.name === 'check') {
                sendText(eventPacket('imAlive', event.args[0]));
            } else if (event.name === 'welcome') {
                finish({ ok: true, socketStatus: 'welcome', reason: 'welcome' });
            } else if (event.name === 'changeMode') {
                finish({ ok: false, socketStatus: 'changeMode', reason: JSON.stringify(event.args) });
            }
        };

        const processFrames = () => {
            try {
                while (!done) {
                    const frame = readWebSocketFrame(frameBuffer);
                    if (!frame) return;
                    frameBuffer = frame.remaining;

                    if (frame.opcode === 0x1 || frame.opcode === 0x0) {
                        handlePacket(frame.payload.toString('utf8'));
                    } else if (frame.opcode === 0x8) {
                        finish({ ok: false, socketStatus: 'closed', reason: 'server sent close frame' });
                    } else if (frame.opcode === 0x9) {
                        socket.write(encodeClientFrame(0xA, frame.payload));
                    }
                }
            } catch (error) {
                finish({ ok: false, socketStatus: 'frame-error', reason: error.message || String(error) });
            }
        };

        const timer = setTimeout(() => {
            finish({ ok: false, socketStatus: 'timeout', reason: `No welcome before ${timeoutMs}ms.` });
        }, timeoutMs);

        socket.on('data', (chunk) => {
            frameBuffer = Buffer.concat([frameBuffer, chunk]);
            processFrames();
        });

        socket.on('error', (error) => {
            finish({ ok: false, socketStatus: 'websocket-error', reason: error.message || 'WebSocket socket error.' });
        });

        socket.on('close', () => {
            finish({ ok: false, socketStatus: 'closed', reason: 'socket closed' });
        });

        processFrames();
    });
}

async function performStatusCheck(config, deps = {}) {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    const fetchImpl = deps.fetchImpl || globalThis.fetch;
    const hasInjectedWebSocket = Object.prototype.hasOwnProperty.call(deps, 'WebSocketImpl');
    const WebSocketImpl = hasInjectedWebSocket ? deps.WebSocketImpl : globalThis.WebSocket;
    const socketProbe = deps.socketProbe || (typeof WebSocketImpl === 'function'
        ? (socketOptions) => probeSocket({ ...socketOptions, WebSocketImpl })
        : probeSocketWithNodeClient);

    const baseRecord = {
        checkedAt,
        status: 'UNKNOWN',
        ok: false,
        projectId: config.projectIdRedacted,
        engineIoVersion: config.engineIoVersion,
        type: config.type || '',
        reason: '',
        elapsedMs: 0,
    };

    if (!config.projectId) {
        return { ...baseRecord, reason: 'ENTRY_MONITOR_PROJECT_ID is not configured.' };
    }
    if (config.envFileError) {
        return { ...baseRecord, reason: `Failed to read monitor env file: ${config.envFileError}` };
    }
    if (typeof fetchImpl !== 'function') {
        return { ...baseRecord, reason: 'fetch is not available in this Node runtime.' };
    }

    try {
        const cloudServer = await fetchCloudServerInfo(config.projectId, fetchImpl, config.timeoutMs);
        const socketResult = await socketProbe({
            url: cloudServer.url,
            query: cloudServer.query,
            type: config.type,
            engineIoVersion: config.engineIoVersion,
            timeoutMs: config.timeoutMs,
        });
        return {
            ...baseRecord,
            status: socketResult.ok ? 'UP' : 'DOWN',
            ok: socketResult.ok,
            socketStatus: socketResult.socketStatus,
            reason: socketResult.reason,
            elapsedMs: socketResult.elapsedMs,
        };
    } catch (error) {
        return {
            ...baseRecord,
            status: 'UNKNOWN',
            reason: error.message || String(error),
            elapsedMs: Date.now() - startedAt,
        };
    }
}

function publicConfig(config) {
    return {
        enabled: config.enabled,
        configured: Boolean(config.projectId),
        projectId: config.projectIdRedacted,
        accountConfigured: config.accountConfigured,
        nicknameConfigured: config.nicknameConfigured,
        intervalMs: config.intervalMs,
        timeoutMs: config.timeoutMs,
        engineIoVersion: config.engineIoVersion,
        type: config.type || '',
        loginMode: config.loginMode,
        historyLimit: config.historyLimit,
    };
}

function createEntryCvMonitor(options = {}) {
    const config = options.config || normalizeConfig(options.env || process.env);
    const deps = {
        fetchImpl: options.fetchImpl,
        WebSocketImpl: options.WebSocketImpl,
        socketProbe: options.socketProbe,
    };
    const now = options.now || (() => Date.now());
    const setTimer = options.setTimeout || setTimeout;
    const clearTimer = options.clearTimeout || clearTimeout;
    let timer = null;
    let running = false;

    function history() {
        return readHistoryFile(config.logPath).slice(-config.historyLimit);
    }

    function latest() {
        const list = history();
        return list.length ? list[list.length - 1] : null;
    }

    function nextCheckAt() {
        if (!config.enabled) return null;
        const last = latest();
        if (!last?.checkedAt) return new Date(now()).toISOString();
        const lastMs = Date.parse(last.checkedAt);
        if (!Number.isFinite(lastMs)) return new Date(now()).toISOString();
        return new Date(Math.max(now(), lastMs + config.intervalMs)).toISOString();
    }

    function append(record) {
        const next = history().concat(record).slice(-config.historyLimit);
        writeHistoryFile(config.logPath, next);
    }

    async function checkOnce() {
        const record = await performStatusCheck(config, deps);
        append(record);
        return record;
    }

    function schedule() {
        if (!config.enabled || timer) return;
        const next = nextCheckAt();
        if (!next) return;
        const delay = Math.max(0, Date.parse(next) - now());
        timer = setTimer(async () => {
            timer = null;
            if (running) {
                schedule();
                return;
            }
            running = true;
            try {
                await checkOnce();
            } catch (error) {
                try {
                    append({
                        checkedAt: new Date(now()).toISOString(),
                        status: 'UNKNOWN',
                        ok: false,
                        projectId: config.projectIdRedacted,
                        reason: `Monitor check failed: ${error.message || String(error)}`,
                        elapsedMs: 0,
                    });
                } catch { /* keep scheduler alive even when history cannot be written */ }
            } finally {
                running = false;
                schedule();
            }
        }, delay);
        if (timer?.unref) timer.unref();
    }

    function start() {
        schedule();
    }

    function stop() {
        if (!timer) return;
        clearTimer(timer);
        timer = null;
    }

    function getSnapshot() {
        const list = history();
        const last = list.length ? list[list.length - 1] : null;
        return {
            checkedAt: new Date(now()).toISOString(),
            monitor: publicConfig(config),
            latest: last,
            history: list.slice().reverse(),
            nextCheckAt: nextCheckAt(),
            running,
        };
    }

    return { start, stop, checkOnce, getSnapshot };
}

module.exports = {
    MIN_INTERVAL_MS,
    createEntryCvMonitor,
    normalizeConfig,
    performStatusCheck,
    readEnvFile,
    readHistoryFile,
    writeHistoryFile,
    redactId,
    _test: {
        encodeClientFrame,
        readWebSocketFrame,
        makeSocketUrl,
        probeSocketWithNodeClient,
    },
};
