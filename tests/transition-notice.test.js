'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const notice = require('../public/js/transition-notice');

function makeDomFixture() {
    const documentListeners = new Map();
    const storage = new Map();
    let document;

    function makeElement(tagName) {
        const attributes = new Map();
        const listeners = new Map();
        const element = {
            tagName: tagName.toUpperCase(),
            children: [],
            parentNode: null,
            innerHTML: '',
            focusCount: 0,
            setAttribute(name, value) {
                attributes.set(name, String(value));
            },
            getAttribute(name) {
                return attributes.has(name) ? attributes.get(name) : null;
            },
            hasAttribute(name) {
                return attributes.has(name);
            },
            removeAttribute(name) {
                attributes.delete(name);
            },
            addEventListener(type, listener) {
                listeners.set(type, listener);
            },
            appendChild(child) {
                child.parentNode = element;
                element.children.push(child);
                return child;
            },
            focus() {
                element.focusCount += 1;
                document.activeElement = element;
            },
            remove() {
                if (!element.parentNode) return;
                const index = element.parentNode.children.indexOf(element);
                if (index >= 0) element.parentNode.children.splice(index, 1);
                element.parentNode = null;
            },
            _listeners: listeners,
        };
        return element;
    }

    const body = makeElement('body');
    const page = makeElement('main');
    const preInertPage = makeElement('aside');
    page.setAttribute('aria-hidden', 'false');
    preInertPage.setAttribute('inert', '');
    body.appendChild(page);
    body.appendChild(preInertPage);

    document = {
        body,
        activeElement: body,
        createElement(tagName) {
            const element = makeElement(tagName);
            if (tagName.toLowerCase() === 'div') {
                const button = makeElement('button');
                element._button = button;
                element.querySelector = selector =>
                    selector === 'button' ? button : null;
            }
            return element;
        },
        querySelector(selector) {
            if (selector !== '[data-code205-transition-notice]') return null;
            return body.children.find(child =>
                child.hasAttribute('data-code205-transition-notice')
            ) || null;
        },
        addEventListener(type, listener) {
            documentListeners.set(type, listener);
        },
        removeEventListener(type, listener) {
            if (documentListeners.get(type) === listener) {
                documentListeners.delete(type);
            }
        },
    };

    return {
        page,
        preInertPage,
        root: {
            document,
            sessionStorage: {
                getItem(key) {
                    return storage.has(key) ? storage.get(key) : null;
                },
                setItem(key, value) {
                    storage.set(key, String(value));
                },
            },
        },
        dispatchKey(key) {
            const event = {
                key,
                defaultPrevented: false,
                preventDefault() {
                    event.defaultPrevented = true;
                },
            };
            const listener = documentListeners.get('keydown');
            if (listener) listener(event);
            return event;
        },
        storage,
    };
}

describe('service transition notice', () => {
    it('is visible before the fixed deadline when not dismissed', () => {
        const duringNotice = Date.parse('2026-07-31T23:59:59+09:00');
        assert.equal(
            notice.shouldDisplay(duringNotice, notice.NOTICE_END_AT, false),
            true
        );
    });

    it('is hidden after the deadline', () => {
        const deadline = Date.parse('2026-08-01T00:00:00+09:00');
        assert.equal(
            notice.shouldDisplay(deadline, notice.NOTICE_END_AT, false),
            false
        );
    });

    it('stays hidden for the rest of a dismissed browser session', () => {
        const duringNotice = Date.parse('2026-07-25T12:00:00+09:00');
        assert.equal(
            notice.shouldDisplay(duringNotice, notice.NOTICE_END_AT, true),
            false
        );
    });

    it('keeps keyboard focus inside the modal and restores the background on close', () => {
        const fixture = makeDomFixture();
        const overlay = notice.render(fixture.root);
        const button = overlay._button;

        assert.equal(fixture.page.hasAttribute('inert'), true);
        assert.equal(fixture.page.getAttribute('aria-hidden'), 'true');
        assert.equal(fixture.preInertPage.hasAttribute('inert'), true);
        assert.equal(button.focusCount, 1);

        const tab = fixture.dispatchKey('Tab');
        assert.equal(tab.defaultPrevented, true);
        assert.equal(button.focusCount, 2);

        const escape = fixture.dispatchKey('Escape');
        assert.equal(escape.defaultPrevented, true);
        assert.equal(overlay.parentNode, null);
        assert.equal(fixture.page.hasAttribute('inert'), false);
        assert.equal(fixture.page.getAttribute('aria-hidden'), 'false');
        assert.equal(fixture.preInertPage.hasAttribute('inert'), true);
        assert.equal(fixture.preInertPage.hasAttribute('aria-hidden'), false);
        assert.equal(fixture.storage.get(notice.SESSION_KEY), '1');
    });
});
