import { t } from '../shared/i18n';

/** Small DOM helpers shared by the config editor and the disk cleanup. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** Form controls: their prop types are too large for `el`'s inference. */
export const control = <T extends HTMLElement>(tag: string, props: Record<string, unknown>) => Object.assign(document.createElement(tag), props) as unknown as T;

export const icon = (name: string) => el('i', { className: `fa-solid ${name}` });

const MB = 1024 * 1024;
export const fmtSize = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.max(b ? 1 : 0, Math.round(b / 1024))} KB`);

export interface ConfirmOptions {
  title: string;
  body: (Node | string)[];
  ok: string;
  okIcon?: string;
  danger?: boolean;
}

/** A question in the launcher's own window style; resolves true when the player confirms. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const ok = el('button', { type: 'button', className: opts.danger ? 'danger' : 'primary' }, ...(opts.okIcon ? [icon(opts.okIcon), ' '] : []), opts.ok);
    const close = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));
    const modal = el('div', { className: 'modal' },
      el('div', { className: 'modal-box glass-panel join-box confirm-box' }, close,
        el('div', { className: 'modal-body' }, el('h2', { textContent: opts.title }), ...opts.body, el('div', { className: 'row join-actions' }, cancel, ok))));
    const done = (answer: boolean) => {
      modal.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(answer);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(false);
      }
    };
    cancel.addEventListener('click', () => done(false));
    close.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    modal.addEventListener('click', (e) => e.target === modal && done(false));
    document.addEventListener('keydown', onKey, true);
    document.body.append(modal);
    ok.focus();
  });
}
