/**
 * merge-app.js — /merge 페이지 UI 오케스트레이션.
 * 출처: extensions/entry-merge-extension/js/app.js (DOM ID 동일 유지).
 * 처리는 전량 로컬(MergeEngine) — 서버 업로드 없음. 진행률은 엔진이 바이트 가중으로 보고.
 */
(function () {
  'use strict';

  const MAX_FILE_SIZE = 50 * 1024 * 1024;     // 파일 1개당 50MB
  const MAX_TOTAL_SIZE = 150 * 1024 * 1024;   // 전체 150MB
  const MAX_FILE_COUNT = 10;                  // 최대 10개

  const $ = id => document.getElementById(id);
  const dom = {
    dropZone: $('dropZone'),
    fileInput: $('fileInput'),
    fileList: $('fileList'),
    mergeBtn: $('mergeBtn'),
    status: $('status'),
    totalSize: $('totalSize'),
    extraToggle: $('extraToggle'),
    extraSettings: $('extraSettings'),
    clearRemake: $('clearRemake'),
    hideTimerAnswer: $('hideTimerAnswer'),
    overlay: $('progressOverlay'),
    progressMsg: $('progressMsg'),
    progressBar: $('progressBar'),
    progressPct: $('progressPct'),
    progressClose: $('progressClose'),
  };

  let files = [];
  let dragCounter = 0; // 중첩 dragenter/dragleave 추적

  // --- 기타 설정 토글 ---
  dom.extraToggle.addEventListener('click', () => {
    dom.extraSettings.classList.toggle('show');
  });

  // --- 드래그 & 드롭 ---
  dom.dropZone.addEventListener('click', () => dom.fileInput.click());
  dom.dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dom.fileInput.click(); }
  });
  dom.dropZone.addEventListener('dragenter', e => {
    e.preventDefault();
    if (++dragCounter === 1) dom.dropZone.classList.add('drag-over');
  });
  dom.dropZone.addEventListener('dragleave', e => {
    e.preventDefault();
    if (--dragCounter === 0) dom.dropZone.classList.remove('drag-over');
  });
  dom.dropZone.addEventListener('dragover', e => e.preventDefault());
  dom.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    dom.dropZone.classList.remove('drag-over');
    addFiles(e.dataTransfer.files);
  });

  dom.fileInput.addEventListener('change', () => {
    addFiles(dom.fileInput.files);
    dom.fileInput.value = '';
  });

  // --- 파일 관리 ---
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function addFiles(newFiles) {
    for (const f of newFiles) {
      if (!f.name.toLowerCase().endsWith('.ent')) continue;
      if (files.some(x => x.name === f.name && x.size === f.size)) continue;
      if (files.length >= MAX_FILE_COUNT) break;
      files.push(f);
    }
    renderList();
  }

  function removeFile(idx) {
    files.splice(idx, 1);
    renderList();
  }

  function renderList() {
    dom.fileList.innerHTML = '';
    let total = 0;
    let hasOverSize = false;

    files.forEach((f, i) => {
      total += f.size;
      const overSize = f.size > MAX_FILE_SIZE;
      if (overSize) hasOverSize = true;

      const li = document.createElement('li');
      if (overSize) li.classList.add('over-size');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = f.name;

      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'size';
      sizeSpan.textContent = formatSize(f.size) + (overSize ? ' (초과!)' : '');

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `${f.name} 제거`);
      removeBtn.addEventListener('click', () => removeFile(i));

      li.append(nameSpan, sizeSpan, removeBtn);
      dom.fileList.appendChild(li);
    });

    const totalOver = total > MAX_TOTAL_SIZE;

    if (files.length > 0) {
      dom.totalSize.textContent = `합계: ${formatSize(total)} / ${formatSize(MAX_TOTAL_SIZE)}`;
      dom.totalSize.className = 'total-size' + (totalOver ? ' over' : '');
    } else {
      dom.totalSize.textContent = '';
    }

    dom.mergeBtn.disabled = files.length < 2 || hasOverSize || totalOver;

    setStatus('', '');

    if (hasOverSize) {
      setStatus('50MB를 초과하는 파일이 있습니다.', 'error');
    } else if (totalOver) {
      setStatus('전체 용량이 150MB를 초과합니다.', 'error');
    }
  }

  // --- 상태 메시지 ---
  function setStatus(text, type) {
    dom.status.textContent = text;
    dom.status.className = 'status' + (type ? ' ' + type : '');
  }

  // --- 진행 오버레이 ---
  function showProgress() {
    dom.progressMsg.textContent = '작품을 합치는 중...';
    dom.progressBar.style.width = '0%';
    dom.progressPct.textContent = '0%';
    dom.progressClose.style.display = 'none';
    dom.overlay.classList.add('show');
  }

  function updateProgress(pct, msg) {
    dom.progressBar.style.width = pct + '%';
    dom.progressPct.textContent = pct + '%';
    if (msg) dom.progressMsg.textContent = msg;
  }

  function finishProgress(success) {
    dom.progressClose.style.display = 'block';
    if (success) {
      dom.progressMsg.textContent = '합치기 완료!';
      dom.progressBar.style.width = '100%';
      dom.progressPct.textContent = '100%';
    }
  }

  dom.progressClose.addEventListener('click', () => {
    dom.overlay.classList.remove('show');
  });

  // --- 합치기 ---
  dom.mergeBtn.addEventListener('click', async () => {
    if (files.length < 2) return;

    dom.mergeBtn.disabled = true;
    dom.mergeBtn.textContent = '합치는 중...';
    setStatus('로컬에서 처리 중입니다...', 'loading');
    showProgress();

    try {
      const blob = await MergeEngine.performMerge(
        [...files],
        {
          clearRemake: dom.clearRemake.checked,
          hideTimerAnswer: dom.hideTimerAnswer.checked
        },
        updateProgress
      );

      // 다운로드 (download 시작 보장 위해 revokeObjectURL 지연)
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '머지.ent';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      dom.mergeBtn.textContent = '작품 합치기';
      renderList();
      setStatus('합치기 완료! 파일이 다운로드됩니다.', 'success');
      finishProgress(true);
    } catch (e) {
      const msg = e.message || '오류가 발생했습니다.';
      dom.mergeBtn.textContent = '작품 합치기';
      renderList();
      setStatus(msg, 'error');
      updateProgress(0, '오류 발생: ' + msg);
      finishProgress(false);
    }
  });
})();
