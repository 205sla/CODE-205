/* ============================================================
   index.js — 메인 문제 선택 화면
   /data/problems.json에서 문제 목록을 받아 두 섹션으로 렌더링.
   - 상단 "학습 시작하기": category가 'sample'·'tutorial'인 문제 (필터 무관, 항상 전체 표시)
   - 하단 "전체 문제": category가 없는 일반 문제 (난이도·해결 여부 필터 적용)
   localStorage: entry:solved (해결 기록), entry:filter (필터 상태 기억)
   ============================================================ */

var FILTER_KEY = 'entry:filter';

var state = {
    problems: [],
    solved: {},
    filter: loadFilter()
};

// ─────── 유틸 ───────

function getSolvedSet() {
    // SolvedSync.loadLocal이 storage 키('entry:solved') + 정규화를 단독 책임.
    // 여기는 set 형태(O(1) 조회)로만 변환.
    var set = {};
    window.SolvedSync.loadLocal().forEach(function (n) { set[n] = true; });
    return set;
}

// escapeHtml은 dom-escape.js가 window에 노출 — index.html에서 이 파일보다 먼저 로드.
var escapeHtml = window.escapeHtml;

function defaultFilter() {
    return { difficulty: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true }, solved: 'all' };
}

function loadFilter() {
    try {
        var raw = localStorage.getItem(FILTER_KEY);
        if (!raw) return defaultFilter();
        var obj = JSON.parse(raw);
        var diffs = Array.isArray(obj.difficulty) ? obj.difficulty : [0, 1, 2, 3, 4, 5];
        var f = defaultFilter();
        f.difficulty = { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false };
        diffs.forEach(function (n) {
            n = parseInt(n, 10);
            if (n >= 0 && n <= 5) f.difficulty[n] = true;
        });
        f.solved = (obj.solved === 'solved' || obj.solved === 'unsolved') ? obj.solved : 'all';
        return f;
    } catch (e) { return defaultFilter(); }
}

function saveFilter() {
    try {
        var diffs = [];
        for (var i = 0; i <= 5; i++) if (state.filter.difficulty[i]) diffs.push(i);
        localStorage.setItem(FILTER_KEY, JSON.stringify({
            difficulty: diffs,
            solved: state.filter.solved
        }));
    } catch (e) {}
}

// DOM → state
function syncFilterFromUI() {
    var panel = document.getElementById('filter-panel');
    var diffs = panel.querySelectorAll('.filter-difficulty input[type="checkbox"]');
    for (var i = 0; i < diffs.length; i++) {
        var n = parseInt(diffs[i].getAttribute('data-diff'), 10);
        state.filter.difficulty[n] = diffs[i].checked;
    }
    var solved = panel.querySelector('.filter-solved input[type="radio"]:checked');
    state.filter.solved = solved ? solved.value : 'all';
}

// state → DOM (최초 진입 시 localStorage 값으로 체크박스 복원)
function applyFilterToUI() {
    var panel = document.getElementById('filter-panel');
    var diffs = panel.querySelectorAll('.filter-difficulty input[type="checkbox"]');
    for (var i = 0; i < diffs.length; i++) {
        var n = parseInt(diffs[i].getAttribute('data-diff'), 10);
        diffs[i].checked = !!state.filter.difficulty[n];
    }
    var radios = panel.querySelectorAll('.filter-solved input[type="radio"]');
    for (var j = 0; j < radios.length; j++) {
        radios[j].checked = (radios[j].value === state.filter.solved);
    }
}

// ─────── 카드 DOM ───────

