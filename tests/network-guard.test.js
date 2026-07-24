'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const networkGuard = require('../public/js/network-guard');

function makeRoot() {
    const documentAttributes = new Map();
    const calls = {
        fetch: 0,
        xhr: 0,
        websocket: 0,
        eventSource: 0,
        beacon: 0,
    };

    class FakeXMLHttpRequest {
        open() {
            calls.xhr += 1;
            return 'xhr-opened';
        }
    }

    class FakeWebSocket {
        constructor(url) {
            calls.websocket += 1;
            this.url = url;
        }
    }

    class FakeEventSource {
        constructor(url) {
            calls.eventSource += 1;
            this.url = url;
        }
    }

    const root = {
        location: new URL('https://code.205.kr/editor.html?problem=1'),
        fetch: async input => {
            calls.fetch += 1;
            return { input };
        },
        XMLHttpRequest: FakeXMLHttpRequest,
        WebSocket: FakeWebSocket,
        EventSource: FakeEventSource,
        navigator: {
            sendBeacon() {
                calls.beacon += 1;
                return true;
            },
        },
        console: {
            warn() {},
        },
        document: {
            documentElement: {
                setAttribute(name, value) {
                    documentAttributes.set(name, value);
                },
            },
        },
    };

    networkGuard.install(root);
    return { root, calls, documentAttributes };
}

describe('browser network guard', () => {
    it('allows same-origin HTTP requests and local URL forms', async () => {
        const { root, calls, documentAttributes } = makeRoot();

        await root.fetch('/data/problems.json');
        assert.equal(calls.fetch, 1);

        const xhr = new root.XMLHttpRequest();
        assert.equal(xhr.open('GET', './data/problems.json'), 'xhr-opened');
        assert.equal(calls.xhr, 1);

        assert.equal(root.__CODE205_NETWORK_GUARD__.isAllowed('data:text/plain,ok'), true);
        assert.equal(root.__CODE205_NETWORK_GUARD__.isAllowed('blob:https://code.205.kr/id'), true);
        assert.equal(documentAttributes.get('data-code205-network-guard'), 'active');
    });

    it('blocks cross-origin fetch and XMLHttpRequest before native code runs', async () => {
        const { root, calls } = makeRoot();

        await assert.rejects(
            root.fetch('https://playentry.org/graphql'),
            /blocked a cross-origin fetch request/
        );
        assert.equal(calls.fetch, 0);

        const xhr = new root.XMLHttpRequest();
        assert.throws(
            () => xhr.open('GET', 'https://playentry.org/api/project'),
            /blocked a cross-origin XMLHttpRequest request/
        );
        assert.equal(calls.xhr, 0);
    });

    it('allows only same-host WebSocket and EventSource connections', () => {
        const { root, calls } = makeRoot();

        const socket = new root.WebSocket('wss://code.205.kr/ws');
        assert.equal(socket.url, 'wss://code.205.kr/ws');
        assert.equal(calls.websocket, 1);
        assert.throws(
            () => new root.WebSocket('wss://cloud.playentry.org/socket'),
            /blocked a cross-origin WebSocket request/
        );
        assert.equal(calls.websocket, 1);

        const events = new root.EventSource('/events');
        assert.equal(events.url, '/events');
        assert.equal(calls.eventSource, 1);
        assert.throws(
            () => new root.EventSource('https://playentry.org/events'),
            /blocked a cross-origin EventSource request/
        );
        assert.equal(calls.eventSource, 1);
    });

    it('rejects cross-origin beacons without calling the native implementation', () => {
        const { root, calls } = makeRoot();

        assert.equal(root.navigator.sendBeacon('/telemetry', 'ok'), true);
        assert.equal(calls.beacon, 1);
        assert.equal(
            root.navigator.sendBeacon('https://playentry.org/telemetry', 'blocked'),
            false
        );
        assert.equal(calls.beacon, 1);
    });
});
