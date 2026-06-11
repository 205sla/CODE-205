'use strict';

// db.init 스키마 마이그레이션 검증.
// - 새 DB 부트 시 schema_version에 BASELINE_VERSION 한 행만 들어가야 한다.
// - schema.sql 자체에 INSERT가 없으므로 baseline 행은 init.js만 INSERT.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { getDb, closeDb, BASELINE_VERSION } = require('../src/db/init');

describe('db.init schema_version', () => {
    it('새 DB 부트 시 schema_version에 BASELINE_VERSION 한 행', () => {
        const db = getDb({ path: ':memory:' });
        const rows = db.prepare('SELECT version FROM schema_version ORDER BY version').all();
        assert.deepEqual(rows.map((r) => r.version), [BASELINE_VERSION]);
    });

    it('BASELINE_VERSION은 양의 정수', () => {
        assert.equal(typeof BASELINE_VERSION, 'number');
        assert.ok(BASELINE_VERSION >= 1);
    });

    it('v3 운영 DB를 v4로 올리며 sync_projects를 생성', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code205-db-migrate-'));
        const dbPath = path.join(tmpDir, 'legacy.db');
        const legacy = new Database(dbPath);
        legacy.exec(`
            CREATE TABLE schema_version (
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL
            );
            INSERT INTO schema_version (version, applied_at) VALUES (3, 1);
        `);
        legacy.close();

        const migrated = getDb({ path: dbPath });
        const versions = migrated.prepare(
            'SELECT version FROM schema_version ORDER BY version'
        ).all().map((row) => row.version);
        const table = migrated.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_projects'"
        ).get();

        assert.deepEqual(versions, [3, 4]);
        assert.equal(table.name, 'sync_projects');

        closeDb(dbPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
});
