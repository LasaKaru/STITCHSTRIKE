import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COSMETICS, LOOK_SLOTS, MAPS, MEDALS, createWorld, type Look } from '@stitchstrike/shared';
import { heldBlaster, spawnFigure } from './figures/cast.ts';
import { dressGun, swingCharm } from './scene/charms.ts';
import { poseHumanoid } from './figures/humanoid.ts';
import { lookOptions } from './figures/looks.ts';
import type { FigureInstance } from './figures/rig.ts';
import { levelOf, loadProfile, saveProfile, type Profile } from './profile.ts';
import { buy, isUnlocked, unlockText } from './progression.ts';

/**
 * Menu screens for progression: Customise (a live turntable of your knitted
 * figure in its toy packaging, every cosmetic slot) and Progress (level,
 * stats, medals, secrets found, what unlocks next).
 */

const SLOT_NAMES: Record<keyof Look, string> = {
  head: 'Head', hat: 'Hat & hair yarn', beard: 'Beard', glasses: 'Glasses', pattern: 'Knit pattern',
  skin: 'Skin', jacket: 'Jacket yarn', pants: 'Trousers', packaging: 'Packaging', charm: 'Weapon charm', wrap: 'Grip wrap',
};
const PREVIEW_COLOR = 0xe8742a;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export class CustomiseScreen {
  private profile: Profile = loadProfile();
  private slot: keyof Look = 'head';
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 3 / 4, 0.05, 50);
  private figure: FigureInstance | null = null;
  private gun: THREE.Group | null = null;
  private turntable = new THREE.Group();
  private active = false;
  private knitTimer = 0;

  constructor(private name: () => string, private blip: (k: 'move' | 'select' | 'back') => void) {
    this.camera.position.set(0, 1.0, -3.6);
    this.camera.lookAt(0, 0.8, 0);
    this.scene.add(this.turntable);
    const key = new THREE.DirectionalLight(0xffe8c8, 3);
    key.position.set(-2, 3, -3);
    const rim = new THREE.DirectionalLight(0xbcd4ff, 2);
    rim.position.set(3, 2, 3);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x806050, 0.6));
  }

  open(): void {
    this.profile = loadProfile();
    this.active = true;
    if (!this.renderer) {
      const canvas = document.getElementById('preview') as HTMLCanvasElement;
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        this.renderer.toneMapping = THREE.AgXToneMapping;
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
        this.scene.environmentIntensity = 0.4;
      } catch { this.renderer = null; }
    }
    this.renderTabs();
    this.renderItems();
    this.refreshPackage();
    this.reknit();
  }

  close(): void {
    this.active = false;
  }

  frame(t: number): void {
    if (!this.active || !this.renderer) return;
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 0 && (canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || canvas.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.turntable.rotation.y = Math.sin(t * 0.6) * 0.8;
    if (this.figure) poseHumanoid(this.figure, { t, speed: 0, phase: 0, pitch: Math.sin(t * 0.7) * 0.15, crouch: 0, airborne: false, aiming: true }, 1, this.gun ?? undefined);
    if (this.gun) swingCharm(this.gun, t, 0.3);
    this.renderer.render(this.scene, this.camera);
  }

  private reknit(): void {
    const knitting = document.getElementById('knitting')!;
    knitting.classList.add('on');
    clearTimeout(this.knitTimer);
    // Let the "Knitting…" label paint before the (synchronous) sculpt.
    this.knitTimer = window.setTimeout(() => {
      if (this.figure) this.turntable.remove(this.figure.root);
      this.figure = spawnFigure(lookOptions(this.profile.look, PREVIEW_COLOR, 'game'));
      this.gun = heldBlaster(0x8bcb3a);
      dressGun(this.gun, this.profile.look, new THREE.Vector3(0, -0.04, 0.03), 1.2);
      this.figure.root.add(this.gun);
      this.turntable.add(this.figure.root);
      knitting.classList.remove('on');
    }, 30);
  }

  private refreshPackage(): void {
    document.getElementById('package')!.className = `package pk-${this.profile.look.packaging}`;
    document.getElementById('pname')!.textContent = this.name();
    document.getElementById('c-credits')!.textContent = `${this.profile.credits} credits · Level ${levelOf(this.profile.xp).level}`;
  }

  private renderTabs(): void {
    const tabs = document.getElementById('slot-tabs')!;
    tabs.innerHTML = LOOK_SLOTS.map((s) => `<button class="tab ${s === this.slot ? 'on' : ''}" data-slot="${s}">${SLOT_NAMES[s]}</button>`).join('');
    tabs.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => b.addEventListener('click', () => {
      this.slot = b.dataset.slot as keyof Look;
      this.blip('select');
      this.renderTabs();
      this.renderItems();
    }));
  }

  private renderItems(): void {
    const list = document.getElementById('slot-items')!;
    const items = COSMETICS[this.slot];
    list.innerHTML = items.map((item, i) => {
      const unlocked = isUnlocked(this.profile, item);
      const on = this.profile.look[this.slot] === i;
      const buyable = !unlocked && item.unlock.kind === 'credits';
      const state = on ? 'Equipped' : unlocked ? 'Unlocked' : buyable ? `Buy · ${unlockText(item)}` : `🔒 ${unlockText(item)}`;
      const swatch = item.color !== undefined ? `<i class="sw" style="background:${hex(item.color)}"></i>` : '';
      return `<button class="cos ${on ? 'on' : ''} ${unlocked ? '' : 'locked'} ${buyable ? 'buy' : ''}" data-i="${i}">${swatch}<b>${escapeHtml(item.name)}</b><span>${state}</span></button>`;
    }).join('');
    list.querySelectorAll<HTMLButtonElement>('.cos').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      const item = items[i];
      if (!isUnlocked(this.profile, item)) {
        if (!buy(this.profile, item)) { this.blip('back'); return; }
      }
      this.profile.look[this.slot] = i;
      saveProfile(this.profile);
      this.blip('select');
      this.renderItems();
      this.refreshPackage();
      if (this.slot === 'charm' || this.slot === 'wrap') { if (this.gun) dressGun(this.gun, this.profile.look, new THREE.Vector3(0, -0.04, 0.03), 1.2); }
      else if (this.slot !== 'packaging') this.reknit();
    }));
  }
}

