import { t } from './i18n';

/**
 * Mod config files: which format a file is, a small syntax highlighter for the
 * config editor and checks for the formats that can be parsed (JSON, JSON5, TOML).
 * Pure functions, no DOM, so the tests run them too.
 */

export type ConfigFormat = 'json' | 'json5' | 'toml' | 'properties' | 'yaml' | 'text';

export function formatOf(file: string): ConfigFormat {
  const ext = file.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (ext === 'json' || ext === 'mcmeta') return 'json';
  if (ext === 'json5' || ext === 'jsonc') return 'json5';
  if (ext === 'toml') return 'toml';
  if (ext === 'yml' || ext === 'yaml') return 'yaml';
  if (ext === 'properties' || ext === 'cfg' || ext === 'ini' || ext === 'conf') return 'properties';
  return 'text';
}

export const FORMAT_NAMES: Record<ConfigFormat, string> = {
  json: 'JSON', json5: 'JSON5', toml: 'TOML', properties: 'Properties / CFG', yaml: 'YAML', text: 'Tekst',
};

// ---------- highlighting ----------

export type TokenClass = 'comment' | 'key' | 'string' | 'number' | 'keyword' | 'section' | 'punct';
export interface Token { text: string; cls?: TokenClass }

/** A rule matches at the current position (sticky regex); the class can depend on the text. */
type Rule = [TokenClass | undefined | ((text: string) => TokenClass | undefined), RegExp];

const NUMBER = /[+-]?(?:0[xX][\da-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)(?![\w.])/y;
const DQ = /"(?:[^"\\\n]|\\.)*"?/y;
const SQ = /'(?:[^'\\\n]|\\.)*'?/y;

/** Plain text, a number, a boolean or a quoted string: how a bare value in a .properties/.cfg line looks. */
function valueClass(text: string): TokenClass | undefined {
  const v = text.trim();
  if (/^(?:true|false)$/i.test(v)) return 'keyword';
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(v)) return 'number';
  return v ? 'string' : undefined;
}

