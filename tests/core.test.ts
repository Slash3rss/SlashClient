import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { offlineUuid } from '../src/main/auth';
import { compareVersions } from '../src/main/loaders';
import { rulesAllow } from '../src/main/rules';
import { osName } from '../src/main/platform';
import { mavenPath } from '../src/main/versions';
import { setLang, t } from '../src/shared/i18n';

describe('offlineUuid', () => {
  it('matches what a vanilla server assigns in offline mode', () => {
    // UUID.nameUUIDFromBytes("OfflinePlayer:Notch")
    assert.equal(offlineUuid('Notch'), 'b50ad385-829d-3141-a216-7e7d7539ba7f');
  });
});

describe('rulesAllow', () => {
  it('allows when there are no rules', () => assert.equal(rulesAllow(undefined), true));
  it('uses the last matching rule', () => {
    const rules = [{ action: 'allow' as const }, { action: 'disallow' as const, os: { name: osName } }];
    assert.equal(rulesAllow(rules), false);
  });
  it('checks features', () => {
    const rules = [{ action: 'allow' as const, features: { has_custom_resolution: true } }];
    assert.equal(rulesAllow(rules, {}), false);
    assert.equal(rulesAllow(rules, { has_custom_resolution: true }), true);
  });
});

describe('mavenPath', () => {
  it('builds paths with and without a classifier', () => {
    assert.equal(mavenPath('org.ow2.asm:asm:9.10.1'), 'org/ow2/asm/asm/9.10.1/asm-9.10.1.jar');
    assert.equal(mavenPath('org.lwjgl:lwjgl:3.3.3:natives-macos'), 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-macos.jar');
  });
});

describe('compareVersions', () => {
  it('orders loader versions newest first, releases above their betas', () => {
    const list = ['0.20.0-beta.9', '0.24.0', '0.20.0-beta.10', '0.20.0', '0.19.5'];
    assert.deepEqual(list.sort((a, b) => compareVersions(b, a)), ['0.24.0', '0.20.0', '0.20.0-beta.10', '0.20.0-beta.9', '0.19.5']);
  });
});

describe('i18n', () => {
  it('fills placeholders and falls back to Polish', () => {
    setLang('en');
    assert.equal(t('Zainstalowano {0}', 'Sodium'), 'Installed Sodium');
    assert.equal(t('Tekst bez tłumaczenia'), 'Tekst bez tłumaczenia');
    setLang('pl');
    assert.equal(t('Zainstalowano {0}', 'Sodium'), 'Zainstalowano Sodium');
  });
});
