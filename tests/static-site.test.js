'use strict';

const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { buildStaticSite } = require('../tools/build-pages');

const ROOT_DIR = path.resolve(__dirname, '..');
let tmpDir;
let siteDir;
let result;

function walkFiles(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(fullPath));
        else files.push(fullPath);
    }
    return files;
}

describe('GitHub Pages 정적 빌드', () => {
    before(() => {
        tmpDir = fs.mkdtempSync(path.join(ROOT_DIR, '.tmp-pages-test-'));
        siteDir = path.join(tmpDir, 'site');
        result = buildStaticSite({ outDir: siteDir });
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('100개 문제와 공유 자산을 생성한다', () => {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(siteDir, 'data', 'problems.json'), 'utf8')
        );
        assert.equal(manifest.length, 100);
        assert.equal(result.problemCount, 100);
        assert.ok(result.assetCount > 0);
        assert.ok(result.assetCount < 100, '중복 제거된 공유 자산 수가 비정상적으로 많음');
    });

    it('모든 문제 데이터와 project.json을 생성한다', () => {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(siteDir, 'data', 'problems.json'), 'utf8')
        );
        for (const problem of manifest) {
            const id = String(problem.id).padStart(3, '0');
            const problemDir = path.join(siteDir, 'data', 'problems', id);
            assert.ok(fs.existsSync(path.join(problemDir, 'problem.json')), id);
            assert.ok(fs.existsSync(path.join(problemDir, 'tests.json')), id);
            assert.ok(fs.existsSync(path.join(problemDir, 'project.json')), id);
        }
    });

    it('project.json의 모든 same-origin 자산 참조가 실제 파일을 가리킨다', () => {
        const projects = walkFiles(path.join(siteDir, 'data', 'problems'))
            .filter(file => path.basename(file) === 'project.json');
        const refs = new Set();
        const externalRefs = new Set();
        const collect = value => {
            if (!value || typeof value !== 'object') return;
            if (Array.isArray(value)) {
                value.forEach(collect);
                return;
            }
            for (const [key, nested] of Object.entries(value)) {
                if ((key === 'fileurl' || key === 'thumbUrl') && typeof nested === 'string') {
                    if (nested.startsWith('/')) refs.add(nested);
                    if (/^https?:\/\//i.test(nested)) externalRefs.add(nested);
                }
                collect(nested);
            }
        };
        projects.forEach(file => collect(JSON.parse(fs.readFileSync(file, 'utf8'))));
        assert.ok(refs.size > 0);
        assert.deepEqual([...externalRefs], []);
        for (const ref of refs) {
            assert.ok(fs.existsSync(path.join(siteDir, ref.slice(1))), ref);
        }
    });

    it('excludes unused Entry online-service bundles from the Pages artifact', () => {
        const excluded = [
            'lib/entry-lms',
            'lib/vendor/socket.io-client',
        ];
        for (const relative of excluded) {
            assert.equal(fs.existsSync(path.join(siteDir, relative)), false, relative);
        }

        const editor = fs.readFileSync(path.join(siteDir, 'editor.html'), 'utf8');
        for (const relative of excluded) assert.doesNotMatch(editor, new RegExp(relative));

        const guardIndex = editor.indexOf('js/network-guard.js');
        const legacyVideoIndex = editor.indexOf('lib/legacy-video/index.js');
        const entryIndex = editor.indexOf('lib/entry-js/extern/lang/ko.js');
        assert.ok(guardIndex >= 0);
        assert.ok(entryIndex > guardIndex);
        assert.ok(legacyVideoIndex > guardIndex);
        assert.ok(fs.existsSync(path.join(siteDir, 'lib', 'legacy-video', 'index.js')));
    });

    it('adds same-origin Content Security Policy to every generated HTML page', () => {
        const htmlFiles = walkFiles(siteDir).filter(file => file.endsWith('.html'));
        assert.ok(htmlFiles.length > 0);
        for (const file of htmlFiles) {
            const html = fs.readFileSync(file, 'utf8');
            assert.match(html, /http-equiv=["']Content-Security-Policy["']/i);
            assert.match(html, /connect-src 'self'/);
            assert.match(html, /object-src 'none'/);
        }

        const editor = fs.readFileSync(path.join(siteDir, 'editor.html'), 'utf8');
        assert.match(editor, /script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:/);
    });

    it('injects the seven-day transition notice into every generated HTML page', () => {
        const htmlFiles = walkFiles(siteDir).filter(file => file.endsWith('.html'));
        for (const file of htmlFiles) {
            const html = fs.readFileSync(file, 'utf8');
            assert.match(html, /\/css\/transition-notice\.css/);
            assert.match(html, /\/js\/transition-notice\.js/);
        }

        const script = fs.readFileSync(
            path.join(siteDir, 'js', 'transition-notice.js'),
            'utf8'
        );
        assert.match(script, /2026-08-01T00:00:00\+09:00/);
        assert.match(script, /별도 백업을 남기지 않았습니다/);
        assert.match(script, /문제 풀이는 계속 이용할 수 있습니다/);
    });

    it('does not load executable scripts or stylesheets from external origins', () => {
        const offenders = [];
        const htmlFiles = walkFiles(siteDir).filter(file => file.endsWith('.html'));

        for (const htmlFile of htmlFiles) {
            const html = fs.readFileSync(htmlFile, 'utf8');
            const scripts = html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/gi) || [];
            const styles = (html.match(/<link\b[^>]*>/gi) || [])
                .filter(tag => /\brel\s*=\s*["'][^"']*\bstylesheet\b[^"']*["']/i.test(tag));

            for (const tag of [...scripts, ...styles]) {
                const attribute = tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
                if (attribute && /^(?:https?:)?\/\//i.test(attribute[1])) {
                    offenders.push(
                        `${path.relative(siteDir, htmlFile)} -> ${attribute[1]}`
                    );
                }
            }
        }

        assert.deepEqual(offenders, []);
    });

    it('Pages 산출물의 앱 HTML·JS에 서버 API 호출이 남지 않는다', () => {
        const candidates = [
            ...walkFiles(siteDir).filter(file => file.endsWith('.html')),
            ...walkFiles(path.join(siteDir, 'js')).filter(file => file.endsWith('.js')),
        ];
        const offenders = candidates.filter(file =>
            fs.readFileSync(file, 'utf8').includes('/api/')
        );
        assert.deepEqual(offenders, []);
    });

    it('에디터의 문제 메타데이터 네트워크 요청을 한 곳에서 캐시한다', () => {
        const editor = fs.readFileSync(path.join(siteDir, 'js', 'editor.js'), 'utf8');
        const directFetches = editor.match(
            /fetch\(problemDataUrl\(problemId,\s*['"]problem\.json['"]\)\)/g
        ) || [];
        assert.equal(directFetches.length, 1);
        assert.match(editor, /__problemMetaPromises/);
        assert.match(editor, /fetchProblemMeta\(problemId\)/);
    });

    it('HTML의 로컬 script와 stylesheet 참조가 모두 실제 파일을 가리킨다', () => {
        const missing = [];
        const htmlFiles = walkFiles(siteDir).filter(file => file.endsWith('.html'));

        for (const htmlFile of htmlFiles) {
            const html = fs.readFileSync(htmlFile, 'utf8');
            const tags = html.match(/<(?:script|link)\b[^>]*>/gi) || [];

            for (const tag of tags) {
                const attribute = tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
                if (!attribute) continue;
                const ref = attribute[1];
                if (/^(?:https?:|data:|mailto:|#)/i.test(ref)) continue;

                const pathname = decodeURIComponent(ref.split(/[?#]/, 1)[0]);
                if (!pathname) continue;
                let target = pathname.startsWith('/')
                    ? path.join(siteDir, pathname.slice(1))
                    : path.resolve(path.dirname(htmlFile), pathname);
                if (pathname.endsWith('/')) target = path.join(target, 'index.html');

                const relativeTarget = path.relative(siteDir, target);
                assert.ok(
                    relativeTarget !== '..' && !relativeTarget.startsWith('..' + path.sep),
                    `${path.relative(siteDir, htmlFile)} -> ${ref}`
                );
                if (!fs.existsSync(target)) {
                    missing.push(`${path.relative(siteDir, htmlFile)} -> ${ref}`);
                }
            }
        }

        assert.deepEqual(missing, []);
    });

    it('Pages 산출물에 서버·DB·비밀정보·해설 원본이 포함되지 않는다', () => {
        const relativeFiles = walkFiles(siteDir)
            .map(file => path.relative(siteDir, file).replaceAll(path.sep, '/'));
        const forbidden = relativeFiles.filter(file =>
            /^(?:src|db|node_modules)\//.test(file) ||
            /(?:^|\/)(?:\.env(?:\.|$)|solution\.txt$|ecosystem\.config\.js$)/.test(file)
        );
        assert.deepEqual(forbidden, []);
    });

    it('Jekyll 우회, clean /merge 및 호환 안내 페이지를 포함한다', () => {
        assert.equal(fs.existsSync(path.join(siteDir, 'CNAME')), false);
        assert.ok(fs.existsSync(path.join(siteDir, '.nojekyll')));
        assert.ok(fs.existsSync(path.join(siteDir, 'merge', 'index.html')));
        assert.ok(fs.existsSync(path.join(siteDir, 'Status', 'index.html')));
        for (const name of ['login.html', 'signup.html', 'profile.html']) {
            const html = fs.readFileSync(path.join(siteDir, name), 'utf8');
            assert.match(html, /회원 기능 종료 안내/);
        }
    });

    it('sitemap에 문제 URL 100개와 정적 페이지가 들어간다', () => {
        const sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');
        const problemUrls = sitemap.match(/editor\.html\?problem=\d+/g) || [];
        assert.equal(problemUrls.length, 100);
        assert.match(sitemap, /https:\/\/code\.205\.kr\/merge\//);
    });
});
