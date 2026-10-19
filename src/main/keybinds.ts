import AdmZip from 'adm-zip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getLang, t } from '../shared/i18n';

/**
 * Key conflicts in a profile's options.txt: two actions (the game's or mods') bound to the same
 * key. Lines look like `key_key.forward:key.keyboard.w`; Forge adds a modifier
 * (`key_key.forward:key.keyboard.w:NONE`). The fix moves the extra actions to free keys and only
 * rewrites those lines, everything else in the file stays byte for byte.
 */

export interface KeyBinding {
  /** e.g. "key.forward" or "key.sodium.options". */
  action: string;
  /** e.g. "key.keyboard.w" or "key.mouse.middle". */
  key: string;
  /** Forge modifier ("SHIFT", "CONTROL", "ALT"); empty = none. */
  modifier: string;
  /** Whether the line has the modifier field at all (Forge), so a rewrite keeps the format. */
  hasModifierField: boolean;
}

export interface KeyConflict {
  key: string;
  modifier: string;
  /** In order: the one that stays first (the game's own before mods'), then those a fix moves. */
  actions: string[];
}

export interface KeyChange {
  action: string;
  from: string;
  to: string;
}

export const UNBOUND = 'key.keyboard.unknown';

/** The game's own actions (1.20–26.x). Anything else in options.txt comes from a mod. */
const VANILLA = new Set([
  'key.attack', 'key.use', 'key.forward', 'key.left', 'key.back', 'key.right', 'key.jump', 'key.sneak', 'key.sprint', 'key.drop',
  'key.inventory', 'key.chat', 'key.playerlist', 'key.pickItem', 'key.command', 'key.socialInteractions', 'key.screenshot',
  'key.togglePerspective', 'key.smoothCamera', 'key.fullscreen', 'key.spectatorOutlines', 'key.spectatorHotbar', 'key.swapOffhand',
  'key.saveToolbarActivator', 'key.loadToolbarActivator', 'key.advancements', 'key.quickActions', 'key.toggleGui',
  'key.toggleSpectatorShaderEffects', 'key.friends', 'key.debug.overlay', 'key.debug.modifier',
  ...Array.from({ length: 9 }, (_, i) => `key.hotbar.${i + 1}`),
]);

/** Only matter while spectating: sharing a key with another of the game's own actions is how Mojang ships them. */
const SPECTATOR_ONLY = new Set(['key.spectatorHotbar', 'key.spectatorOutlines', 'key.toggleSpectatorShaderEffects']);

export const isVanillaAction = (action: string) => VANILLA.has(action) || action.startsWith('key.debug.');

/**
 * F3 combinations (key.debug.*, 1.21.9+) are pressed together with F3, so their keys never clash
 * with plain ones; F3 itself (overlay) does. The modifier binding repeats F3 on purpose.
 */
const ignored = (action: string) => action.startsWith('key.debug.') && action !== 'key.debug.overlay';

/** Every `key_…` line of options.txt. */
export function parseKeybinds(text: string): KeyBinding[] {
  const out: KeyBinding[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^key_([^:]+):([^:\s]+)(?::(\w*))?\s*$/);
    if (!m) continue;
    const modifier = m[3] && m[3] !== 'NONE' ? m[3] : '';
    out.push({ action: m[1], key: m[2], modifier, hasModifierField: m[3] !== undefined });
  }
  return out;
}

/** Actions sharing a key (and modifier). Unbound actions and F3 combinations never conflict. */
export function findConflicts(binds: KeyBinding[]): KeyConflict[] {
  const groups = new Map<string, KeyBinding[]>();
  for (const b of binds) {
    if (b.key === UNBOUND || ignored(b.action)) continue;
    const id = `${b.key}|${b.modifier}`;
    groups.set(id, [...(groups.get(id) ?? []), b]);
  }
  const out: KeyConflict[] = [];
  for (const list of groups.values()) {
    let members = list;
    // the game's own spectator keys overlap others of the game's by design
    if (members.every((b) => isVanillaAction(b.action))) members = members.filter((b) => !SPECTATOR_ONLY.has(b.action));
    if (members.length < 2) continue;
    const ordered = [...members.filter((b) => isVanillaAction(b.action)), ...members.filter((b) => !isVanillaAction(b.action))];
    out.push({ key: list[0].key, modifier: list[0].modifier, actions: ordered.map((b) => b.action) });
  }
  return out;
}

