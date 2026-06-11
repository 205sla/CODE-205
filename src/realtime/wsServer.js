'use strict';

const { WebSocket, WebSocketServer } = require('ws');
const onlineProjectService = require('../services/onlineProjectService');
const { createRoomManager } = require('./roomManager');
const { createUsageMeter } = require('./usageMeter');

const DEFAULT_MAX_PAYLOAD = 64 * 1024;
const DEFAULT_JOIN_TIMEOUT_MS = 10 * 1000;
const DEFAULT_MESSAGE_RATE_LIMIT = 30;
const DEFAULT_MESSAGE_RATE_WINDOW_MS = 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 25 * 1000;

function attachWsServer(server, options = {}) {
    const findByOwner = options.findByOwner
        || onlineProjectService.findByOwner;
    const joinTimeoutMs = options.joinTimeoutMs ?? DEFAULT_JOIN_TIMEOUT_MS;
    const messageRateLimit = options.messageRateLimit
        ?? DEFAULT_MESSAGE_RATE_LIMIT;
    const messageRateWindowMs = options.messageRateWindowMs
        ?? DEFAULT_MESSAGE_RATE_WINDOW_MS;
    const heartbeatIntervalMs = options.heartbeatIntervalMs
        ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    const now = options.now || Date.now;
    const reportError = options.onError || ((error) => {
        console.error('[Entry Online WS]', error);
    });
    const usageMeter = options.usageMeter || createUsageMeter({
        db: options.db,
        onError: reportError,
    });
    const ownsUsageMeter = !options.usageMeter;
    const usageProjects = new WeakMap();
    const roomManagerOptions = options.roomManagerOptions || {};
    const roomManager = options.roomManager || createRoomManager({
        ...roomManagerOptions,
        onSend(client, bytes, payload) {
            roomManagerOptions.onSend?.(client, bytes, payload);
            usageMeter.recordOutbound(usageProjects.get(client), bytes);
        },
    });

    const wss = new WebSocketServer({
        noServer: true,
        maxPayload: options.maxPayload || DEFAULT_MAX_PAYLOAD,
        clientTracking: true,
    });

    function rejectSocket(socket, statusLine) {
        try {
            socket.write(
                'HTTP/1.1 ' + statusLine + '\r\n'
                + 'Connection: close\r\n'
                + 'Content-Length: 0\r\n'
                + '\r\n'
            );
        } finally {
            socket.destroy();
        }
    }

    function sendJson(ws, payload, project = usageProjects.get(ws)) {
        if (ws.readyState !== WebSocket.OPEN) return false;
        try {
            const encoded = JSON.stringify(payload);
            ws.send(encoded);
            usageMeter.recordOutbound(project, Buffer.byteLength(encoded));
            return true;
        } catch (error) {
            reportError(error);
            return false;
        }
    }

    function onUpgrade(request, socket, head) {
        let pathname;
        try {
            pathname = new URL(request.url, 'http://localhost').pathname;
        } catch (_) {
            rejectSocket(socket, '400 Bad Request');
            return;
        }
        if (pathname !== '/sync') {
            rejectSocket(socket, '404 Not Found');
            return;
        }

        try {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        } catch (error) {
            reportError(error);
            socket.destroy();
        }
    }

    server.on('upgrade', onUpgrade);
    wss.on('error', reportError);

    wss.on('connection', (ws) => {
        let joined = false;
        let project = null;
        let rateWindowStartedAt = now();
        let rateWindowCount = 0;
        ws.isAlive = true;

        function consumeRateLimit() {
            if (messageRateLimit <= 0) return true;
            const timestamp = now();
            if (timestamp - rateWindowStartedAt >= messageRateWindowMs) {
                rateWindowStartedAt = timestamp;
                rateWindowCount = 0;
            }
            rateWindowCount += 1;
            return rateWindowCount <= messageRateLimit;
        }

        const joinTimer = setTimeout(() => {
            if (!joined) {
                sendJson(ws, {
                    type: 'error',
                    code: 'JOIN_TIMEOUT',
                    message: 'join 메시지 제한 시간을 초과했습니다.',
                });
                ws.close(1008, 'join timeout');
            }
        }, joinTimeoutMs);
        joinTimer.unref?.();

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', (raw, isBinary) => {
            try {
                if (isBinary) {
                    if (project) usageMeter.recordInbound(project, raw.length);
                    ws.close(1003, 'text messages only');
                    return;
                }
                if (!consumeRateLimit()) {
                    if (project) usageMeter.recordInbound(project, raw.length);
                    sendJson(ws, {
                        type: 'error',
                        code: 'RATE_LIMITED',
                        message: '메시지를 너무 자주 보냈습니다.',
                    });
                    ws.close(1008, 'message rate exceeded');
                    return;
                }

                let message;
                try {
                    message = JSON.parse(raw.toString('utf8'));
                } catch (_) {
                    if (project) usageMeter.recordInbound(project, raw.length);
                    sendJson(ws, {
                        type: 'error',
                        code: 'INVALID_JSON',
                        message: 'JSON 메시지만 사용할 수 있습니다.',
                    });
                    return;
                }

                if (!joined) {
                    if (!message || message.type !== 'join') {
                        sendJson(ws, {
                            type: 'error',
                            code: 'JOIN_REQUIRED',
                            message: '첫 메시지는 join이어야 합니다.',
                        });
                        return;
                    }
                    project = findByOwner(message.projectId, message.ownerId);
                    if (!project) {
                        sendJson(ws, {
                            type: 'error',
                            code: 'REGISTRATION_NOT_FOUND',
                            message: '해당 CODE 205 ID로 등록된 작품을 찾을 수 없습니다.',
                        });
                        ws.close(1008, 'registration not found');
                        return;
                    }

                    usageProjects.set(ws, project);
                    usageMeter.recordInbound(project, raw.length);
                    let result;
                    if (message.resumeToken) {
                        result = roomManager.resume(
                            ws,
                            {
                                registrationId: project.id,
                                projectId: project.entry_project_id,
                                roomSize: project.room_size,
                            },
                            message.resumeToken
                        );
                        if (!result) {
                            sendJson(ws, {
                                type: 'error',
                                code: 'RESUME_NOT_FOUND',
                                message: '재접속할 기존 방을 찾을 수 없습니다.',
                            });
                            ws.close(1008, 'resume not found');
                            return;
                        }
                    } else {
                        result = roomManager.join(ws, {
                            registrationId: project.id,
                            projectId: project.entry_project_id,
                            roomSize: project.room_size,
                        });
                    }
                    if (!result) {
                        ws.close(1011, 'room join failed');
                        return;
                    }

                    joined = true;
                    clearTimeout(joinTimer);
                    usageMeter.recordConnection(project);
                    return;
                }

                usageMeter.recordInbound(project, raw.length);
                roomManager.handleMessage(ws, message);
            } catch (error) {
                reportError(error);
                sendJson(ws, {
                    type: 'error',
                    code: 'INTERNAL',
                    message: '메시지 처리 중 서버 오류가 발생했습니다.',
                });
                ws.close(1011, 'message handler failed');
            }
        });

        ws.on('error', (error) => {
            reportError(error);
            if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
        });

        ws.on('close', (code) => {
            clearTimeout(joinTimer);
            roomManager.leave(ws, {
                allowResume: code === 1006 || code === 4000,
            });
            usageProjects.delete(ws);
        });
    });

    let heartbeatTimer = null;
    if (heartbeatIntervalMs > 0) {
        heartbeatTimer = setInterval(() => {
            for (const ws of wss.clients) {
                if (ws.isAlive === false) {
                    ws.terminate();
                    continue;
                }
                ws.isAlive = false;
                try {
                    ws.ping();
                } catch (error) {
                    reportError(error);
                    ws.terminate();
                }
            }
        }, heartbeatIntervalMs);
        heartbeatTimer.unref?.();
    }

    function close(callback) {
        server.off('upgrade', onUpgrade);
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        for (const client of wss.clients) {
            client.close(1001, 'server shutdown');
        }
        if (ownsUsageMeter) usageMeter.close();
        wss.close(callback);
    }

    return { wss, roomManager, usageMeter, close };
}

module.exports = {
    DEFAULT_MAX_PAYLOAD,
    DEFAULT_JOIN_TIMEOUT_MS,
    DEFAULT_MESSAGE_RATE_LIMIT,
    DEFAULT_MESSAGE_RATE_WINDOW_MS,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    attachWsServer,
};
