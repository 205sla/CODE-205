(function () {
    'use strict';

    var REFRESH_MS = 60 * 1000;

    function byId(id) {
        return document.getElementById(id);
    }

    function formatDate(value) {
        if (!value) return '-';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return new Intl.DateTimeFormat('ko-KR', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }).format(date);
    }

    function formatInterval(ms) {
        if (!ms) return '-';
        var minutes = Math.round(ms / 60000);
        return minutes + '분';
    }

    function statusText(status) {
        if (status === 'UP') return '정상';
        if (status === 'DOWN') return '장애';
        return '확인 필요';
    }

    function badgeClass(status) {
        if (status === 'UP') return 'status-badge status-up';
        if (status === 'DOWN') return 'status-badge status-down';
        return 'status-badge status-unknown';
    }

    function rowStatusClass(status) {
        if (status === 'UP') return 'history-status status-up-text';
        if (status === 'DOWN') return 'history-status status-down-text';
        return 'history-status status-unknown-text';
    }

    function setText(id, text) {
        var el = byId(id);
        if (el) el.textContent = text;
    }

    function setSummary(snapshot) {
        var latest = snapshot.latest;
        var monitor = snapshot.monitor || {};
        var status = latest ? latest.status : 'UNKNOWN';
        var badge = byId('status-badge');
        if (badge) {
            badge.className = badgeClass(status);
            badge.textContent = statusText(status);
        }

        if (!monitor.enabled) {
            setText('status-message', '상태 기록 대기 중입니다.');
        } else if (!latest) {
            setText('status-message', '첫 상태 확인을 기다리는 중입니다.');
        } else {
            setText('status-message', latest.reason || '마지막 상태 기록을 불러왔습니다.');
        }

        setText('metric-checked', latest ? formatDate(latest.checkedAt) : '-');
        setText('metric-next', formatDate(snapshot.nextCheckAt));
        setText('metric-interval', formatInterval(monitor.intervalMs));
        setText('metric-project', monitor.projectId || (monitor.configured ? '설정됨' : '미설정'));
    }

    function renderHistory(history) {
        var body = byId('history-body');
        if (!body) return;
        body.replaceChildren();

        if (!history || !history.length) {
            var empty = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = 4;
            td.className = 'empty-row';
            td.textContent = '아직 기록이 없습니다.';
            empty.appendChild(td);
            body.appendChild(empty);
            return;
        }

        history.slice(0, 24).forEach(function (item) {
            var tr = document.createElement('tr');
            var checked = document.createElement('td');
            var status = document.createElement('td');
            var elapsed = document.createElement('td');
            var reason = document.createElement('td');

            checked.textContent = formatDate(item.checkedAt);
            status.textContent = statusText(item.status);
            status.className = rowStatusClass(item.status);
            elapsed.textContent = item.elapsedMs ? item.elapsedMs + 'ms' : '-';
            reason.textContent = item.reason || item.socketStatus || '-';

            tr.appendChild(checked);
            tr.appendChild(status);
            tr.appendChild(elapsed);
            tr.appendChild(reason);
            body.appendChild(tr);
        });
    }

    async function loadStatus() {
        try {
            var response = await fetch('/api/status/entry-cv', {
                headers: { accept: 'application/json' },
                cache: 'no-store',
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            var snapshot = await response.json();
            setSummary(snapshot);
            renderHistory(snapshot.history || []);
        } catch (error) {
            var badge = byId('status-badge');
            if (badge) {
                badge.className = 'status-badge status-unknown';
                badge.textContent = '확인 필요';
            }
            setText('status-message', '상태 API 응답을 불러오지 못했습니다.');
            renderHistory([]);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var reload = byId('reload-button');
        if (reload) reload.addEventListener('click', loadStatus);
        loadStatus();
        setInterval(loadStatus, REFRESH_MS);
    });
})();
