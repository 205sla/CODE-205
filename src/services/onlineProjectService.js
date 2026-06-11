'use strict';

const crypto = require('crypto');
const { getDb } = require('../db/init');
const authService = require('./authService');

const MAX_PROJECTS_PER_USER = 3;
const MIN_ROOM_SIZE = 2;
const MAX_ROOM_SIZE = 8;
const PROJECT_ID_RE = /^[a-f0-9]{8,64}$/i;

class OnlineProjectError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'OnlineProjectError';
        this.status = status;
        this.code = code;
    }
}

function normalizeProjectId(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeOwnerId(value) {
    return authService.normalizeUsername(
        typeof value === 'string' ? value.trim() : ''
    );
}

function validateProjectInput(input) {
    const entryProjectId = normalizeProjectId(input?.entryProjectId);
    const roomSize = Number(input?.roomSize);

    if (!PROJECT_ID_RE.test(entryProjectId)) {
        throw new OnlineProjectError(
            400,
            'VALIDATION',
            '올바른 Entry 작품 ID를 입력해 주세요.'
        );
    }
    if (!Number.isInteger(roomSize) || roomSize < MIN_ROOM_SIZE || roomSize > MAX_ROOM_SIZE) {
        throw new OnlineProjectError(
            400,
            'VALIDATION',
            '방 인원은 2명부터 8명까지 선택할 수 있습니다.'
        );
    }

    return { entryProjectId, roomSize };
}

function toPublicProject(row) {
    if (!row) return null;
    return {
        id: row.id,
        ownerId: row.owner_username,
        entryProjectId: row.entry_project_id,
        roomSize: row.room_size,
        createdAt: row.created_at,
    };
}

function listProjects(ownerUserId, opts = {}) {
    const db = opts.db || getDb();
    return db.prepare(`
        SELECT p.id, u.username AS owner_username, p.entry_project_id,
               p.room_size, p.created_at
        FROM sync_projects p
        JOIN users u ON u.id = p.owner_user_id
        WHERE p.owner_user_id = ?
        ORDER BY p.created_at ASC, p.id ASC
    `).all(ownerUserId).map(toPublicProject);
}

function createProject(ownerUserId, input, opts = {}) {
    const db = opts.db || getDb();
    const { entryProjectId, roomSize } = validateProjectInput(input);
    const tokenFactory = opts.tokenFactory || (() => crypto.randomBytes(32).toString('base64url'));

    const create = db.transaction(() => {
        const count = db.prepare(
            'SELECT COUNT(*) AS n FROM sync_projects WHERE owner_user_id = ?'
        ).get(ownerUserId).n;
        if (count >= MAX_PROJECTS_PER_USER) {
            throw new OnlineProjectError(
                409,
                'PROJECT_LIMIT',
                '계정당 작품은 최대 3개까지 등록할 수 있습니다.'
            );
        }

        for (let attempt = 0; attempt < 3; attempt++) {
            const token = tokenFactory();
            try {
                const info = db.prepare(`
                    INSERT INTO sync_projects
                        (owner_user_id, entry_project_id, room_size, token, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    ownerUserId,
                    entryProjectId,
                    roomSize,
                    token,
                    Math.floor(Date.now() / 1000)
                );
                return db.prepare(`
                    SELECT p.*, u.username AS owner_username
                    FROM sync_projects p
                    JOIN users u ON u.id = p.owner_user_id
                    WHERE p.id = ?
                `)
                    .get(info.lastInsertRowid);
            } catch (error) {
                if (/sync_projects\.owner_user_id, sync_projects\.entry_project_id/.test(error.message || '')) {
                    throw new OnlineProjectError(
                        409,
                        'DUPLICATE_PROJECT',
                        '이미 등록한 Entry 작품입니다.'
                    );
                }
                if (/sync_projects\.token/.test(error.message || '') && attempt < 2) {
                    continue;
                }
                throw error;
            }
        }
        throw new Error('Failed to allocate a unique Entry Online token.');
    });

    return toPublicProject(create());
}

function deleteProject(ownerUserId, id, opts = {}) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId < 1) return false;
    const db = opts.db || getDb();
    const info = db.prepare(
        'DELETE FROM sync_projects WHERE id = ? AND owner_user_id = ?'
    ).run(numericId, ownerUserId);
    return info.changes > 0;
}

function findByOwner(entryProjectId, ownerId, opts = {}) {
    const normalizedId = normalizeProjectId(entryProjectId);
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    if (!PROJECT_ID_RE.test(normalizedId)
        || authService.validateUsername(normalizedOwnerId)) {
        return null;
    }
    const db = opts.db || getDb();
    return db.prepare(`
        SELECT p.id, p.owner_user_id, u.username AS owner_username,
               p.entry_project_id, p.room_size, p.created_at
        FROM sync_projects p
        JOIN users u ON u.id = p.owner_user_id
        WHERE p.entry_project_id = ? AND u.username = ?
        LIMIT 1
    `).get(normalizedId, normalizedOwnerId) || null;
}

module.exports = {
    MAX_PROJECTS_PER_USER,
    MIN_ROOM_SIZE,
    MAX_ROOM_SIZE,
    OnlineProjectError,
    normalizeProjectId,
    normalizeOwnerId,
    validateProjectInput,
    listProjects,
    createProject,
    deleteProject,
    findByOwner,
};
