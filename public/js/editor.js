/* ============================================================
   editor.js — Entry 에디터 화면 스크립트
   Entry 라이브러리(lib/entry-js 등) 로드 이후에 실행되어야 합니다.
   ============================================================ */

window.PUBLIC_PATH_FOR_ENTRYJS = 'lib/entry-js/dist/';

// ============================================================
// 1. Globals — timing constants + grading state
// ============================================================

// Timing constants (all in milliseconds). Centralized so tuning is localized
// and behavior is self-documenting at call sites.
var CONFIG = {
    // Delay before notifying Entry of a window resize after major layout changes
    // (Entry init, problem panel hide). Entry needs the DOM to settle first.
    RESIZE_AFTER_INIT_MS: 100,
    RESIZE_AFTER_PANEL_HIDE_MS: 50,

    // How often to poll Entry.stateManager for undo/redo availability so the
    // header buttons enable/disable in sync. Fast enough to feel responsive,
    // slow enough to avoid CPU waste.
    UNDO_REDO_SYNC_INTERVAL_MS: 300,

    // Default per-test timeout. Individual tests can override via testCase.timeout.
    // Kept generous to accommodate Python mode code→block conversion on slow devices.
    DEFAULT_TEST_TIMEOUT_MS: 5000,

    // How often runSingleTest polls for engine completion (no more executors)
    // or timeout. Too small wastes CPU; too large delays result display.
    GRADING_POLL_INTERVAL_MS: 100,

    // After the engine finishes, wait this long before capturing state.
    // Allows pending say/think animations, final setValue calls, and queued
    // microtasks to settle so the snapshot reflects the true end state.
    POST_STOP_CAPTURE_DELAY_MS: 300,

    // After capturing state, wait briefly before calling evaluateTest.
    // Guards against races where Entry.variableContainer mutations from
    // synchronous teardown paths overwrite the captured values.
    POST_CAPTURE_EVAL_DELAY_MS: 50
};

// All grading-related mutable state, collected in one place so the
// runAllTests → runSingleTest → grade-stop state machine is easy to
// trace. Anything accessed across more than one function lives here.
var GradingState = {
    // URL-param problem id. null in free mode or while tests are loading.
    // Set by loadProblemTests() once the server confirms the problem has tests.
    problemId: null,

    // True from runAllTests() entry until its Promise chain fully settles
    // (success OR cancellation). Gates keyboard events, reset button, and
    // Entry.engine toggle buttons to prevent user interference.
    isRunning: false,

    // True after the user clicks "채점 중단". Checked at every await/poll
    // boundary so in-flight tests abort promptly. Reset to false at the
    // start of each runAllTests() call.
    cancelled: false,

    // Cancellation callback for the currently running runSingleTest.
    // Stored at entry, cleared at finish(). Called by grade-stop handler
    // to break out of the poll interval immediately.
    currentCancel: null,

    // Original Entry.engine methods, captured before installEngineGuard
    // wraps them. Used by the wrapper to call through when allowed.
    engine: {
        origStop: null,    // Entry.engine.toggleStop
        origRun: null,     // Entry.engine.toggleRun
        // True when the grading code itself is driving the engine
        // (engineInternalStop/Run). Bypasses the "isRunning" guard
        // so the grader can start/stop the engine it's managing.
        internal: false
    },

    // User's Entry.isTurbo value captured at runAllTests() entry.
    // Grading forces turbo ON for faster loop evaluation; this restores
    // the user's original setting on exit (completion OR cancellation).
    // null when not in a grading run.
    prevTurbo: null
};

// Local sprite library fetched from /api/sprites (page-scope, not grading state).
var __spriteCatalog = [];

// ============================================================
// 2. Workspace mode toggle (called by header buttons via onclick)
// ============================================================

function changeWorkspaceMode(mode) {
    var option = {};
    if (mode === 'block') {
        option.boardType = Entry.Workspace.MODE_BOARD;
        option.textType = -1;
    } else {
        option.boardType = Entry.Workspace.MODE_VIMBOARD;
        option.textType = Entry.Vim.TEXT_TYPE_PY;
        option.runType = Entry.Vim.WORKSPACE_MODE;
    }
    var workspace = Entry.getMainWS();
    if (workspace) {
        workspace.setMode(option);
    }
}

// ============================================================
// 3. Entry init (DOM ready)
// ============================================================

