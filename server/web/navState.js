// The header's account button as it was last shown (the player's name, the admin panel's button): put back
// at once on every page, so a signed-in player does not see "Zaloguj się" for a moment while the page
// asks the server who is signed in. The page's own script still sets it from the server's answer.

const KEY = 'slashclient.nav';
const SIGNED_OUT = ['Zaloguj się', 'Sign in'];

function remembered() {
  try {
    if (!localStorage.getItem('slashclient.token')) return null;
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** What the header shows now, kept for the next page; nothing kept once it says "Zaloguj się". */
function keep() {
  const label = document.querySelector('#nav-account .label');
  if (!label) return;
  try {
    const name = label.textContent.trim();
    if (!name || SIGNED_OUT.includes(name)) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify({ name, admin: !document.querySelector('#nav-admin')?.classList.contains('hidden') }));
  } catch {
    // not kept then: the page shows "Zaloguj się" until the server answers, as before
  }
}

let watched = null;
const observer = new MutationObserver(keep);

/** Puts the remembered name in a freshly shown header and follows what the page then sets there. */
export function restoreNav() {
  const label = document.querySelector('#nav-account .label');
  const was = remembered();
  if (label && was && SIGNED_OUT.includes(label.textContent.trim())) {
    label.textContent = was.name;
    if (was.admin) document.querySelector('#nav-admin')?.classList.remove('hidden');
  }
  const button = document.querySelector('#nav-account');
  if (button && button !== watched) {
    observer.disconnect();
    observer.observe(button, { subtree: true, childList: true, characterData: true });
    observer.observe(document.querySelector('#nav-admin') ?? button, { attributes: true, attributeFilter: ['class'] });
    watched = button;
  }
}

restoreNav();
