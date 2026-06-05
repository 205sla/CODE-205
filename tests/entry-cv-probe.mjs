#!/usr/bin/env node

import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_TYPES = ['', 'workspace', 'project', 'variable', 'list', 'realtime'];

function parseArgs(argv) {
    const args = {
        projectId: process.env.ENTRY_CV_PROJECT_ID || '',
        url: process.env.ENTRY_CV_URL || '',
        query: process.env.ENTRY_CV_QUERY || '',
        type: process.env.ENTRY_CV_TYPE,
        timeoutMs: Number(process.env.ENTRY_CV_TIMEOUT_MS || 8000),
        candidateTypes: DEFAULT_TYPES,
        eioVersions: (process.env.ENTRY_CV_EIO || '3,4').split(','),
        json: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--project-id') args.projectId = argv[++i] || '';
        else if (arg === '--url') args.url = argv[++i] || '';
        else if (arg === '--query') args.query = argv[++i] || '';
        else if (arg === '--type') args.type = argv[++i] || '';
        else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i] || args.timeoutMs);
        else if (arg === '--types') args.candidateTypes = (argv[++i] || '').split(',');
        else if (arg === '--eio') args.eioVersions = (argv[++i] || '').split(',');
        else if (arg === '--json') args.json = true;
        else if (arg === '--help') args.help = true;
    }
    return args;
}

function usage() {
    return [
        'Usage:',
        '  node tests/entry-cv-probe.mjs --project-id <playentryProjectId>',
        '  node tests/entry-cv-probe.mjs --url https://playentry.org --query <cloudServerInfo.query>',
        '',
        'Options:',
        '  --type <type>         Try one type only. Empty type is allowed with --type "".',
        '  --types a,b,c        Try multiple type query values. Default: empty,workspace,project,variable,list,realtime.',
        '  --eio 3,4           Try Engine.IO protocol versions. Default: 3,4.',
        '  --timeout-ms <ms>    Per-connection timeout. Default: 8000.',
        '  --json              Print JSON only.',
    ].join('\n');
}

function redact(value) {
    if (!value) return '';
    return value.length <= 12 ? '<redacted>' : `${value.slice(0, 6)}...${value.slice(-6)}`;
}

async function getCsrfContext() {
    const response = await fetch('https://playentry.org/ws/new');
    const html = await response.text();
    const csrfCookie = (response.headers.get('set-cookie') || '').match(/_csrf=([^;]+)/)?.[1] || '';
    const csrfToken = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1] || '';
    if (!csrfCookie || !csrfToken) {
        throw new Error('Failed to obtain playentry CSRF cookie/token.');
    }
    return { csrfCookie, csrfToken };
}

async function fetchCloudServerInfo(projectId) {
    const { csrfCookie, csrfToken } = await getCsrfContext();
    const response = await fetch('https://playentry.org/graphql', {
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
    });
    const payload = await response.json();
    if (!response.ok || payload.errors || !payload.data?.cloudServerInfo) {
        const error = new Error('Failed to fetch cloudServerInfo.');
        error.details = payload;
        throw error;
    }
    return payload.data.cloudServerInfo;
}

function makeSocketUrl(baseUrl, query, type, eio) {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
    url.pathname = '/cv/';
    url.searchParams.set('EIO', eio);
    url.searchParams.set('transport', 'websocket');
    if (type !== undefined && type !== '') {
        url.searchParams.set('type', type);
    }
    url.searchParams.set('q', query);
    return url.toString();
}

function parseSocketIoEvent(packet) {
    if (!packet.startsWith('42')) return null;
    try {
        const decoded = JSON.parse(packet.slice(2));
        if (Array.isArray(decoded)) {
            return { name: decoded[0], args: decoded.slice(1) };
        }
    } catch {
        return null;
    }
    return null;
}

function eventPacket(name, ...args) {
    return `42${JSON.stringify([name, ...args])}`;
}

