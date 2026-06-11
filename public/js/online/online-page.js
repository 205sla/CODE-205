(function () {
    'use strict';

    var MAX_PROJECTS = 3;
    var projects = [];
    var usageByProjectId = Object.create(null);
    var usageTotal = {
        projects: 0,
        connections: 0,
        totalMessages: 0,
        totalBytes: 0,
    };
    var Usage = window.EntryOnlineUsage;

    var form = document.getElementById('projectForm');
    var projectIdInput = document.getElementById('entryProjectId');
    var roomSizeSelect = document.getElementById('roomSize');
    var submitButton = document.getElementById('submitButton');
    var formMessage = document.getElementById('formMessage');
    var projectCount = document.getElementById('projectCount');
    var projectList = document.getElementById('projectList');
    var totalUsageProjects = document.getElementById('totalUsageProjects');
    var totalUsageConnections = document.getElementById('totalUsageConnections');
    var totalUsageMessages = document.getElementById('totalUsageMessages');
    var totalUsageBytes = document.getElementById('totalUsageBytes');

    function setMessage(message, kind) {
        formMessage.textContent = message || '';
        formMessage.className = 'form-message' + (kind ? ' ' + kind : '');
    }

    function setBusy(busy) {
        submitButton.disabled = busy || projects.length >= MAX_PROJECTS;
        projectIdInput.disabled = busy || projects.length >= MAX_PROJECTS;
        roomSizeSelect.disabled = busy || projects.length >= MAX_PROJECTS;
        submitButton.textContent = busy ? '등록 중...' : '작품 등록';
    }

    function appendUsage(usageGrid, label, value, detail) {
        var item = document.createElement('div');
        var labelElement = document.createElement('span');
        var valueElement = document.createElement('strong');
        labelElement.textContent = label;
        valueElement.textContent = value;
        item.appendChild(labelElement);
        item.appendChild(valueElement);
        if (detail) {
            var detailElement = document.createElement('small');
            detailElement.textContent = detail;
            item.appendChild(detailElement);
        }
        usageGrid.appendChild(item);
    }

    function createProjectCard(project) {
        var usage = usageByProjectId[project.entryProjectId]
            || Usage.emptyUsage(project.entryProjectId);
        var card = document.createElement('article');
        card.className = 'project-card';

        var header = document.createElement('div');
        header.className = 'project-card-header';

        var id = document.createElement('span');
        id.className = 'project-id';
        id.textContent = project.entryProjectId;

        var roomSize = document.createElement('span');
        roomSize.className = 'room-size';
        roomSize.textContent = project.roomSize + '인 방';

        header.appendChild(id);
        header.appendChild(roomSize);

        var actionRow = document.createElement('div');
        actionRow.className = 'token-row';

        var ownerId = document.createElement('code');
        ownerId.className = 'token-value';
        ownerId.textContent = '$입장("' + project.ownerId + '")';

        var deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'delete-button';
        deleteButton.textContent = '등록 해제';
        deleteButton.addEventListener('click', function () {
            if (!window.confirm('이 작품 등록을 해제할까요? 새 플레이어는 더 이상 입장할 수 없습니다.')) {
                return;
            }
            deleteButton.disabled = true;
            window.Api.deleteJson(window.Api.URL.ONLINE_PROJECT_ID(project.id), null, {
                on401: 'redirect-login',
            }).then(function (result) {
                if (result.status !== 200 || !result.data.removed) {
                    throw new Error(result.data.message || '등록 해제에 실패했습니다.');
                }
                setMessage('작품 등록을 해제했습니다. 과거 사용량은 총합에 유지됩니다.', 'success');
                return loadDashboard();
            }).catch(function (error) {
                deleteButton.disabled = false;
                setMessage(error.message || '등록 해제에 실패했습니다.', 'error');
            });
        });

        actionRow.appendChild(ownerId);
        actionRow.appendChild(deleteButton);

        var usageGrid = document.createElement('div');
        usageGrid.className = 'project-usage-grid';
        appendUsage(
            usageGrid,
            '연결',
            Usage.formatCount(usage.connections) + '회'
        );
        appendUsage(
            usageGrid,
            '메시지',
            Usage.formatCount(usage.totalMessages) + '건',
            '수신 ' + Usage.formatCount(usage.messagesIn)
                + ' · 송신 ' + Usage.formatCount(usage.messagesOut)
        );
        appendUsage(
            usageGrid,
            '송수신 크기',
            Usage.formatBytes(usage.totalBytes),
            '수신 ' + Usage.formatBytes(usage.bytesIn)
                + ' · 송신 ' + Usage.formatBytes(usage.bytesOut)
        );

        var usagePeriod = document.createElement('p');
        usagePeriod.className = 'usage-period';
        usagePeriod.textContent = usage.firstDay
            ? '기록 기간: ' + usage.firstDay + ' ~ ' + usage.lastDay
            : '아직 기록된 서버 사용량이 없습니다.';

        card.appendChild(header);
        card.appendChild(actionRow);
        card.appendChild(usageGrid);
        card.appendChild(usagePeriod);
        return card;
    }

    function renderUsageTotal() {
        totalUsageProjects.textContent = Usage.formatCount(usageTotal.projects) + '개';
        totalUsageConnections.textContent = Usage.formatCount(usageTotal.connections) + '회';
        totalUsageMessages.textContent = Usage.formatCount(usageTotal.totalMessages) + '건';
        totalUsageBytes.textContent = Usage.formatBytes(usageTotal.totalBytes);
    }

    function renderProjects() {
        projectCount.textContent = projects.length + ' / ' + MAX_PROJECTS;
        renderUsageTotal();
        projectList.replaceChildren();

        if (projects.length === 0) {
            var empty = document.createElement('p');
            empty.className = 'empty-message';
            empty.textContent = usageTotal.projects > 0
                ? '현재 등록한 작품은 없습니다. 과거 사용량은 위 총합에 유지됩니다.'
                : '아직 등록한 작품이 없습니다.';
            projectList.appendChild(empty);
        } else {
            projects.forEach(function (project) {
                projectList.appendChild(createProjectCard(project));
            });
        }
        setBusy(false);
    }

    function loadDashboard() {
        var options = { on401: 'redirect-login' };
        return Promise.all([
            window.Api.getJson(window.Api.URL.ONLINE_PROJECTS, options),
            window.Api.getJson(window.Api.URL.ONLINE_USAGE, options),
        ]).then(function (results) {
            var projectResult = results[0];
            var usageResult = results[1];
            if (projectResult.redirected || usageResult.redirected) return;
            if (projectResult.status !== 200) {
                throw new Error(
                    projectResult.data.message || '등록 정보를 불러오지 못했습니다.'
                );
            }
            if (usageResult.status !== 200) {
                throw new Error(
                    usageResult.data.message || '사용량을 불러오지 못했습니다.'
                );
            }
            projects = Array.isArray(projectResult.data.projects)
                ? projectResult.data.projects
                : [];
            usageByProjectId = Usage.indexUsage(usageResult.data.usage);
            usageTotal = usageResult.data.total || usageTotal;
            renderProjects();
        }).catch(function (error) {
            projectList.textContent = '';
            var failed = document.createElement('p');
            failed.className = 'empty-message';
            failed.textContent = error.message || '등록 정보와 사용량을 불러오지 못했습니다.';
            projectList.appendChild(failed);
        });
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        setMessage('');
        setBusy(true);

        window.Api.postJson(window.Api.URL.ONLINE_PROJECTS, {
            entryProjectId: projectIdInput.value,
            roomSize: Number(roomSizeSelect.value),
        }, {
            on401: 'redirect-login',
        }).then(function (result) {
            if (result.redirected) return;
            if (result.status !== 201) {
                throw new Error(result.data.message || '작품 등록에 실패했습니다.');
            }
            projectIdInput.value = '';
            setMessage('작품을 등록했습니다.', 'success');
            return loadDashboard();
        }).catch(function (error) {
            setMessage(error.message || '작품 등록에 실패했습니다.', 'error');
            setBusy(false);
        });
    });

    loadDashboard();
})();