const RULES: Record<ConfigFormat, Rule[]> = {
  json: [
    ['comment', /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y],
    ['key', /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y],
    ['string', DQ],
    ['keyword', /\b(?:true|false|null)\b/y],
    [undefined, /[A-Za-z_$][\w$]*/y],
    ['number', NUMBER],
    ['punct', /[{}[\],:]/y],
  ],
  json5: [
    ['comment', /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y],
    ['key', /(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|[A-Za-z_$][\w$]*)(?=\s*:)/y],
    ['string', DQ],
    ['string', SQ],
    ['keyword', /\b(?:true|false|null|Infinity|NaN)\b/y],
    [undefined, /[A-Za-z_$][\w$]*/y],
    ['number', NUMBER],
    ['punct', /[{}[\],:]/y],
  ],
  toml: [
    ['comment', /#[^\n]*/y],
    ['section', /^[ \t]*\[\[?[^\]\n]*\]\]?/my],
    ['string', /"""[\s\S]*?(?:"""|$)/y],
    ['string', /'''[\s\S]*?(?:'''|$)/y],
    ['key', /(?:[A-Za-z0-9_-]+|"(?:[^"\\\n]|\\.)*"|'[^'\n]*')(?:[ \t]*\.[ \t]*(?:[A-Za-z0-9_-]+|"(?:[^"\\\n]|\\.)*"|'[^'\n]*'))*(?=[ \t]*=)/y],
    ['string', DQ],
    ['string', /'[^'\n]*'?/y],
    ['number', /\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:\d{2})?)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?/y],
    ['keyword', /\b(?:true|false)\b|[+-]?\b(?:inf|nan)\b/y],
    [undefined, /[A-Za-z_][\w-]*/y],
    ['number', NUMBER],
    ['punct', /[[\]{},=.]/y],
  ],
  properties: [
    ['comment', /^[ \t]*(?:[#;!]|\/\/)[^\n]*/my],
    ['section', /^[ \t]*\[[^\]\n]*\]/my],
    // old Forge .cfg: "S:name=value" and "category {" blocks
    ['key', /^[ \t]*[BIDSL]:(?:"[^"\n]*"|[^=\n]*)(?==)/my],
    ['section', /^[ \t]*[^\s{}=:#][^\n{}=:]*?(?=[ \t]*\{[ \t]*$)/my],
    ['key', /^[ \t]*[^\s=:#;!{}[<>][^=:\n]*?(?=[ \t]*[=:])/my],
    [valueClass, /(?<=[=:])[^\n]+/y],
    ['punct', /[{}<>=:]/y],
  ],
  yaml: [
    ['comment', /(?:^|(?<=\s))#[^\n]*/my],
    ['punct', /^(?:---|\.\.\.)(?=\s|$)/my],
    ['key', /(?:"(?:[^"\\\n]|\\.)*"|'[^'\n]*'|[^\s#'"\-?:,[\]{}&*!|>%@`][^#\n:]*?|-[^\s#:][^#\n:]*?)(?=:(?:[ \t]|$))/my],
    ['string', DQ],
    ['string', SQ],
    ['keyword', /[&*][\w-]+|![\w!/-]*|\b(?:true|false|yes|no|on|off|null)\b(?![\w-])|~/y],
    [undefined, /[A-Za-z_][\w-]*/y],
    ['number', NUMBER],
    ['punct', /[-:[\]{},|>?]/y],
  ],
  text: [],
};

/** Splits a config file into coloured tokens; joined back, the texts give the input unchanged. */
export function highlight(text: string, format: ConfigFormat): Token[] {
  const rules = RULES[format];
  const out: Token[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ text: plain });
    plain = '';
  };
  let i = 0;
  outer: while (i < text.length) {
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (!m || !m[0]) continue;
      const c = typeof cls === 'function' ? cls(m[0]) : cls;
      if (c) {
        flush();
        out.push({ text: m[0], cls: c });
      } else plain += m[0];
      i += m[0].length;
      continue outer;
    }
    plain += text[i++];
  }
  flush();
  return out;
}

// ---------- validation ----------

export interface ConfigProblem { line: number; column: number; message: string }

/** A parse error in the file, or undefined when it parses (or its format cannot be checked). */
export function validateConfig(text: string, format: ConfigFormat): ConfigProblem | undefined {
  if (format === 'json' || format === 'json5') return checkJson(text, format === 'json5');
  if (format === 'toml') return checkToml(text);
  return undefined;
}

function position(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, column: index - before.lastIndexOf('\n') };
}

class ParseError extends Error {
  constructor(message: string, public index: number) {
    super(message);
  }
}

/**
 * A strict JSON or (with `json5`) JSON5 parser that only checks the syntax: the
 * built-in JSON.parse does not always say where the problem is, and knows no JSON5.
 */
function checkJson(text: string, json5: boolean): ConfigProblem | undefined {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const fail = (message: string, at = i): never => {
    throw new ParseError(message, at);
  };
  const space = () => {
    for (;;) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || (json5 && (c === '\v' || c === '\f' || c === '\u00a0' || c === '\ufeff'))) i++;
      // comments: JSON5 allows them, and so do many mods' .json files
      else if (c === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++;
      } else if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end < 0) fail(t('Niezamknięty komentarz'));
        i = end + 2;
      } else return;
    }
  };
  const string = () => {
    const quote = text[i];
    const start = i++;
    while (i < text.length && text[i] !== quote) {
      const c = text[i];
      if (c === '\n' || (!json5 && c === '\r')) fail(t('Niezamknięty tekst'), start);
      if (c === '\\') {
        i++;
        if (json5 && (text[i] === '\n' || text[i] === '\r')) {
          i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
          continue;
        }
        if (!json5 && !/["\\/bfnrtu]/.test(text[i] ?? '')) fail(t('Nieprawidłowy znak po \\'));
        if (text[i] === 'u' && !/^[\da-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) fail(t('Nieprawidłowy znak po \\'));
      }
      i++;
    }
    if (i >= text.length) fail(t('Niezamknięty tekst'), start);
    i++;
  };
  const number = () => {
    const re = json5
      ? /[+-]?(?:Infinity|NaN|0[xX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y
      : /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) fail(t('Nieoczekiwany znak „{0}”', text[i]));
    i += m![0].length;
    if (/[\w.]/.test(text[i] ?? '')) fail(t('Nieoczekiwany znak „{0}”', text[i]));
  };
  const word = (w: string) => {
    if (text.startsWith(w, i) && !/[\w$]/.test(text[i + w.length] ?? '')) {
      i += w.length;
      return true;
    }
    return false;
  };
  const key = () => {
    if (text[i] === '"' || (json5 && text[i] === "'")) return string();
    if (json5) {
      const m = /[A-Za-z_$][\w$]*/y;
      m.lastIndex = i;
      const found = m.exec(text);
      if (found) {
        i += found[0].length;
        return;
      }
    }
    fail(json5 ? t('Oczekiwano nazwy klucza') : t('Oczekiwano nazwy klucza w cudzysłowie'));
  };
  const list = (close: string, item: () => void) => {
    i++;
    space();
    if (text[i] === close) {
      i++;
      return;
    }
    for (;;) {
      item();
      space();
      if (text[i] === ',') {
        i++;
        space();
        if (text[i] === close) {
          if (!json5) fail(t('Zbędny przecinek przed „{0}”', close));
          i++;
          return;
        }
        continue;
      }
      if (text[i] === close) {
        i++;
        return;
      }
      if (i >= text.length) fail(t('Plik kończy się przed „{0}”', close));
      fail(t('Oczekiwano „,” albo „{0}”', close));
    }
  };
  const value = (): void => {
    space();
    const c = text[i];
    if (c === undefined) fail(t('Nieoczekiwany koniec pliku'));
    if (c === '{') {
      return list('}', () => {
        key();
        space();
        if (text[i] !== ':') fail(t('Oczekiwano „:”'));
        i++;
        value();
      });
    }
    if (c === '[') return list(']', value);
    if (c === '"' || (json5 && c === "'")) return string();
    if (word('true') || word('false') || word('null')) return;
    if (/[\d.+-]/.test(c) || (json5 && (text.startsWith('Infinity', i) || text.startsWith('NaN', i)))) return number();
    fail(t('Nieoczekiwany znak „{0}”', c));
  };
  try {
    space();
    if (i >= text.length) return undefined; // an empty file: the mod writes its defaults
    value();
    space();
    if (i < text.length) fail(t('Nieoczekiwany znak „{0}” po końcu danych', text[i]));
    return undefined;
  } catch (err) {
    if (!(err instanceof ParseError)) throw err;
    return { ...position(text, Math.min(err.index, text.length)), message: err.message };
  }
}

/**
 * Checks the structure of a TOML file: table headers, `key = value` lines, strings,
 * arrays and inline tables (also over several lines), and keys or tables defined twice.
 */
function checkToml(text: string): ConfigProblem | undefined {
  let i = 0;
  const fail = (message: string, at = i): never => {
    throw new ParseError(message, at);
  };
  const BARE = /[A-Za-z0-9_-]+/y;
  const hspace = () => {
    while (text[i] === ' ' || text[i] === '\t') i++;
  };
  const comment = () => {
    if (text[i] === '#') while (i < text.length && text[i] !== '\n') i++;
  };
  /** Spaces, comments and new lines (inside arrays). */
  const anySpace = () => {
    for (;;) {
      hspace();
      comment();
      if (text[i] === '\n' || text[i] === '\r') i++;
      else return;
    }
  };
  const endOfLine = () => {
    hspace();
    comment();
    if (text[i] === '\r') i++;
    if (i < text.length && text[i] !== '\n') fail(t('Oczekiwano końca linii'));
    i++;
  };
  const stringAt = (): string => {
    const start = i;
    for (const q of ['"""', "'''"]) {
      if (text.startsWith(q, i)) {
        const end = text.indexOf(q, i + 3);
        if (end < 0) fail(t('Niezamknięty tekst'), start);
        i = end + 3;
        while (text[i] === q[0]) i++; // up to two quotes may end the string
        return text.slice(start + 3, end);
      }
    }
    const q = text[i++];
    while (i < text.length && text[i] !== q) {
      if (text[i] === '\n') fail(t('Niezamknięty tekst'), start);
      if (q === '"' && text[i] === '\\') {
        i++;
        if (!/[btnfr"\\uUe]/.test(text[i] ?? '')) fail(t('Nieprawidłowy znak po \\'));
      }
      i++;
    }
    if (i >= text.length) fail(t('Niezamknięty tekst'), start);
    i++;
    return text.slice(start + 1, i - 1);
  };
  const keyPart = (): string => {
    if (text[i] === '"' || text[i] === "'") {
      if (text.startsWith('"""', i) || text.startsWith("'''", i)) fail(t('Oczekiwano nazwy klucza'));
      return stringAt();
    }
    BARE.lastIndex = i;
    const m = BARE.exec(text);
    if (!m) fail(t('Oczekiwano nazwy klucza'));
    i += m![0].length;
    return m![0];
  };
  const dottedKey = (): string[] => {
    const parts = [keyPart()];
    for (;;) {
      hspace();
      if (text[i] !== '.') return parts;
      i++;
      hspace();
      parts.push(keyPart());
    }
  };
  const value = (): void => {
    const c = text[i];
    if (c === '"' || c === "'") {
      stringAt();
      return;
    }
    if (c === '[') {
      i++;
      anySpace();
      while (text[i] !== ']') {
        if (i >= text.length) fail(t('Plik kończy się przed „{0}”', ']'));
        value();
        anySpace();
        if (text[i] === ',') {
          i++;
          anySpace();
        } else if (text[i] !== ']') fail(t('Oczekiwano „,” albo „{0}”', ']'));
      }
      i++;
      return;
    }
    if (c === '{') {
      i++;
      hspace();
      const seen = new Set<string>();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        const at = i;
        const k = dottedKey().join('.');
        if (seen.has(k)) fail(t('Klucz „{0}” jest już zdefiniowany', k), at);
        seen.add(k);
        hspace();
        if (text[i] !== '=') fail(t('Oczekiwano „=”'));
        i++;
        hspace();
        value();
        hspace();
        if (text[i] === ',') {
          i++;
          hspace();
          continue;
        }
        if (text[i] === '}') {
          i++;
          return;
        }
        fail(t('Oczekiwano „,” albo „{0}”', '}'));
      }
    }
    // a bare value: number, boolean, date or time
    const m = /[^\s,\]}#]+(?: \d{2}:\d{2}[^\s,\]}#]*)?/y;
    m.lastIndex = i;
    const found = m.exec(text)?.[0];
    if (!found) fail(t('Oczekiwano wartości'));
    const ok = /^(?:true|false|[+-]?(?:inf|nan)|[+-]?(?:0x[\da-fA-F](?:_?[\da-fA-F])*|0o[0-7](?:_?[0-7])*|0b[01](?:_?[01])*|(?:0|[1-9](?:_?\d)*)(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?)|\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:\d{2})?)?|\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.test(found!);
    if (!ok) fail(t('Nieprawidłowa wartość „{0}” (tekst musi być w cudzysłowie)', found!));
    i += found!.length;
  };

  const tables = new Set<string>();
  const keys = new Set<string>();
  let table = '';
  try {
    if (text.charCodeAt(0) === 0xfeff) i = 1;
    while (i < text.length) {
      hspace();
      if (text[i] === '#' || text[i] === '\n' || text[i] === '\r') {
        endOfLine();
        continue;
      }
      if (i >= text.length) break;
      const at = i;
      if (text[i] === '[') {
        const array = text[i + 1] === '[';
        i += array ? 2 : 1;
        hspace();
        const name = dottedKey().join('.');
        hspace();
        if (!text.startsWith(array ? ']]' : ']', i)) fail(t('Oczekiwano „{0}”', array ? ']]' : ']'));
        i += array ? 2 : 1;
        if (!array) {
          if (tables.has(name) || keys.has(name)) fail(t('Tabela „{0}” jest już zdefiniowana', name), at);
          tables.add(name);
        }
        // entries of an array of tables each start afresh
        if (array) for (const k of [...keys]) if (k.startsWith(`${name}.`)) keys.delete(k);
        table = name;
        endOfLine();
        continue;
      }
      const name = [table, ...dottedKey()].filter(Boolean).join('.');
      if (keys.has(name) || tables.has(name)) fail(t('Klucz „{0}” jest już zdefiniowany', name), at);
      keys.add(name);
      hspace();
      if (text[i] !== '=') fail(t('Oczekiwano „=”'));
      i++;
      hspace();
      value();
      endOfLine();
    }
    return undefined;
  } catch (err) {
    if (!(err instanceof ParseError)) throw err;
    return { ...position(text, Math.min(err.index, text.length)), message: err.message };
  }
}
