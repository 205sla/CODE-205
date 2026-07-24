(function (root, factory) {
    'use strict';

    var api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root && root.document) {
        api.install(root);
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    var NOTICE_END_AT = Date.parse('2026-08-01T00:00:00+09:00');
    var SESSION_KEY = 'code205:transition-notice:dismissed';

    function shouldDisplay(now, endAt, dismissed) {
        return Number.isFinite(now) &&
            Number.isFinite(endAt) &&
            now < endAt &&
            !dismissed;
    }

    function isDismissed(storage) {
        try {
            return storage.getItem(SESSION_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function markDismissed(storage) {
        try {
            storage.setItem(SESSION_KEY, '1');
        } catch (_) {
            // Storage may be unavailable in private browsing. Closing still works.
        }
    }

    function isolateBackground(document, overlay) {
        var states = [];
        var children = Array.prototype.slice.call(document.body.children || []);

        children.forEach(function (node) {
            if (node === overlay || typeof node.setAttribute !== 'function') return;
            states.push({
                node: node,
                hadInert: node.hasAttribute('inert'),
                ariaHidden: node.getAttribute('aria-hidden'),
            });
            node.setAttribute('inert', '');
            node.setAttribute('aria-hidden', 'true');
        });

        return function restoreBackground() {
            states.forEach(function (state) {
                if (!state.hadInert) state.node.removeAttribute('inert');
                if (state.ariaHidden === null) {
                    state.node.removeAttribute('aria-hidden');
                } else {
                    state.node.setAttribute('aria-hidden', state.ariaHidden);
                }
            });
        };
    }

    function render(root) {
        if (root.document.querySelector('[data-code205-transition-notice]')) return null;

        var overlay = root.document.createElement('div');
        overlay.className = 'code205-transition-notice';
        overlay.setAttribute('data-code205-transition-notice', '');
        overlay.innerHTML = [
            '<section class="code205-transition-notice__dialog" role="dialog"',
            ' aria-modal="true" aria-labelledby="code205-transition-title">',
            '<h2 class="code205-transition-notice__title" id="code205-transition-title">',
            '회원 기능 종료 및 데이터 삭제 안내</h2>',
            '<p>CODE 205는 서버 유지비 부담을 줄이면서 문제 풀이 서비스를 계속 제공하기 위해 ',
            '계정·서버 저장 기능을 종료하고 GitHub Pages 기반의 정적 서비스로 전환했습니다.</p>',
            '<p class="code205-transition-notice__important"><strong>문제 풀이는 계속 이용할 수 있습니다.</strong> ',
            '브라우저 채점, <code>.ent</code> 저장과 작품 합치기도 그대로 제공됩니다.</p>',
            '<p>기존 회원정보, 로그인 세션, 서버에 저장된 클리어 기록과 제출 코드는 모두 삭제했으며 ',
            '별도 백업을 남기지 않았습니다. 기존 개인정보는 별도로 보관되거나 이용되지 않으니 안심하셔도 됩니다.</p>',
            '<p>앞으로 클리어 기록은 현재 브라우저에만 저장됩니다. 브라우저 데이터를 삭제하거나 ',
            '기기·브라우저를 바꾸면 기록을 복구할 수 없습니다.</p>',
            '<p class="code205-transition-notice__period">이 안내는 2026년 7월 31일까지 표시됩니다.</p>',
            '<button class="code205-transition-notice__button" type="button">확인했습니다</button>',
            '</section>',
        ].join('');

        var button = overlay.querySelector('button');
        var closed = false;
        var restoreBackground;
        function close() {
            if (closed) return;
            closed = true;
            markDismissed(root.sessionStorage);
            root.document.removeEventListener('keydown', onKeyDown);
            restoreBackground();
            overlay.remove();
        }
        function onKeyDown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
                return;
            }
            if (event.key === 'Tab') {
                event.preventDefault();
                button.focus();
            }
        }

        button.addEventListener('click', close);
        root.document.addEventListener('keydown', onKeyDown);
        root.document.body.appendChild(overlay);
        restoreBackground = isolateBackground(root.document, overlay);
        button.focus();
        return overlay;
    }

    function install(root) {
        function start() {
            var dismissed = isDismissed(root.sessionStorage);
            if (!shouldDisplay(Date.now(), NOTICE_END_AT, dismissed)) return;
            render(root);
        }

        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }

    return {
        NOTICE_END_AT: NOTICE_END_AT,
        SESSION_KEY: SESSION_KEY,
        shouldDisplay: shouldDisplay,
        isolateBackground: isolateBackground,
        install: install,
        render: render,
    };
});
