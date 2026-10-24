'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const timing = require('../public/js/grading-timing');

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

function harness() {
    const elements = new Map();
    const document = {
        addEventListener() {},
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, {
                classList: { add() {}, remove() {} },
                handlers: {},
                addEventListener(event, fn) { this.handlers[event] = fn; }
            });
            return elements.get(id);
        }
    };
    const context = vm.createContext({
        document, $: () => ({ ready() {} }),
        Entry: { isTurbo: false, engine: { toggleStop() {}, toggleRun() {} } }
    });
    context.window = context;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/editor.js'), 'utf8'), context);
    context.renderGradeResults = () => {};
    context.markProblemSolved = () => {};
    context.GradingState.problemId = 38;
    context.initGrading();
    return { context, click: id => document.getElementById(id).handlers.click() };
}

it('serializes simultaneous test/submit fetch completions without replacing the active run', async () => {
    const { context: c, click } = harness();
    const pendingTest = deferred();
    const pendingSubmit = deferred();
    const execution = deferred();
    let calls = 0;
    c.fetchTestCases = mode => mode === 'test' ? pendingTest.promise : pendingSubmit.promise;
    c.waitForEngineStop = () => Promise.resolve();
    c.runSingleTest = () => { calls++; return execution.promise; };
    click('test-btn');
    click('submit-btn');
    pendingTest.resolve([{}]);
    pendingSubmit.resolve([{}]);
    await tick();
    assert.equal(calls, 1);
    assert.equal(c.GradingState.prevTurbo, false);
    execution.resolve({ pass: true });
    await tick();
    assert.equal(c.GradingState.isRunning, false);
    assert.equal(c.Entry.isTurbo, false);
});

it('keeps cancellation owned until asynchronous engine stop drains, then allows a new run', async () => {
    const { context: c, click } = harness();
    const execution = deferred();
    const drain = deferred();
    let stopCalls = 0;
    let testCalls = 0;
    c.waitForEngineStop = () => ++stopCalls === 1 ? Promise.resolve() : drain.promise;
    c.runSingleTest = () => {
        testCalls++;
        c.GradingState.currentCancel = () => execution.resolve({ cancelled: true });
        return execution.promise;
    };
    const first = c.runAllTests([{}, {}]);
    await tick();
    click('grade-stop');
    await tick();
    assert.equal(c.GradingState.isRunning, true);
    assert.equal(c.runAllTests([{}]), undefined);
    assert.equal(c.GradingState.cancelled, true);
    assert.equal(testCalls, 1);
    drain.resolve();
    await first;
    assert.equal(c.GradingState.isRunning, false);
    assert.equal(c.Entry.isTurbo, false);
    c.waitForEngineStop = () => Promise.resolve();
    c.runSingleTest = () => { testCalls++; return Promise.resolve({ pass: true }); };
    await c.runAllTests([{}]);
    assert.equal(testCalls, 2);
    assert.equal(c.GradingState.cancelled, false);
    assert.equal(c.Entry.isTurbo, false);
});

for (const failure of ['missing timing module', 'invalid list setup']) {
    it('reports ' + failure + ' and restores grading control and installed hooks', async () => {
        const { context: c } = harness();
        const dialog = function () {};
        const timedBlock = function () {};
        const waitBlock = function () {};
        c.Entry.Dialog = dialog;
        c.Entry.engine.state = 'stop';
        c.Entry.engine.setTimeout = () => {};
        c.Entry.TimeWaitManager = { add() {} };
        c.Entry.block = { dialog_time: { func: timedBlock }, wait_second: { func: waitBlock } };
        c.Entry.variableContainer = { getListByName: () => ({ array_: [] }) };
        c.waitForEngineStop = () => Promise.resolve();
        let finalResults;
        c.renderGradeResults = (results, running) => { if (!running) finalResults = results; };
        if (failure === 'invalid list setup') c.Code205GradingTiming = timing;
        const testCase = failure === 'invalid list setup' ? { setup: { lists: { numbers: 'invalid' } } } : {};
        await c.runAllTests([testCase]);
        assert.equal(c.GradingState.isRunning, false);
        assert.equal(c.GradingState.currentCancel, null);
        assert.equal(c.Entry.isTurbo, false);
        assert.equal(c.Entry.Dialog, dialog);
        assert.equal(c.Entry.block.dialog_time.func, timedBlock);
        assert.equal(c.Entry.block.wait_second.func, waitBlock);
        assert.equal(finalResults[0].error, true);
        assert.equal(finalResults[0].pass, false);
        assert.match(finalResults[0].errorMessage, /오류/);
    });
}
