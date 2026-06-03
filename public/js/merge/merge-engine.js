/**
 * merge-engine.js — 엔트리 작품(.ent) 합치기 핵심 로직.
 *
 * 출처: extensions/entry-merge-extension/js/merge-engine.js (services/EntryMergeServer/web.py 포팅).
 * 전량 클라이언트 사이드 — 파일은 브라우저를 떠나지 않는다.
 *
 * CODE 205 이식 시 변경점:
 *   1. 진행률을 "파일 개수" 대신 "바이트 가중 + 단계 예산"으로 재설계 (얼마나 남았는지 정확히).
 *   2. 출력 gzip을 pako.Deflate 스트리밍으로 처리해 압축 단계도 세분 진행 보고 (가능 시).
 *   3. 끝에 node(test)용 export tail 추가 — 순수 함수 단위 테스트 대상 (editor-pure.js 패턴).
 *
 * applyMetadata의 205 계정 ID(parent/origin·user)는 기본값으로 유지한다 (운영 결정).
 */
const MergeEngine = (() => {
  'use strict';

  const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const SPECIAL_VAR_TYPES = new Set(['timer', 'answer']);
  const textDecoder = new TextDecoder();

  // --- Deep comparison (Python의 `in` 연산자는 리스트에 deep equality) ---

  function deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== typeof b) return false;

    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      if (keysA.length !== Object.keys(b).length) return false;
      for (const k of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
      }
      return true;
    }

    return false;
  }

  function deepIncludes(arr, item) {
    return arr.some(el => deepEqual(el, item));
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  // 바이트를 사람이 읽는 단위로.
  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  // 브라우저 렌더 루프에 양보 (무거운 동기 작업 중 UI 멈춤 방지). node에서도 무해.
  function yieldToUI() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  // --- 재귀 dict 병합 ---

  function mergeDicts(target, source) {
    for (const [key, value] of Object.entries(source)) {
      if (!(key in target)) {
        target[key] = value;
        continue;
      }

      const existing = target[key];

      if (isPlainObject(existing) && isPlainObject(value)) {
        mergeDicts(existing, value);
      } else if (Array.isArray(existing) && Array.isArray(value)) {
        for (const item of value) {
          if (!deepIncludes(existing, item)) existing.push(item);
        }
      } else if (!deepEqual(existing, value)) {
        const list = Array.isArray(existing) ? existing : (target[key] = [existing]);
        if (!deepIncludes(list, value)) list.push(value);
      }
    }
  }

  // --- Scene ID 난수화 ---

  function generateId(len, usedIds) {
    let id;
    do {
      id = '';
      for (let i = 0; i < len; i++) {
        id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
      }
    } while (usedIds.has(id));
    return id;
  }

  function processSingleProject(project, globalUsedIds) {
    if (!Array.isArray(project.scenes)) return project;

    const mapping = {};

    for (const scene of project.scenes) {
      const oldId = scene.id;
      if (!oldId) continue;
      const newId = generateId(4, globalUsedIds);
      globalUsedIds.add(newId);
      mapping[oldId] = newId;
      scene.id = newId;
    }

    if (project.objects) {
      const update = (obj) => {
        if (obj.scene && mapping[obj.scene]) {
          obj.scene = mapping[obj.scene];
        }
        if (typeof obj.script === 'string') {
          for (const [oldId, newId] of Object.entries(mapping)) {
            obj.script = obj.script.replaceAll(oldId, newId);
          }
        }
      };

      const objs = project.objects;
      const items = Array.isArray(objs) ? objs : Object.values(objs);
      for (const obj of items) {
        if (obj && typeof obj === 'object') update(obj);
      }
    }

    return project;
  }

  // --- 병합 후처리 ---

  function dedupSpecialVariables(merged) {
    if (!Array.isArray(merged.variables)) return;
    const seen = new Set();
    merged.variables = merged.variables.filter(v => {
      if (v && typeof v === 'object' && SPECIAL_VAR_TYPES.has(v.variableType)) {
        if (seen.has(v.variableType)) return false;
        seen.add(v.variableType);
      }
      return true;
    });
  }

  function hideTimerAnswerVariables(merged) {
    if (!Array.isArray(merged.variables)) return;
    for (const v of merged.variables) {
      if (v && typeof v === 'object' && SPECIAL_VAR_TYPES.has(v.variableType)) {
        v.x = 2050;
        v.y = 2050;
      }
    }
  }

  function applyMetadata(merged, clearRemake) {
    merged.name = '머지';
    if (clearRemake) {
      merged.parent = '';
      merged.origin = '';
      merged.user = '';
    } else {
      merged.parent = '678b8711133715065e4548c7';
      merged.origin = '678b8711133715065e4548c7';
      merged.user = '56136825dadc91e1235b460d';
    }
  }

  // --- .ent 파일 추출 (브라우저 전용: pako·Tar 필요) ---

  function parseEntFile(fileName, arrayBuffer) {
    let tarData;
    try {
      tarData = pako.inflate(new Uint8Array(arrayBuffer));
    } catch (_) {
      throw new Error(`'${fileName}'은(는) 유효한 .ent 파일이 아닙니다. (GZIP 해제 실패)`);
    }

    const entries = Tar.parse(tarData);
    let projectData = null;
    const resources = [];

    for (const entry of entries) {
      if (entry.name.includes('..')) continue;

      const basename = entry.name.split('/').pop();
      if (basename === 'project.json') {
        try {
          projectData = JSON.parse(textDecoder.decode(entry.data));
        } catch (_) {
          throw new Error(`'${fileName}'의 project.json 파싱에 실패했습니다.`);
        }
      } else if (entry.data.length > 0) {
        resources.push({ name: entry.name, data: entry.data });
      }
    }

    if (!projectData) {
      throw new Error(`'${fileName}'에서 project.json을 찾을 수 없습니다.`);
    }

    return { projectData, resources };
  }

  // --- TAR 출력 빌더 (gzip 스트리밍 + 세분 진행) ---

  async function buildOutputTar(mergedProject, allResources, onSub) {
    const projectJsonBytes = new TextEncoder().encode(
      JSON.stringify(mergedProject, null, 4)
    );

    // 디렉터리 구조 포함 엔트리 구성 (Python의 tar.add(arcname="temp")와 동일)
    const tarEntries = [{ name: 'temp/', data: new Uint8Array(0) }];
    const dirs = new Set(['temp/']);

    allResources.set('temp/project.json', projectJsonBytes);

    for (const [path, data] of allResources) {
      if (!path.startsWith('temp/')) continue;

      const segments = path.split('/');
      for (let d = 2; d < segments.length; d++) {
        const dir = segments.slice(0, d).join('/') + '/';
        if (!dirs.has(dir)) {
          tarEntries.push({ name: dir, data: new Uint8Array(0) });
          dirs.add(dir);
        }
      }

      tarEntries.push({ name: path, data });
    }

    if (onSub) onSub(0, 'TAR 구성 중...');
    const tarBytes = Tar.create(tarEntries);

    // gzip: pako.Deflate 스트리밍으로 입력 소비량 기반 진행 보고. 미지원 시 일괄 압축으로 폴백.
    if (typeof pako.Deflate === 'function') {
      const gzip = new pako.Deflate({ level: 6, gzip: true });
      const CHUNK = 1 << 20; // 1MB
      const total = tarBytes.length || 1;
      for (let off = 0; off < tarBytes.length; off += CHUNK) {
        const end = Math.min(off + CHUNK, tarBytes.length);
        gzip.push(tarBytes.subarray(off, end), end >= tarBytes.length);
        if (gzip.err) throw new Error('압축 실패: ' + (gzip.msg || gzip.err));
        if (onSub) onSub(0.1 + 0.9 * (end / total), `압축 중... ${Math.round((end / total) * 100)}%`);
        await yieldToUI();
      }
      return gzip.result;
    }

    if (onSub) onSub(0.5, '압축 중...');
    return pako.gzip(tarBytes, { level: 6 });
  }

  // --- 메인 오케스트레이션 ---
  //
  // 진행률 단계 예산(%): 파일 수집/병합 0–82 (누적 처리 바이트 비례) ·
  //                      후처리 82–88 · 출력 빌드(tar+gzip) 88–100.

  const INGEST_END = 82; // 파일 수집/병합 구간 상한
  const POST_END = 88;   // 후처리 구간 상한

  async function performMerge(files, options, onProgress) {
    const globalUsedIds = new Set();
    const allResources = new Map();
    let mergedProject = null;

    const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0) || 1;
    let processedBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const remainingCount = files.length - i - 1;
      const remainingBytes = Math.max(0, totalBytes - processedBytes);

      // 이 파일 시작 시점 = 이미 처리한 바이트 비율 → 큰 파일이 더 큰 진행을 차지
      onProgress(
        Math.round((processedBytes / totalBytes) * INGEST_END),
        `처리 중: ${file.name} (${i + 1}/${files.length}) · 남은 ${remainingCount}개 · ${formatBytes(remainingBytes)}`
      );

      const arrayBuffer = await file.arrayBuffer();
      await yieldToUI();

      const { projectData, resources } = parseEntFile(file.name, arrayBuffer);

      for (const r of resources) {
        allResources.set(r.name, r.data);
      }

      processSingleProject(projectData, globalUsedIds);

      if (mergedProject === null) {
        mergedProject = projectData;
      } else {
        mergeDicts(mergedProject, projectData);
      }

      processedBytes += (file.size || 0);
      await yieldToUI();
    }

    if (!mergedProject) {
      throw new Error('유효한 project.json 데이터를 찾을 수 없습니다.');
    }

    // 후처리 82–88
    onProgress(INGEST_END + 2, '중복 변수 정리 중...');
    dedupSpecialVariables(mergedProject);
    if (options.hideTimerAnswer) hideTimerAnswerVariables(mergedProject);
    onProgress(POST_END, '메타데이터 적용 중...');
    applyMetadata(mergedProject, options.clearRemake);
    await yieldToUI();

    // 출력 빌드 88–100 (frac 0..1 → POST_END..100)
    const gzBytes = await buildOutputTar(mergedProject, allResources, (frac, msg) => {
      onProgress(POST_END + Math.round((100 - POST_END) * frac), msg);
    });

    onProgress(100, '완료!');
    return new Blob([gzBytes], { type: 'application/gzip' });
  }

  return {
    performMerge,
    // 아래는 node 단위 테스트 대상 순수 함수 (브라우저에서도 노출되나 무해)
    deepEqual, deepIncludes, mergeDicts, generateId, processSingleProject,
    dedupSpecialVariables, hideTimerAnswerVariables, applyMetadata, formatBytes,
  };
})();

// node(test) 환경에서 require 가능하게. 브라우저에선 module이 undefined라 무시됨.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MergeEngine;
}
