// SEO 라우트: /sitemap.xml 동적 생성.
// 문제 폴더를 매 요청마다 훑어 새 문제를 자동 반영 (서버 재시작 불필요).

const fs = require('fs');
const express = require('express');
const { PROBLEMS_DIR, SITE_URL } = require('../config');
const { readMeta } = require('../services/problemService');

const router = express.Router();

router.get('/sitemap.xml', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
        { loc: SITE_URL + '/',                priority: '1.0', changefreq: 'weekly' },
        { loc: SITE_URL + '/contribute.html', priority: '0.7', changefreq: 'monthly' },
        { loc: SITE_URL + '/merge',           priority: '0.7', changefreq: 'monthly' },
        { loc: SITE_URL + '/editor.html',     priority: '0.5', changefreq: 'monthly' },
        { loc: SITE_URL + '/privacy.html',    priority: '0.3', changefreq: 'yearly' },
        { loc: SITE_URL + '/terms.html',      priority: '0.3', changefreq: 'yearly' }
    ];
    try {
        const entries = fs.readdirSync(PROBLEMS_DIR, { withFileTypes: true });
        entries.forEach(entry => {
            if (!entry.isDirectory()) return;
            if (!/^\d+$/.test(entry.name)) return;
            const id = parseInt(entry.name, 10);
            if (!readMeta(id)) return;
            urls.push({
                loc: SITE_URL + '/editor.html?problem=' + id,
                priority: '0.8',
                changefreq: 'monthly'
            });
        });
    } catch (e) {}

    const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map(u =>
            '  <url>\n' +
            '    <loc>' + u.loc + '</loc>\n' +
            '    <lastmod>' + today + '</lastmod>\n' +
            '    <changefreq>' + u.changefreq + '</changefreq>\n' +
            '    <priority>' + u.priority + '</priority>\n' +
            '  </url>'
        ).join('\n') +
        '\n</urlset>\n';
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(body);
});

module.exports = router;
