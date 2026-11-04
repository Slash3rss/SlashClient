// The wiki's pages (/wiki, /en/wiki): answers while typing in the search box, from the wiki's list
// (/v1/wiki: titles, descriptions and headings), and the menu and contents folded on narrow screens.
// Without this script the search is a plain form (/wiki?q=) and the lists stay open.

const fold = (s) => s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');

let index;
function load(lang) {
  index ??= fetch(`/v1/wiki?lang=${lang}`).then((r) => (r.ok ? r.json() : { sections: [] })).then((r) => r.sections.flatMap((s) => s.pages.map((p) => ({
    ...p, section: s.title, t: fold(p.title), d: fold(p.description || ''), h: fold((p.headings || []).join(' ')),
  })))).catch(() => { index = undefined; return []; });
  return index;
}

/** The same order as the server's search (src/wiki/pages.ts): title, then description, then headings. */
function search(pages, q) {
  const words = fold(q).split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  return pages.map((p) => {
    let score = 0;
    for (const w of words) {
      const s = (p.t.includes(w) ? 10 : 0) + (p.d.includes(w) ? 4 : 0) + (p.h.includes(w) ? 2 : 0) + (p.slug.includes(w) ? 1 : 0);
      if (!s) return { p, score: 0 };
      score += s;
    }
    return { p, score };
  }).filter((x) => x.score).sort((a, b) => b.score - a.score).slice(0, 12).map((x) => x.p);
}

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

for (const form of document.querySelectorAll('.wiki-search')) {
  const input = form.querySelector('input');
  const box = form.querySelector('.wiki-hits');
  const lang = input.dataset.lang === 'en' ? 'en' : 'pl';
  const prefix = lang === 'en' ? '/en/wiki/' : '/wiki/';
  let active = -1;
  const links = () => [...box.querySelectorAll('a')];
  const mark = (i) => {
    active = i;
    links().forEach((a, k) => a.classList.toggle('active', k === i));
    links()[i]?.scrollIntoView({ block: 'nearest' });
  };
  async function update() {
    const q = input.value.trim();
    if (!q) {
      box.hidden = true;
      return;
    }
    const hits = search(await load(lang), q);
    if (input.value.trim() !== q) return;
    box.replaceChildren(...(hits.length
      ? hits.map((p) => el('a', { href: prefix + p.slug }, el('em', { textContent: p.section }), el('b', { textContent: p.title }), p.description ? el('small', { textContent: p.description }) : ''))
      : [el('p', { textContent: lang === 'en' ? 'Nothing found. Try another word.' : 'Nic nie znaleziono. Spróbuj innego słowa.' })]));
    active = -1;
    box.hidden = false;
  }
  input.addEventListener('focus', () => void load(lang));
  input.addEventListener('input', () => void update());
  input.addEventListener('keydown', (e) => {
    const n = links().length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); mark((active + 1) % n); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); mark((active - 1 + n) % n); }
    else if (e.key === 'Escape') box.hidden = true;
    else if (e.key === 'Enter' && n) {
      // the marked result, or the first one; with no results the form searches on the server
      e.preventDefault();
      location.href = links()[Math.max(active, 0)].href;
    }
  });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) box.hidden = true; });
}

// the menu and the contents: open beside the text on wide screens, folded above it on narrow ones
const narrow = window.matchMedia('(max-width: 860px)');
const medium = window.matchMedia('(max-width: 1180px)');
const menu = document.getElementById('wiki-menu');
const toc = document.getElementById('legal-toc');
const fold2 = () => {
  if (menu) menu.open = !narrow.matches;
  if (toc) toc.open = !medium.matches;
};
fold2();
narrow.addEventListener('change', fold2);
medium.addEventListener('change', fold2);
toc?.addEventListener('click', (e) => { if (medium.matches && e.target instanceof HTMLAnchorElement) toc.open = false; });