$(document).ready(function () {
    var problemId = new URLSearchParams(location.search).get('problem');
    var initOption = {
        libDir: 'lib/entry-js',
        entryDir: '',
        type: 'workspace',
        textCodingEnable: true,
        // Disable unused features for algorithm platform (Entry built-in options)
        hardwareEnable: false,       // 하드웨어 블록 카테고리
        backpackDisable: true,       // 나만의 보관함 (서버 필요)
        exportObjectEnable: false,   // 오브젝트 내보내기 (우클릭 메뉴)
        blockSaveImageEnable: false, // 블록 이미지로 저장 (우클릭 메뉴)
        aiLearningEnable: false,     // 인공지능 학습 블록
        aiUtilizeDisable: true,      // 인공지능 활용 블록
        expansionDisable: true,      // 확장 블록 (날씨/번역 등, 서버 API 필요)
        // Note: pictureeditable / soundeditable는 탭 전체를 숨기므로 사용하지 않음.
        // 페인트/소리 에디터만 숨기고 목록은 유지하기 위해 CSS로 처리.
    };
    Entry.creationChangedEvent = new Entry.Event(window);
    Entry.init(document.getElementById('workspace'), initOption);

    // Hide unused block categories: 데이터분석, 인공지능, 확장, 하드웨어
    var banUnusedCategories = function () {
        var ws = Entry.getMainWS();
        if (ws && ws.blockMenu) {
            ['analysis', 'ai_utilize', 'expansion', 'arduino'].forEach(function (cat) {
                ws.blockMenu.banCategory(cat);
            });
        }
    };

    if (problemId) {
        loadProblemProject(problemId)
            .finally(banUnusedCategories)
            .then(function () { return checkAndOfferRestore(problemId, banUnusedCategories); });
        loadProblemMeta(problemId);
        loadProblemTests(problemId);
    } else {
        Entry.loadProject(bot205DefaultProject());
        banUnusedCategories();
        hideProblemPanel();
    }
    loadSpriteCatalog(problemId);
    initEntryPopup();
    initResizableSplitter();
    initGrading();
    initUndoRedo();
    initReset();
    initExport();
    // Notify Entry of resize after panel layout is set
    setTimeout(function () { $(window).trigger('resize'); }, CONFIG.RESIZE_AFTER_INIT_MS);
});

// ============================================================
// 4. Data fetching — sprites / problem project / meta / tests
// ============================================================

// Fetch sprite catalog for the current mode (problem-specific or free mode).
// In free mode (no problemId), returns all 10. In problem mode, server filters
// by the problem's meta.json `sprites` field; falls back to all if unspecified.
function loadSpriteCatalog(problemId) {
    var url = '/api/sprites' + (problemId ? '?problem=' + encodeURIComponent(problemId) : '');
    fetch(url)
        .then(function (r) { return r.ok ? r.json() : { sprites: [] }; })
        .then(function (data) { __spriteCatalog = (data && data.sprites) || []; })
        .catch(function () { __spriteCatalog = []; });
}

// Load a problem's starter project (.ent → tar → project.json) into Entry.
// On any failure (404, network, parse), falls back to an empty project
// so the editor stays usable. Returns a Promise that settles after
// Entry.loadProject(...) returns — callers can chain init logic via .then()/.finally().
function loadProblemProject(problemId) {
    return fetch('/api/problems/' + problemId)
        .then(function (r) { if (r.ok) return r.json(); throw r; })
        .then(function (project) { Entry.loadProject(project); })
        .catch(function () { Entry.loadProject(bot205DefaultProject()); });
}

// 로그인 사용자가 이전에 풀어 저장된 코드가 있으면 복원 모달을 띄우고,
// "내 풀이 불러오기" 선택 시 Entry에 덮어쓰기 로드한다. 비로그인·미저장·실패는 silent.
// 모달 표시 시점은 loadProblemProject가 끝난 뒤이므로 화면에는 기본 problem.ent가 이미 보임.
function checkAndOfferRestore(problemId, onAfterLoad) {
    if (!window.SubmissionSync || typeof window.SubmissionSync.loadMySubmission !== 'function') {
        return Promise.resolve();
    }
    return window.SubmissionSync.loadMySubmission(problemId).then(function (project) {
        if (!project) return; // 비로그인·미저장·파싱 실패 — 정상 흐름
        showRestoreOverlay(function (yes) {
            if (yes) {
                try {
                    // 이전 problem.ent로 로드된 객체·블록을 먼저 깨끗이 정리해야
                    // Entry.loadProject가 기존 상태에 누적하지 않고 깨끗이 교체.
                    // (reset 버튼도 같은 패턴: clearProject → loadProblemProject)
                    if (typeof Entry.clearProject === 'function') Entry.clearProject();
                    Entry.loadProject(project);
                    if (typeof onAfterLoad === 'function') onAfterLoad();
                } catch (e) {
                    console.warn('[checkAndOfferRestore] Entry.loadProject failed', e);
                }
            }
        });
    });
}

// 복원 모달 표시·핸들러 1회 바인딩. ESC / 배경 클릭 = 처음부터 시작.
// initReset과 같은 dismiss UX (ESC + background click) 보장.
function showRestoreOverlay(onChoice) {
    var overlay = document.getElementById('restore-overlay');
    var yesBtn = document.getElementById('restore-yes');
    var noBtn = document.getElementById('restore-no');
    if (!overlay || !yesBtn || !noBtn) return;

    function close(yes) {
        overlay.hidden = true;
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
        document.removeEventListener('keydown', onKey);
        overlay.removeEventListener('click', onBg);
        if (typeof onChoice === 'function') onChoice(yes);
    }
    function onYes() { close(true); }
    function onNo()  { close(false); }
    function onKey(e) { if (e.key === 'Escape') close(false); }
    function onBg(e)  { if (e.target === overlay) close(false); }

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', onBg);
    overlay.hidden = false;
}

