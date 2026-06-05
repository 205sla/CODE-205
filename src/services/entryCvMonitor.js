'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

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

async function performStatusCheck(config, deps = {}) {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    const fetchImpl = deps.fetchImpl || globalThis.fetch;
    const WebSocketImpl = deps.WebSocketImpl || globalThis.WebSocket;

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
    if (typeof WebSocketImpl !== 'function') {
        return { ...baseRecord, reason: 'WebSocket is not available in this Node runtime.' };
    }

    try {
        const cloudServer = await fetchCloudServerInfo(config.projectId, fetchImpl, config.timeoutMs);
        const socketResult = await probeSocket({
            url: cloudServer.url,
            query: cloudServer.query,
            type: config.type,
            engineIoVersion: config.engineIoVersion,
            timeoutMs: config.timeoutMs,
            WebSocketImpl,
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
};
