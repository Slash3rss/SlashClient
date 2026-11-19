// The panel the admin panel's pickers (colour, icon) open from their button: under the button, or
// over it when there is no room below; on a phone a sheet at the bottom of the screen. A click
// outside, Escape or opening another picker closes it.

/** The one picker open at a time (opening another closes it). */
let openOne;

/**
 * Ties `panel` to the button `root`: a click on the button opens or closes it. `onOpen` runs before
 * it shows, `onClose` after it is gone; Escape calls `onCancel` first (to put back what was there).
 */
export function popover(root, panel, { onOpen, onClose, onCancel, focus }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'cp-backdrop';
  backdrop.addEventListener('click', () => close(false));
  root.setAttribute('aria-haspopup', 'dialog');
  root.setAttribute('aria-expanded', 'false');

  function place() {
    const sheet = innerWidth < 560;
    panel.classList.toggle('sheet', sheet);
    backdrop.classList.toggle('sheet', sheet);
    if (sheet) { panel.style.left = panel.style.top = ''; return; }
    const r = root.getBoundingClientRect();
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const below = r.bottom + 8 + h <= innerHeight - 8 || r.top - 8 - h < 8;
    panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    // kept on the screen even when the button itself has scrolled off it
    panel.style.top = `${Math.max(8, Math.min(below ? r.bottom + 8 : r.top - 8 - h, innerHeight - h - 8))}px`;
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel?.(); close(true); } };
  const onScroll = (e) => { if (!panel.contains(e.target)) place(); };
  function open() {
    if (openOne) openOne(false);
    openOne = close;
    onOpen?.();
    document.body.append(backdrop, panel);
    place();
    root.setAttribute('aria-expanded', 'true');
    addEventListener('keydown', onKey, true);
    addEventListener('resize', place);
    addEventListener('scroll', onScroll, true);
    (focus?.() ?? panel).focus({ preventScroll: true });
  }
  function close(refocus) {
    if (!panel.isConnected) return;
    panel.remove();
    backdrop.remove();
    openOne = undefined;
    root.setAttribute('aria-expanded', 'false');
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', place);
    removeEventListener('scroll', onScroll, true);
    onClose?.();
    if (refocus) root.focus({ preventScroll: true });
  }
  root.addEventListener('click', (e) => { e.preventDefault(); if (panel.isConnected) close(true); else open(); });
  return { open, close, place, isOpen: () => panel.isConnected };
}
