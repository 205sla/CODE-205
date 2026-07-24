'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const notice = require('../public/js/transition-notice');

describe('service transition notice', () => {
    it('is visible before the fixed deadline when not dismissed', () => {
        const duringNotice = Date.parse('2026-07-31T23:59:59+09:00');
        assert.equal(
            notice.shouldDisplay(duringNotice, notice.NOTICE_END_AT, false),
            true
        );
    });

    it('is hidden after the deadline', () => {
        const deadline = Date.parse('2026-08-01T00:00:00+09:00');
        assert.equal(
            notice.shouldDisplay(deadline, notice.NOTICE_END_AT, false),
            false
        );
    });

    it('stays hidden for the rest of a dismissed browser session', () => {
        const duringNotice = Date.parse('2026-07-25T12:00:00+09:00');
        assert.equal(
            notice.shouldDisplay(duringNotice, notice.NOTICE_END_AT, true),
            false
        );
    });
});
