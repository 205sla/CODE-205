'use strict';

// GitHub Pages용 완전 정적 산출물 생성기.
// - public/을 _site/로 복사하되 서버 전용 회원·상태 파일은 제외
// - problems/*/project.ent를 project.json + 공유 자산 풀로 변환
// - 문제 목록, 문제 설명, 테스트, sitemap.xml을 생성
//
// 서버 소스(src/)와 운영 DB는 건드리지 않는다. 전환 기간의 롤백 자산으로
// 그대로 보존하며, Pages에는 이 스크립트가 만든 _site/만 업로드한다.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT_DIR, '_site');
const SITE_URL = 'https://code.205.kr';

const EXCLUDED_PUBLIC_PATHS = new Set([
    'login.html',
    'signup.html',
    'profile.html',
    'status.html',
    'js/api.js',
    'js/auth-page.js',
    'js/common-header.js',
    'js/profile-page.js',
    'js/status.js',
    'js/submission-sync.js',
    'css/auth.css',
    'css/profile.css',
    'css/status.css',
]);

const EXCLUDED_PUBLIC_PREFIXES = [
    'lib/entry-lms',
    'lib/vendor/socket.io-client',
];

const DEFAULT_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

const EDITOR_CSP = DEFAULT_CSP.replace(
    "script-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:"
);

function readText(filePath) {
    let value = fs.readFileSync(filePath, 'utf8');
    if (value.charCodeAt(0) === 0xFEFF) value = value.slice(1);
    return value;
}

function readJson(filePath) {
    return JSON.parse(readText(filePath));
}

function normalizeTarPath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

function assertPortableAssetReference(value, problemId) {
    if (typeof value !== 'string' || !value) return;

    const trimmed = value.trim();
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
    const hasUnsupportedScheme = scheme && scheme[1].toLowerCase() !== 'data';
    if (/^\/\//.test(trimmed) || hasUnsupportedScheme) {
        throw new Error(
            `${problemId}: project.json에 외부 또는 비이식 자산 URL을 사용할 수 없습니다: ${value}`
        );
    }
}

function parseTar(buffer) {
    const entries = new Map();
    let offset = 0;
    while (offset + 512 <= buffer.length) {
        const header = buffer.subarray(offset, offset + 512);
        let allZero = true;
        for (let i = 0; i < header.length; i++) {
            if (header[i] !== 0) {
                allZero = false;
                break;
            }
        }
        if (allZero) break;

        const readField = (start, length, encoding = 'utf8') =>
            header.toString(encoding, start, start + length).replace(/\0.*/, '');
        const name = readField(0, 100);
        const prefix = readField(345, 155);
        const fullName = normalizeTarPath(prefix ? prefix + '/' + name : name);
        const size = parseInt(readField(124, 12, 'ascii').trim(), 8) || 0;
        const type = String.fromCharCode(header[156] || 48);
        const dataStart = offset + 512;

        if (type !== '5' && fullName) {
            entries.set(fullName, Buffer.from(buffer.subarray(dataStart, dataStart + size)));
        }
        offset = dataStart + Math.ceil(size / 512) * 512;
    }
    return entries;
}

function safeResetOutput(outDir) {
    const resolved = path.resolve(outDir);
    const workspace = path.resolve(ROOT_DIR);
    if (resolved === workspace || !resolved.startsWith(workspace + path.sep)) {
        throw new Error('Refusing to reset output outside the project: ' + resolved);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
    fs.mkdirSync(resolved, { recursive: true });
}

function copyPublic(publicDir, outDir) {
    fs.cpSync(publicDir, outDir, {
        recursive: true,
        filter(source) {
            if (source === publicDir) return true;
            const relative = path.relative(publicDir, source).replace(/\\/g, '/');
            return !EXCLUDED_PUBLIC_PATHS.has(relative) &&
                !EXCLUDED_PUBLIC_PREFIXES.some(prefix =>
                    relative === prefix || relative.startsWith(prefix + '/')
                );
        },
    });
}

function walkFiles(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(fullPath));
        else files.push(fullPath);
    }
    return files;
}

function hardenHtml(outDir) {
    const htmlFiles = walkFiles(outDir).filter(file => file.endsWith('.html'));
    for (const htmlFile of htmlFiles) {
        let html = fs.readFileSync(htmlFile, 'utf8');
        if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) continue;

        const relative = path.relative(outDir, htmlFile).replace(/\\/g, '/');
        const policy = relative === 'editor.html' ? EDITOR_CSP : DEFAULT_CSP;
        const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
        const charset = /<meta\b[^>]*charset[^>]*>/i;
        html = charset.test(html)
            ? html.replace(charset, match => match + '\n  ' + meta)
            : html.replace(/<head\b[^>]*>/i, match => match + '\n  ' + meta);
        fs.writeFileSync(htmlFile, html);
    }
}