/** Keys offered as replacements, most convenient first. */
const CANDIDATES = [
  ...'kjhuiyzvbnmrgoxcplf'.split('').map((c) => `key.keyboard.${c}`),
  ...[6, 7, 8, 9, 10, 12].map((n) => `key.keyboard.f${n}`),
  ...Array.from({ length: 10 }, (_, i) => `key.keyboard.keypad.${i}`),
  'key.keyboard.left.bracket', 'key.keyboard.right.bracket', 'key.keyboard.semicolon', 'key.keyboard.apostrophe',
  'key.keyboard.comma', 'key.keyboard.period', 'key.keyboard.minus', 'key.keyboard.equal', 'key.keyboard.grave.accent',
  'key.keyboard.insert', 'key.keyboard.home', 'key.keyboard.page.up', 'key.keyboard.page.down', 'key.keyboard.end',
  'key.mouse.4', 'key.mouse.5',
];

/** Keys no action uses (with or without a modifier), in the order they are offered. */
export function freeKeys(binds: KeyBinding[]): string[] {
  const used = new Set(binds.filter((b) => !ignored(b.action)).map((b) => b.key));
  return CANDIDATES.filter((k) => !used.has(k));
}

/** The fix for every conflict: all but the first action of each go to a different free key. */
export function suggestFixes(binds: KeyBinding[], conflicts = findConflicts(binds)): KeyChange[] {
  const free = freeKeys(binds);
  const changes: KeyChange[] = [];
  for (const c of conflicts) {
    for (const action of c.actions.slice(1)) {
      const to = free.shift();
      if (!to) return changes;
      changes.push({ action, from: c.key, to });
    }
  }
  return changes;
}

/** options.txt with the given actions rebound; the other lines (and line ends) stay as they were. */
export function applyKeyChanges(text: string, changes: { action: string; to: string }[]): string {
  const byAction = new Map(changes.map((c) => [c.action, c.to]));
  return text.replace(/^key_([^:\r\n]+):([^:\s]+)(:\w*)?[ \t]*$/gm, (line, action: string, _key: string, mod?: string) => {
    const to = byAction.get(action);
    if (!to) return line;
    // the new key comes without a modifier: Forge keeps its field, set to none
    return `key_${action}:${to}${mod !== undefined ? ':NONE' : ''}`;
  });
}

/** Validates a key name sent by the page before it goes into options.txt. */
export const isKeyName = (key: unknown): key is string => typeof key === 'string' && /^key\.(keyboard|mouse)\.[a-z0-9.]+$/.test(key) && key.length < 64;

// ---------- names shown to the player ----------

const VANILLA_NAMES: Record<string, string> = {
  'key.attack': 'Atak / niszczenie', 'key.use': 'Użycie przedmiotu / stawianie bloku', 'key.forward': 'Do przodu', 'key.left': 'W lewo',
  'key.back': 'Do tyłu', 'key.right': 'W prawo', 'key.jump': 'Skok', 'key.sneak': 'Skradanie', 'key.sprint': 'Sprint',
  'key.drop': 'Upuszczenie przedmiotu', 'key.inventory': 'Ekwipunek', 'key.chat': 'Czat', 'key.playerlist': 'Lista graczy',
  'key.pickItem': 'Wybór bloku', 'key.command': 'Polecenie', 'key.socialInteractions': 'Interakcje społeczne', 'key.screenshot': 'Zrzut ekranu',
  'key.togglePerspective': 'Zmiana perspektywy', 'key.smoothCamera': 'Kamera filmowa', 'key.fullscreen': 'Pełny ekran',
  'key.spectatorOutlines': 'Podświetlanie graczy (obserwator)', 'key.spectatorHotbar': 'Pasek obserwatora', 'key.swapOffhand': 'Zamiana przedmiotu z drugą ręką',
  'key.saveToolbarActivator': 'Zapis paska narzędzi', 'key.loadToolbarActivator': 'Wczytanie paska narzędzi', 'key.advancements': 'Postępy',
  'key.quickActions': 'Szybkie akcje', 'key.toggleGui': 'Ukrycie interfejsu', 'key.toggleSpectatorShaderEffects': 'Efekty obserwatora',
  'key.friends': 'Znajomi', 'key.debug.overlay': 'Ekran debugowania (F3)', 'key.debug.modifier': 'Klawisz kombinacji debugowania',
};

