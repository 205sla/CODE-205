'use strict';

const { getDb } = require('../db/init');

const DEFAULT_FLUSH_INTERVAL_MS = 10 * 1000;

function dayKey(timestampMs) {
    return new Date(timestampMs).toISOString().slice(0, 10);
}

function nonNegativeInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.floor(number);
}

function createUsageMeter(options = {}) {
    const db = options.db || getDb();
    const now = options.now || Date.now;
    const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    const counters = new Map();

    const upsert = db.prepare(`
        INSERT INTO sync_usage (
            owner_user_id, entry_project_id, day,
            connections, messages_in, messages_out, bytes_in, bytes_out
        ) VALUES (
            @ownerUserId, @entryProjectId, @day,
            @connections, @messagesIn, @messagesOut, @bytesIn, @bytesOut
        )
        ON CONFLICT(owner_user_id, entry_project_id, day) DO UPDATE SET
            connections = connections + excluded.connections,
            messages_in = messages_in + excluded.messages_in,
            messages_out = messages_out + excluded.messages_out,
            bytes_in = bytes_in + excluded.bytes_in,
            bytes_out = bytes_out + excluded.bytes_out
    `);
    const flushRows = db.transaction((rows) => {
        for (const row of rows) upsert.run(row);
    });

    function getCounter(project) {
        if (!project
            || !Number.isInteger(Number(project.owner_user_id))
            || typeof project.entry_project_id !== 'string') {
            return null;
        }
        const ownerUserId = Number(project.owner_user_id);
        const entryProjectId = project.entry_project_id;
        const day = dayKey(now());
        const key = ownerUserId + ':' + entryProjectId + ':' + day;
        let counter = counters.get(key);
        if (!counter) {
            counter = {
                ownerUserId,
                entryProjectId,
                day,
                connections: 0,
                messagesIn: 0,
                messagesOut: 0,
                bytesIn: 0,
                bytesOut: 0,
            };
            counters.set(key, counter);
        }
        return counter;
    }

    function recordConnection(project) {
        const counter = getCounter(project);
        if (counter) counter.connections += 1;
    }

    function recordInbound(project, bytes) {
        const counter = getCounter(project);
        if (!counter) return;
        counter.messagesIn += 1;
        counter.bytesIn += nonNegativeInteger(bytes);
    }

    function recordOutbound(project, bytes) {
        const counter = getCounter(project);
        if (!counter) return;
        counter.messagesOut += 1;
        counter.bytesOut += nonNegativeInteger(bytes);
    }

    function flush() {
        if (counters.size === 0) return 0;
        const rows = [...counters.values()];
        flushRows(rows);
        for (const row of rows) {
            counters.delete(
                row.ownerUserId + ':' + row.entryProjectId + ':' + row.day
            );
        }
        return rows.length;
    }

    let timer = null;
    if (flushIntervalMs > 0) {
        timer = setInterval(() => {
            try {
                flush();
            } catch (error) {
                if (options.onError) options.onError(error);
                else console.error('[Entry Online usage] flush failed', error);
            }
        }, flushIntervalMs);
        timer.unref?.();
    }

    function close() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        return flush();
    }

    return {
        recordConnection,
        recordInbound,
        recordOutbound,
        flush,
        close,
    };
}

module.exports = {
    DEFAULT_FLUSH_INTERVAL_MS,
    createUsageMeter,
    dayKey,
};