function injectTransitionNotice(outDir) {
    const htmlFiles = walkFiles(outDir).filter(file => file.endsWith('.html'));
    for (const htmlFile of htmlFiles) {
        let html = fs.readFileSync(htmlFile, 'utf8');
        if (!html.includes('css/transition-notice.css')) {
            html = html.replace(
                /<\/head>/i,
                '  <link href="/css/transition-notice.css" rel="stylesheet">\n</head>'
            );
        }
        if (!html.includes('js/transition-notice.js')) {
            html = html.replace(
                /<\/body>/i,
                '  <script src="/js/transition-notice.js"></script>\n</body>'
            );
        }
        fs.writeFileSync(htmlFile, html);
    }
}

function makeRetiredPage(title, message) {
    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title} · CODE 205</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link href="/css/common.css" rel="stylesheet">
  <link href="/css/contribute.css" rel="stylesheet">
</head>
<body>
  <header>
    <a href="/" class="back-link">← 메인</a>
    <span class="header-title">CODE 205 <span class="beta-badge">BETA</span></span>
  </header>
  <main class="container">
    <h1>${title}</h1>
    <p class="lead">${message}</p>
    <p>문제 클리어 기록은 이 브라우저의 로컬 저장소에 계속 보관됩니다. 브라우저 데이터 삭제나 다른 기기에서는 복구되지 않습니다.</p>
    <p><a href="/">문제 목록으로 돌아가기</a></p>
  </main>
  <script src="/js/common-footer.js"></script>
