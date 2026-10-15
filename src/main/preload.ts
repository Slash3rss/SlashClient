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
  addOfflineAccount: (name: string) => invoke('account:addOffline', name),
  deleteAccount: (id: string) => invoke('account:delete', id),
  loginMicrosoft: () => invoke('account:loginMicrosoft'),
  cancelLogin: () => invoke('account:cancelLogin'),
  launch: (profileId: string, accountId: string, server?: string) => invoke('game:launch', profileId, accountId, server),
  listServers: (force?: boolean) => invoke('servers:list', force),
  pingServer: (address: string) => invoke('servers:ping', address),
  kill: () => invoke('game:kill'),
  on,
};

contextBridge.exposeInMainWorld('slash', api);
export type SlashApi = typeof api;
