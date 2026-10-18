import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { APP_USER_MODEL_ID, cleanTarget, Notifier, shortBody, type NoticeTarget, type SystemNotification } from '../src/main/notifications';

/** A stand-in for Electron's Notification that can be clicked. */
class FakeNotification implements SystemNotification {
  listeners: Record<string, () => void> = {};
  shown = false;
  constructor(readonly title: string, readonly body: string) {}
  on(event: string, listener: () => void) {
    this.listeners[event] = listener;
  }
  show() {
    this.shown = true;
  }
}

function setup(supported = true) {
  const made: FakeNotification[] = [];
  const calls: string[] = [];
  const opened: NoticeTarget[] = [];
  const notifier = new Notifier({
    supported: () => supported,
    create: (title, body) => {
      const n = new FakeNotification(title, body);
      made.push(n);
      return n;
    },
    focus: () => calls.push('focus'),
    open: (target) => {
      calls.push('open');
      opened.push(target);
    },
  });
  return { notifier, made, calls, opened };
}

describe('system notifications', () => {
  it('a click brings the window back first, then opens the sender’s chat', () => {
    const { notifier, made, calls, opened } = setup();
    assert.equal(notifier.show({ title: 'Kuba', body: 'siema', target: { view: 'friends', friendId: 'u1' } }), true);
    assert.equal(made[0].shown, true);
    assert.equal(notifier.kept, 1);
    made[0].listeners.click();
    assert.deepEqual(calls, ['focus', 'open']);
    assert.deepEqual(opened, [{ view: 'friends', friendId: 'u1' }]);
    assert.equal(notifier.kept, 0);
  });

  it('without a target the click only brings the window back', () => {
    const { notifier, made, calls } = setup();
    notifier.show({ title: 'SlashClient', body: 'Gotowe' });
    made[0].listeners.click();
    assert.deepEqual(calls, ['focus']);
  });

  it('keeps the notifications referenced until clicked, up to a limit', () => {
    const { notifier, made } = setup();
    for (let i = 0; i < 30; i++) notifier.show({ title: 'a', body: String(i) });
    assert.equal(notifier.kept, 20);
    made[29].listeners.failed();
    assert.equal(notifier.kept, 19);
  });

  it('shows nothing where the system has no notifications', () => {
    const { notifier, made } = setup(false);
    assert.equal(notifier.show({ title: 'a', body: 'b' }), false);
    assert.equal(made.length, 0);
  });

  it('shortens long messages to one line', () => {
    assert.equal(shortBody('a\n  b'), 'a b');
    const long = shortBody('x'.repeat(300));
    assert.equal(long.length, 120);
    assert.ok(long.endsWith('…'));
  });

  it('only passes a friend id that looks like one', () => {
    assert.deepEqual(cleanTarget({ view: 'friends', friendId: 'abc-123' }), { view: 'friends', friendId: 'abc-123' });
    assert.deepEqual(cleanTarget({ view: 'friends', friendId: '../x"' }), { view: 'friends' });
    assert.equal(cleanTarget({ view: 'settings' }), undefined);
    assert.equal(cleanTarget(null), undefined);
  });

  it('uses the installer’s app id on Windows', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    assert.equal(APP_USER_MODEL_ID, pkg.build.appId);
  });
});