async function probeOnce({ url, query, type, eio, timeoutMs }) {
    const startedAt = Date.now();
    const socketUrl = makeSocketUrl(url, query, type, eio);
    const events = [];

    return await new Promise((resolve) => {
        let done = false;
        let ws;
        const finish = (result) => {
            if (done) return;
            done = true;
            try {
                ws?.close();
            } catch {}
            resolve({
                type,
                eio,
                elapsedMs: Date.now() - startedAt,
                events,
                ...result,
            });
        };

        const timer = setTimeout(() => {
            finish({ ok: false, status: 'timeout', reason: `No welcome before ${timeoutMs}ms.` });
        }, timeoutMs);

        try {
            ws = new WebSocket(socketUrl);
        } catch (error) {
            clearTimeout(timer);
            finish({ ok: false, status: 'constructor-error', reason: error.message });
            return;
        }

        ws.addEventListener('open', () => {
            events.push({ atMs: Date.now() - startedAt, event: 'websocket-open' });
        });

        ws.addEventListener('message', ({ data }) => {
            const packet = String(data);
            events.push({ atMs: Date.now() - startedAt, packet: packet.slice(0, 120) });

            if (packet.startsWith('0')) {
                ws.send('40');
                return;
            }
            if (packet === '2') {
                ws.send('3');
                return;
            }
            if (packet.startsWith('40')) {
                events.push({ atMs: Date.now() - startedAt, event: 'socketio-open' });
                return;
            }
            if (packet.startsWith('44')) {
                clearTimeout(timer);
                finish({ ok: false, status: 'socketio-error', reason: packet.slice(2) });
                return;
            }

            const event = parseSocketIoEvent(packet);
            if (!event) return;
            events.push({ atMs: Date.now() - startedAt, event: event.name });
            if (event.name === 'check') {
                ws.send(eventPacket('imAlive', event.args[0]));
            } else if (event.name === 'welcome') {
                clearTimeout(timer);
                finish({ ok: true, status: 'welcome', welcome: event.args[0] || null });
            } else if (event.name === 'changeMode') {
                clearTimeout(timer);
                finish({ ok: false, status: 'changeMode', reason: JSON.stringify(event.args) });
            }
        });

        ws.addEventListener('error', () => {
            clearTimeout(timer);
            finish({ ok: false, status: 'websocket-error', reason: 'WebSocket error event.' });
        });

        ws.addEventListener('close', (event) => {
            clearTimeout(timer);
            finish({
                ok: false,
                status: 'closed',
                reason: `code=${event.code} reason=${event.reason || ''}`,
            });
        });
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(usage());
        return;
    }

    let cv = { url: args.url, query: args.query };
    if (args.projectId) {
        cv = await fetchCloudServerInfo(args.projectId);
    }
    if (!cv.url || !cv.query) {
        throw new Error('Provide --project-id or both --url and --query.');
    }

    const candidateTypes = args.type === undefined ? args.candidateTypes : [args.type];
    const results = [];
    for (const eio of args.eioVersions) {
        for (const type of candidateTypes) {
            results.push(await probeOnce({
                url: cv.url,
                query: cv.query,
                type,
                eio,
                timeoutMs: args.timeoutMs,
            }));
            await delay(250);
        }
    }

    const summary = {
        checkedAt: new Date().toISOString(),
        source: args.projectId ? { projectId: args.projectId } : { url: cv.url, query: redact(cv.query) },
        url: cv.url,
        query: redact(cv.query),
        results,
    };

    if (args.json) {
        console.log(JSON.stringify(summary, null, 2));
    } else {
        console.log(`Entry CV probe at ${summary.checkedAt}`);
        console.log(`url=${summary.url}`);
        console.log(`query=${summary.query}`);
        for (const result of results) {
            const label = result.type === '' ? '<empty>' : result.type;
            console.log(`eio=${result.eio} type=${label} status=${result.status} ok=${result.ok} elapsedMs=${result.elapsedMs}`);
            if (result.reason) console.log(`  reason=${result.reason}`);
            for (const event of result.events.slice(0, 5)) {
                console.log(`  event=${JSON.stringify(event)}`);
            }
        }
    }

    if (!results.some((result) => result.ok)) {
        process.exitCode = 2;
    }
}

main().catch((error) => {
    console.error(error.message);
    if (error.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
});
