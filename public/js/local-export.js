// 현재 Entry 프로젝트를 브라우저 안에서 .ent(gzip tar)로 내보낸다.
// 이전 서버 내보내기 엔드포인트를 대체하며 프로젝트와 자산은 외부로 전송되지 않는다.
//
// 선행 스크립트: js/merge/pako.min.js, js/merge/tar.js

const Code205Export = (() => {
    'use strict';

    const MEDIA_EXT_RE = /\.(svg|png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a)$/i;
    const IMAGE_EXT_RE = /\.(svg|png|jpg|jpeg|gif|webp)$/i;
    const textEncoder = new TextEncoder();

    function randomEntryId() {
        const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        let value = '';
        for (let i = 0; i < bytes.length; i++) {
            value += chars[bytes[i] % chars.length];
        }
        return value;
    }

    function extensionOf(url) {
        try {
            return (new URL(url, location.href).pathname.match(/\.([^.\/]+)$/) || [])[1]?.toLowerCase() || '';
        } catch (_) {
            return '';
        }
    }

    function mimeForExtension(extension) {
        const values = {
            svg: 'image/svg+xml',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            ogg: 'audio/ogg',
            m4a: 'audio/mp4',
        };
        return values[extension] || 'application/octet-stream';
    }

    function loadImage(blob) {
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(image);
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('이미지 변환을 위한 디코딩에 실패했습니다.'));
            };
            image.src = objectUrl;
        });
    }

    function canvasToPng(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error('PNG 변환에 실패했습니다.'));
                    return;
                }
                blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject);
            }, 'image/png');
        });
    }

    async function rasterizeImage(bytes, mime, maxSize) {
        const image = await loadImage(new Blob([bytes], { type: mime }));
        const sourceWidth = image.naturalWidth || image.width || 1;
        const sourceHeight = image.naturalHeight || image.height || 1;
        const scale = maxSize
            ? Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight))
            : 1;
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D 컨텍스트를 사용할 수 없습니다.');
        context.drawImage(image, 0, 0, width, height);
        return canvasToPng(canvas);
    }

    function ensureDir(pathValue, buckets, seen) {
        if (seen.has(pathValue)) return;
        seen.add(pathValue);
        buckets.push({ name: pathValue, data: new Uint8Array(0) });
    }

    async function fetchLocalAsset(url) {
        if (!url || /^(data:|https?:)/i.test(url)) return null;
        const resolved = new URL(url, location.href);
        if (resolved.origin !== location.origin || !MEDIA_EXT_RE.test(resolved.pathname)) {
            return null;
        }
        const response = await fetch(resolved.href);
        if (!response.ok) {
            throw new Error(`작품 자산을 불러오지 못했습니다: ${resolved.pathname} (${response.status})`);
        }
        return {
            bytes: new Uint8Array(await response.arrayBuffer()),
            extension: extensionOf(resolved.href),
        };
    }

    async function buildEnt(projectInput) {
        if (typeof pako === 'undefined' || typeof Tar === 'undefined') {
            throw new Error('작품 압축 모듈이 로드되지 않았습니다.');
        }
        if (!projectInput || !Array.isArray(projectInput.objects)) {
            throw new Error('내보낼 프로젝트 데이터가 올바르지 않습니다.');
        }

        // Entry.exportProject 반환값을 직접 변경하지 않도록 깊은 복사한다.
        const project = JSON.parse(JSON.stringify(projectInput));
        const dirs1 = [];
        const dirs2 = [];
        const dirs3 = [];
        const payloads = [];
        const seenDirs = new Set(['temp/']);
        const assetCache = new Map();

        async function bundleAsset(url, kind) {
            if (!url || /^(\.\/)?temp\//.test(url) || /^(data:|https?:)/i.test(url)) {
                return { fileurl: url, filename: null };
            }
            if (assetCache.has(url)) return assetCache.get(url);

            let asset;
            try {
                asset = await fetchLocalAsset(url);
            } catch (error) {
                console.warn('CODE 205 export: asset fetch failed; keeping original URL.', url, error);
                const passthrough = { fileurl: url, filename: null };
                assetCache.set(url, passthrough);
                return passthrough;
            }
            if (!asset) {
                const passthrough = { fileurl: url, filename: null };
                assetCache.set(url, passthrough);
                return passthrough;
            }

            const hash = randomEntryId();
            const level1 = hash.slice(0, 2);
            const level2 = hash.slice(2, 4);
            ensureDir(`temp/${level1}/`, dirs1, seenDirs);
            ensureDir(`temp/${level1}/${level2}/`, dirs2, seenDirs);
            ensureDir(`temp/${level1}/${level2}/${kind}/`, dirs3, seenDirs);

            const fileurl = `temp/${level1}/${level2}/${kind}/${hash}.${asset.extension}`;
            payloads.push({ name: fileurl, data: asset.bytes });

            if (kind === 'image' && IMAGE_EXT_RE.test('.' + asset.extension)) {
                if (asset.extension === 'svg') {
                    try {
                        const fullPng = await rasterizeImage(
                            asset.bytes,
                            mimeForExtension(asset.extension),
                            null
                        );
                        payloads.push({
                            name: `temp/${level1}/${level2}/image/${hash}.png`,
                            data: fullPng,
                        });
                    } catch (error) {
                        console.warn('CODE 205 export: SVG rasterization failed; keeping SVG only.', url, error);
                    }
                }

                ensureDir(`temp/${level1}/${level2}/thumb/`, dirs3, seenDirs);
                try {
                    const thumbnail = await rasterizeImage(
                        asset.bytes,
                        mimeForExtension(asset.extension),
                        96
                    );
                    payloads.push({
                        name: `temp/${level1}/${level2}/thumb/${hash}.png`,
                        data: thumbnail,
                    });
                } catch (error) {
                    console.warn('CODE 205 export: thumbnail generation failed; keeping original image.', url, error);
                }
            }

            const bundled = { fileurl, filename: hash };
            assetCache.set(url, bundled);
            return bundled;
        }

        for (const object of project.objects) {
            if (!object || !object.sprite) continue;
            for (const picture of (object.sprite.pictures || [])) {
                if (!picture.fileurl) continue;
                const bundled = await bundleAsset(picture.fileurl, 'image');
                picture.fileurl = bundled.fileurl;
                if (bundled.filename) picture.filename = bundled.filename;
                delete picture.thumbUrl;
            }
            for (const sound of (object.sprite.sounds || [])) {
                if (!sound.fileurl) continue;
                const bundled = await bundleAsset(sound.fileurl, 'sound');
                sound.fileurl = bundled.fileurl;
                if (bundled.filename) sound.filename = bundled.filename;
            }
        }

        const entries = [
            { name: 'temp/', data: new Uint8Array(0) },
            ...dirs1,
            {
                name: 'temp/project.json',
                data: textEncoder.encode(JSON.stringify(project)),
            },
            ...dirs2,
            ...dirs3,
            ...payloads,
        ];
        return pako.gzip(Tar.create(entries), { level: 6 });
    }

    function download(bytes) {
        const timestamp = new Date().toISOString()
            .replace(/[-:]/g, '')
            .replace(/\..+/, '')
            .replace('T', '-');
        const blob = new Blob([bytes], { type: 'application/gzip' });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `code205-${timestamp}.ent`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }

    async function exportProject(project) {
        const bytes = await buildEnt(project);
        download(bytes);
    }

    return {
        buildEnt,
        exportProject,
        randomEntryId,
    };
})();

if (typeof window !== 'undefined') {
    window.Code205Export = Code205Export;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code205Export;
}
