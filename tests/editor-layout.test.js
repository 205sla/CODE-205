'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../public/js/editor-layout');
const limits = { minimum: 324, maximum: 640, collapseBelow: 162 };

// Exercise the installed DOM handlers, not a separate copy of the drag formula.
function mountEditor() {
    const vm = require('node:vm');
    const fs = require('node:fs');
    const win = new EventTarget();
    const document = { body: { style: { cursor: 'default', userSelect: 'text' } }, defaultView: win };
    function element(width) {
        const el = new EventTarget();
        const classes = new Set();
        Object.assign(el, {
            ownerDocument: document, style: {}, clientWidth: width, clientHeight: 800, offsetWidth: width,
            classList: {
                add: (...names) => names.forEach(name => classes.add(name)),
                remove: (...names) => names.forEach(name => classes.delete(name)),
                contains: name => classes.has(name),
            },
            getBoundingClientRect: () => ({ width: parseFloat(el.style.width) || width }),
            setPointerCapture: id => { el.capture = id; },
            hasPointerCapture: id => el.capture === id,
            releasePointerCapture: () => { el.capture = undefined; },
        });
        return el;
    }
    const stageSplitter = element(16);
    const cover = element(456);
    cover.classList.add('entryRemove');
    const engine = element(480);
    const board = element(439);
    engine.querySelector = selector => selector === '.propertyPanelCover' ? cover : stageSplitter;
    const workspace = element(1232);
    workspace.querySelector = selector => selector === '.engineContainer' ? engine : board;
    const elements = {
        workspace,
        'workspace-wrapper': element(1232),
        main: element(1600),
        'problem-panel': element(360),
        splitter: element(8),
    };
    document.getElementById = id => elements[id];
    win.getComputedStyle = () => ({ left: '313px' });
    win.requestAnimationFrame = () => 1;
    const unbound = [];
    win.jQuery = el => ({ off: events => unbound.push({ el, events }) });
    const calls = [];
    const entry = {
        CANVAS_DEFAULT_WIDTH: 324, CANVAS_MAX_WIDTH: 640, CANVAS_MIN_WIDTH: 162,
        interfaceState: { canvasWidth: 480, menuWidth: 280, object: 'bot205' },
        container: {}, disposeEvent: { notify() {} }, addEventListener() {},
        resizeElement(state) {
            this.interfaceState = state;
            engine.style.width = state.canvasWidth + 'px';
            calls.push(state.canvasWidth);
        },
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/editor-layout'), 'utf8'), {
        window: win, document, ResizeObserver: class { observe() {} },
    });
    win.Code205EditorLayout.install(entry);
    function pointer(type, x, overrides) {
        const event = new Event(type, { cancelable: true });
        Object.assign(event, { clientX: x, pointerId: 7, button: 0, isPrimary: true }, overrides);
        stageSplitter.dispatchEvent(event);
        return event;
    }
    return { win, document, stageSplitter, cover, entry, calls, pointer, unbound };
}

describe('installed editor splitter handlers', () => {
    it('uses movement from the grab point despite the 368px problem-panel offset', () => {
        const h = mountEditor();
        assert.equal(h.unbound[0].el, h.stageSplitter);
        assert.equal(h.unbound[0].events, 'mousedown touchstart');
        assert.equal(h.pointer('pointerdown', 840).defaultPrevented, true);
        h.pointer('pointermove', 820);
        h.pointer('pointermove', 740);
        assert.deepEqual(h.calls.slice(-2), [460, 380]);
        assert.equal(h.entry.interfaceState.menuWidth, 280);
        assert.equal(h.entry.interfaceState.object, 'bot205');
        assert.equal(h.cover.classList.contains('entryRemove'), false);
        h.pointer('pointerup', 740);
        assert.equal(h.stageSplitter.hasPointerCapture(7), false);
        assert.equal(h.entry.container.splitterEnable, false);
        assert.equal(h.cover.classList.contains('entryRemove'), true);
        assert.equal(h.document.body.style.cursor, 'default');
        assert.equal(h.document.body.style.userSelect, 'text');
    });

    it('ignores other pointers and cleans up a cancelled or interrupted drag', () => {
        for (const end of ['pointercancel', 'lostpointercapture', 'blur']) {
            const h = mountEditor();
            h.pointer('pointerdown', 840);
            h.pointer('pointermove', 950, { pointerId: 8 });
            assert.equal(h.entry.interfaceState.canvasWidth, 480);
            if (end === 'blur') h.win.dispatchEvent(new Event('blur'));
            else h.pointer(end, 840);
            h.pointer('pointermove', 740);
            assert.equal(h.entry.interfaceState.canvasWidth, 480);
            assert.equal(h.cover.classList.contains('entryRemove'), true);
            assert.equal(h.stageSplitter.classList.contains('dragging'), false);
        }
    });

    it('ignores secondary mouse buttons and reopens a collapsed stage on a click', () => {
        const h = mountEditor();
        h.pointer('pointerdown', 840, { button: 2 });
        h.pointer('pointermove', 740);
        assert.equal(h.entry.interfaceState.canvasWidth, 480);
        h.entry.resizeElement({ canvasWidth: 16 });
        h.pointer('pointerdown', 376);
        h.pointer('pointerup', 376);
        assert.equal(h.entry.interfaceState.canvasWidth, 324);
    });
});

describe('editor layout budgets', () => {
    it('keeps a usable block board at 1280px with a 360px problem panel', () => {
        const workspaceWidth = 1280 - 360 - 8;
        const canvasWidth = layout.canvasWidthFor(640, workspaceWidth, 313, limits);
        assert.equal(canvasWidth, 359);
        assert.equal(workspaceWidth - canvasWidth - 313, 240);
    });

    it('limits the problem panel before a 1024px window clips the editor', () => {
        const panelWidth = layout.problemPanelLimit(1024, 8, 313, limits);
        assert.equal(panelWidth, 139);
        const workspaceWidth = 1024 - panelWidth - 8;
        assert.equal(layout.canvasWidthFor(640, workspaceWidth, 313, limits), 324);
        assert.equal(workspaceWidth, layout.minimumWorkspaceWidth(313, limits));
    });

    it('allows the normal stage range on a wide screen', () => {
        for (const width of [324, 480, 640]) {
            assert.equal(layout.canvasWidthFor(width, 1552, 313, limits), width);
        }
        assert.equal(layout.canvasWidthFor(900, 1552, 313, limits), 640);
    });

    it('reserves the board for both folded menus and side tabs', () => {
        for (const menuWidth of [0, 60, 250, 254, 313]) {
            const workspaceWidth = layout.minimumWorkspaceWidth(menuWidth, limits);
            const width = layout.canvasWidthFor(640, workspaceWidth, menuWidth, limits);
            assert.equal(workspaceWidth - width - menuWidth, 240);
        }
    });

    it('preserves collapsing and reopening the stage at the Entry thresholds', () => {
        for (const width of [-500, 0, 16, 161]) {
            assert.equal(layout.canvasWidthFor(width, 912, 313, limits), 16);
        }
        for (const width of [162, 200, 324]) {
            assert.equal(layout.canvasWidthFor(width, 912, 313, limits), 324);
        }
    });

    it('retains grabbable panels and scrollable content below the desktop minimum', () => {
        assert.equal(layout.problemPanelLimit(768, 8, 313, limits), 40);
        assert.equal(layout.minimumWorkspaceWidth(313, limits), 877);
        assert.equal(layout.canvasWidthFor(640, 877, 313, limits), 324);
        assert.equal(layout.problemPanelLimit(2560, 8, 313, limits), 800);
    });
});