const KEY_NAMES: Record<string, string> = {
  'left.shift': 'Lewy Shift', 'right.shift': 'Prawy Shift', 'left.control': 'Lewy Ctrl', 'right.control': 'Prawy Ctrl',
  'left.alt': 'Lewy Alt', 'right.alt': 'Prawy Alt', 'left.win': 'Lewy Win', 'right.win': 'Prawy Win', space: 'Spacja', tab: 'Tab',
  enter: 'Enter', escape: 'Esc', backspace: 'Backspace', 'caps.lock': 'Caps Lock', slash: '/', backslash: '\\', comma: ',', period: '.',
  semicolon: ';', apostrophe: "'", minus: '-', equal: '=', 'left.bracket': '[', 'right.bracket': ']', 'grave.accent': '`',
  insert: 'Insert', delete: 'Delete', home: 'Home', end: 'End', 'page.up': 'Page Up', 'page.down': 'Page Down',
  up: 'Strzałka w górę', down: 'Strzałka w dół', left: 'Strzałka w lewo', right: 'Strzałka w prawo', menu: 'Menu',
};

/** "key.keyboard.left.shift" → "Lewy Shift", "key.mouse.middle" → "Środkowy przycisk myszy". */
export function keyLabel(key: string, modifier = ''): string {
  const mod = modifier ? `${{ SHIFT: 'Shift', CONTROL: 'Ctrl', ALT: 'Alt' }[modifier] ?? modifier} + ` : '';
  let name: string;
  const mouse = key.match(/^key\.mouse\.(.+)$/);
  const keyboard = key.match(/^key\.keyboard\.(.+)$/);
  if (mouse) {
    const which = mouse[1];
    name = which === 'left' ? t('Lewy przycisk myszy') : which === 'right' ? t('Prawy przycisk myszy') : which === 'middle' ? t('Środkowy przycisk myszy') : t('Przycisk myszy {0}', which);
  } else if (keyboard) {
    const k = keyboard[1];
    const pad = k.match(/^keypad\.(.+)$/);
    if (pad) name = `Num ${KEY_NAMES[pad[1]] ? t(KEY_NAMES[pad[1]]) : pad[1].toUpperCase()}`;
    else if (KEY_NAMES[k]) name = t(KEY_NAMES[k]);
    else name = k.length <= 3 ? k.toUpperCase() : k.replace(/\./g, ' ');
  } else name = key;
  return mod + name;
}

/** A mod's action without a translation: "key.journeymap.map" → "journeymap: map". */
export function prettyAction(action: string): string {
  const parts = action.replace(/^key\./, '').split('.');
  if (parts.length < 2) return parts[0];
  return `${parts[0]}: ${parts.slice(1).join(' ').replace(/[_-]/g, ' ')}`;
}

/** Translations of mods' key names, read from the jars' lang files (only when a mod's key is in a conflict). */
export async function modKeyNames(modsDir: string, wanted: Set<string>): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!wanted.size) return found;
  const langs = getLang() === 'pl' ? ['pl_pl.json', 'en_us.json'] : ['en_us.json'];
  const jars = (await fs.readdir(modsDir).catch(() => [] as string[])).filter((f) => f.endsWith('.jar'));
  for (const jar of jars) {
    if ([...wanted].every((w) => found.has(w))) break;
    let zip: AdmZip;
    try {
      zip = new AdmZip(path.join(modsDir, jar));
    } catch {
      continue;
    }
    for (const lang of [...langs].reverse()) {
      for (const entry of zip.getEntries()) {
        if (!/^assets\/[^/]+\/lang\//.test(entry.entryName) || !entry.entryName.endsWith(`/${lang}`)) continue;
        try {
          const dict = JSON.parse(entry.getData().toString('utf8').replace(/^﻿/, '')) as Record<string, unknown>;
          for (const key of wanted) if (typeof dict[key] === 'string') found.set(key, dict[key] as string);
        } catch {
          // a broken lang file: the name stays the raw one
        }
      }
    }
  }
  return found;
}

/** The name of any action: the game's own (translated), a mod's from its lang file, or the id made readable. */
export function actionLabel(action: string, modNames: Map<string, string>): string {
  if (VANILLA_NAMES[action]) return t(VANILLA_NAMES[action]);
  const hotbar = action.match(/^key\.hotbar\.(\d)$/);
  if (hotbar) return t('Pasek szybkiego dostępu {0}', hotbar[1]);
  return modNames.get(action) ?? prettyAction(action);
}
