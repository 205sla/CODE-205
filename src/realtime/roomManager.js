'use strict';

const crypto = require('crypto');

const DEFAULT_RESUME_GRACE_MS = 15 * 1000;

const LOCAL_VARIABLE_NAMES = new Set([
    '$확장프로그램',
    '$유저번호',
]);

function isPrimitive(value) {
    const type = typeof value;
    return value === null || type === 'number' || type === 'string' || type === 'boolean';
}

function clonePrimitiveArray(value) {
    if (!Array.isArray(value) || !value.every(isPrimitive)) return null;
    return value.slice();
}

function variableKey(item) {
    if (typeof item.id === 'string' && item.id) return 'id:' + item.id;
    return 'name:' + item.name;
}

function sanitizeVariables(items) {
    if (!Array.isArray(items)) return [];
    const sanitized = new Map();
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        if (typeof item.name !== 'string' || !item.name.startsWith('$')) continue;
        if (LOCAL_VARIABLE_NAMES.has(item.name) || !isPrimitive(item.value)) continue;
        const clean = {
            id: typeof item.id === 'string' ? item.id : null,
            name: item.name,
            value: item.value,
        };
        sanitized.set(variableKey(clean), clean);
    }
    return [...sanitized.values()];
}

function sanitizeLists(items) {
    if (!Array.isArray(items)) return [];
    const sanitized = new Map();
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        if (typeof item.name !== 'string' || !item.name.startsWith('$')) continue;
        if (LOCAL_VARIABLE_NAMES.has(item.name)) continue;
        const array = clonePrimitiveArray(item.array);
        if (!array) continue;
        const clean = {
            id: typeof item.id === 'string' ? item.id : null,
            name: item.name,
            array,
        };
        sanitized.set(variableKey(clean), clean);
    }
    return [...sanitized.values()];
}

