import * as THREE from 'three';
import { MenuMusic } from './audio/music.ts';
import { buildCinematic, type Cinematic } from './scene/cinematic.ts';
import { BIND_ACTIONS, DEFAULT_KEYS, desktop, keyLabel, loadSettings, rebind, saveSettings, type BindAction, type ColorblindMode, type QualitySetting } from './settings.ts';
import { CustomiseScreen, renderProgress } from './menu-customise.ts';
import { levelOf, loadProfile } from './profile.ts';
import { setPresence, syncAchievements } from './platform.ts';

/**
 * Main menu: "press any key" title over a live in-engine cinematic, then a
 * console-style menu (mouse, keyboard or gamepad) with Play, Settings, How to
 * play and Credits. ?menu=main|play|settings opens a screen directly.
 */

const params = new URLSearchParams(location.search);
const settings = loadSettings();
setPresence('In the menus');
syncAchievements(loadProfile().medals);
const bridge = desktop();
const music = new MenuMusic();
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...document.querySelectorAll(sel)] as T[];

if (bridge) {
  document.body.classList.add('desktop');
  $('#version').textContent = `v${bridge.version}`;
}
for (const el of $$('.logo')) el.appendChild(($('#logo-tpl') as unknown as HTMLTemplateElement).content.cloneNode(true));
function refreshWho(): void {
  const p = loadProfile();
  $('#who-name').textContent = `${settings.name} · Lv ${levelOf(p.xp).level} · ${p.credits} credits`;
}
refreshWho();

// ---------------------------------------------------------------- the cinematic

let cin: Cinematic | null = null;
let renderer: THREE.WebGLRenderer | null = null;
const quality: QualitySetting = (params.get('quality') as QualitySetting | null) ?? settings.quality;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 1.25 : 1));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  $('#bg').appendChild(renderer.domElement);
} catch {
  renderer = null; // no WebGL: the menu still works over the painted backdrop
}

const setProgress = (k: number, label: string) => {
  $('.spool i').style.setProperty('--p', `${Math.round(k * 100)}%`);
  $('#load-label').textContent = label;
};

if (renderer && params.get('bg') !== '0') {
  // Let the title paint first, then knit the scene.
  setTimeout(() => {
    buildCinematic(renderer!, quality, setProgress).then((c) => {
      cin = c;
      cin.setOffset(offsetFor(current));
      document.body.classList.add('scene-ready');
      (window as unknown as { __menu: unknown }).__menu = { cin };
    }).catch((e: unknown) => {
      console.error(e);
      setProgress(1, 'Backdrop unavailable');
    });
  }, 60);
} else {
  setProgress(1, '');
}

addEventListener('resize', () => {
  renderer?.setSize(innerWidth, innerHeight);
  cin?.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- screens

type ScreenId = 'title' | 'main' | 'play' | 'settings' | 'howto' | 'credits' | 'customise' | 'progress';
let current: ScreenId = 'title';
const stack: ScreenId[] = [];

function offsetFor(s: ScreenId): number {
  if (s === 'title') return 0;
  if (innerWidth < 820) return 0;
  return s === 'main' ? 0.17 : 0.24;
}

function focusables(): HTMLElement[] {
  return $$<HTMLElement>(`#${current} button, #${current} input, #${current} select`).filter((e) => e.offsetParent !== null && !(e as HTMLButtonElement).disabled);
}

function go(s: ScreenId, push = true): void {
  if (s === current) return;
  if (push) stack.push(current);
  $(`#${current}`).classList.remove('active');
  if (current === 'customise') { customise.close(); refreshWho(); }
  $(`#${s}`).classList.add('active');
  current = s;
  if (s === 'customise') customise.open();
  if (s === 'progress') renderProgress();
  document.body.classList.toggle('in-menu', s !== 'title');
  document.body.classList.toggle('in-panel', s !== 'title' && s !== 'main');
  cin?.setOffset(offsetFor(s));
  const first = s === 'play' ? $('#start') : focusables()[0];
  setTimeout(() => first?.focus({ preventScroll: true }), 60);
}

function back(): void {
  const prev = stack.pop();
  if (!prev || prev === 'title') return;
  music.blip('back', settings.sfxVolume);
  go(prev, false);
}

let started = false;
function pressStart(): void {
  if (started) return;
  started = true;
  music.start(settings.musicVolume);
  music.blip('select', settings.sfxVolume);
  go('main');
}

function leave(url: string): void {
  music.blip('select', settings.sfxVolume);
  music.stop(0.7);
  document.body.classList.add('leaving');
  setTimeout(() => { location.href = url; }, 750);
}

// ---------------------------------------------------------------- menu actions

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (current === 'title') { pressStart(); return; }
  if (!el) return;
  if (el.dataset.go) { music.blip('select', settings.sfxVolume); go(el.dataset.go as ScreenId); }
  else if (el.hasAttribute('data-back')) back();
  else if (el.dataset.href) leave(el.dataset.href);
  else if (el.dataset.action === 'quick') leave(arenaUrl({ mode: 'coop', map: 'garden', where: 'solo' }));
  else if (el.dataset.action === 'quit') { music.stop(0.4); setTimeout(() => bridge?.quit(), 450); }
  else if (el.classList.contains('choice')) choose(el);
});

