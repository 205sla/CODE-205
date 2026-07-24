'use strict';

// _site/ 로컬 검증용 최소 정적 서버. 외부 의존성 없이 Pages의 clean URL
// 동작(/merge, /Status)과 동일한 형태로 산출물을 확인한다.

const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..', '_site');
const port = Number(process.env.PAGES_PREVIEW_PORT || 4173);
const mime = {
    '.css': 'text/css; charset=utf-8',
    '.ent': 'application/gzip',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.webp': 'image/webp',
    '.xml': 'application/xml; charset=utf-8',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.error('Missing _site/index.html. Run npm run build:pages first.');
    process.exit(1);
}

http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
    }
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (_) {
        res.writeHead(400).end();
        return;
    }

    let relative = pathname.replace(/^\/+/, '');
    if (!relative) relative = 'index.html';
    let filePath = path.resolve(root, relative);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
    }

    try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch (_) {
        if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
            filePath += '.html';
        }
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    res.writeHead(200, {
        'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
        res.end();
        return;
    }
    fs.createReadStream(filePath).pipe(res);
}).listen(port, '127.0.0.1', () => {
    console.log(`CODE 205 Pages preview: http://127.0.0.1:${port}`);
});