// Build a starter project with CODE 205's mascot (205봇 / bot205) instead
// of the default Entrybot. Called in three places:
//  - Free mode entry (no problemId)
//  - Reset button in free mode
//  - Fallback when a problem has no project.ent / fails to load
//
// Uses Entry.getStartProject() as the base so scenes/variables/expansion
// flags match whatever the engine expects, then swaps the sole object.
// Returns a fresh plain object each call (Entry mutates it internally).
function bot205DefaultProject() {
    var base;
    try {
        base = Entry.getStartProject();
    } catch (e) {
        base = { scenes: [{ name: '장면 1', id: 'bot205sc' }], variables: [],
                 objects: [], expansionBlocks: [], aiUtilizeBlocks: [], speed: 60 };
    }
    var sceneId = (base.scenes && base.scenes[0] && base.scenes[0].id) || 'bot205sc';
    var pic = function (slug, name) {
        var url = '/images/mascot/' + slug + '.svg';
        return { id: slug, fileurl: url, thumbUrl: url, name: name,
                 imageType: 'svg', dimension: { width: 200, height: 240 } };
    };
    base.objects = [{
        id: 'bot205',
        name: '205봇',
        script: [[]],
        selectedPictureId: 'bot205-idle',
        objectType: 'sprite',
        rotateMethod: 'free',
        scene: sceneId,
        sprite: {
            sounds: [],
            pictures: [
                pic('bot205-idle',   '205봇_서기'),
                pic('bot205-walk-1', '205봇_걷기1'),
                pic('bot205-walk-2', '205봇_걷기2'),
                pic('bot205-hello',  '205봇_인사')
            ]
        },
        entity: {
            x: 0, y: 0,
            regX: 100, regY: 120,     // anchor at image center (200x240)
            scaleX: 0.5, scaleY: 0.5, // stage size ≈ 100x120, similar to Entrybot footprint
            rotation: 0, direction: 90,
            width: 200, height: 240,
            visible: true
        },
        lock: false,
        active: true
    }];
    return base;
}

function loadProblemTests(problemId) {
    fetch('/api/problems/' + problemId + '/has-tests')
        .then(function (r) { return r.json(); })
        .then(function (info) {
            if (info.hasTests) {
                GradingState.problemId = problemId;
                document.getElementById('test-btn').style.display = '';
                document.getElementById('submit-btn').style.display = '';
            }
        });
}

function fetchTestCases(mode) {
    return fetch('/api/problems/' + GradingState.problemId + '/tests?mode=' + mode)
        .then(function (r) { if (r.ok) return r.json(); throw r; })
        .then(function (data) { return data.cases || []; });
}

function loadProblemMeta(problemId) {
    fetch('/api/problems/' + problemId + '/meta')
        .then(function (r) { if (r.ok) return r.json(); throw r; })
        .then(function (meta) {
            document.getElementById('problem-panel-title').textContent = meta.title || ('문제 ' + problemId);
            document.getElementById('problem-panel-body').innerHTML = renderMarkdown(meta.description);
        })
        .catch(function () {
            document.getElementById('problem-panel-title').textContent = '문제 ' + problemId;
            document.getElementById('problem-panel-body').innerHTML = '<p style="color:#999;">문제 설명이 없습니다.</p>';
        });
}

// ============================================================
// 5. Markdown renderer (minimal)
// ============================================================
// Note: renderMarkdown() and escapeHtml() are defined in editor-pure.js.
// ============================================================

// ============================================================
// 6. Layout — problem panel, splitter
// ============================================================

function hideProblemPanel() {
    document.getElementById('problem-panel').classList.add('hidden');
    document.getElementById('splitter').classList.add('hidden');
    setTimeout(function () { $(window).trigger('resize'); }, CONFIG.RESIZE_AFTER_PANEL_HIDE_MS);
}

function initResizableSplitter() {
    var panel = document.getElementById('problem-panel');
    var splitter = document.getElementById('splitter');

    // Drag to resize (min 40px so the splitter handle stays grabbable)
    var dragging = false;
    splitter.addEventListener('mousedown', function (e) {
        dragging = true;
        splitter.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var w = Math.max(40, Math.min(800, e.clientX));
        panel.style.width = w + 'px';
    });
    document.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        splitter.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        $(window).trigger('resize');
    });
}

// ============================================================
// 7. Reset button — confirm dialog + project reload
// ============================================================

function initReset() {
    var overlay = document.getElementById('confirm-overlay');
    var yesBtn = document.getElementById('confirm-yes');
    var noBtn = document.getElementById('confirm-no');

    function close() { overlay.hidden = true; }

    document.getElementById('reset-btn').addEventListener('click', function () {
        // Don't allow reset during grading
        if (GradingState.isRunning) return;
        overlay.hidden = false;
    });

    noBtn.addEventListener('click', close);

    // Dismiss: background click 또는 ESC (showRestoreOverlay와 같은 UX).
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !overlay.hidden) close();
    });

    yesBtn.addEventListener('click', function () {
        overlay.hidden = true;
        // Clear all existing state first, then reload
        Entry.clearProject();
        var problemId = new URLSearchParams(location.search).get('problem');
        if (problemId) {
            loadProblemProject(problemId);
        } else {
            Entry.loadProject(bot205DefaultProject());
        }
    });
}

// ============================================================
// 7b. Export to .ent — bundle current project into a playentry.org
// -compatible archive that can be uploaded via "오프라인 작품 불러오기"
// ============================================================

