(function (root, factory) {
    'use strict';

    var api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root && root.location) {
        api.install(root);
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    function parseTarget(target, baseUrl) {
        var value = target && typeof target === 'object' && target.url
            ? target.url
            : target;
        return new URL(String(value), baseUrl);
    }

    function effectivePort(url) {
        if (url.port) return url.port;
        if (url.protocol === 'https:' || url.protocol === 'wss:') return '443';
        if (url.protocol === 'http:' || url.protocol === 'ws:') return '80';
        return '';
    }

    function isAllowed(target, locationValue) {
        var url;
        try {
            url = parseTarget(target, locationValue.href);
        } catch (_) {
            return false;
        }

        if (/^(?:blob:|data:|about:)$/.test(url.protocol)) return true;
        if (url.protocol === 'ws:' || url.protocol === 'wss:') {
            var expectedProtocol = locationValue.protocol === 'https:' ? 'wss:' : 'ws:';
            return url.protocol === expectedProtocol &&
                url.hostname === locationValue.hostname &&
                effectivePort(url) === effectivePort(locationValue);
        }
        return url.origin === locationValue.origin;
    }

    function blockedError(kind, target) {
        var value = target && typeof target === 'object' && target.url
            ? target.url
            : target;
        return new TypeError(
            'CODE 205 blocked a cross-origin ' + kind + ' request: ' + String(value)
        );
    }

    function install(root) {
        if (root.__CODE205_NETWORK_GUARD__) return root.__CODE205_NETWORK_GUARD__;

        function assertAllowed(kind, target) {
            if (!isAllowed(target, root.location)) throw blockedError(kind, target);
        }

        if (typeof root.fetch === 'function') {
            var nativeFetch = root.fetch.bind(root);
            root.fetch = function (input, init) {
                try {
                    assertAllowed('fetch', input);
                } catch (error) {
                    return Promise.reject(error);
                }
                return nativeFetch(input, init);
            };
        }

        if (root.XMLHttpRequest && root.XMLHttpRequest.prototype) {
            var nativeOpen = root.XMLHttpRequest.prototype.open;
            root.XMLHttpRequest.prototype.open = function (method, url) {
                assertAllowed('XMLHttpRequest', url);
                return nativeOpen.apply(this, arguments);
            };
        }

        if (typeof root.WebSocket === 'function') {
            var NativeWebSocket = root.WebSocket;
            var GuardedWebSocket = function (url, protocols) {
                assertAllowed('WebSocket', url);
                return protocols === undefined
                    ? new NativeWebSocket(url)
                    : new NativeWebSocket(url, protocols);
            };
            GuardedWebSocket.prototype = NativeWebSocket.prototype;
            Object.setPrototypeOf(GuardedWebSocket, NativeWebSocket);
            root.WebSocket = GuardedWebSocket;
        }

        if (typeof root.EventSource === 'function') {
            var NativeEventSource = root.EventSource;
            var GuardedEventSource = function (url, options) {
                assertAllowed('EventSource', url);
                return options === undefined
                    ? new NativeEventSource(url)
                    : new NativeEventSource(url, options);
            };
            GuardedEventSource.prototype = NativeEventSource.prototype;
            Object.setPrototypeOf(GuardedEventSource, NativeEventSource);
            root.EventSource = GuardedEventSource;
        }

        if (root.navigator && typeof root.navigator.sendBeacon === 'function') {
            var nativeSendBeacon = root.navigator.sendBeacon.bind(root.navigator);
            root.navigator.sendBeacon = function (url, data) {
                if (!isAllowed(url, root.location)) {
                    if (root.console && typeof root.console.warn === 'function') {
                        root.console.warn(
                            'CODE 205 blocked a cross-origin beacon request:',
                            String(url)
                        );
                    }
                    return false;
                }
                return nativeSendBeacon(url, data);
            };
        }

        var guard = {
            isAllowed: function (target) {
                return isAllowed(target, root.location);
            },
        };
        Object.defineProperty(root, '__CODE205_NETWORK_GUARD__', {
            value: guard,
            configurable: false,
            enumerable: false,
            writable: false,
        });
        if (root.document && root.document.documentElement) {
            root.document.documentElement.setAttribute(
                'data-code205-network-guard',
                'active'
            );
        }
        return guard;
    }

    return {
        install: install,
        isAllowed: isAllowed,
    };
});
