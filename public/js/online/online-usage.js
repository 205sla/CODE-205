(function (root) {
    'use strict';

    function number(value) {
        var parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
    }

    function formatCount(value) {
        return number(value).toLocaleString('ko-KR');
    }

    function formatBytes(value) {
        var bytes = number(value);
        if (bytes < 1024) return formatCount(bytes) + ' B';
        var units = ['KB', 'MB', 'GB', 'TB'];
        var size = bytes;
        var unitIndex = -1;
        do {
            size /= 1024;
            unitIndex += 1;
        } while (size >= 1024 && unitIndex < units.length - 1);
        var digits = size >= 100 ? 0 : (size >= 10 ? 1 : 2);
        return size.toFixed(digits) + ' ' + units[unitIndex];
    }

    function emptyUsage(entryProjectId) {
        return {
            entryProjectId: entryProjectId || null,
            connections: 0,
            messagesIn: 0,
            messagesOut: 0,
            bytesIn: 0,
            bytesOut: 0,
            totalMessages: 0,
            totalBytes: 0,
            firstDay: null,
            lastDay: null,
        };
    }

    function indexUsage(items) {
        return (Array.isArray(items) ? items : []).reduce(function (indexed, item) {
            if (item && typeof item.entryProjectId === 'string') {
                indexed[item.entryProjectId] = item;
            }
            return indexed;
        }, Object.create(null));
    }

    var api = {
        emptyUsage: emptyUsage,
        formatBytes: formatBytes,
        formatCount: formatCount,
        indexUsage: indexUsage,
    };

    root.EntryOnlineUsage = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
