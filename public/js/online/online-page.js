(function () {
    'use strict';

    var MAX_PROJECTS = 3;
    var projects = [];

    var form = document.getElementById('projectForm');
    var projectIdInput = document.getElementById('entryProjectId');
    var roomSizeSelect = document.getElementById('roomSize');
    var submitButton = document.getElementById('submitButton');
    var formMessage = document.getElementById('formMessage');
    var projectCount = document.getElementById('projectCount');
    var projectList = document.getElementById('projectList');

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

    function createProjectCard(project) {
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
                setMessage('작품 등록을 해제했습니다.', 'success');
                return loadProjects();
            }).catch(function (error) {
                deleteButton.disabled = false;
                setMessage(error.message || '등록 해제에 실패했습니다.', 'error');
            });
        });

        actionRow.appendChild(ownerId);
        actionRow.appendChild(deleteButton);
        card.appendChild(header);
        card.appendChild(actionRow);
        return card;
    }

    function renderProjects() {
        projectCount.textContent = projects.length + ' / ' + MAX_PROJECTS;
        projectList.replaceChildren();

        if (projects.length === 0) {
            var empty = document.createElement('p');
            empty.className = 'empty-message';
            empty.textContent = '아직 등록한 작품이 없습니다.';
            projectList.appendChild(empty);
        } else {
            projects.forEach(function (project) {
                projectList.appendChild(createProjectCard(project));
            });
        }
        setBusy(false);
    }

    function loadProjects() {
        return window.Api.getJson(window.Api.URL.ONLINE_PROJECTS, {
            on401: 'redirect-login',
        }).then(function (result) {
            if (result.redirected) return;
            if (result.status !== 200) {
                throw new Error(result.data.message || '등록 정보를 불러오지 못했습니다.');
            }
            projects = Array.isArray(result.data.projects) ? result.data.projects : [];
            renderProjects();
        }).catch(function (error) {
            projectList.textContent = '';
            var failed = document.createElement('p');
            failed.className = 'empty-message';
            failed.textContent = error.message || '등록 정보를 불러오지 못했습니다.';
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
            return loadProjects();
        }).catch(function (error) {
            setMessage(error.message || '작품 등록에 실패했습니다.', 'error');
            setBusy(false);
        });
    });

    loadProjects();
})();
