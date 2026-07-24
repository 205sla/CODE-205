// 클리어 기록의 브라우저 로컬 저장.
// localStorage 'entry:solved'는 정수 배열(예: [1, 3, 17])로 유지한다.
// 정적 사이트에서는 계정·서버 동기화를 사용하지 않는다.
//
// 노출:
//   window.SolvedSync.padId(n)          — 정수 → 3자리 문자열
//   window.SolvedSync.loadLocal()       — localStorage 정수 배열 반환
//   window.SolvedSync.markLocal(idNum)  — localStorage에 단일 추가

(function () {
    'use strict';

    var STORAGE_KEY = 'entry:solved';

    function padId(n) {
        return String(parseInt(n, 10)).padStart(3, '0');
    }

    function loadLocal() {
        try {
            var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            if (!Array.isArray(list)) return [];
            // 정수만 필터링·정규화
            var out = [];
            for (var i = 0; i < list.length; i++) {
                var n = parseInt(list[i], 10);
                if (n > 0 && out.indexOf(n) === -1) out.push(n);
            }
            return out;
        } catch (e) { return []; }
    }

    function saveLocal(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) { /* quota / privacy 모드 — 무시 */ }
    }

    function markLocal(idNum) {
        var n = parseInt(idNum, 10);
        if (!n) return;
        var list = loadLocal();
        if (list.indexOf(n) === -1) {
            list.push(n);
            saveLocal(list);
        }
    }

    window.SolvedSync = {
        padId: padId,
        loadLocal: loadLocal,
        markLocal: markLocal,
    };
})();