function cardInnerHTML(p, isSolved, variant) {
    var stars = '';
    var d = Math.max(0, Math.min(5, p.difficulty || 0));
    for (var i = 0; i < 5; i++) {
        stars += i < d
            ? '<span class="star-filled">&#9733;</span>'
            : '<span class="star-empty">&#9733;</span>';
    }
    var badge = isSolved ? '<span class="card-solved-badge">&#10004; 해결</span>' : '';

    var catBadge = '';
    if (variant === 'feature') {
        if (p.category === 'sample') catBadge = '<span class="card-cat-badge cat-sample">샘플</span>';
        else if (p.category === 'tutorial') catBadge = '<span class="card-cat-badge cat-tutorial">튜토리얼</span>';
    }

    var credits = '';
    if (p.author) {
        credits += '<div class="card-author">출제 ' + escapeHtml(p.author) + '</div>';
    }
    if (Array.isArray(p.contributors) && p.contributors.length > 0) {
        var names = p.contributors.map(escapeHtml).join(', ');
        credits += '<div class="card-contributors">수정 ' + names + '</div>';
    }

    return badge
        + '<div class="card-number">' + p.id + '</div>'
        + catBadge
        + '<div class="card-title">' + escapeHtml(p.title) + '</div>'
        + '<div class="card-difficulty">' + stars + '</div>'
        + credits;
}

function createCardAnchor(p, isSolved, variant) {
    var a = document.createElement('a');
    var cls = 'card';
    if (isSolved) cls += ' solved';
    if (variant === 'feature') cls += ' card--feature';
    a.className = cls;
    a.href = '/editor.html?problem=' + p.id;
    a.innerHTML = cardInnerHTML(p, isSolved, variant);
    return a;
}

// ─────── 섹션 렌더러 ───────

function renderTopSection(problems, solved) {
    var section = document.getElementById('learning-section');
    var grid = document.getElementById('learning-list');
    grid.innerHTML = '';
    var special = problems.filter(function (p) {
        return p.category === 'sample' || p.category === 'tutorial';
    });
    if (!special.length) {
        section.hidden = true;
        return;
    }
    section.hidden = false;
    // 샘플 먼저, 튜토리얼 다음, 그 안에서 id 순
    special.sort(function (a, b) {
        var order = { sample: 0, tutorial: 1 };
        if (order[a.category] !== order[b.category]) return order[a.category] - order[b.category];
        return a.id - b.id;
    });
    special.forEach(function (p) {
        grid.appendChild(createCardAnchor(p, !!solved[p.id], 'feature'));
    });
}

function renderGrid(problems, solved, filter) {
    var grid = document.getElementById('problem-list');
    var countEl = document.getElementById('problems-count');
    grid.innerHTML = '';
    var normal = problems.filter(function (p) { return !p.category; });
    var visible = normal.filter(function (p) {
        var d = Math.max(0, Math.min(5, p.difficulty || 0));
        if (!filter.difficulty[d]) return false;
        var s = !!solved[p.id];
        if (filter.solved === 'solved' && !s) return false;
        if (filter.solved === 'unsolved' && s) return false;
        return true;
    });
    if (countEl) {
        countEl.textContent = visible.length + ' / ' + normal.length;
    }
    if (!visible.length) {
        grid.innerHTML = '<div class="empty">조건에 맞는 문제가 없습니다. 필터를 완화해 보세요.</div>';
        return;
    }
    visible.forEach(function (p) {
        grid.appendChild(createCardAnchor(p, !!solved[p.id], 'compact'));
    });
}

// ─────── 부트스트랩 ───────

fetch('/data/problems.json')
    .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
    })
    .then(function (problems) {
        if (!Array.isArray(problems)) throw new Error('invalid problems manifest');
        state.problems = problems;
        state.solved = getSolvedSet();

        if (!problems.length) {
            document.getElementById('problem-list').innerHTML =
                '<div class="empty">등록된 문제가 없습니다.</div>';
            return;
        }

        applyFilterToUI();
        renderTopSection(state.problems, state.solved);
        renderGrid(state.problems, state.solved, state.filter);

        var panel = document.getElementById('filter-panel');
        panel.addEventListener('change', function () {
            syncFilterFromUI();
            saveFilter();
            renderGrid(state.problems, state.solved, state.filter);
        });

    })
    .catch(function (err) {
        console.error('[/data/problems.json]', err);
        document.getElementById('problem-list').innerHTML =
            '<div class="empty">문제 목록을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.</div>';
    });
