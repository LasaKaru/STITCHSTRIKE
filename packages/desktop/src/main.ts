import { app, BrowserWindow, ipcMain, Menu, screen, shell } from 'electron';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PORT } from '@stitchstrike/shared';
import { startGameServer, type GameServer } from '@stitchstrike/server/src/server.ts';
import { initSteam, type Steam } from './steam.ts';

/**
 * STITCHSTRIKE desktop (the build that ships on Steam).
 *
 * The app embeds the real game server: it serves the built client over
 * http://127.0.0.1 (module workers, pointer lock and WebSockets all behave
 * exactly as on the web) and hosts online rooms on the same port. Solo play
 * runs the server in a Web Worker as on the web, so it needs no network.
 *
 * Flags: --lan (host rooms for other PCs on the network) · --windowed ·
 *        --steam-overlay (in-process GPU so the Steam overlay can hook the window) ·
 *        --no-steam (skip Steamworks even when it is installed)
 */

const LAN = process.argv.includes('--lan') || process.env.STITCHSTRIKE_LAN === '1';
const WINDOWED = process.argv.includes('--windowed');
if (process.argv.includes('--steam-overlay')) {
  // The Steam overlay injects into the process that owns the swap chain.
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('disable-direct-composition');
}
// Games want the discrete GPU and an uncapped, unthrottled render loop.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let server: GameServer | null = null;
let steam: Steam | null = null;
let win: BrowserWindow | null = null;

function clientDir(): string {
  // Packaged: resources/app.asar/client. Dev: packages/desktop/client (copied by scripts/build.mjs).
  const packaged = join(__dirname, '..', 'client');
  return existsSync(packaged) ? packaged : join(__dirname, '..', '..', 'client', 'dist');
}

async function startServer(): Promise<GameServer> {
  const host = LAN ? '0.0.0.0' : '127.0.0.1';
  const staticDir = clientDir();
  const log = (m: string) => console.log(m);
  try {
    return await startGameServer({ port: DEFAULT_PORT, host, staticDir, log });
  } catch {
    // Port busy (another copy, or a dev server): take any free port.
    return startGameServer({ port: 0, host, staticDir, log });
  }
}

function lanAddresses(): string[] {
  if (!LAN) return [];
  return Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
}

function createWindow(port: number): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    title: 'STITCHSTRIKE',
    width: Math.min(1600, width),
    height: Math.min(900, height),
    minWidth: 960,
    minHeight: 600,
    fullscreen: !WINDOWED,
    backgroundColor: '#0f1117',
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  const origin = `http://127.0.0.1:${port}`;
  // Stay inside the game; anything else opens in the player's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) { e.preventDefault(); void shell.openExternal(url); }
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win?.setFullScreen(!win.isFullScreen());
    if (input.type === 'keyDown' && input.key === 'F12' && !app.isPackaged) win?.webContents.toggleDevTools();
  });
  void win.loadURL(`${origin}/`);
  win.on('closed', () => { win = null; });
}

ipcMain.on('ss:quit', () => app.quit());
ipcMain.on('ss:fullscreen', () => win?.setFullScreen(!win.isFullScreen()));
ipcMain.on('ss:version', (e) => { e.returnValue = app.getVersion(); });
ipcMain.handle('ss:lan', () => lanAddresses());
ipcMain.on('ss:steam', (e) => { e.returnValue = { available: !!steam?.available, name: steam?.name ?? '' }; });
ipcMain.on('ss:achievement', (_e, id: unknown) => { if (typeof id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(id)) steam?.achievement(id); });
ipcMain.on('ss:presence', (_e, status: unknown) => { if (typeof status === 'string') steam?.presence(status); });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  Menu.setApplicationMenu(null);
  void app.whenReady().then(async () => {
    steam = initSteam((m) => console.log(m));
    server = await startServer();
    console.log(`STITCHSTRIKE ${app.getVersion()} · game server on ${LAN ? '0.0.0.0' : '127.0.0.1'}:${server.port}`);
    createWindow(server.port);
    app.on('activate', () => { if (!win && server) createWindow(server.port); });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { void server?.close(); });
}
