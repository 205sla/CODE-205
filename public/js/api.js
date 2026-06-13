// 클라이언트 측 fetch 헬퍼 — 모든 페이지가 공유.
//
// 동기:
//  - /api/me, /api/me/solved 등 endpoint 경로가 여러 모듈에 흩어져 있음
//  - 401 처리 정책(redirect / silent / throw)이 모듈마다 달라 향후 token 만료
//    같은 정책 변경 시 사방을 고쳐야 함
//
// 노출 (window.Api):
//   Api.URL              엔드포인트 상수 모음
//   Api.getJson(url, opts)
//   Api.postJson(url, body, opts)
//   Api.patchJson(url, body, opts)
//   Api.deleteJson(url, body?, opts)
//
// opts:
//   on401: 'silent' | 'throw' | 'redirect-login' (default: 'silent')
//          'redirect-login'은 location.href를 /login.html?next=현재경로 로 변경.
//
// 반환: { status, data }
//   - status: HTTP status (네트워크 오류 시 0)
//   - data:   JSON 본문 (파싱 실패 시 빈 객체 {})
//
// 모든 fetch는 credentials: 'same-origin'으로 세션 쿠키 자동 동봉.

(function () {
    'use strict';

    var URL = {
        AUTH_ME:     '/api/auth/me',
        AUTH_LOGIN:  '/api/auth/login',
        AUTH_SIGNUP: '/api/auth/signup',
        AUTH_LOGOUT: '/api/auth/logout',

        ME:                '/api/me',
        ME_PASSWORD:       '/api/me/password',
        ME_SOLVED:         '/api/me/solved',
        ME_SOLVED_ID:      function (padId) { return '/api/me/solved/' + padId; },
        ME_SUBMISSIONS:    '/api/me/submissions',
        ME_SUBMISSIONS_ID: function (padId) { return '/api/me/submissions/' + padId; },

        PROBLEMS:    '/api/problems',
        PROBLEM_ONE: function (padId) { return '/api/problems/' + padId; },
        PROBLEM_HAS_TESTS: function (padId) { return '/api/problems/' + padId + '/has-tests'; },

        SPRITES: '/api/sprites',
        EXPORT:  '/api/export',
    };

    // 401 정책 적용 — fetch resolve 직후 status 검사.
    function handle401(status, on401) {
        if (status !== 401) return false;
        if (on401 === 'throw') {
            var err = new Error('UNAUTHORIZED');
            err.status = 401;
            throw err;
        }
        if (on401 === 'redirect-login') {
            var next = encodeURIComponent(location.pathname + location.search);
            location.href = '/login.html?next=' + next;
            return true; // 호출자에 응답을 돌려주지 않도록 신호
        }
        // 'silent' (default): 그대로 진행
        return false;
    }

    function request(method, url, body, opts) {
        opts = opts || {};
        var on401 = opts.on401 || 'silent';
        var init = {
            method: method,
            credentials: 'same-origin',
        };
        if (body !== undefined && body !== null) {
            init.headers = { 'Content-Type': 'application/json' };
            init.body = JSON.stringify(body);
        }

        return fetch(url, init).then(function (res) {
            if (handle401(res.status, on401)) {
                // redirect 발생 — 호출자에게는 빈 응답으로 표시 (체이닝 중단 신호)
                return { status: 401, data: {}, redirected: true };
            }
            return res.text().then(function (text) {
                var data = {};
                if (text) {
                    try { data = JSON.parse(text); }
                    catch (e) { /* non-JSON body 허용 */ }
                }
                return { status: res.status, data: data };
            });
        });
    }

    var Api = {
        URL: URL,
        getJson:    function (url, opts)        { return request('GET',    url, null, opts); },
        postJson:   function (url, body, opts)  { return request('POST',   url, body, opts); },
        patchJson:  function (url, body, opts)  { return request('PATCH',  url, body, opts); },
        deleteJson: function (url, body, opts)  { return request('DELETE', url, body, opts); },
    };

    window.Api = Api;
})();