// Ask the Entry engine for its current project JSON, POST it to the server
// (which re-bundles local /images/* assets into the tar), then trigger a
// browser download of the returned .ent blob. Disabled during grading.
function initExport() {
    var btn = document.getElementById('export-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
        if (GradingState.isRunning) return;

        var project;
        try { project = Entry.exportProject({}); }
        catch (e) { alert('작품 저장 준비에 실패했습니다.'); return; }
        if (!project) { alert('저장할 오브젝트가 없습니다.'); return; }

        btn.disabled = true;
        var originalText = btn.innerHTML;
        btn.innerHTML = '저장 중…';

        fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project)
        }).then(function (r) {
            if (!r.ok) throw new Error('서버 오류 (' + r.status + ')');
            // Honor server-provided filename when present
            var cd = r.headers.get('Content-Disposition') || '';
            var m = /filename="([^"]+)"/.exec(cd);
            var filename = m ? m[1] : 'code205.ent';
            return r.blob().then(function (blob) { return { blob: blob, filename: filename }; });
        }).then(function (out) {
            var url = URL.createObjectURL(out.blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = out.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }).catch(function (err) {
            alert('저장 실패: ' + (err && err.message ? err.message : err));
        }).then(function () {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    });
}

// ============================================================
// 8. Undo / Redo — header buttons synced with Entry.stateManager
// ============================================================

function initUndoRedo() {
    var undoBtn = document.getElementById('undo-btn');
    var redoBtn = document.getElementById('redo-btn');

    undoBtn.addEventListener('click', function () {
        Entry.dispatchEvent('undo');
    });
    redoBtn.addEventListener('click', function () {
        Entry.dispatchEvent('redo');
    });

    // Periodically sync button disabled state with stateManager
    setInterval(function () {
        var sm = Entry.stateManager;
        if (!sm) return;
        undoBtn.disabled = !sm.canUndo();
        redoBtn.disabled = !sm.canRedo();
    }, CONFIG.UNDO_REDO_SYNC_INTERVAL_MS);
}

// ============================================================
// 9. Engine guard — prevent user interference during grading
// ============================================================

// Hook Entry.engine.toggleStop/toggleRun so user shortcuts and the ■/▶ button
// cannot disturb an in-progress grading run. Grading code bypasses the guard
// via GradingState.engine.internal. Idempotent — only installs once.
function installEngineGuard() {
    if (GradingState.engine.origStop) return;
    if (!window.Entry || !Entry.engine) return;
    GradingState.engine.origStop = Entry.engine.toggleStop;
    GradingState.engine.origRun = Entry.engine.toggleRun;
    Entry.engine.toggleStop = function () {
        if (GradingState.isRunning && !GradingState.engine.internal) return;
        return GradingState.engine.origStop.apply(this, arguments);
    };
    Entry.engine.toggleRun = function () {
        if (GradingState.isRunning && !GradingState.engine.internal) return;
        return GradingState.engine.origRun.apply(this, arguments);
    };
}

function engineInternalStop() {
    GradingState.engine.internal = true;
    try {
        if (Entry.engine.state === 'run') Entry.engine.toggleStop();
    } catch (e) {}
    finally { GradingState.engine.internal = false; }
}

function engineInternalRun() {
    GradingState.engine.internal = true;
    try { Entry.engine.toggleRun(); } catch (e) {}
    finally { GradingState.engine.internal = false; }
}

// Resolve when Entry.engine has fully settled to state === 'stop'.
//
// Why this exists: Entry.engine.toggleStop() is async — synchronously it only
// sets state = 'stopping', then awaits Promise.all(execPromises), then runs
// cleanup (entity/variable snapshot restore, threads clear) and finally sets
// state = 'stop'. Entry.engine.toggleRun() has a `this.state === 'stop'` branch
// that owns fireEvent('start') and snapshot capture; if we call toggleRun()
// while state is still 'stopping', that branch is skipped → scripts never
// execute and the test silently records zero output → guaranteed fail.
//
// This caused the "first test always wrong when user clicked ▶ before grading"
// bug. We call this at the start of runAllTests() (and between iterations) so
// the engine is in a clean 'stop' state before the first engineInternalRun().
//
// Triggers a stop only if state === 'run'; for 'stopping' or 'pause' we just
// wait. 4s cap keeps the chain alive even if Promise.all(execPromises) hangs
// — pathological scripts hit the per-test timeout instead.
function waitForEngineStop() {
    return new Promise(function (resolve) {
        if (!window.Entry || !Entry.engine) return resolve();
        if (Entry.engine.state === 'stop') return resolve();
        if (Entry.engine.state === 'run') {
            GradingState.engine.internal = true;
            try {
                var p = Entry.engine.toggleStop();
                // Don't await the returned promise directly — toggleStop's
                // generator wrapper can reject on cleanup errors. Polling state
                // is the source of truth.
                if (p && typeof p.catch === 'function') p.catch(function () {});
            } catch (e) {}
            finally { GradingState.engine.internal = false; }
        }
        var attempts = 0;
        var iv = setInterval(function () {
            if (!window.Entry || !Entry.engine || Entry.engine.state === 'stop' || attempts > 200) {
                clearInterval(iv);
                resolve();
            }
            attempts++;
        }, 20);
    });
}

// Apply test case setup to Entry's variables/lists.
// Called TWICE per test: once before engineInternalRun(), once after —
// Python mode converts code→blocks synchronously during toggleRun() and
// overwrites variables/lists with hardcoded values, so re-applying after
// toggleRun() restores the test values before the first block executes.
// Idempotent in block mode (second call is a no-op refresh).
function applyTestSetup(setup) {
    if (!setup) return;
    if (setup.variables) {
        Object.keys(setup.variables).forEach(function (vName) {
            var v = Entry.variableContainer.getVariableByName(vName);
            if (v) v.setValue(setup.variables[vName]);
        });
    }
    if (setup.lists) {
        Object.keys(setup.lists).forEach(function (lName) {
            var list = Entry.variableContainer.getListByName(lName);
            if (list) {
                list.array_ = setup.lists[lName].map(function (v) { return { data: v }; });
                list.updateView && list.updateView();
            }
        });
    }
}

