'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

describe('배포 안전장치', () => {
    it('Oracle 배포 워크플로가 남아 있지 않다', () => {
        assert.equal(
            fs.existsSync(path.join(ROOT_DIR, '.github', 'workflows', 'deploy.yml')),
            false
        );
    });

    it('Pages 워크플로가 main push에 반응한다', () => {
        const workflow = fs.readFileSync(
            path.join(ROOT_DIR, '.github', 'workflows', 'pages.yml'),
            'utf8'
        );

        assert.match(workflow, /^\s*push:/m);
        assert.match(workflow, /branches:\s*\[main\]/);
        assert.match(workflow, /npm run build:pages/);
        assert.match(workflow, /actions\/deploy-pages@v4/);
        assert.doesNotMatch(workflow, /\bssh\b/i);
        assert.doesNotMatch(workflow, /DEPLOY_(?:HOST|KEY|USER)/);
    });
});
