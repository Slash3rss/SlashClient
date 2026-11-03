import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { dayOf } from '../src/achievements.ts';
import { CODE_ALPHABET, minecraftKey, normalizeCode } from '../src/referrals.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-referrals-'));
let base = '';
let app: ReturnType<typeof createApp>;
const DAY = 86_400_000;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string; handle: string } };
const page = async (url: string, lang = 'pl') => {
  const res = await fetch(base + url, { headers: { Accept: 'text/html', 'Accept-Language': lang } });
  return { status: res.status, html: await res.text() };
};
const info = async (token: string) => (await call('GET', '/v1/referrals', token)).body;
const redeem = (token: string, code: unknown) => call('POST', '/v1/referrals/redeem', token, { code });

/** A Minecraft account linked to the account, as a sign-in with Minecraft leaves it. */
function linkMinecraft(uuid: string, mc = randomUUID().replace(/-/g, '')) {
  app.db.sql.prepare("INSERT INTO identities (provider, subject, uuid, label) VALUES ('minecraft', ?, ?, ?)").run(mc, uuid, `mc${mc.slice(0, 6)}`);
  return mc;
}
/** Play time on days before now (as the achievements' ticks write it). */
function play(uuid: string, hoursEach: number[], now = Date.now()) {
  hoursEach.forEach((h, i) => app.achievements.store.addPlay(uuid, dayOf(now - i * DAY), h * 3600));
}
const ledger = (uuid: string) => app.db.sql.prepare("SELECT amount, ref FROM sparks_ledger WHERE uuid = ? AND reason = 'referral' ORDER BY id").all(uuid) as { amount: number; ref: string }[];