export function renderProgress(): void {
  const p = loadProfile();
  const lv = levelOf(p.xp);
  const s = p.stats;
  const secrets = MAPS.map((m) => {
    const all = createWorld(m.id).collectibles;
    return `<div><b>${all.filter((c) => p.collected.includes(c.id)).length}/${all.length}</b><span>${escapeHtml(m.name)} secrets</span></div>`;
  }).join('');
  // What unlocks at the next few levels.
  const next: string[] = [];
  for (const slot of LOOK_SLOTS) for (const item of COSMETICS[slot]) {
    if (item.unlock.kind === 'level' && item.unlock.level > lv.level && item.unlock.level <= lv.level + 3) next.push(`Level ${item.unlock.level}: ${item.name}`);
  }
  next.sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)));
  document.getElementById('progress-body')!.innerHTML = `
    <div class="lvl-card"><div class="lvl-badge">${lv.level}</div>
      <div style="flex:1"><b>Level ${lv.level}</b> · ${lv.into} / ${lv.need} XP · <span style="color:var(--gold)">${p.credits} credits</span>
      <div class="xpbar"><i style="width:${(lv.into / lv.need) * 100}%"></i></div></div></div>
    <h4>Service record</h4>
    <div class="stat-grid">
      <div><b>${s.matches}</b><span>matches</span></div><div><b>${s.wins}</b><span>missions won</span></div><div><b>${s.waves}</b><span>waves held</span></div>
      <div><b>${s.kills}</b><span>unravelled</span></div><div><b>${s.revives}</b><span>re-stitched</span></div><div><b>${s.bossKills}</b><span>bosses unpicked</span></div>
      <div><b>${s.bestEndless}</b><span>best endless wave</span></div>
    </div>
    <h4>Secrets found</h4><div class="stat-grid">${secrets}</div>
    <h4>Medals · ${p.medals.length}/${MEDALS.length}</h4>
    <div class="medals">${MEDALS.map((m) => `<div class="medal ${p.medals.includes(m.id) ? 'got' : ''}"><b>${p.medals.includes(m.id) ? '🏅 ' : ''}${escapeHtml(m.name)}</b><span>${escapeHtml(m.blurb)}</span></div>`).join('')}</div>
    <h4>Coming up</h4><p class="hint">${next.length ? next.map(escapeHtml).join(' · ') : 'Keep playing: medals and credits unlock the rarest yarns and packaging.'}</p>`;
}
