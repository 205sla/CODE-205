'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.pako = require('../public/js/merge/pako.min.js');
global.Tar = require('../public/js/merge/tar.js');
const localExport = require('../public/js/local-export.js');

describe('브라우저 .ent 내보내기', () => {
    it('자산 없는 프로젝트를 gzip tar로 만들고 project.json을 복원한다', async () => {
        const source = {
            name: '정적 내보내기 테스트',
            scenes: [{ id: 'scene1', name: '장면 1' }],
            variables: [],
            objects: [],
        };

        const gzip = await localExport.buildEnt(source);
        assert.ok(gzip instanceof Uint8Array);
        assert.ok(gzip.length > 0);

        const entries = global.Tar.parse(global.pako.inflate(gzip));
        const projectEntry = entries.find(entry => entry.name === 'temp/project.json');
        assert.ok(projectEntry, 'temp/project.json이 있어야 함');
        const restored = JSON.parse(new TextDecoder().decode(projectEntry.data));
        assert.deepEqual(restored, source);
    });

    it('이미지 래스터화가 실패해도 원본 자산으로 내보내기를 계속한다', async () => {
        const previous = {
            location: global.location,
            fetch: global.fetch,
            Image: global.Image,
            warn: console.warn,
        };
        let warningCount = 0;

        global.location = {
            href: 'https://code.205.kr/editor.html?problem=1',
            origin: 'https://code.205.kr',
        };
        global.fetch = async () => ({
            ok: true,
            status: 200,
            arrayBuffer: async () => new TextEncoder()
                .encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
                .buffer,
        });
        global.Image = class {
            set src(_value) {
                queueMicrotask(() => this.onerror(new Error('decode failed')));
            }
        };
        console.warn = () => { warningCount += 1; };

        try {
            const source = {
                scenes: [{ id: 'scene1', name: '장면 1' }],
                variables: [],
                objects: [{
                    id: 'object1',
                    sprite: {
                        pictures: [{
                            id: 'picture1',
                            fileurl: '/images/test.svg',
                            thumbUrl: '/images/test.svg',
                        }],
                        sounds: [],
                    },
                }],
            };

            const gzip = await localExport.buildEnt(source);
            const entries = global.Tar.parse(global.pako.inflate(gzip));
            const projectEntry = entries.find(entry => entry.name === 'temp/project.json');
            const restored = JSON.parse(new TextDecoder().decode(projectEntry.data));
            const picture = restored.objects[0].sprite.pictures[0];

            assert.match(picture.fileurl, /^temp\/[a-z0-9]{2}\/[a-z0-9]{2}\/image\/[a-z0-9]{32}\.svg$/);
            assert.equal(picture.filename.length, 32);
            assert.equal('thumbUrl' in picture, false);
            assert.ok(entries.some(entry => entry.name === picture.fileurl));
            assert.equal(entries.some(entry => entry.name.endsWith('.png')), false);
            assert.equal(warningCount, 2);
        } finally {
            if (previous.location === undefined) delete global.location;
            else global.location = previous.location;
            if (previous.fetch === undefined) delete global.fetch;
            else global.fetch = previous.fetch;
            if (previous.Image === undefined) delete global.Image;
            else global.Image = previous.Image;
            console.warn = previous.warn;
        }
    });
});