const customise = new CustomiseScreen(() => settings.name, (k) => music.blip(k, settings.sfxVolume));
const play = { mode: 'coop', map: 'garden', where: 'solo', waves: '10', difficulty: '1' };
function choose(el: HTMLElement): void {
  const group = el.parentElement!.dataset.group as keyof typeof play;
  for (const c of el.parentElement!.querySelectorAll('.choice')) c.classList.toggle('selected', c === el);
  play[group] = el.dataset.value!;
  document.body.classList.toggle('online', play.where === 'online');
  document.body.classList.toggle('pvp-mode', play.mode !== 'coop');
  music.blip('select', settings.sfxVolume);
}

const bots = $<HTMLInputElement>('#bots');
bots.addEventListener('input', () => { $('#bots-out').textContent = bots.value; });

function arenaUrl(p: { mode: string; map: string; where: string; waves?: string; difficulty?: string }): string {
  const q = new URLSearchParams({ mode: p.mode, map: p.map });
  if (p.mode === 'coop') { q.set('waves', p.waves ?? '10'); q.set('difficulty', p.difficulty ?? '1'); }
  if (p.where === 'split') return `/split.html?${q}`;
  if (p.where === 'split4') return `/split.html?${q}&players=4`;
  if (p.where === 'solo') q.set('solo', '1');
  else q.set('room', ($<HTMLInputElement>('#room').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'LOBBY'));
  if (current === 'play') q.set('bots', bots.value);
  return `/arena.html?${q}`;
}
$('#start').addEventListener('click', () => leave(arenaUrl(play)));

// ---------------------------------------------------------------- settings

function bindRange(id: string, key: 'sensitivity' | 'fov' | 'sfxVolume' | 'musicVolume', fmt: (v: number) => string): void {
  const input = $<HTMLInputElement>(id);
  const out = input.nextElementSibling as HTMLOutputElement;
  input.value = String(settings[key]);
  out.textContent = fmt(settings[key]);
  input.addEventListener('input', () => {
    settings[key] = Number(input.value);
    out.textContent = fmt(settings[key]);
    if (key === 'musicVolume') music.setVolume(settings.musicVolume);
    saveSettings(settings);
  });
}
bindRange('#s-sens', 'sensitivity', (v) => (v / 0.0022).toFixed(2) + '×');
bindRange('#s-fov', 'fov', (v) => `${v}°`);
bindRange('#s-sfx', 'sfxVolume', (v) => `${Math.round(v * 100)}%`);
bindRange('#s-music', 'musicVolume', (v) => `${Math.round(v * 100)}%`);

