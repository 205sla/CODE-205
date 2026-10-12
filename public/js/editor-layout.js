(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.Code205EditorLayout = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    var MIN_BOARD_WIDTH = 240;
    var MIN_PROBLEM_WIDTH = 40;
    var MAX_PROBLEM_WIDTH = 800;

    function minimumWorkspaceWidth(menuWidth, limits) {
        return limits.minimum + menuWidth + MIN_BOARD_WIDTH;
    }

    function problemPanelLimit(mainWidth, splitterWidth, menuWidth, limits) {
        return Math.max(MIN_PROBLEM_WIDTH, Math.min(MAX_PROBLEM_WIDTH,
            mainWidth - splitterWidth - minimumWorkspaceWidth(menuWidth, limits)));
    }

    function canvasWidthFor(requested, workspaceWidth, menuWidth, limits) {
        // Preserve Entry's collapse gesture and its normal minimum stage size.
        if (requested < limits.collapseBelow) return 16;
        var maximum = Math.max(limits.minimum,
            Math.min(limits.maximum, workspaceWidth - menuWidth - MIN_BOARD_WIDTH));
        return Math.max(limits.minimum, Math.min(maximum, requested));
    }

    function bindSplitter(handle, readWidth, applyWidth, hooks) {
        var win = handle.ownerDocument.defaultView;
        var body = handle.ownerDocument.body;
        var drag = null;
        hooks = hooks || {};

        function finish(cancelled) {
            if (!drag) return;
            var previous = drag;
            drag = null;
            handle.classList.remove('dragging', 'enabled');
            body.style.cursor = previous.cursor;
            body.style.userSelect = previous.userSelect;
            if (handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
            if (hooks.end) hooks.end(previous, cancelled);
        }

        handle.addEventListener('pointerdown', function (event) {
            if (drag || event.isPrimary === false || event.button !== 0) return;
            event.preventDefault();
            drag = {
                id: event.pointerId,
                x: event.clientX,
                width: readWidth(),
                moved: false,
                cursor: body.style.cursor,
                userSelect: body.style.userSelect
            };
            handle.setPointerCapture(event.pointerId);
            handle.classList.add('dragging', 'enabled');
            body.style.cursor = 'col-resize';
            body.style.userSelect = 'none';
            if (hooks.start) hooks.start();
        });
        handle.addEventListener('pointermove', function (event) {
            if (!drag || event.pointerId !== drag.id) return;
            var delta = event.clientX - drag.x;
            if (delta !== 0) drag.moved = true;
            // Widths are local to Entry. Absolute clientX includes the problem panel.
            applyWidth(drag.width + delta);
        });
        handle.addEventListener('pointerup', function (event) {
            if (drag && event.pointerId === drag.id) finish(false);
        });
        handle.addEventListener('pointercancel', function (event) {
            if (drag && event.pointerId === drag.id) finish(true);
        });
        handle.addEventListener('lostpointercapture', function () { finish(true); });
        win.addEventListener('blur', function () { finish(true); });
    }

    function install(entry) {
        var workspace = document.getElementById('workspace');
        var wrapper = document.getElementById('workspace-wrapper');
        var main = document.getElementById('main');
        var panel = document.getElementById('problem-panel');
        var problemSplitter = document.getElementById('splitter');
        var engine = workspace.querySelector('.engineContainer');
        var stageSplitter = engine.querySelector('.entryObjectSelectedImgWorkspace');
        var cover = engine.querySelector('.propertyPanelCover');
        var board = workspace.querySelector('.entryWorkspaceBoard');
        var limits = {
            minimum: entry.CANVAS_DEFAULT_WIDTH,
            maximum: entry.CANVAS_MAX_WIDTH,
            collapseBelow: entry.CANVAS_MIN_WIDTH
        };
        var lastSize = '';
        var pendingFrame = 0;

        function menuWidth() {
            // Also works with the folded menu and the picture/sound/property tabs.
            return parseFloat(window.getComputedStyle(board).left) || 0;
        }

        function resizeStage(width) {
            var nextWidth = canvasWidthFor(width, workspace.clientWidth, menuWidth(), limits);
            // This updates the canvas, object panel, board bounds and hit testing together.
            // Keep the other persisted interface fields when changing canvasWidth.
            entry.resizeElement(Object.assign({}, entry.interfaceState, { canvasWidth: nextWidth }));
        }

        function refresh() {
            var menu = menuWidth();
            workspace.style.minWidth = minimumWorkspaceWidth(menu, limits) + 'px';
            panel.style.maxWidth = problemPanelLimit(
                main.clientWidth, problemSplitter.offsetWidth, menu, limits) + 'px';
            var width = engine.getBoundingClientRect().width;
            var nextWidth = canvasWidthFor(width, workspace.clientWidth, menu, limits);
            var size = [workspace.clientWidth, workspace.clientHeight, menu, nextWidth].join(':');
            if (width !== nextWidth || size !== lastSize) {
                lastSize = size;
                resizeStage(nextWidth);
            }
        }

        function scheduleRefresh() {
            if (pendingFrame) return;
            pendingFrame = window.requestAnimationFrame(function () {
                pendingFrame = 0;
                refresh();
            });
        }

        // Replace only this handle's vendored absolute-coordinate drag handler.
        window.jQuery(stageSplitter).off('mousedown touchstart');
        bindSplitter(stageSplitter, function () {
            return engine.getBoundingClientRect().width;
        }, resizeStage, {
            start: function () {
                if (entry.disposeEvent) entry.disposeEvent.notify();
                entry.container.splitterEnable = true;
                cover.classList.remove('entryRemove');
            },
            end: function (drag, cancelled) {
                entry.container.splitterEnable = false;
                cover.classList.add('entryRemove');
                if (!cancelled && !drag.moved && drag.width < limits.collapseBelow) {
                    resizeStage(limits.minimum);
                }
            }
        });
        bindSplitter(problemSplitter, function () {
            return panel.getBoundingClientRect().width;
        }, function (width) {
            panel.style.width = Math.max(MIN_PROBLEM_WIDTH, Math.min(width,
                problemPanelLimit(main.clientWidth, problemSplitter.offsetWidth, menuWidth(), limits))) + 'px';
            // Notify Entry during the drag, not just when the mouse is released.
            refresh();
        });

        var observer = new ResizeObserver(scheduleRefresh);
        [main, wrapper, engine, board].forEach(function (element) { observer.observe(element); });
        window.addEventListener('resize', scheduleRefresh);
        entry.addEventListener('loadComplete', scheduleRefresh);
        refresh();
    }

    return {
        minimumWorkspaceWidth: minimumWorkspaceWidth,
        problemPanelLimit: problemPanelLimit,
        canvasWidthFor: canvasWidthFor,
        install: install
    };
});
