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
  loaderVersions: (loader: string, versionId: string) => invoke('loaders:versions', loader, versionId),
  addOfflineAccount: (name: string) => invoke('account:addOffline', name),
  deleteAccount: (id: string) => invoke('account:delete', id),
  loginMicrosoft: () => invoke('account:loginMicrosoft'),
  cancelLogin: () => invoke('account:cancelLogin'),
  launch: (profileId: string, accountId: string, server?: string) => invoke('game:launch', profileId, accountId, server),
  listServers: (force?: boolean) => invoke('servers:list', force),
  searchContent: (profileId: string, query: string, type: string, offset?: number) => invoke('content:search', profileId, query, type, offset),
  listContent: (profileId: string) => invoke('content:list', profileId),
  installContent: (profileId: string, projectId: string, type: string) => invoke('content:install', profileId, projectId, type),
  toggleContent: (profileId: string, type: string, filename: string, enabled: boolean) => invoke('content:toggle', profileId, type, filename, enabled),
  removeContent: (profileId: string, type: string, filename: string) => invoke('content:remove', profileId, type, filename),
  installModpack: (projectId: string) => invoke('modpack:install', projectId),
  importModpack: () => invoke('modpack:import'),
  pingServer: (address: string) => invoke('servers:ping', address),
  kill: () => invoke('game:kill'),
  revealFile: (file: string) => invoke('file:reveal', file),
  on,
};

contextBridge.exposeInMainWorld('slash', api);
export type SlashApi = typeof api;