const nameInput = $<HTMLInputElement>('#s-name');
nameInput.value = settings.name;
nameInput.addEventListener('input', () => {
  settings.name = nameInput.value.trim().slice(0, 16) || settings.name;
  $('#who-name').textContent = settings.name;
  saveSettings(settings);
});
const invert = $<HTMLInputElement>('#s-invert');
invert.checked = settings.invertY;
invert.addEventListener('change', () => { settings.invertY = invert.checked; saveSettings(settings); });
const netBox = $<HTMLInputElement>('#s-net');
netBox.checked = settings.showNet;
netBox.addEventListener('change', () => { settings.showNet = netBox.checked; saveSettings(settings); });
const qualitySel = $<HTMLSelectElement>('#s-quality');
qualitySel.value = settings.quality;
qualitySel.addEventListener('change', () => { settings.quality = qualitySel.value as QualitySetting; saveSettings(settings); });
// Accessibility.
const cbSel = $<HTMLSelectElement>('#s-cb');
cbSel.value = settings.colorblind;
cbSel.addEventListener('change', () => { settings.colorblind = cbSel.value as ColorblindMode; saveSettings(settings); });
const subsBox = $<HTMLInputElement>('#s-subs');
subsBox.checked = settings.subtitles;
subsBox.addEventListener('change', () => { settings.subtitles = subsBox.checked; saveSettings(settings); });
const shakeBox = $<HTMLInputElement>('#s-shake');
shakeBox.checked = settings.reduceShake;
shakeBox.addEventListener('change', () => { settings.reduceShake = shakeBox.checked; saveSettings(settings); });

// Key bindings: click an action, press a key.
let listening: BindAction | null = null;
function renderKeys(): void {
  const box = $('#s-keys');
  box.innerHTML = (Object.keys(BIND_ACTIONS) as BindAction[]).map((a) =>
    `<button data-bind="${a}" class="${listening === a ? 'listening' : ''}"><span>${BIND_ACTIONS[a]}</span><kbd>${listening === a ? 'press a key…' : keyLabel(settings.keys[a])}</kbd></button>`).join('');
  box.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    listening = b.dataset.bind as BindAction;
    renderKeys();
  }));
}
// Capture phase, so the menu's own keyboard navigation never sees the key being bound.
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!listening) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.code !== 'Escape' && !/^(Digit[1-9]|Tab|F\d+|MetaLeft|MetaRight)$/.test(e.code)) {
    rebind(settings, listening, e.code);
    saveSettings(settings);
  }
  listening = null;
  renderKeys();
}, true);
$('#s-keys-reset').addEventListener('click', (e) => { e.preventDefault(); settings.keys = { ...DEFAULT_KEYS }; saveSettings(settings); renderKeys(); });
renderKeys();

const serverInput = $<HTMLInputElement>('#s-server');
serverInput.value = settings.server;
serverInput.addEventListener('change', () => {
  let v = serverInput.value.trim();
  if (v && !/^wss?:\/\//.test(v)) v = `ws://${v}`;
  settings.server = v;
  serverInput.value = v;
  saveSettings(settings);
  void checkServer();
});
$('#s-fullscreen').addEventListener('click', (e) => { e.preventDefault(); bridge?.toggleFullscreen(); });
if (bridge) {
  void bridge.lanAddresses().then((ips) => {
    if (ips.length) $('#lan-hint').textContent = `Hosting: friends on your network can set their game server to ${ips.map((ip) => `${ip}:${location.port || 80}`).join(' or ')}.`;
  });
}

async function checkServer(): Promise<void> {
  const label = $('#server-state');
  const url = settings.server ? settings.server.replace(/^ws/, 'http').replace(/\/+$/, '') + '/health' : '/health';
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { signal: ctrl.signal });
    const body = await res.json() as { rooms: unknown[] };
    label.textContent = `Server online · ${body.rooms.length} room${body.rooms.length === 1 ? '' : 's'} open`;
    $('.dot').style.background = '';
  } catch {
    label.textContent = 'No server reachable · play offline or set one in Settings';
    $('.dot').style.background = 'var(--gold)';
  }
}
void checkServer();

