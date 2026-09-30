import { contextBridge, ipcRenderer } from 'electron';

/** The only desktop powers the game page gets (see client/src/settings.ts DesktopBridge). */
contextBridge.exposeInMainWorld('stitchstrikeDesktop', {
  quit: () => ipcRenderer.send('ss:quit'),
  toggleFullscreen: () => ipcRenderer.send('ss:fullscreen'),
  version: ipcRenderer.sendSync('ss:version') as string,
  lanAddresses: () => ipcRenderer.invoke('ss:lan') as Promise<string[]>,
});
