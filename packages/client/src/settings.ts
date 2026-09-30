/**
 * Player settings, shared by the main menu (which edits them) and the arena
 * (which reads them). Stored per browser / per desktop install.
 */

export type QualitySetting = 'low' | 'medium' | 'high';

export interface Settings {
  name: string;
  quality: QualitySetting;
  /** Radians per pixel of mouse movement. */
  sensitivity: number;
  fov: number;
  invertY: boolean;
  /** 0..1 */
  sfxVolume: number;
  /** 0..1 */
  musicVolume: number;
  /** Game server for online play; empty means the page's own origin (/ws). */
  server: string;
  showNet: boolean;
}

const KEY = 'ss-settings';

export const DEFAULTS: Settings = {
  name: '',
  quality: 'high',
  sensitivity: 0.0022,
  fov: 90,
  invertY: false,
  sfxVolume: 0.6,
  musicVolume: 0.5,
  server: '',
  showNet: true,
};

export function loadSettings(): Settings {
  let stored: Partial<Settings> = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    // Older builds kept these two on their own keys.
    stored.name ??= localStorage.getItem('ss-name') ?? undefined;
    const sens = localStorage.getItem('ss-sens');
    if (stored.sensitivity === undefined && sens) stored.sensitivity = Number(sens);
  } catch { /* storage unavailable: defaults */ }
  const s = { ...DEFAULTS, ...stored };
  if (!s.name) s.name = `Toy${Math.floor(Math.random() * 900 + 100)}`;
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem('ss-name', s.name);
  } catch { /* ignore */ }
}

/** The desktop (Electron) bridge, when running as the packaged game. */
export interface DesktopBridge {
  quit(): void;
  toggleFullscreen(): void;
  version: string;
  lanAddresses(): Promise<string[]>;
}

export function desktop(): DesktopBridge | null {
  return (window as unknown as { stitchstrikeDesktop?: DesktopBridge }).stitchstrikeDesktop ?? null;
}