// ============================================================
// 10. Grading — button wiring, modal, localStorage persistence
// ============================================================

var gradingInitialized = false;
function initGrading() {
    // 재진입(hot reload·DOM 재초기화) 시 핸들러가 N배로 등록되는 사고 방지.
    if (gradingInitialized) return;
    gradingInitialized = true;

    // Block all keyboard input during grading so user keystrokes
    // don't interfere with ask_and_wait auto-fill or engine state.
    document.addEventListener('keydown', function (e) {
        if (GradingState.isRunning) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    document.addEventListener('keyup', function (e) {
        if (GradingState.isRunning) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    document.addEventListener('keypress', function (e) {
        if (GradingState.isRunning) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    document.getElementById('test-btn').addEventListener('click', function () {
        if (!GradingState.problemId) return;
        fetchTestCases('test').then(function (cases) {
            if (!cases.length) { alert('테스트 케이스가 없습니다.'); return; }
            runAllTests(cases, '테스트 결과', 'test');
        });
    });
    document.getElementById('submit-btn').addEventListener('click', function () {
        if (!GradingState.problemId) return;
        fetchTestCases('submit').then(function (cases) {
            if (!cases.length) { alert('제출용 테스트 케이스가 없습니다.'); return; }
            runAllTests(cases, '제출 결과', 'submit');
        });
    });
    // Stop grading: cancel in-progress grading, stop engine, skip remaining tests, close modal
    document.getElementById('grade-stop').addEventListener('click', function () {
        GradingState.cancelled = true;
        if (GradingState.currentCancel) {
            var fn = GradingState.currentCancel;
            GradingState.currentCancel = null;
            try { fn(); } catch (e) {}
        }
        GradingState.isRunning = false; // release user control over start/stop
        restoreTurboState();            // restore user's Entry.isTurbo setting
        document.getElementById('grade-overlay').hidden = true;
    });

    // Close (after grading done): just hide modal, stay in editor
    document.getElementById('grade-close-btn').addEventListener('click', function () {
        document.getElementById('grade-overlay').hidden = true;
    });

    // Home: navigate back to problem selection page
    document.getElementById('grade-home').addEventListener('click', function () {
        location.href = '/';
    });
}

function showGradeModal() {
    // Reset footer each time the modal opens:
    //  - "running" shows the stop button only
    //  - no "show-home" until we confirm submit + all pass
    var footer = document.getElementById('grade-footer');
    footer.classList.add('running');
    footer.classList.remove('show-home');
    document.getElementById('grade-overlay').hidden = false;
}

// Persist a solved problem id locally + sync to server (if logged in).
// SolvedSync 모듈이 두 저장소(localStorage·서버)를 동시에 처리.
// 비로그인이거나 네트워크 실패면 markRemote는 silent fail — 다음 페이지 로드 시 동기화.
//
// editor.html에서 solved-sync.js를 editor.js보다 먼저 동기 <script>로 로드하므로
// window.SolvedSync는 항상 존재. (확신 못할 때만 가드 추가.)
function markProblemSolved(id) {
    var idNum = parseInt(id, 10);
    if (!idNum) return;
    window.SolvedSync.markLocal(idNum);
    window.SolvedSync.markRemote(idNum);
}

function renderGradeResults(results, running, mode) {
    var body = document.getElementById('grade-body');
    var passCount = results.filter(function (r) { return r.pass; }).length;
    var errorCount = results.filter(function (r) { return r.error; }).length;
    var timeoutCount = results.filter(function (r) { return r.timeout; }).length;
    var total = results.length;
    var summaryClass = running ? 'running' : (passCount === total ? 'pass' : 'fail');
    var summaryText;
    if (running) {
        summaryText = '채점 중... (' + (results.filter(function (r) { return r.done; }).length) + '/' + total + ')';
    } else if (passCount === total) {
        summaryText = '✅ 전체 통과 (' + passCount + '/' + total + ')';
    } else {
        summaryText = '❌ ' + passCount + '/' + total + ' 통과';
        var aux = [];
        if (errorCount > 0) aux.push('오류 ' + errorCount);
        if (timeoutCount > 0) aux.push('시간 초과 ' + timeoutCount);
        if (aux.length) summaryText += ' (' + aux.join(', ') + ')';
    }

    var html = '<div class="grade-summary ' + summaryClass + '">' + summaryText + '</div>';
    results.forEach(function (r, idx) {
        var cls, status;
        if (!r.done) { cls = 'running'; status = '실행중'; }
        else if (r.error) { cls = 'error'; status = '오류'; }
        else if (r.timeout) { cls = 'fail'; status = '시간 초과'; }
        else if (r.pass) { cls = 'pass'; status = '통과'; }
        else { cls = 'fail'; status = '실패'; }

        // Submit mode: hide case names — show "테스트 N" instead
        var displayName = (mode === 'submit') ? ('테스트 ' + (idx + 1)) : (r.name || '테스트');

        html += '<div class="test-case ' + cls + '">';
        html += '<div class="test-status">' + status + '</div>';
        html += '<div class="test-detail"><div class="test-name">' + escapeHtml(displayName) + '</div>';
        if (r.done && r.error && r.errorMessage) {
            html += '<div class="test-diff">' + escapeHtml(r.errorMessage) + '</div>';
        } else if (r.done && r.timeout) {
            // Timeout reason is always shown (even in submit) — doesn't leak expected output
            html += '<div class="test-diff">' + escapeHtml(r.diff || '시간 초과') + '</div>';
        } else if (r.done && !r.pass && r.diff && mode !== 'submit') {
            html += '<div class="test-diff">' + r.diff + '</div>';
        }
        html += '</div></div>';
    });
    body.innerHTML = html;
}

// Restore Entry.isTurbo to the user's original setting captured at
// runAllTests() entry. Idempotent — safe to call multiple times
// (e.g. from both normal completion and grade-stop cancellation).
function restoreTurboState() {
    if (window.Entry && GradingState.prevTurbo !== null) {
        Entry.isTurbo = GradingState.prevTurbo;
        GradingState.prevTurbo = null;
    }
}

function runAllTests(cases, title, mode) {
    GradingState.cancelled = false;
    installEngineGuard();
    GradingState.isRunning = true; // block user-initiated start/stop until done or cancelled

    // Force turbo mode ON during grading so loop-heavy solutions complete
    // within the timeout budget. Manual ▶ runs are unaffected because this
    // only wraps the test/submit code path. User's original setting is
    // restored on completion or cancellation (see restoreTurboState).
    if (window.Entry) {
        GradingState.prevTurbo = Entry.isTurbo || false;
        Entry.isTurbo = true;
    }

    showGradeModal();
    document.getElementById('grade-title').textContent = title || '채점 결과';
    var results = cases.map(function (c) {
        return { name: c.name || '테스트', done: false, pass: false };
    });
    renderGradeResults(results, true, mode);

    // Chain on waitForEngineStop() so the user can click ▶ and then 테스트하기
    // without the first case silently failing — see waitForEngineStop() comment
    // for the underlying toggleStop/toggleRun async race. Between tests we wait
    // again because runSingleTest.finish() also fires-and-forgets toggleStop.
    var chain = waitForEngineStop();
    cases.forEach(function (testCase, idx) {
        chain = chain.then(function () {
            if (GradingState.cancelled) return;
            return runSingleTest(testCase).then(function (result) {
                if (GradingState.cancelled || (result && result.cancelled)) return;
                results[idx].done = true;
                results[idx].pass = result.pass;
                results[idx].diff = result.diff;
                results[idx].error = result.error;
                results[idx].errorMessage = result.errorMessage;
                results[idx].timeout = result.timeout;
                renderGradeResults(results, idx < cases.length - 1, mode);
            }).then(function () {
                // Per-iteration drain: ensures the next runSingleTest's
                // engineInternalRun starts from a fully-settled stop state.
                if (GradingState.cancelled) return;
                return waitForEngineStop();
            });
        });
    });
    chain.then(function () {
        GradingState.isRunning = false; // release user control once chain fully settles
        restoreTurboState();            // restore user's Entry.isTurbo setting
        if (GradingState.cancelled) return;
        renderGradeResults(results, false, mode);

        var footer = document.getElementById('grade-footer');
        // Exit "running" → show 닫기 button
        footer.classList.remove('running');

        // Submit + all-pass only:
        //  - show "문제 선택으로" button (via .show-home)
        //  - persist this problem id to localStorage
        // Test mode: never show home button, never save
        var allPass = results.length > 0 &&
                      results.every(function (r) { return r.done && r.pass; });
        if (mode === 'submit' && GradingState.problemId && allPass) {
            footer.classList.add('show-home');
            markProblemSolved(GradingState.problemId);
            // 정답 코드도 서버에 자동 저장 (로그인 사용자만, 실패 silent)
            if (window.SubmissionSync) {
                window.SubmissionSync.saveSubmission(GradingState.problemId);
            }
        }
    });
}

// Install Entry.Dialog + Entry.toast hooks for one test run.
// - Dialog hook captures say/think/yell output into `sayLog`.
// - toast hook captures the FIRST warning/alert (used as error signal).
// Returns { sayLog, getWarning, restore } — caller must call restore() exactly once.
function installTestHooks() {
    var sayLog = [];
    var warning = null;

    // Dialog hook — capture say/think/yell output
    var OrigDialog = Entry.Dialog;
    Entry.Dialog = function (entity, message, mode, isStamp) {
        sayLog.push({ message: String(message), mode: mode });
        return new OrigDialog(entity, message, mode, isStamp);
    };
    Entry.Dialog.prototype = OrigDialog.prototype;

    // toast hook — capture first warning/alert as error signal
    var OrigWarning = Entry.toast && Entry.toast.warning ? Entry.toast.warning.bind(Entry.toast) : null;
    var OrigAlert = Entry.toast && Entry.toast.alert ? Entry.toast.alert.bind(Entry.toast) : null;
    if (Entry.toast) {
        Entry.toast.warning = function (title, message) {
            if (!warning) warning = { type: '경고', title: String(title || ''), message: String(message || '') };
            return OrigWarning && OrigWarning(title, message);
        };
        Entry.toast.alert = function (title, message) {
            if (!warning) warning = { type: '오류', title: String(title || ''), message: String(message || '') };
            return OrigAlert && OrigAlert(title, message);
        };
    }

    return {
        sayLog: sayLog,
        getWarning: function () { return warning; },
        restore: function () {
            Entry.Dialog = OrigDialog;
            if (Entry.toast) {
                if (OrigWarning) Entry.toast.warning = OrigWarning;
                if (OrigAlert) Entry.toast.alert = OrigAlert;
            }
        }
    };
}

// Snapshot Entry variables_ / lists_ into a plain object. Called BEFORE
// engineInternalStop() because stop restores the pre-run snapshot — capturing
// after stop would lose the test's output values.
function captureFinalState() {
    var state = { variables: {}, lists: {} };
    Entry.variableContainer.variables_.forEach(function (v) {
        state.variables[v.name_] = v.getValue();
    });
    Entry.variableContainer.lists_.forEach(function (l) {
        state.lists[l.name_] = (l.array_ || []).map(function (item) {
            return item.data;
        });
    });
    return state;
}

// Note: escapeHtml, renderMarkdown, normalizeValue, listsEqual,
// formatTimeoutResult, formatWarningResult, evaluateTest are defined in
// editor-pure.js (loaded before this file) — they are pure and unit-tested.

// Run a single test case: setup → run → poll until done/timeout/warning →
// (if not timeout) settle → capture state → evaluate → resolve.
// Resolves with one of:
//  - { cancelled: true }                                  — user stopped grading
//  - { pass: false, timeout: true, diff: '...' }          — pure timeout
//  - { error: true, errorMessage: '...' }                 — Entry warned/alerted
//  - { pass: true } | { pass: false, diff: '...' }        — evaluateTest result
function runSingleTest(testCase) {
    return new Promise(function (resolve) {
        engineInternalStop(); // clean slate before hooks install

        var hooks = installTestHooks();
        var setup = testCase.setup || {};
        // Auto-answer: if setup.variables['대답'] exists, fill ask_and_wait input when it appears.
        var autoAnswer = (setup.variables && setup.variables['대답'] !== undefined)
            ? String(setup.variables['대답']) : null;
        var timeoutMs = testCase.timeout || CONFIG.DEFAULT_TEST_TIMEOUT_MS;

        // Cleanup plumbing — unified exit via finish()
        var pollInterval = null;
        var delayTimer = null;
        var finalTimer = null;
        var done = false;
        var finish = function (result) {
            if (done) return;
            done = true;
            if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
            if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
            if (finalTimer) { clearTimeout(finalTimer); finalTimer = null; }
            engineInternalStop();
            hooks.restore();
            if (GradingState.currentCancel === cancelFn) GradingState.currentCancel = null;
            resolve(result);
        };
        var cancelFn = function () { finish({ cancelled: true }); };
        GradingState.currentCancel = cancelFn;

        // Edge case: cancelled before we started
        if (GradingState.cancelled) { finish({ cancelled: true }); return; }

        // Setup → run → re-setup (Python mode overwrites during toggleRun)
        applyTestSetup(setup);
        engineInternalRun();
        applyTestSetup(setup);

        // Poll until one of: cancelled, warning, completion, timeout
        var startTime = Date.now();
        pollInterval = setInterval(function () {
            if (GradingState.cancelled) return finish({ cancelled: true });

            // Auto-fill ask_and_wait (canvas input, not DOM) once per test
            if (autoAnswer !== null) {
                var iv = Entry.container.inputValue;
                if (iv && iv.setValue && iv.complete === false) {
                    try { Entry.container.setInputValue(autoAnswer); } catch (e) {}
                    autoAnswer = null;
                }
            }

            var warning = hooks.getWarning();
            var elapsed = Date.now() - startTime;
            var noMoreWork = Entry.container.objects_.every(function (obj) {
                return !obj.script || !obj.script.executors || obj.script.executors.length === 0;
            });
            var timedOut = elapsed >= timeoutMs;
            if (!warning && !noMoreWork && !timedOut) return;

            clearInterval(pollInterval);
            pollInterval = null;

            // Pure timeout → fail immediately (partial state mid-infinite-loop is unreliable)
            if (timedOut && !warning && !noMoreWork) {
                return finish(formatTimeoutResult(timeoutMs));
            }

            // Settle, capture state, then evaluate
            delayTimer = setTimeout(function () {
                delayTimer = null;
                if (GradingState.cancelled) return finish({ cancelled: true });

                var w = hooks.getWarning();
                if (w) return finish(formatWarningResult(w));

                var finalState = captureFinalState();
                finalTimer = setTimeout(function () {
                    finalTimer = null;
                    if (GradingState.cancelled) return finish({ cancelled: true });
                    finish(evaluateTest(testCase, hooks.sayLog, finalState));
                }, CONFIG.POST_CAPTURE_EVAL_DELAY_MS);
            }, CONFIG.POST_STOP_CAPTURE_DELAY_MS);
        }, CONFIG.GRADING_POLL_INTERVAL_MS);
    });
}

// Note: evaluateTest(), normalizeValue(), listsEqual() are defined in editor-pure.js.

// ============================================================
// 11. Entry sprite/picture/sound popup (local catalog)
// ============================================================

function initEntryPopup() {
    var container = document.getElementById('popup-container');
    var popup = new EntryTool.Popup({
        container: container,
        isShow: false,
        theme: 'entry',
        data: { data: { data: [] } }
    });

    // Match the official example's init defaults — EntryTool.Popup's project-nav
    // uses these even when we don't surface the "작품" tab, and leaving them
    // unset can leave the popup shell in a half-rendered state.
    // Ref: https://github.com/entrylabs/example/blob/main/base/js/popup/index.mjs
    if (typeof popup.setData === 'function') {
        popup.setData({
            projectNavOptions: {
                categoryOptions: ['all', 'game', 'living', 'storytelling', 'arts', 'knowledge', 'etc'],
                sortOptions:     ['updated', 'visit', 'likeCnt', 'comment'],
                periodOptions:   ['all', 'today', 'week', 'month', 'quarter'],
            },
        });
    }

    var currentType = '';

    // Catalog items carry both `id` (our canonical key) and `_id` (same value,
    // required by EntryTool.Popup for selection tracking). The server filters
    // by `id` via meta.json; the popup reads `_id` from the data as-is.
    //
    // 카탈로그 항목 두 가지를 지원:
    //   1) 단일 picture: { id, fileurl, dimension, ... }   — 모양 1개짜리 sprite
    //   2) 다중 모양 sprite: { id, pictures:[...], sounds, category }  — 예: 205봇 4개 모양
    function showPopup(type) {
        currentType = type;
        container.style.display = 'block';
        var data;
        if (type === 'sprite') {
            // Sprite mode: 다중 모양 sprite는 그대로, 단일 picture는 {pictures:[img]}로 wrap.
            // `category` is required because Entry.EntryObject.initEntity() reads
            // `model.sprite.category.main` unconditionally (src/class/object.js L152).
            // Missing it triggers TypeError and the object silently fails to spawn.
            data = __spriteCatalog.map(function (item) {
                if (Array.isArray(item.pictures)) {
                    return {
                        _id:      item._id || item.id,
                        name:     item.name,
                        pictures: item.pictures,
                        sounds:   item.sounds   || [],
                        category: item.category || {},
                    };
                }
                return {
                    _id: item.id,
                    name: item.name,
                    pictures: [item],
                    sounds: [],
                    category: {},
                };
            });
        } else if (type === 'picture') {
            // Picture mode: 다중 모양 sprite는 picture 단위로 펼쳐서 노출.
            // 각 picture는 카탈로그의 picture id를 _id로 사용해 popup selection 호환.
            data = [];
            __spriteCatalog.forEach(function (item) {
                if (Array.isArray(item.pictures)) {
                    item.pictures.forEach(function (p) {
                        data.push(Object.assign({ _id: p._id || p.id }, p));
                    });
                } else {
                    data.push(item);
                }
            });
        } else {
            data = []; // sound: no bundled sounds yet
        }
        if (typeof popup.setData === 'function') {
            popup.setData({ data: { data: data } });
        }
        popup.show({ type: type }, {});
    }

    Entry.addEventListener('openSpriteManager',  function () { showPopup('sprite');  });
    Entry.addEventListener('openPictureManager', function () { showPopup('picture'); });
    Entry.addEventListener('openSoundManager',   function () { showPopup('sound');   });

    // EntryTool.Popup emits 'submit' with a `{ selected: [...] }` object — NOT a
    // plain array. Treating the argument as an array silently short-circuits on
    // `items.length === undefined` and nothing ever gets added. Always unwrap
    // `data.selected` first. Ref: base/js/popup/{sprite,picture,sound}.mjs
    popup.on('submit', function (data) {
        var items = (data && data.selected) || [];
        if (!items.length) return;

        if (currentType === 'sprite') {
            items.forEach(function (sprite) {
                // Each `sprite` keeps the wrap shape we set in showPopup():
                // { _id, name, pictures:[<catalog img>], sounds:[] }.
                // Regenerate picture IDs so duplicate adds stay distinct in Entry.
                (sprite.pictures || []).forEach(function (p) {
                    p.id = Entry.generateHash();
                    p.fileurl = p.fileurl || p.thumbUrl || '';
                    p.thumbUrl = p.thumbUrl || p.fileurl || '';
                    p.filename = p.filename || '_';
                });
                (sprite.sounds || []).forEach(function (s) {
                    s.id = s.id || Entry.generateHash();
                    s.fileurl = s.fileurl || '';
                    s.filename = s.filename || '_';
                });
                // Entry fills in scene/entity/rotateMethod defaults when they
                // are omitted, matching the official sprite.mjs pattern.
                Entry.container.addObject({
                    id: Entry.generateHash(),
                    objectType: 'sprite',
                    sprite: sprite,
                }, 0);
            });
        } else if (currentType === 'picture') {
            items.forEach(function (pic) {
                pic.id = Entry.generateHash();
                pic.fileurl = pic.fileurl || pic.thumbUrl || '';
                pic.thumbUrl = pic.thumbUrl || pic.fileurl || '';
                pic.filename = pic.filename || '_';
                Entry.playground.addPicture(pic, true);
            });
        } else if (currentType === 'sound') {
            items.forEach(function (snd) {
                snd.id = Entry.generateHash();
                snd.fileurl = snd.fileurl || '';
                snd.filename = snd.filename || '_';
                Entry.playground.addSound(snd, true);
            });
            if (Entry.Utils && Entry.Utils.forceStopSounds) {
                Entry.Utils.forceStopSounds();
            }
        }
        container.style.display = 'none';
        currentType = '';
    });

    popup.on('close', function () {
        container.style.display = 'none';
        currentType = '';
    });

    // Note: 'uploads', 'draw', 'write' handlers removed — those tabs are hidden
    // via CSS because they require a server upload endpoint (offline unsupported).
}
