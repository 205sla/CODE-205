'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
    MIN_INTERVAL_MS,
    normalizeConfig,
    readEnvFile,
    redactId,
    readHistoryFile,
    writeHistoryFile,
} = require('../src/services/entryCvMonitor');

describe('entryCvMonitor config', () => {
    it('loads local env files without exposing secrets in public config', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-cv-env-'));
        const file = path.join(dir, 'monitor.env');
        fs.writeFileSync(file, [
            'ENTRY_MONITOR_ENABLED=true',
            'ENTRY_MONITOR_PROJECT_ID=6a2254000216bc9b9a744a57',
            'ENTRY_MONITOR_ID=entrycvmon205',
            "ENTRY_MONITOR_PASSWORD='secret-password'",
            'ENTRY_MONITOR_INTERVAL_MINUTES=1',
        ].join('\n'));

        const parsed = readEnvFile(file);
        assert.equal(parsed.values.ENTRY_MONITOR_PASSWORD, 'secret-password');

        const config = normalizeConfig({ ENTRY_MONITOR_ENV_FILE: file });
        assert.equal(config.enabled, true);
        assert.equal(config.accountConfigured, true);
        assert.equal(config.projectIdRedacted, '6a2254...4a57');
        assert.equal(config.intervalMs, MIN_INTERVAL_MS);
        assert.equal(config.password, undefined);
        assert.equal(config.id, undefined);

        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('redacts ids before exposing monitor state', () => {
        assert.equal(redactId('6a2254000216bc9b9a744a57'), '6a2254...4a57');
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
