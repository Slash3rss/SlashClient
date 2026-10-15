import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const on = (channel: string, fn: (payload: any) => void) => {
  const listener = (_e: unknown, payload: unknown) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const api = {
  getStore: () => invoke('store:get'),
  listVersions: () => invoke('versions:list'),
  saveSettings: (s: unknown) => invoke('settings:save', s),
  newProfile: () => invoke('profile:new'),
  saveProfile: (p: unknown) => invoke('profile:save', p),
  deleteProfile: (id: string) => invoke('profile:delete', id),
  openProfileDir: (id: string) => invoke('profile:openDir', id),
  openModsDir: (id: string) => invoke('profile:openMods', id),
  setProfileIcon: (id: string, icon: string) => invoke('profile:setIcon', id, icon),
  chooseProfileIcon: (id: string) => invoke('profile:chooseIcon', id),
  loaderVersions: (loader: string, versionId: string) => invoke('loaders:versions', loader, versionId),
  addOfflineAccount: (name: string) => invoke('account:addOffline', name),
  deleteAccount: (id: string) => invoke('account:delete', id),
  loginMicrosoft: () => invoke('account:loginMicrosoft'),
  cancelLogin: () => invoke('account:cancelLogin'),
  launch: (profileId: string, accountId: string, server?: string, world?: string) => invoke('game:launch', profileId, accountId, server, world),
  listServers: (force?: boolean) => invoke('servers:list', force),
  searchContent: (profileId: string, query: string, type: string, offset?: number) => invoke('content:search', profileId, query, type, offset),
  listContent: (profileId: string) => invoke('content:list', profileId),
  installContent: (profileId: string, projectId: string, type: string, title?: string, icon?: string, versionId?: string) =>
    invoke('content:install', profileId, projectId, type, title, icon, versionId),
  contentVersions: (profileId: string, projectId: string, type: string, onlyCompatible: boolean) =>
    invoke('content:versions', profileId, projectId, type, onlyCompatible),
  checkUpdates: (profileId: string) => invoke('content:checkUpdates', profileId),
  updateContent: (profileId: string, items: unknown[]) => invoke('content:update', profileId, items),
  checkModpack: (profileId: string) => invoke('modpack:check', profileId),
  updateModpack: (profileId: string, versionId?: string) => invoke('modpack:update', profileId, versionId),
  toggleContent: (profileId: string, type: string, filename: string, enabled: boolean) => invoke('content:toggle', profileId, type, filename, enabled),
  removeContent: (profileId: string, type: string, filename: string) => invoke('content:remove', profileId, type, filename),
  installModpack: (projectId: string, title: string, iconUrl?: string, versionId?: string) => invoke('modpack:install', projectId, title, iconUrl, versionId),
  importModpack: () => invoke('modpack:import'),
  pingServer: (address: string) => invoke('servers:ping', address),
  kill: () => invoke('game:kill'),
  revealFile: (file: string) => invoke('file:reveal', file),
  openFile: (file: string) => invoke('file:open', file),
  getSkin: (accountId: string) => invoke('skin:get', accountId),
  saveSkin: (accountId: string) => invoke('skin:save', accountId),
  listNews: (offset: number, limit: number, filter: string) => invoke('news:list', offset, limit, filter),
  installUpdate: () => invoke('update:install'),
  appVersion: () => invoke('app:version'),
  newsArticle: (id: string) => invoke('news:article', id),
  listWorlds: (profileId: string) => invoke('worlds:list', profileId),
  backupWorld: (profileId: string, folder: string) => invoke('worlds:backup', profileId, folder),
  listBackups: (profileId: string) => invoke('backups:list', profileId),
  restoreBackup: (profileId: string, name: string) => invoke('backups:restore', profileId, name),
  deleteBackup: (profileId: string, name: string) => invoke('backups:delete', profileId, name),
  listScreenshots: (profileId: string) => invoke('screenshots:list', profileId),
  deleteScreenshot: (profileId: string, name: string) => invoke('screenshots:delete', profileId, name),
  on,
};

contextBridge.exposeInMainWorld('slash', api);
export type SlashApi = typeof api;
