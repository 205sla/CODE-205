'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const usage = require('../public/js/online/online-usage');

describe('Entry Online usage formatting', () => {
    it('formats counts and byte sizes for the dashboard', () => {
        assert.equal(usage.formatCount(1234), '1,234');
        assert.equal(usage.formatBytes(0), '0 B');
        assert.equal(usage.formatBytes(1536), '1.50 KB');
        assert.equal(usage.formatBytes(5 * 1024 * 1024), '5.00 MB');
    });

    it('indexes usage by Entry project ID', () => {
        const indexed = usage.indexUsage([
            { entryProjectId: 'aaa', totalBytes: 10 },
            { entryProjectId: 'bbb', totalBytes: 20 },
        ]);
        assert.equal(indexed.aaa.totalBytes, 10);
        assert.equal(indexed.bbb.totalBytes, 20);
        assert.equal(indexed.ccc, undefined);
    });
});