function createRoomManager(options = {}) {
    const idFactory = options.idFactory || (() => crypto.randomUUID());
    const resumeTokenFactory = options.resumeTokenFactory
        || (() => crypto.randomBytes(24).toString('base64url'));
    const resumeGraceMs = options.resumeGraceMs ?? DEFAULT_RESUME_GRACE_MS;
    const now = options.now || Date.now;
    const onSend = options.onSend || (() => {});
    const rooms = new Map();
    const pools = new Map();
    const sessions = new Map();
    const resumeReservations = new Map();

    function send(client, payload) {
        try {
            if (typeof client.send !== 'function') return false;
            if (typeof client.readyState === 'number' && client.readyState !== 1) return false;
            const encoded = JSON.stringify(payload);
            client.send(encoded);
            onSend(client, Buffer.byteLength(encoded), payload);
            return true;
        } catch (_) {
            return false;
        }
    }

    function sendError(client, code, message) {
        send(client, { type: 'error', code, message });
    }

    function getPool(project) {
        const key = String(project.registrationId);
        let pool = pools.get(key);
        if (!pool) {
            pool = {
                key,
                projectId: project.projectId,
                rooms: new Set(),
                forming: null,
            };
            pools.set(key, pool);
        }
        return pool;
    }

    function createRoom(pool, roomSize) {
        const room = {
            id: idFactory(),
            pool,
            state: 'forming',
            roomSize,
            members: new Map(),
            sharedState: {
                vars: new Map(),
                lists: new Map(),
            },
        };
        rooms.set(room.id, room);
        pool.rooms.add(room);
        pool.forming = room;
        return room;
    }

    function statePayload(room) {
        return {
            type: 'state',
            roomId: room.id,
            vars: [...room.sharedState.vars.values()],
            lists: [...room.sharedState.lists.values()],
        };
    }

    function rosterPayload(room) {
        const payload = {
            type: 'roster',
            roomId: room.id,
            state: room.state,
            roomSize: room.roomSize,
            connected: room.members.size,
        };
        if (room.state === 'locked') {
            const occupied = new Set(
                [...room.members.values()].map((member) => member.slot)
            );
            payload.slots = Array.from({ length: room.roomSize }, (_, index) => ({
                slot: index + 1,
                connected: occupied.has(index + 1),
            }));
        }
        return payload;
    }

    function broadcast(room, payload, exceptClient = null) {
        for (const client of room.members.keys()) {
            if (client !== exceptClient) send(client, payload);
        }
    }

    function broadcastRoster(room) {
        broadcast(room, rosterPayload(room));
    }

    function lockRoom(room) {
        room.state = 'locked';
        room.pool.forming = null;

        let slot = 1;
        for (const [client, member] of room.members) {
            member.slot = slot;
            member.resumeToken = resumeTokenFactory();
            send(client, {
                type: 'slot',
                roomId: room.id,
                slot,
                roomSize: room.roomSize,
                resumeToken: member.resumeToken,
            });
            send(client, statePayload(room));
            slot += 1;
        }
        broadcastRoster(room);
    }

    function join(client, project) {
        if (sessions.has(client)) {
            sendError(client, 'ALREADY_JOINED', '이미 방에 참가한 연결입니다.');
            return null;
        }

        const pool = getPool(project);
        const room = pool.forming || createRoom(pool, project.roomSize);
        const member = { slot: null, resumeToken: null };
        room.members.set(client, member);
        sessions.set(client, { room, member });

        if (room.members.size === room.roomSize) {
            lockRoom(room);
        } else {
            broadcastRoster(room);
        }
        return { roomId: room.id, state: room.state, slot: member.slot };
    }

    function resume(client, project, token) {
        if (sessions.has(client) || typeof token !== 'string' || !token) {
            return null;
        }
        const reservation = resumeReservations.get(token);
        if (!reservation) return null;
        if (reservation.expiresAt <= now()) {
            clearTimeout(reservation.timer);
            resumeReservations.delete(token);
            if (reservation.room.members.size === 0
                && !roomHasReservations(reservation.room)) {
                destroyRoom(reservation.room);
            }
            return null;
        }
        if (reservation.room.pool.key !== String(project.registrationId)) {
            return null;
        }

        clearTimeout(reservation.timer);
        resumeReservations.delete(token);
        reservation.room.members.set(client, reservation.member);
        sessions.set(client, {
            room: reservation.room,
            member: reservation.member,
        });
        send(client, {
            type: 'slot',
            roomId: reservation.room.id,
            slot: reservation.member.slot,
            roomSize: reservation.room.roomSize,
            resumeToken: reservation.member.resumeToken,
            resumed: true,
        });
        send(client, statePayload(reservation.room));
        broadcastRoster(reservation.room);
        return {
            roomId: reservation.room.id,
            state: reservation.room.state,
            slot: reservation.member.slot,
            resumed: true,
        };
    }

    function mergePatch(room, message) {
        const vars = sanitizeVariables(message.vars);
        const lists = sanitizeLists(message.lists);
        for (const item of vars) {
            room.sharedState.vars.set(variableKey(item), item);
        }
        for (const item of lists) {
            room.sharedState.lists.set(variableKey(item), item);
        }
        return { vars, lists };
    }

    function handleMessage(client, message) {
        if (!message || typeof message !== 'object') {
            sendError(client, 'INVALID_MESSAGE', '메시지 형식이 올바르지 않습니다.');
            return;
        }

        if (message.type === 'ping') {
            send(client, { type: 'pong' });
            return;
        }

        const session = sessions.get(client);
        if (!session) {
            sendError(client, 'NOT_JOINED', '먼저 join 메시지를 보내야 합니다.');
            return;
        }
        const { room, member } = session;

        if (message.type === 'resync') {
            if (room.state !== 'locked') {
                sendError(client, 'ROOM_FORMING', '방 인원이 모일 때까지 기다려 주세요.');
                return;
            }
            send(client, statePayload(room));
            return;
        }

        if (message.type === 'set') {
            if (room.state !== 'locked' || member.slot === null) {
                sendError(client, 'ROOM_FORMING', '방 인원이 모일 때까지 기다려 주세요.');
                return;
            }
            const patch = mergePatch(room, message);
            if (patch.vars.length === 0 && patch.lists.length === 0) {
                sendError(client, 'INVALID_PATCH', '동기화할 변수 또는 리스트가 없습니다.');
                return;
            }
            broadcast(room, {
                type: 'patch',
                roomId: room.id,
                fromSlot: member.slot,
                vars: patch.vars,
                lists: patch.lists,
            }, client);
            return;
        }

        sendError(client, 'UNKNOWN_MESSAGE', '지원하지 않는 메시지입니다.');
    }

    function destroyRoom(room) {
        for (const [token, reservation] of resumeReservations) {
            if (reservation.room !== room) continue;
            clearTimeout(reservation.timer);
            resumeReservations.delete(token);
        }
        rooms.delete(room.id);
        room.pool.rooms.delete(room);
        if (room.pool.forming === room) room.pool.forming = null;
        if (room.pool.rooms.size === 0) pools.delete(room.pool.key);
    }

    function roomHasReservations(room) {
        for (const reservation of resumeReservations.values()) {
            if (reservation.room === room) return true;
        }
        return false;
    }

    function reserveForResume(room, member) {
        if (resumeGraceMs <= 0 || !member.resumeToken) return false;
        const token = member.resumeToken;
        const reservation = {
            room,
            member,
            expiresAt: now() + resumeGraceMs,
            timer: null,
        };
        reservation.timer = setTimeout(() => {
            if (resumeReservations.get(token) !== reservation) return;
            resumeReservations.delete(token);
            if (room.members.size === 0 && !roomHasReservations(room)) {
                destroyRoom(room);
            }
        }, resumeGraceMs);
        reservation.timer.unref?.();
        resumeReservations.set(token, reservation);
        return true;
    }

    function leave(client, leaveOptions = {}) {
        const session = sessions.get(client);
        if (!session) return false;
        sessions.delete(client);

        const { room, member } = session;
        room.members.delete(client);
        const reserved = leaveOptions.allowResume === true
            && room.state === 'locked'
            && reserveForResume(room, member);
        if (room.members.size === 0 && !reserved && !roomHasReservations(room)) {
            destroyRoom(room);
        } else {
            broadcastRoster(room);
        }
        return true;
    }

    function getSnapshot() {
        return [...rooms.values()].map((room) => ({
            id: room.id,
            projectId: room.pool.projectId,
            registrationId: room.pool.key,
            state: room.state,
            roomSize: room.roomSize,
            connected: room.members.size,
            reserved: [...resumeReservations.values()]
                .filter((reservation) => reservation.room === room).length,
            slots: [...room.members.values()].map((member) => member.slot),
            vars: [...room.sharedState.vars.values()],
            lists: [...room.sharedState.lists.values()],
        }));
    }

    return {
        join,
        resume,
        handleMessage,
        leave,
        getSnapshot,
    };
}

module.exports = {
    DEFAULT_RESUME_GRACE_MS,
    LOCAL_VARIABLE_NAMES,
    createRoomManager,
    sanitizeVariables,
    sanitizeLists,
};