async function connect(token: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token }));
  const waitFor = async (pred: (e: any) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const hit = events.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('event did not come');
  };
  await waitFor((e) => e.type === 'ready');
  return { ws, events, waitFor };
}

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost/', allowDevLogin: true, loginsPerMinute: 1000, profileViewsPerMinute: 1000, oauth: {}, adminHandles: ['SzefZaproszen'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  app.settings.set({ 'referrals.redeemsPerMinute': 1000 }, 'test');
});
after(async () => {
  await new Promise((r) => setTimeout(r, 100));
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('invites: codes and redeeming', () => {
  it('gives every account its own stable code, a link and the rewards', async () => {
    const a = await login('ZapAla');
    const first = await info(a.token);
    assert.equal(first.enabled, true);
    assert.match(first.code, /^[A-HJKMNP-Z2-9]{6}$/);
    for (const c of first.code) assert.ok(CODE_ALPHABET.includes(c));
    assert.equal(first.link, `http://localhost/z/${first.code}`);
    assert.equal((await info(a.token)).code, first.code);
    assert.equal(first.canRedeem, true);
    const created = (app.db.sql.prepare('SELECT created_at FROM users WHERE uuid = ?').get(a.user.id) as { created_at: number }).created_at;
    assert.equal(first.redeemUntil, created + 7 * DAY);
    assert.deepEqual([first.redeemed, first.suggested, first.counted, first.invited], [null, null, 0, []]);
    assert.deepEqual([first.hoursGoal, first.daysGoal, first.inviterSparks, first.inviteeSparks], [3, 2, 100, 50]);
    // the achievements for invites, their capes; the hidden one is not listed
    assert.deepEqual(first.rewards.map((r: any) => [r.count, r.item, r.reached]), [[1, 'sakura', false], [3, 'aurora', false], [5, 'rainbow', false], [10, 'vortex', false], [25, 'starfall', false]]);
    assert.equal(first.rewards[0].itemName, 'Sakura');
    assert.ok(first.rewards.every((r: any) => r.sparks > 0));
  });

  it('takes one code only: not a wrong one, not one\'s own, only in the first days, never in a circle', async () => {
    const a = await login('ZapBasia');
    const b = await login('ZapCelina');
    const codeA = (await info(a.token)).code;
    const codeB = (await info(b.token)).code;
    assert.deepEqual((await redeem(b.token, 'ZZZZZZ')).body.error, 'bad_code');
    assert.equal((await redeem(b.token, 'ZZZZZZ')).status, 404);
    assert.equal((await redeem(b.token, 42)).body.error, 'bad_code');
    assert.equal((await redeem(b.token, codeB)).body.error, 'own_code');
    // typed in lower case, with a dash and spaces: the same code
    const typed = `${codeA.slice(0, 3).toLowerCase()}-${codeA.slice(3).toLowerCase()} `;
    assert.equal(normalizeCode(typed), codeA);
    const ok = await redeem(b.token, typed);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true, inviter: { handle: 'ZapBasia', name: 'ZapBasia' } });
    assert.equal((await redeem(b.token, codeA)).body.error, 'already_redeemed');
    const viewB = await info(b.token);
    assert.deepEqual([viewB.canRedeem, viewB.redeemUntil, viewB.redeemed], [false, null, { handle: 'ZapBasia', name: 'ZapBasia' }]);
    const viewA = await info(a.token);
    assert.deepEqual(viewA.invited.map((r: any) => [r.handle, r.status, r.hours, r.days, r.minecraft]), [['ZapCelina', 'pending', 0, 0, false]]);
    // A typing in B's code: B was invited by A
    assert.equal((await redeem(a.token, codeB)).body.error, 'cycle');
    // and further down the line: C invited by B, A cannot take C's code either
    const c = await login('ZapDorota');
    assert.equal((await redeem(c.token, codeB)).status, 200);
    assert.equal((await redeem(a.token, (await info(c.token)).code)).body.error, 'cycle');
    // an account older than the window
    const old = await login('ZapStary');
    app.db.sql.prepare('UPDATE users SET created_at = ? WHERE uuid = ?').run(Date.now() - 8 * DAY, old.user.id);
    assert.equal((await redeem(old.token, codeA)).body.error, 'too_late');
    assert.deepEqual([(await info(old.token)).canRedeem, (await info(old.token)).redeemUntil], [false, null]);
    // a longer window (the admin's setting) lets it in
    app.settings.set({ 'referrals.redeemDays': 10 }, 'test');
    assert.equal((await info(old.token)).canRedeem, true);
    app.settings.set({ 'referrals.redeemDays': null }, 'test');
  });

  it('counts an invite only with a Minecraft account and enough hours on enough days, and pays both once', async () => {
    const inviter = await login('ZapEwa');
    const friend = await login('ZapFranek');
    const live = await connect(inviter.token);
    assert.equal((await redeem(friend.token, (await info(inviter.token)).code)).status, 200);
    await live.waitFor((e) => e.type === 'referral' && e.status === 'pending' && e.friend.handle === 'ZapFranek');
    // four hours on one day: not enough days
    play(friend.user.id, [4]);
    app.referrals.tick();
    let view = await info(inviter.token);
    assert.deepEqual(view.invited.map((r: any) => [r.status, r.hours, r.days, r.minecraft]), [['pending', 4, 1, false]]);
    // a second day: still no Minecraft account
    play(friend.user.id, [0, 0.5]);
    app.referrals.tick();
    assert.equal((await info(inviter.token)).invited[0].status, 'pending');
    assert.deepEqual(ledger(inviter.user.id), []);
    linkMinecraft(friend.user.id);
    assert.equal((await info(inviter.token)).invited[0].minecraft, true);
    // looking (GET) counts it too, not only the tick
    view = await info(inviter.token);
    assert.equal(view.invited[0].status, 'counted');
    assert.equal(view.counted, 1);
    assert.equal(view.rewards[0].reached, true);
    assert.deepEqual(ledger(inviter.user.id).map((r) => r.amount), [100]);
    assert.deepEqual(ledger(friend.user.id).map((r) => r.amount), [50]);
    const event = await live.waitFor((e) => e.type === 'referral' && e.status === 'counted');
    assert.deepEqual([event.role, event.friend.handle, event.sparks], ['inviter', 'ZapFranek', 100]);
    await live.waitFor((e) => e.type === 'wallet' && e.reason === 'referral' && e.change === 100);
    // the achievements: the inviter's first invite (its cape), the friend's hidden one
    assert.ok(app.achievements.store.unlocked(inviter.user.id).has('invites_1'));
    assert.ok(app.db.grants(inviter.user.id).includes('sakura'));
    assert.ok(app.achievements.store.unlocked(friend.user.id).has('invited_by_friend'));
    // once: more ticks, more looks, nothing more
    app.referrals.tick();
    await info(friend.token);
    assert.equal(ledger(inviter.user.id).length, 1);
    assert.equal(ledger(friend.user.id).length, 1);
    // the sparks' history says what it was
    const wallet = (await call('GET', '/v1/wallet', inviter.token)).body;
    const row = wallet.ledger.find((e: any) => e.reason === 'referral');
    assert.deepEqual([row.label, row.labelEn], ['Zaproszony znajomy @ZapFranek', 'Friend invited @ZapFranek']);
    const theirs = (await call('GET', '/v1/wallet', friend.token)).body.ledger.find((e: any) => e.reason === 'referral');
    assert.equal(theirs.label, 'Dołączenie z zaproszenia @ZapEwa');
    live.ws.close();
  });

  it('counts one Minecraft account once, also after it is linked to another account', async () => {
    const inviter = await login('ZapGosia');
    const first = await login('ZapHenio');
    const second = await login('ZapIrek');
    const code = (await info(inviter.token)).code;
    for (const p of [first, second]) assert.equal((await redeem(p.token, code)).status, 200);
    const mc = linkMinecraft(first.user.id);
    play(first.user.id, [2, 2]);
    play(second.user.id, [2, 2]);
    app.referrals.tick();
    assert.equal(app.referrals.store.redeemed(first.user.id)?.status, 'counted');
    // the same Minecraft account moved to the second account: it counted already
    app.db.sql.prepare("DELETE FROM identities WHERE provider = 'minecraft' AND subject = ?").run(mc);
    linkMinecraft(second.user.id, mc);
    app.referrals.tick();
    assert.equal(app.referrals.store.redeemed(second.user.id)?.status, 'pending');
    const listed = (await info(inviter.token)).invited.find((r: any) => r.handle === 'ZapIrek');
    assert.equal(listed.minecraft, false);
    // kept hashed, not as the uuid itself
    assert.ok(app.db.sql.prepare('SELECT 1 FROM referral_minecraft WHERE key = ?').get(minecraftKey(mc)));
    assert.ok(!app.db.sql.prepare('SELECT 1 FROM referral_minecraft WHERE key = ?').get(mc));
    // another Minecraft account of its own: it counts
    linkMinecraft(second.user.id);
    app.referrals.tick();
    assert.equal(app.referrals.store.redeemed(second.user.id)?.status, 'counted');
    assert.equal((await info(inviter.token)).counted, 2);
  });

  it('counts at most so many invites of one player a month, the rest the next month', async () => {
    app.settings.set({ 'referrals.monthlyCap': 1 }, 'test');
    const inviter = await login('ZapJacek');
    const code = (await info(inviter.token)).code;
    const friends = [await login('ZapKasia'), await login('ZapLeon')];
    for (const f of friends) {
      assert.equal((await redeem(f.token, code)).status, 200);
      linkMinecraft(f.user.id);
      play(f.user.id, [2, 2]);
    }
    const march = Date.UTC(2031, 2, 30);
    app.referrals.tick(march);
    app.referrals.tick(march + 60_000);
    const status = () => friends.map((f) => app.referrals.store.redeemed(f.user.id)?.status).sort();
    assert.deepEqual(status(), ['counted', 'pending']);
    app.referrals.tick(Date.UTC(2031, 3, 1, 0, 5));
    assert.deepEqual(status(), ['counted', 'counted']);
    app.settings.set({ 'referrals.monthlyCap': null }, 'test');
  });

  it('offers the code whose page was opened from the same address, and shows the page', async () => {
    const host = await login('ZapMarta');
    const code = (await info(host.token)).code;
    const shown = await page(`/z/${code.toLowerCase()}`);
    assert.equal(shown.status, 200);
    assert.ok(shown.html.includes('ZapMarta zaprasza Cię do SlashClient'));
    assert.ok(shown.html.includes(`id="ref-code">${code}<`));
    assert.ok(shown.html.includes('50 Iskier na start'));
    assert.ok(shown.html.includes('href="/#pobierz"'));
    assert.ok(shown.html.includes('wpisz go w launcherze po zalogowaniu'.replace('wpisz', 'Wpisz')));
    // English, by the browser or asked for
    assert.ok((await page(`/z/${code}`, 'en-GB')).html.includes('ZapMarta invites you to SlashClient'));
    assert.ok((await page(`/z/${code}?lang=en`)).html.includes('invites you to SlashClient'));
    // a code nobody has: a friendly page
    const unknown = await page('/z/ZZZZZZ');
    assert.equal(unknown.status, 404);
    assert.ok(unknown.html.includes('Nie ma takiego zaproszenia'));
    // a new player from the same address is offered it; the owner and a player who typed one in are not
    const guest = await login('ZapNikola');
    assert.deepEqual((await info(guest.token)).suggested, { code, handle: 'ZapMarta', name: 'ZapMarta' });
    assert.equal((await info(host.token)).suggested, null);
    assert.equal((await redeem(guest.token, code)).status, 200);
    assert.equal((await info(guest.token)).suggested, null);
  });

  it('switches off: no codes, no redeeming, no page, nothing counts', async () => {
    const inviter = await login('ZapOla');
    const friend = await login('ZapPiotr');
    const code = (await info(inviter.token)).code;
    assert.equal((await redeem(friend.token, code)).status, 200);
    linkMinecraft(friend.user.id);
    app.settings.set({ 'referrals.enabled': false }, 'test');
    play(friend.user.id, [2, 2]);
    assert.deepEqual(await info(inviter.token), { enabled: false });
    const other = await login('ZapRysiek');
    assert.deepEqual([(await redeem(other.token, code)).status, (await redeem(other.token, code)).body.error], [503, 'disabled']);
    assert.equal((await page(`/z/${code}`)).status, 503);
    app.referrals.tick();
    assert.equal(app.referrals.store.redeemed(friend.user.id)?.status, 'pending');
    app.settings.set({ 'referrals.enabled': null }, 'test');
    app.referrals.tick();
    assert.equal(app.referrals.store.redeemed(friend.user.id)?.status, 'counted');
  });

  it('lets the admin see the invites and reject a cheated one, taking the sparks back only when they are there', async () => {
    const boss = await login('SzefZaproszen');
    const inviter = await login('ZapSebastian');
    assert.equal((await call('GET', '/v1/admin/referrals', inviter.token)).status, 403);
    const code = (await info(inviter.token)).code;
    const [kept, spent, waiting] = [await login('ZapTomek'), await login('ZapUla'), await login('ZapWiktor')];
    for (const f of [kept, spent, waiting]) assert.equal((await redeem(f.token, code)).status, 200);
    for (const f of [kept, spent]) {
      linkMinecraft(f.user.id);
      play(f.user.id, [2, 2]);
    }
    app.referrals.tick();
    const view = (await call('GET', '/v1/admin/referrals', boss.token)).body;
    assert.equal(view.settings.enabled, true);
    const top = view.top.find((t: any) => t.handle === 'ZapSebastian');
    assert.deepEqual([top.counted, top.pending, top.rejected], [2, 1, 0]);
    assert.ok(view.recent.some((r: any) => r.invitee.handle === 'ZapTomek' && r.inviter.handle === 'ZapSebastian' && r.status === 'counted' && r.inviterSparks === 100));
    assert.equal((await call('GET', '/v1/admin/referrals?q=zapwiktor', boss.token)).body.recent.length, 1);
    assert.ok((await call('GET', '/v1/admin/referrals?status=pending', boss.token)).body.recent.every((r: any) => r.status === 'pending'));
    // rejected with the sparks still there: both give them back
    const before = app.wallet.balance(inviter.user.id);
    const res = await call('POST', `/v1/admin/referrals/${kept.user.id}/reject`, boss.token, { reason: 'drugie konto' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.rejected, { was: 'counted', taken: { inviter: true, invitee: true } });
    assert.equal(app.wallet.balance(inviter.user.id), before - 100);
    assert.equal(app.wallet.balance(kept.user.id), (app.db.sql.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM sparks_ledger WHERE uuid = ? AND reason = 'achievement'").get(kept.user.id) as { n: number }).n);
    assert.equal((await call('POST', `/v1/admin/referrals/${kept.user.id}/reject`, boss.token, {})).body.error, 'already_rejected');
    // the friend spent theirs: only marked, the balance never goes below zero
    app.wallet.change(spent.user.id, -app.wallet.balance(spent.user.id), 'admin', '', 'test');
    const second = (await call('POST', `/v1/admin/referrals/${spent.user.id}/reject`, boss.token, {})).body.rejected;
    assert.deepEqual(second, { was: 'counted', taken: { inviter: true, invitee: false } });
    assert.equal(app.wallet.balance(spent.user.id), 0);
    // a pending one never counts after
    assert.deepEqual((await call('POST', `/v1/admin/referrals/${waiting.user.id}/reject`, boss.token, {})).body.rejected, { was: 'pending', taken: { inviter: false, invitee: false } });
    linkMinecraft(waiting.user.id);
    play(waiting.user.id, [2, 2]);
    app.referrals.tick();
    assert.equal(app.referrals.store.redeemed(waiting.user.id)?.status, 'rejected');
    // the inviter sees them as rejected; the achievement got stays
    const mine = await info(inviter.token);
    assert.deepEqual(mine.invited.map((r: any) => r.status).sort(), ['rejected', 'rejected', 'rejected']);
    assert.equal(mine.counted, 0);
    assert.ok(app.achievements.store.unlocked(inviter.user.id).has('invites_1'));
    assert.equal((await call('POST', '/v1/admin/referrals/nobody/reject', boss.token, {})).status, 404);
    // the admin log has it
    assert.ok(app.db.sql.prepare("SELECT 1 FROM admin_log WHERE action = 'referral_reject' AND target = 'ZapTomek'").get());
  });
});
