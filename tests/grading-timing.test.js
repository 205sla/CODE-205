'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const timing = require('../public/js/grading-timing');

function harness() {
    const scheduled = [];
    const entry = {
        engine: { setTimeout(callback, delay) {
            scheduled.push({ kind: 'dialog', callback, delay, receiver: this });
            return 17;
        } },
        TimeWaitManager: { add(id, callback, delay) {
            scheduled.push({ kind: 'wait', id, callback, delay, receiver: this });
            return 23;
        } },
        block: {}
    };
    entry.block.dialog_time = { func(sprite, script) {
        assert.equal(this, entry.block.dialog_time);
        const result = entry.engine.setTimeout(script.callback, script.seconds * 1000);
        if (script.error) throw script.error;
        return result;
    } };
    entry.block.wait_second = { func(sprite, script) {
        return entry.TimeWaitManager.add(script.id, script.callback, script.seconds * 1000);
    } };
    return { entry, scheduled };
}

describe('grading presentation delays', () => {
    it('caps only timed dialog and wait scheduling and preserves callbacks and return values', () => {
        const { entry, scheduled } = harness();
        const restore = timing.install(entry, 10);
        const callback = () => {};
        assert.equal(entry.block.dialog_time.func(null, { seconds: 1, callback }), 17);
        assert.equal(entry.block.wait_second.func(null, { seconds: 9, id: 'wait', callback }), 23);
        entry.engine.setTimeout(callback, 2000);
        entry.TimeWaitManager.add('other', callback, 3000);
        assert.deepEqual(scheduled.map(call => call.delay), [10, 10, 2000, 3000]);
        assert.equal(scheduled[0].callback, callback);
        assert.equal(scheduled[0].receiver, entry.engine);
        assert.equal(scheduled[1].id, 'wait');
        assert.equal(scheduled[1].receiver, entry.TimeWaitManager);
        restore();
    });

    it('does not lengthen shorter waits or turn invalid/infinite waits into passing ones', () => {
        const { entry, scheduled } = harness();
        const restore = timing.install(entry, 10);
        const values = [0.005, 0, -1, NaN, Infinity];
        values.forEach(seconds => entry.block.dialog_time.func(null, { seconds }));
        assert.deepEqual(scheduled.map(call => call.delay), [5, 0, -1000, NaN, Infinity]);
        restore();
    });

    it('restores functions for normal playback and supports repeated cases and cleanup', () => {
        const { entry, scheduled } = harness();
        const originalDialog = entry.block.dialog_time.func;
        const originalWait = entry.block.wait_second.func;
        for (let i = 0; i < 3; i++) {
            const restore = timing.install(entry, 10);
            entry.block.dialog_time.func(null, { seconds: 1 });
            restore();
            restore();
            assert.equal(entry.block.dialog_time.func, originalDialog);
            assert.equal(entry.block.wait_second.func, originalWait);
            entry.block.dialog_time.func(null, { seconds: 1 });
        }
        assert.deepEqual(scheduled.map(call => call.delay), [10, 1000, 10, 1000, 10, 1000]);
    });

    it('restores the scheduler even when a block throws', () => {
        const { entry } = harness();
        const originalScheduler = entry.engine.setTimeout;
        const restore = timing.install(entry, 10);
        const error = new Error('invalid expression');
        assert.throws(() => entry.block.dialog_time.func(null, { seconds: 1, error }), error);
        assert.equal(entry.engine.setTimeout, originalScheduler);
        restore();
    });

    for (const order of [[0, 1], [1, 0]]) {
        it('keeps remaining installs active and restores originals in order ' + order, () => {
            const { entry, scheduled } = harness();
            const originalDialog = entry.block.dialog_time.func;
            const originalWait = entry.block.wait_second.func;
            const restores = [timing.install(entry, 10), timing.install(entry, 20)];
            entry.block.dialog_time.func(null, { seconds: 1 });
            restores[order[0]]();
            restores[order[0]](); // Duplicate cleanup must not release another owner.
            entry.block.dialog_time.func(null, { seconds: 1 });
            entry.block.wait_second.func(null, { seconds: 1 });
            restores[order[1]]();
            assert.equal(entry.block.dialog_time.func, originalDialog);
            assert.equal(entry.block.wait_second.func, originalWait);
            entry.block.dialog_time.func(null, { seconds: 1 });
            assert.deepEqual(scheduled.map(call => call.delay), [10, order[0] === 0 ? 20 : 10, order[0] === 0 ? 20 : 10, 1000]);
        });
    }
});