</body>
</html>
`;
}

function writeCompatibilityPages(outDir) {
    const accountPage = makeRetiredPage(
        '회원 기능 종료 안내',
        'CODE 205는 계정 없이 사용하는 정적 학습 사이트로 전환되었습니다. 로그인, 가입, 프로필 및 서버 동기화 기능은 더 이상 제공하지 않습니다.'
    );
    for (const name of ['login.html', 'signup.html', 'profile.html']) {
        fs.writeFileSync(path.join(outDir, name), accountPage);
    }

    const statusPage = makeRetiredPage(
        '상태 페이지 종료 안내',
        '서버 기반 상태 모니터 기능은 정적 사이트 전환과 함께 종료되었습니다.'
    );
    fs.writeFileSync(path.join(outDir, 'status.html'), statusPage);
    const statusDir = path.join(outDir, 'Status');
    fs.mkdirSync(statusDir, { recursive: true });
    fs.writeFileSync(path.join(statusDir, 'index.html'), statusPage);
}

function writeMergeDirectory(outDir) {
    const mergeHtmlPath = path.join(outDir, 'merge.html');
    const mergeDir = path.join(outDir, 'merge');
    fs.mkdirSync(mergeDir, { recursive: true });
    fs.copyFileSync(mergeHtmlPath, path.join(mergeDir, 'index.html'));
}

function buildProblemData(rootDir, outDir) {
    const problemsDir = path.join(rootDir, 'problems');
    const problemOutRoot = path.join(outDir, 'data', 'problems');
    const assetOutRoot = path.join(outDir, 'data', 'assets');
    fs.mkdirSync(problemOutRoot, { recursive: true });
    fs.mkdirSync(assetOutRoot, { recursive: true });

    const problemDirs = fs.readdirSync(problemsDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
        .sort((a, b) => Number(a.name) - Number(b.name));

    const manifest = [];
    const writtenAssets = new Set();

    for (const entry of problemDirs) {
        const idNumber = Number(entry.name);
        const paddedId = String(idNumber).padStart(3, '0');
        const sourceDir = path.join(problemsDir, entry.name);
        const metaPath = path.join(sourceDir, 'meta.json');
        if (!fs.existsSync(metaPath)) continue;

        const meta = readJson(metaPath);
        const description = fs.existsSync(path.join(sourceDir, 'description.md'))
            ? readText(path.join(sourceDir, 'description.md'))
            : '';
        const tests = fs.existsSync(path.join(sourceDir, 'tests.json'))
            ? readJson(path.join(sourceDir, 'tests.json'))
            : { test: [], submit: [] };
        const hasTests = !!(
            (Array.isArray(tests.test) && tests.test.length) ||
            (Array.isArray(tests.submit) && tests.submit.length)
        );

        const problemOutDir = path.join(problemOutRoot, paddedId);
        fs.mkdirSync(problemOutDir, { recursive: true });

        const problemRecord = {
            id: idNumber,
            title: meta.title || ('문제 ' + idNumber),
            difficulty: meta.difficulty || 0,
            author: meta.author || null,
            contributors: Array.isArray(meta.contributors) ? meta.contributors : [],
            category: (meta.category === 'sample' || meta.category === 'tutorial')
                ? meta.category
                : null,
            sprites: Array.isArray(meta.sprites) ? meta.sprites : null,
            hasTests,
            description,
        };
        fs.writeFileSync(
            path.join(problemOutDir, 'problem.json'),
            JSON.stringify(problemRecord)
        );
        fs.writeFileSync(
            path.join(problemOutDir, 'tests.json'),
            JSON.stringify(tests)
        );

        const entPath = path.join(sourceDir, 'project.ent');
        if (fs.existsSync(entPath)) {
            const tarEntries = parseTar(zlib.gunzipSync(fs.readFileSync(entPath)));
            const projectBuffer = tarEntries.get('temp/project.json');
            if (!projectBuffer) {
                throw new Error(`${paddedId}: project.ent에 temp/project.json이 없습니다.`);
            }
            const sourceJson = projectBuffer.toString('utf8')
                .replace(/\.\/bower_components\/entry-js\//g, 'lib/entry-js/')
                .replace(/\.\/node_modules\/@entrylabs\/entry\//g, 'lib/entry-js/');
            const project = JSON.parse(sourceJson);

            const rewriteAsset = (value) => {
                if (typeof value !== 'string' || !value) return value;
                assertPortableAssetReference(value, paddedId);
                if (/^(data:|\/)/i.test(value)) return value;
                const normalized = normalizeTarPath(value);
                if (/^lib\//.test(normalized)) return '/' + normalized;
                if (!/^temp\//.test(normalized)) return value;

                const asset = tarEntries.get(normalized);
                if (!asset) {
                    throw new Error(`${paddedId}: project.json 자산을 찾을 수 없습니다: ${normalized}`);
                }
                const extension = path.extname(normalized).toLowerCase() || '.bin';
                const digest = crypto.createHash('sha256').update(asset).digest('hex');
                const fileName = digest + extension;
                if (!writtenAssets.has(fileName)) {
                    fs.writeFileSync(path.join(assetOutRoot, fileName), asset);
                    writtenAssets.add(fileName);
                }
                return '/data/assets/' + fileName;
            };

            for (const object of (project.objects || [])) {
                if (!object || !object.sprite) continue;
                for (const picture of (object.sprite.pictures || [])) {
                    if (picture.fileurl) picture.fileurl = rewriteAsset(picture.fileurl);
                    if (picture.thumbUrl) picture.thumbUrl = rewriteAsset(picture.thumbUrl);
                }
                for (const sound of (object.sprite.sounds || [])) {
                    if (sound.fileurl) sound.fileurl = rewriteAsset(sound.fileurl);
                }
            }

            fs.writeFileSync(
                path.join(problemOutDir, 'project.json'),
                JSON.stringify(project)
            );
        }

        manifest.push({
            id: idNumber,
            title: problemRecord.title,
            difficulty: problemRecord.difficulty,
            author: problemRecord.author,
            contributors: problemRecord.contributors,
            category: problemRecord.category,
            hasTests,
        });
    }

    fs.writeFileSync(
        path.join(outDir, 'data', 'problems.json'),
        JSON.stringify(manifest)
    );
    return {
        problemCount: manifest.length,
        problemIds: manifest.map(problem => problem.id),
        assetCount: writtenAssets.size,
    };
}

function xmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function writeSitemap(outDir, problemIds) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
        ['/', '1.0', 'weekly'],
        ['/contribute.html', '0.7', 'monthly'],
        ['/merge/', '0.7', 'monthly'],
        ['/editor.html', '0.5', 'monthly'],
        ['/privacy.html', '0.3', 'yearly'],
        ['/terms.html', '0.3', 'yearly'],
    ];
    for (const id of problemIds) {
        urls.push(['/editor.html?problem=' + id, '0.8', 'monthly']);
    }
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map(([pathname, priority, changefreq]) =>
            '  <url>\n' +
            `    <loc>${xmlEscape(SITE_URL + pathname)}</loc>\n` +
            `    <lastmod>${today}</lastmod>\n` +
            `    <changefreq>${changefreq}</changefreq>\n` +
            `    <priority>${priority}</priority>\n` +
            '  </url>'
        ).join('\n') +
        '\n</urlset>\n';
    fs.writeFileSync(path.join(outDir, 'sitemap.xml'), body);
}

function buildStaticSite(options = {}) {
    const rootDir = path.resolve(options.rootDir || ROOT_DIR);
    const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
    safeResetOutput(outDir);
    copyPublic(path.join(rootDir, 'public'), outDir);
    writeCompatibilityPages(outDir);
    writeMergeDirectory(outDir);
    const result = buildProblemData(rootDir, outDir);
    writeSitemap(outDir, result.problemIds);
    injectTransitionNotice(outDir);
    hardenHtml(outDir);
    fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
    return { outDir, ...result };
}

if (require.main === module) {
    const result = buildStaticSite();
    console.log(
        `GitHub Pages build complete: ${result.problemCount} problems, ` +
        `${result.assetCount} shared assets -> ${result.outDir}`
    );
}

module.exports = {
    assertPortableAssetReference,
    buildStaticSite,
    parseTar,
    normalizeTarPath,
};
