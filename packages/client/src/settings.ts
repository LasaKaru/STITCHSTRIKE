/**
 * Player settings, shared by the main menu (which edits them) and the arena
 * (which reads them). Stored per browser / per desktop install.
 */

export type QualitySetting = 'low' | 'medium' | 'high';
export type ColorblindMode = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';

/** Rebindable keyboard actions (values are KeyboardEvent.code). Mouse buttons stay fire / yarn-swing. */
export const BIND_ACTIONS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  jump: 'Jump', sprint: 'Sprint', crouch: 'Crouch', reload: 'Reload', use: 'Re-stitch (hold)', grapple: 'Yarn-swing (hold)',
  deck: 'Build deck', rebuild: 'Build last trap', recycle: 'Recycle trap', ready: 'Ready up', camera: 'Camera view',
  shoulder: 'Swap shoulder (3rd person)', photo: 'Photo mode', emote: 'Emote (tap: wave, hold + 1-4: pick)',
} as const;
export type BindAction = keyof typeof BIND_ACTIONS;

export const DEFAULT_KEYS: Record<BindAction, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', crouch: 'KeyC', reload: 'KeyR', use: 'KeyE', grapple: 'KeyX',
  deck: 'KeyB', rebuild: 'KeyQ', recycle: 'KeyG', ready: 'Enter', camera: 'KeyV',
  shoulder: 'KeyH', photo: 'KeyP', emote: 'KeyT',
};

/** "KeyW" -> "W", "ShiftLeft" -> "Left Shift", for menus and hints. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const m = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);
  if (m) return `${m[2]} ${m[1] === 'Control' ? 'Ctrl' : m[1]}`;
  return code.replace(/^Arrow/, '').replace(/^Numpad/, 'Num ');
}

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
  keys: Record<BindAction, string>;
  /** Accessibility. */
  colorblind: ColorblindMode;
  /** Captions for briefings and important sound cues. */
  subtitles: boolean;
  /** Less camera shake from blasts and stomps. */
  reduceShake: boolean;
  /** Tilt-shift blur at the top and bottom of the screen (the miniature look). */
  miniature: boolean;
  /** Camera you start in: first person (through the toy's eyes) or third person (over the shoulder). */
  view: 'first' | 'third';
  /** Third-person shoulder: 1 right, -1 left. */
  shoulder: 1 | -1;
  /** HUD radar in the corner. */
  radar: boolean;
  /** Floating damage numbers on hits. */
  damageNumbers: boolean;
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
  keys: { ...DEFAULT_KEYS },
  colorblind: 'off',
  subtitles: true,
  reduceShake: false,
  miniature: true,
  view: 'first',
  shoulder: 1,
  radar: true,
  damageNumbers: true,
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
  const s = { ...DEFAULTS, ...stored, keys: { ...DEFAULT_KEYS, ...(stored.keys ?? {}) } };
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
  /** Steamworks, when the desktop build runs under Steam (no-ops otherwise). */
  steam?: { available: boolean; name: string; achievement(id: string): void; presence(status: string): void };
}

export function desktop(): DesktopBridge | null {
  return (window as unknown as { stitchstrikeDesktop?: DesktopBridge }).stitchstrikeDesktop ?? null;
}

/** Rebinds an action; if another action had that key they swap, so nothing is left unbound. */
export function rebind(s: Settings, action: BindAction, code: string): void {
  const clash = (Object.keys(s.keys) as BindAction[]).find((a) => a !== action && s.keys[a] === code);
  if (clash) s.keys[clash] = s.keys[action];
  s.keys[action] = code;
}

/**
 * Colour roles, remapped for colour-blind players (Okabe-Ito palette: safe
 * for the common forms of colour blindness).
 */
export interface Palette { good: number; bad: number; team: [number, number]; healthLow: number; healthHigh: number }

export function palette(mode: ColorblindMode): Palette {
  switch (mode) {
    case 'deuteranopia':
    case 'protanopia':
      return { good: 0x56b4e9, bad: 0xe69f00, team: [0xe69f00, 0x0072b2], healthLow: 0xe69f00, healthHigh: 0x56b4e9 };
    case 'tritanopia':
      return { good: 0x009e73, bad: 0xcc79a7, team: [0xd55e00, 0x009e73], healthLow: 0xcc79a7, healthHigh: 0x009e73 };
    default:
      return { good: 0x8bcb3a, bad: 0xd8262e, team: [0xe8742a, 0x3a5da8], healthLow: 0xe6261a, healthHigh: 0x8cd940 };
  }
}
