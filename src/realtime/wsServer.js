'use strict';

const { WebSocketServer } = require('ws');
const onlineProjectService = require('../services/onlineProjectService');
const { createRoomManager } = require('./roomManager');

const DEFAULT_MAX_PAYLOAD = 64 * 1024;
const DEFAULT_JOIN_TIMEOUT_MS = 10 * 1000;

function attachWsServer(server, options = {}) {
    const roomManager = options.roomManager || createRoomManager();
    const findByOwner = options.findByOwner
        || onlineProjectService.findByOwner;
    const joinTimeoutMs = options.joinTimeoutMs || DEFAULT_JOIN_TIMEOUT_MS;

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

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    }

    server.on('upgrade', onUpgrade);

    wss.on('connection', (ws) => {
        let joined = false;
        const joinTimer = setTimeout(() => {
            if (!joined) {
                ws.send(JSON.stringify({
                    type: 'error',
                    code: 'JOIN_TIMEOUT',
                    message: 'join 메시지 제한 시간을 초과했습니다.',
                }));
                ws.close(1008, 'join timeout');
            }
        }, joinTimeoutMs);
        joinTimer.unref?.();

        ws.on('message', (raw, isBinary) => {
            if (isBinary) {
                ws.close(1003, 'text messages only');
                return;
            }

            let message;
            try {
                message = JSON.parse(raw.toString('utf8'));
            } catch (_) {
                ws.send(JSON.stringify({
                    type: 'error',
                    code: 'INVALID_JSON',
                    message: 'JSON 메시지만 사용할 수 있습니다.',
                }));
                return;
            }

            if (!joined) {
                if (!message || message.type !== 'join') {
                    ws.send(JSON.stringify({
                        type: 'error',
                        code: 'JOIN_REQUIRED',
                        message: '첫 메시지는 join이어야 합니다.',
                    }));
                    return;
                }
                const project = findByOwner(message.projectId, message.ownerId);
                if (!project) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        code: 'REGISTRATION_NOT_FOUND',
                        message: '해당 CODE 205 ID로 등록된 작품을 찾을 수 없습니다.',
                    }));
                    ws.close(1008, 'registration not found');
                    return;
                }

                joined = true;
                clearTimeout(joinTimer);
                roomManager.join(ws, {
                    registrationId: project.id,
                    projectId: project.entry_project_id,
                    roomSize: project.room_size,
                });
                return;
            }

            roomManager.handleMessage(ws, message);
        });

        ws.on('close', () => {
            clearTimeout(joinTimer);
            roomManager.leave(ws);
        });
    });

    function close(callback) {
        server.off('upgrade', onUpgrade);
        for (const client of wss.clients) {
            client.close(1001, 'server shutdown');
        }
        wss.close(callback);
    }

    return { wss, roomManager, close };
}

module.exports = {
    DEFAULT_MAX_PAYLOAD,
    DEFAULT_JOIN_TIMEOUT_MS,
    attachWsServer,
};
