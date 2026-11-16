// A small menu under the mouse (right-click), in the launcher's own look: quick actions on a list's row.

export interface MenuItem {
  icon: string;
  label: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}

let open: HTMLElement | undefined;

export function closeContextMenu() {
  open?.remove();
  open = undefined;
}

/** Opens the menu at the mouse (kept inside the window); a click elsewhere, Esc, scrolling or resizing closes it. */
export function showContextMenu(x: number, y: number, items: (MenuItem | 'line')[]) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    if (item === 'line') {
      menu.append(document.createElement('hr'));
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.disabled = !!item.disabled;
    if (item.danger) button.classList.add('danger');
    const icon = document.createElement('i');
    icon.className = `fa-solid ${item.icon}`;
    button.append(icon, document.createTextNode(item.label));
    button.addEventListener('click', () => {
      closeContextMenu();
      item.run();
    });
    menu.append(button);
  }
  document.body.append(menu);
  open = menu;
  // the size without the opening animation's scale (getBoundingClientRect would measure it a bit smaller)
  const width = menu.offsetWidth, height = Math.min(menu.offsetHeight, window.innerHeight - 8);
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - height - 4))}px`;
  menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  menu.addEventListener('keydown', (e) => {
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  });
}

document.addEventListener('mousedown', (e) => {
  if (open && !open.contains(e.target as Node)) closeContextMenu();
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open) {
    e.stopPropagation();
    closeContextMenu();
  }
}, true);
window.addEventListener('blur', closeContextMenu);
window.addEventListener('resize', closeContextMenu);
document.addEventListener('scroll', closeContextMenu, true);
