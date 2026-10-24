/* Shorten presentation delays only while a test case is running. */
(function (root) {
    'use strict';

    // One wrapper per block, with independently releasable owners. Overlapping
    // installs may finish in either order without leaving a stale wrapper.
    var installations = new WeakMap();

    function install(entry, maxDelayMs) {
        var restores = [];
        // Scope the scheduler override to the synchronous block call. Other
        // blocks (movement, sound, etc.) and the grader's real clock are intact.
        [
            { block: 'dialog_time', target: entry.engine, method: 'setTimeout', delay: 1 },
            { block: 'wait_second', target: entry.TimeWaitManager, method: 'add', delay: 2 }
        ].forEach(function (spec) {
            var block = entry.block && entry.block[spec.block];
            if (!block || typeof block.func !== 'function' || !spec.target || typeof spec.target[spec.method] !== 'function') return;
            var state = installations.get(block);
            var owner = { maxDelayMs: maxDelayMs };
            if (state) {
                state.owners.add(owner);
            } else {
                state = { original: block.func, owners: new Set([owner]) };
                installations.set(block, state);
                block.func = function () {
                    var schedule = spec.target[spec.method];
                    spec.target[spec.method] = function () {
                        var args = Array.prototype.slice.call(arguments);
                        var delay = Number(args[spec.delay]);
                        var limit = Infinity;
                        state.owners.forEach(function (lease) {
                            limit = Math.min(limit, lease.maxDelayMs);
                        });
                        // Preserve zero, negative and invalid durations, including
                        // infinite waits, so acceleration cannot hide their errors.
                        if (Number.isFinite(delay) && delay > limit) {
                            args[spec.delay] = limit;
                        }
                        return schedule.apply(this, args);
                    };
                    try {
                        return state.original.apply(this, arguments);
                    } finally {
                        spec.target[spec.method] = schedule;
                    }
                };
            }
            restores.push(function () {
                state.owners.delete(owner);
                if (state.owners.size === 0) {
                    block.func = state.original;
                    installations.delete(block);
                }
            });
        });
        return function restore() {
            restores.forEach(function (restoreBlock) { restoreBlock(); });
            restores = [];
        };
    }

    var api = { install: install };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Code205GradingTiming = api;
}(typeof window !== 'undefined' ? window : this));
