'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionConfig } = require('../src/config');

function production(overrides = {}) {
    return {
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-secure-random-session-secret-over-32-bytes',
        SESSION_COOKIE_SECURE: 'true',
        ...overrides,
    };
}

describe('production config gate', () => {
    it('개발 환경에서는 운영 전용 검증을 건너뛴다', () => {
        assert.doesNotThrow(() => validateProductionConfig({
            NODE_ENV: 'development',
        }));
    });

    it('짧거나 개발 기본값인 세션 시크릿을 거부한다', () => {
        assert.throws(
            () => validateProductionConfig(production({ SESSION_SECRET: 'short' })),
            /SESSION_SECRET/
        );
        assert.throws(
            () => validateProductionConfig(production({
                SESSION_SECRET: 'dev-only-insecure-secret-change-me',
            })),
            /SESSION_SECRET/
        );
    });

    it('운영 환경에서 Secure 세션 쿠키를 강제한다', () => {
        assert.throws(
            () => validateProductionConfig(production({
                SESSION_COOKIE_SECURE: 'false',
            })),
            /SESSION_COOKIE_SECURE/
        );
        assert.doesNotThrow(() => validateProductionConfig(production()));
    });
});
