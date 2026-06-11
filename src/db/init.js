// SQLite 연결 초기화·싱글톤 반환.
// - 기본은 DB_PATH (config.js) 기반 파일 DB
// - 테스트는 getDb({ path: ':memory:' })로 격리된 인스턴스 생성
// - WAL 모드로 동시성 향상 (읽기 중에도 쓰기 가능)

'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA_SQL = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
);

// schema.sql이 표현하는 baseline 버전 — 새 DB 부트 시 schema_version에 1행만 INSERT.
// schema.sql 변경 시 함께 올리고, 그 변경에 대응하는 ALTER는 MIGRATIONS에도 추가.
const BASELINE_VERSION = 5;

// 점진적 스키마 변경 정의. 신규 DB는 schema.sql 적용 후 BASELINE_VERSION으로
// 시작하므로 아래 항목을 건너뛴다. 기존 DB만 현재 버전 이후 항목을 순서대로 적용.
const MIGRATIONS = [
    {
        version: 4,
        sql: `
            CREATE TABLE IF NOT EXISTS sync_projects (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_user_id    INTEGER NOT NULL,
                entry_project_id TEXT    NOT NULL,
                room_size        INTEGER NOT NULL CHECK (room_size BETWEEN 2 AND 8),
                token            TEXT    UNIQUE NOT NULL,
                created_at       INTEGER NOT NULL,
                UNIQUE (owner_user_id, entry_project_id),
                FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `,
    },
    {
        version: 5,
        sql: `
            CREATE TABLE IF NOT EXISTS sync_usage (
                owner_user_id    INTEGER NOT NULL,
                entry_project_id TEXT    NOT NULL,
                day              TEXT    NOT NULL,
                connections      INTEGER NOT NULL DEFAULT 0,
                messages_in      INTEGER NOT NULL DEFAULT 0,
                messages_out     INTEGER NOT NULL DEFAULT 0,
                bytes_in         INTEGER NOT NULL DEFAULT 0,
                bytes_out        INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (owner_user_id, entry_project_id, day),
                FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `,
    },
];

function nowSec() {
    return Math.floor(Date.now() / 1000);
}

function getCurrentVersion(db) {
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get();
    return row && typeof row.v === 'number' ? row.v : 0;
}

function applyMigrations(db) {
    let current = getCurrentVersion(db);

    // 새 DB: schema.sql이 baseline 테이블을 만들었지만 schema_version 행은 비어있다.
    if (current === 0) {
        db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
            .run(BASELINE_VERSION, nowSec());
        current = BASELINE_VERSION;
    }

    // baseline 이후의 마이그레이션을 순서대로 적용.
    const pending = MIGRATIONS
        .filter((m) => m.version > current)
        .sort((a, b) => a.version - b.version);

    for (const m of pending) {
        const tx = db.transaction(() => {
            db.exec(m.sql);
            db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
                .run(m.version, nowSec());
        });
        tx();
    }
}

// 파일 경로별로 인스턴스 캐시 (같은 경로면 같은 핸들 반환).
// :memory:는 호출마다 새로 만들어야 격리되므로 캐시 안 함.
const cache = new Map();

/**
 * SQLite 핸들을 가져온다.
 * @param {object} [opts]
 * @param {string} [opts.path] 파일 경로. 기본: config.DB_PATH
 *                              ':memory:' 지정 시 매번 새 인스턴스(테스트용).
 * @returns {Database.Database}
 */
function getDb(opts = {}) {
    const target = opts.path || require('../config').DB_PATH;

    if (target !== ':memory:' && cache.has(target)) {
        return cache.get(target);
    }

    // 파일 DB면 부모 디렉터리 보장
    if (target !== ':memory:') {
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    const db = new Database(target);

    // WAL: 읽기와 쓰기가 동시에 가능. 파일 DB에만 의미가 있고,
    // :memory:에서도 호출 자체는 무해 (no-op).
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // baseline 스키마 멱등 적용 + 점진적 마이그레이션
    db.exec(SCHEMA_SQL);
    applyMigrations(db);

    if (target !== ':memory:') {
        cache.set(target, db);
    }
    return db;
}

/**
 * 캐시된 핸들을 닫는다 (테스트 정리용).
 */
function closeDb(target) {
    if (target && cache.has(target)) {
        cache.get(target).close();
        cache.delete(target);
    }
}

module.exports = { getDb, closeDb, BASELINE_VERSION, MIGRATIONS };
