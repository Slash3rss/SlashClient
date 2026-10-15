import { arch, osName, osVersion } from './platform';

export interface Rule {
  action: 'allow' | 'disallow';
  os?: { name?: string; version?: string; arch?: string };
  features?: Record<string, boolean>;
}

export type Features = Record<string, boolean>;

function ruleMatches(rule: Rule, features: Features): boolean {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== osName) return false;
    if (rule.os.arch && rule.os.arch !== (arch === 'ia32' ? 'x86' : arch)) return false;
    if (rule.os.version && !new RegExp(rule.os.version).test(osVersion)) return false;
  }
  if (rule.features) {
    for (const [key, value] of Object.entries(rule.features)) {
      if ((features[key] ?? false) !== value) return false;
    }
  }
  return true;
}

/** Mojang semantics: no rules → allowed; otherwise the last matching rule wins. */
export function rulesAllow(rules: Rule[] | undefined, features: Features = {}): boolean {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    if (ruleMatches(rule, features)) allowed = rule.action === 'allow';
  }
  return allowed;
}
