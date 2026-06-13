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

    it('v3 운영 DB를 최신 버전으로 올리며 Entry Online 테이블을 제거', () => {
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
        const usageTable = migrated.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_usage'"
        ).get();

        // sync_* 는 v4/v5에서 만들어졌다가 v6에서 드롭되어 최종 상태에는 없어야 한다.
        assert.deepEqual(versions, [3, 4, 5, 6]);
        assert.equal(table, undefined);
        assert.equal(usageTable, undefined);

        closeDb(dbPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('등록 데이터가 있는 운영 DB를 올리며 Entry Online 테이블을 제거하고 회원 데이터는 보존', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code205-db-v4-'));
        const dbPath = path.join(tmpDir, 'legacy.db');
        const legacy = new Database(dbPath);
        legacy.exec(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                birth_year INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE sync_projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_user_id INTEGER NOT NULL,
                entry_project_id TEXT NOT NULL,
                room_size INTEGER NOT NULL,
                token TEXT UNIQUE NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE (owner_user_id, entry_project_id)
            );
            CREATE TABLE schema_version (
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL
            );
            INSERT INTO users
                (id, username, password_hash, birth_year, created_at)
            VALUES (1, 'owner', 'hash', 2000, 1);
            INSERT INTO sync_projects
                (owner_user_id, entry_project_id, room_size, token, created_at)
            VALUES (1, 'aaaaaaaaaaaaaaaaaaaaaaaa', 2, 'legacy-token', 1);
            INSERT INTO schema_version (version, applied_at) VALUES (4, 1);
        `);
        legacy.close();

        const migrated = getDb({ path: dbPath });
        assert.deepEqual(
            migrated.prepare(
                'SELECT version FROM schema_version ORDER BY version'
            ).all().map((row) => row.version),
            [4, 5, 6]
        );
        // 회원 데이터는 보존
        assert.equal(
            migrated.prepare('SELECT COUNT(*) AS n FROM users').get().n,
            1
        );
        // Entry Online 테이블은 등록 데이터가 있어도 드롭된다
        assert.equal(
            migrated.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_projects'"
            ).get(),
            undefined
        );
        assert.equal(
            migrated.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_usage'"
            ).get(),
            undefined
        );

        closeDb(dbPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
});
