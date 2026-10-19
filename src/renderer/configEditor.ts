import { FORMAT_NAMES, formatOf, highlight, validateConfig, type ConfigFormat, type ConfigProblem } from '../shared/configFormats';
import { t } from '../shared/i18n';
import { confirmDialog, control, el, fmtSize, icon } from './dialog';

/**
 * The profile's "Configi" pane: the files in its config/ folder as a tree with a search, and an
 * editor with syntax highlighting. Paths sent to the main process are always relative to config/.
 * Unsaved changes are kept as drafts per file, so switching files or profiles loses nothing.
 */

interface ConfigEntry { path: string; size: number; modifiedAt: number }
interface ConfigFile { path: string; text: string; crlf: boolean; bom: boolean; modifiedAt: number; size: number }
interface OpenFile extends ConfigFile { profileId: string; format: ConfigFormat; saved: string }

export interface ConfigEditorDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

/** Highlighting a huge file on every key press would make typing lag; such files are shown plain. */
const HIGHLIGHT_LIMIT = 300_000;

export function createConfigEditor(root: HTMLElement, deps: ConfigEditorDeps) {
  const { api, toast, errorText } = deps;
  let profileId: string | undefined;
  let files: ConfigEntry[] = [];
  let truncated = false;
  let running = false;
  let query = '';
  let current: OpenFile | undefined;
  /** Folders the player opened in the tree (closed ones are the default). */
  const expanded = new Set<string>();
  /** Unsaved texts by "profile/file", with the file's modification time they were based on. */
  const drafts = new Map<string, { text: string; base: number }>();
  const draftKey = (pid: string, path: string) => `${pid}/${path}`;

  // ---------- the pane's parts ----------

  const notice = el('div', { className: 'notice hidden' });
  const search = control<HTMLInputElement>('input', { placeholder: t('Szukaj pliku…'), type: 'search' });
  const openDir = el('button', { type: 'button' }, icon('fa-folder-open'), ' ', t('Otwórz folder'));
  const reload = el('button', { type: 'button', className: 'icon-btn', title: t('Odśwież listę') }, icon('fa-rotate'));
  const tree = el('div', { className: 'cfg-tree' });
  const treeBox = el('div', { className: 'cfg-side glass-panel' }, tree);

  const title = el('div', { className: 'cfg-title' });
  const status = el('div', { className: 'cfg-status' });
  const restore = el('button', { type: 'button', className: 'danger', title: t('Usuwa plik, a mod utworzy go od nowa z ustawieniami domyślnymi') }, icon('fa-clock-rotate-left'), ' ', t('Przywróć domyślne'));
  const revert = el('button', { type: 'button', className: 'icon-btn', title: t('Cofnij zmiany') }, icon('fa-rotate-left'));
  const save = el('button', { type: 'button', className: 'primary' }, icon('fa-floppy-disk'), ' ', t('Zapisz'));
  const code = el('pre', { className: 'cfg-highlight', ariaHidden: 'true' });
  const input = control<HTMLTextAreaElement>('textarea', { className: 'cfg-input', spellcheck: false, wrap: 'off' });
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocomplete', 'off');
  const editorArea = el('div', { className: 'cfg-code' }, code, input);
  const placeholder = el('div', { className: 'cfg-empty muted' }, icon('fa-file-pen'), el('p', { textContent: t('Wybierz plik z listy, żeby go edytować.') }));
  const editor = el('div', { className: 'cfg-editor glass-panel' },
    el('div', { className: 'cfg-head' }, title, el('div', { className: 'row cfg-actions' }, restore, revert, save)),
    status, editorArea, placeholder);

  root.append(
    notice,
    el('div', { className: 'filters glass-panel' }, el('div', { className: 'search' }, icon('fa-magnifying-glass'), search), openDir, reload),
    el('div', { className: 'cfg-split' }, treeBox, editor),
    el('p', { className: 'muted cfg-foot' }, t('Ctrl+S zapisuje. Zmiany działają po ponownym uruchomieniu gry; niektóre mody wczytują config tylko przy starcie.')),
  );

  // ---------- the tree ----------

  interface Folder { name: string; path: string; folders: Map<string, Folder>; files: ConfigEntry[] }

  function buildTree(list: ConfigEntry[]): Folder {
    const top: Folder = { name: '', path: '', folders: new Map(), files: [] };
    for (const f of list) {
      const parts = f.path.split('/');
      let folder = top;
      for (const part of parts.slice(0, -1)) {
        const p = folder.path ? `${folder.path}/${part}` : part;
        if (!folder.folders.has(part)) folder.folders.set(part, { name: part, path: p, folders: new Map(), files: [] });
        folder = folder.folders.get(part)!;
      }
      folder.files.push(f);
    }
    return top;
  }

  function renderTree() {
    const q = query.trim().toLowerCase();
    const shown = q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;
    if (!files.length) {
      tree.replaceChildren(el('p', { className: 'muted cfg-none', textContent: t('Ten profil nie ma jeszcze configów. Mody tworzą je przy pierwszym uruchomieniu gry.') }));
      return;
    }
    if (!shown.length) {
      tree.replaceChildren(el('p', { className: 'muted cfg-none', textContent: t('Nic nie pasuje do wyszukiwania.') }));
      return;
    }
    const folderNode = (folder: Folder, depth: number): HTMLElement[] => {
      const out: HTMLElement[] = [];
      const pad = (n: HTMLElement) => {
        n.style.paddingLeft = `${8 + depth * 14}px`;
        return n;
      };
      for (const sub of [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        // while searching every folder with a match is open
        const open = !!q || expanded.has(sub.path);
        const row = pad(el('button', { type: 'button', className: 'cfg-row folder', title: sub.path },
          icon(open ? 'fa-folder-open' : 'fa-folder'), el('span', { className: 'grow', textContent: sub.name })));
        row.addEventListener('click', () => {
          if (q) return;
          if (expanded.has(sub.path)) expanded.delete(sub.path);
          else expanded.add(sub.path);
          renderTree();
        });
        out.push(row);
        if (open) out.push(...folderNode(sub, depth + 1));
      }
      for (const f of folder.files) {
        const name = f.path.split('/').pop()!;
        const dirty = drafts.has(draftKey(profileId!, f.path));
        const row = pad(el('button', { type: 'button', className: `cfg-row file${current?.path === f.path ? ' selected' : ''}`, title: f.path },
          icon(fileIcon(f.path)), el('span', { className: 'grow', textContent: name }),
          ...(dirty ? [el('span', { className: 'cfg-dot', title: t('Niezapisane zmiany') })] : []),
          el('small', { textContent: fmtSize(f.size) })));
        row.addEventListener('click', () => void openFile(f.path));
        out.push(row);
      }
      return out;
    };
    const rows = folderNode(buildTree(shown), 0);
    if (truncated) rows.push(el('p', { className: 'muted cfg-none', textContent: t('Lista jest skrócona: w folderze jest bardzo dużo plików.') }));
    tree.replaceChildren(...rows);
  }

  const fileIcon = (p: string) => {
    const f = formatOf(p);
    return f === 'json' || f === 'json5' ? 'fa-file-code' : f === 'text' ? 'fa-file-lines' : 'fa-file-pen';
  };

  // ---------- the editor ----------

  let paintQueued = false;
  function paint() {
    paintQueued = false;
    if (!current) return;
    const text = input.value;
    // a trailing new line needs something after it, or the last empty line has no height
    if (text.length > HIGHLIGHT_LIMIT || current.format === 'text') code.replaceChildren(text + '\n');
    else code.replaceChildren(...highlight(text, current.format).map((tok) => (tok.cls ? el('span', { className: `tk-${tok.cls}`, textContent: tok.text }) : tok.text)), '\n');
    code.scrollTop = input.scrollTop;
    code.scrollLeft = input.scrollLeft;
  }
  const queuePaint = () => {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(paint);
  };

  let checkTimer: ReturnType<typeof setTimeout> | undefined;
  function problemText(p: ConfigProblem) {
    return t('Błąd w linii {0}, kolumna {1}: {2}', p.line, p.column, p.message);
  }
  function renderStatus() {
    if (!current) return;
    const dirty = input.value !== current.saved;
    save.disabled = running || !dirty;
    revert.disabled = !dirty;
    restore.disabled = running;
    input.readOnly = running;
    const parts: (Node | string)[] = [];
    const canCheck = current.format === 'json' || current.format === 'json5' || current.format === 'toml';
    const problem = canCheck && input.value.length <= 2 * 1024 * 1024 ? validateConfig(input.value, current.format) : undefined;
    status.className = `cfg-status${problem ? ' bad' : ''}`;
    if (problem) parts.push(icon('fa-triangle-exclamation'), ' ', problemText(problem));
    else if (canCheck) parts.push(icon('fa-circle-check'), ' ', t('Składnia poprawna'));
    if (dirty) parts.push(el('span', { className: 'cfg-changed', textContent: t('niezapisane zmiany') }));
    status.replaceChildren(...parts);
    title.replaceChildren(el('b', { textContent: current.path }), el('span', { className: 'tag mode', textContent: t(FORMAT_NAMES[current.format]) }), el('small', { className: 'muted', textContent: fmtSize(current.size) }));
  }
  const queueCheck = () => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(renderStatus, 350);
  };

  function showEditor(on: boolean) {
    editor.classList.toggle('empty', !on);
    placeholder.classList.toggle('hidden', on);
    for (const n of [editorArea, status, editor.querySelector('.cfg-head')!]) (n as HTMLElement).classList.toggle('hidden', !on);
  }
  showEditor(false);

  /** Puts the open file's unsaved text aside as a draft (or drops the draft when there is nothing unsaved). */
  function keepDraft() {
    if (!current) return;
    const k = draftKey(current.profileId, current.path);
    if (input.value !== current.saved) drafts.set(k, { text: input.value, base: current.modifiedAt });
    else drafts.delete(k);
  }

  async function openFile(rel: string) {
    if (!profileId) return;
    if (current?.path === rel && current.profileId === profileId) return;
    keepDraft();
    const pid = profileId;
    try {
      const file: ConfigFile = await api.readConfig(pid, rel);
      if (pid !== profileId) return;
      current = { ...file, profileId: pid, format: formatOf(rel), saved: file.text };
      const draft = drafts.get(draftKey(pid, rel));
      // a draft made on an older version of the file (the game rewrote it) is offered, not applied silently
      if (draft && draft.base !== file.modifiedAt) {
        const keep = await confirmDialog({
          title: t('Plik zmienił się na dysku'),
          body: [el('p', { className: 'muted', textContent: t('Masz niezapisane zmiany w {0}, ale od tamtej pory gra lub mod zapisał ten plik ponownie. Wczytać Twoje zmiany zamiast wersji z dysku?', rel) })],
          ok: t('Wczytaj moje zmiany'),
        });
        if (!keep) drafts.delete(draftKey(pid, rel));
      }
      input.value = drafts.get(draftKey(pid, rel))?.text ?? file.text;
      input.scrollTop = 0;
      input.scrollLeft = 0;
      showEditor(true);
      paint();
      renderStatus();
      renderTree();
    } catch (err) {
      toast(errorText(err), true);
    }
  }

  async function doSave() {
    if (!current || running || !profileId) return;
    const file = current;
    const text = input.value;
    const problem = validateConfig(text, file.format);
    if (problem) {
      const go = await confirmDialog({
        title: t('W pliku jest błąd'),
        body: [
          el('p', { className: 'cfg-problem', textContent: problemText(problem) }),
          el('p', { className: 'muted', textContent: t('Mod może nie wczytać takiego pliku albo zastąpić go domyślnym. Zapisać mimo to?') }),
        ],
        ok: t('Zapisz mimo to'),
        danger: true,
      });
      if (!go) return;
    }
    try {
      const opts = { crlf: file.crlf, bom: file.bom, modifiedAt: file.modifiedAt };
      let result: number | { changed: true } = await api.saveConfig(file.profileId, file.path, text, opts);
      if (typeof result === 'object' && result.changed) {
        const overwrite = await confirmDialog({
          title: t('Plik zmienił się na dysku'),
          body: [el('p', { className: 'muted', textContent: t('Od otwarcia tego pliku gra lub mod zapisał go ponownie. Nadpisać go Twoją wersją?') })],
          ok: t('Nadpisz'),
          danger: true,
        });
        if (!overwrite) return;
        result = await api.saveConfig(file.profileId, file.path, text, { ...opts, force: true });
      }
      if (current !== file) return;
      file.modifiedAt = result as number;
      file.saved = text;
      file.size = new Blob([text]).size;
      drafts.delete(draftKey(file.profileId, file.path));
      toast(t('Zapisano {0}', file.path.split('/').pop()!));
      renderStatus();
      void refreshList();
    } catch (err) {
      toast(errorText(err), true);
    }
  }

  async function doRestore() {
    if (!current || running) return;
    const file = current;
    const name = file.path.split('/').pop()!;
    const go = await confirmDialog({
      title: t('Przywrócić domyślne ustawienia?'),
      body: [
        el('p', { className: 'muted', textContent: t('Plik {0} trafi do kosza (a gdy kosza nie ma, zostanie przemianowany na .bak). Przy następnym uruchomieniu gry mod utworzy go od nowa z ustawieniami domyślnymi.', name) }),
        el('p', { className: 'muted', textContent: t('Twoje zmiany w tym pliku przepadną, ale stary plik możesz jeszcze odzyskać z kosza.') }),
      ],
      ok: t('Przywróć domyślne'),
      okIcon: 'fa-clock-rotate-left',
      danger: true,
    });
    if (!go) return;
    try {
      const where: 'trash' | 'bak' = await api.restoreConfig(file.profileId, file.path);
      drafts.delete(draftKey(file.profileId, file.path));
      current = undefined;
      showEditor(false);
      toast(where === 'trash' ? t('{0} jest w koszu. Mod utworzy go od nowa przy następnym uruchomieniu gry.', name) : t('{0} zmieniono na .bak. Mod utworzy go od nowa przy następnym uruchomieniu gry.', name));
      await refreshList();
    } catch (err) {
      toast(errorText(err), true);
    }
  }

  async function refreshList() {
    if (!profileId) return;
    const pid = profileId;
    try {
      const res: { files: ConfigEntry[]; truncated: boolean; running: boolean } = await api.listConfigs(pid);
      if (pid !== profileId) return;
      files = res.files;
      truncated = res.truncated;
      setRunning(res.running);
      // the open file was removed outside the launcher
      if (current && !files.some((f) => f.path === current!.path)) {
        current = undefined;
        showEditor(false);
      }
      renderTree();
    } catch (err) {
      toast(errorText(err), true);
    }
  }

  function setRunning(on: boolean) {
    running = on;
    notice.classList.toggle('hidden', !on);
    notice.textContent = t('Gra tego profilu jest uruchomiona. Configi są teraz tylko do odczytu: gra zapisuje część z nich przy wyjściu i nadpisałaby Twoje zmiany.');
    if (current) renderStatus();
  }

  // ---------- events ----------

  input.addEventListener('input', () => {
    queuePaint();
    queueCheck();
    save.disabled = running || input.value === current?.saved;
    revert.disabled = input.value === current?.saved;
  });
  input.addEventListener('scroll', () => {
    code.scrollTop = input.scrollTop;
    code.scrollLeft = input.scrollLeft;
  });
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void doSave();
    } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !input.readOnly) {
      // Tab indents instead of leaving the editor (execCommand keeps Ctrl+Z working)
      e.preventDefault();
      if (!document.execCommand('insertText', false, '  ')) input.setRangeText('  ', input.selectionStart, input.selectionEnd, 'end');
    }
  });
  save.addEventListener('click', () => void doSave());
  revert.addEventListener('click', () => {
    if (!current) return;
    input.value = current.saved;
    drafts.delete(draftKey(current.profileId, current.path));
    paint();
    renderStatus();
    renderTree();
  });
  restore.addEventListener('click', () => void doRestore());
  search.addEventListener('input', () => {
    query = search.value;
    renderTree();
  });
  reload.addEventListener('click', () => void refreshList());
  openDir.addEventListener('click', () => profileId && api.openConfigDir(profileId).catch((err: unknown) => toast(errorText(err), true)));
  // a game starting or closing makes the files read-only or editable again
  api.on('store', (s: { runningProfiles?: string[] }) => {
    if (profileId) setRunning((s.runningProfiles ?? []).includes(profileId));
  });

  return {
    /** Shows a profile's configs (called when the pane opens or another profile is picked). */
    open(id: string | undefined) {
      if (id !== profileId) {
        keepDraft();
        profileId = id;
        current = undefined;
        files = [];
        expanded.clear();
        search.value = query = '';
        showEditor(false);
        tree.replaceChildren();
      }
      void refreshList();
    },
  };
}