// ---------------------------------------------------------------- keyboard + gamepad navigation

function move(dir: 1 | -1, horizontal = false): void {
  const list = focusables();
  const active = document.activeElement as HTMLElement | null;
  const i = active ? list.indexOf(active) : -1;
  if (horizontal && active?.classList.contains('choice')) {
    const row = [...active.parentElement!.querySelectorAll<HTMLElement>('.choice')];
    const next = row[(row.indexOf(active) + dir + row.length) % row.length];
    next.focus();
    choose(next);
    return;
  }
  if (horizontal) return;
  const next = list[(i + dir + list.length) % list.length];
  next?.focus({ preventScroll: false });
}

document.addEventListener('focusin', (e) => {
  if ((e.target as HTMLElement).matches('button, input, select') && started) music.blip('move', settings.sfxVolume * 0.6);
});

document.addEventListener('keydown', (e) => {
  if (current === 'title') { if (!e.repeat) pressStart(); e.preventDefault(); return; }
  const typing = (e.target as HTMLElement).matches('input:not([type=range]):not([type=checkbox]), select');
  if (e.code === 'Escape' || (e.code === 'Backspace' && !typing)) { e.preventDefault(); back(); return; }
  if (e.code === 'F11' && bridge) { e.preventDefault(); bridge.toggleFullscreen(); return; }
  if (typing && e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
  if (e.code === 'ArrowDown' || (e.code === 'KeyS' && !typing)) { e.preventDefault(); move(1); }
  else if (e.code === 'ArrowUp' || (e.code === 'KeyW' && !typing)) { e.preventDefault(); move(-1); }
  else if ((e.code === 'ArrowRight' || e.code === 'KeyD') && !(e.target as HTMLElement).matches('input')) move(1, true);
  else if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && !(e.target as HTMLElement).matches('input')) move(-1, true);
});
// Hovering an item focuses it, so mouse, keys and pads share one highlight.
document.addEventListener('mouseover', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.item, .choice, .start, .back-btn');
  if (el && el !== document.activeElement && started) el.focus({ preventScroll: true });
});

const padPrev = new Map<number, boolean>();
let padRepeat = 0;
function pollPads(dt: number): void {
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad) continue;
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;
    const edge = (i: number) => { const now = pressed(i); const was = padPrev.get(pad.index * 100 + i) ?? false; padPrev.set(pad.index * 100 + i, now); return now && !was; };
    if (current === 'title') { if (pad.buttons.some((b) => b.pressed)) pressStart(); continue; }
    const y = pad.axes[1] ?? 0, x = pad.axes[0] ?? 0;
    padRepeat -= dt;
    const dirY = pressed(12) || y < -0.6 ? -1 : pressed(13) || y > 0.6 ? 1 : 0;
    const dirX = pressed(14) || x < -0.6 ? -1 : pressed(15) || x > 0.6 ? 1 : 0;
    if ((dirY || dirX) && padRepeat <= 0) {
      if (dirY) move(dirY as 1 | -1); else move(dirX as 1 | -1, true);
      padRepeat = 0.22;
    } else if (!dirY && !dirX) padRepeat = 0;
    if (edge(0)) (document.activeElement as HTMLElement | null)?.click();
    if (edge(1)) back();
  }
}

// ---------------------------------------------------------------- loop

const timer = new THREE.Timer();
const dip = $('#dip');
const shotName = $('#shot-name');
function frame(): void {
  timer.update();
  const dt = Math.min(0.1, timer.getDelta());
  const t = timer.getElapsed();
  if (cin) {
    cin.frame(t, dt);
    if (!document.body.classList.contains('leaving')) dip.style.opacity = String(cin.fade);
    shotName.textContent = cin.shotName;
  }
  pollPads(dt);
  customise.frame(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Direct entry for screenshots and deep links.
const start = params.get('menu') as ScreenId | null;
if (start && start !== 'title') {
  started = true;
  go('main');
  if (start !== 'main') go(start);
}
