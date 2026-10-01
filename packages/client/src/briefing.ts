import type { MapId } from '@stitchstrike/shared';

/**
 * Saturday-morning-cartoon framing: Sgt. Tuft Buttonsworth briefs the squad
 * and hands out tips; Baron von Ravel, who wants every hand-made toy unpicked
 * into factory acrylic, taunts them at every wave. Portraits are drawn on a
 * canvas; voices are synthesized babble (no audio files).
 */

export type Speaker = 'sarge' | 'baron';

const NAMES: Record<Speaker, string> = { sarge: 'SGT. TUFT BUTTONSWORTH', baron: 'BARON VON RAVEL' };

export const BRIEFINGS: Record<MapId, string[]> = {
  bedroom: [
    "Listen up, stuffing-for-brains! The Baron's Mass-Knit Army is crawling out from under the desk and through the door.",
    'Those three Heartspools hold every memory this kid has of us. Lose them and we are just socks.',
    'Build on the stitched pads, climb the curtain for the high ground, and keep your needles sharp!',
  ],
  garden: [
    'Outdoors, troops! The invaders are coming through the hedge, over the fences and out of the shed.',
    'Use the treehouse for sniping and the springs to get onto the shed roof. Mind the pond, it is wet.',
    'Maze them with bricks, zap them with batteries, and do NOT let them near the Heartspools!',
  ],
  garage: [
    "The garage, soldiers. The roll-up door's stuck open and the Baron's toys are crawling under it.",
    'You can crawl under the car and climb onto it. The pegboard makes a fine lookout.',
    'Lance them from the shelves. Snips go for your traps, so keep them covered!',
  ],
  bathroom: [
    "Bathroom duty, troops. They're coming under the door, up the drain and out of the laundry basket.",
    'Climb the shower curtain or the towel on the vanity for height. The toilet tank is the best perch in the house.',
    'Hop into the tub for cover, and do NOT fall in the loo!',
  ],
  park: [
    "The city park, soldiers. Leaves on the paths, ducks on the pond, and the Baron's toys at every gate.",
    'The bandstand roof is the best perch in town: the spring by the steps will get you up there. The trees are climbable too.',
    'Keep them off the bridge and away from the Heartspools. And nobody pops the parade balloon!',
  ],
  toystore: [
    'The toy store, soldiers. The Baron is opening his factory-made recruits straight off the shelves!',
    'Climb the SALE banners to the top shelves and rain yarn down the aisle.',
    'They are coming through the sliding doors and from behind the checkout. Hold the aisle!',
  ],
  dinoden: [
    "Welcome to the Dino Den, soldiers. A knitted prehistoric playset, and the Baron's lot are pouring through every gap in the cliffs.",
    'Climb the volcano ledge by ledge, or take the spring at its foot straight to the crater. The fossil spine makes a fine sniper perch.',
    'There are jeeps by the river and a wind-up tank in the jungle. Use them!',
  ],
};

const TAUNTS = [
  'Mwahaha! Another wave of perfectly identical, perfectly acrylic soldiers!',
  'Hand-made? How quaint. My factory makes a thousand of you before breakfast.',
  'Unpick them, my darlings! Every last stitch!',
  'Your little spools will unravel like a cheap scarf!',
  'Moths! Dinner is served, and it is 100% wool!',
  'I have scissors. So many scissors.',
  "Resistance is futile. Also itchy.",
];

const TIPS = [
  'Good work! Hold E next to a downed toy to re-stitch them. Nobody gets left in the toy box.',
  'Tip: building the same trap on a pad again upgrades it. Three gold poms means maximum oomph.',
  'Blockades make the invaders walk the long way round. Make them walk!',
  'Yarn balls tangle whole crowds. Lob one into the thick of it.',
  'Snips cut traps apart. Lance them before they reach your pads.',
  'Grab stuffing to patch up, thimbles for armour, and Power Poms to hit harder.',
];

/** Dino Stampede: the Baron has opened his prehistoric playset. */
export const STAMPEDE_INTRO = [
  'Bad news, soldiers. The Baron has knitted himself a whole herd of dinosaurs, and the toy box lid is open!',
  'Raptors hunt in packs and leap, so keep moving. Trikes charge and smash traps. Watch the sky for pteros.',
  'If you hear a roar, that is Rex. Every dino near him goes into a rush. Grab a jeep if you need to outrun them!',
];
const DINO_TAUNTS = [
  'Behold, my Cretaceous collection! Hand-knitted? No. Mass-produced. MWAHAHA!',
  'My raptors hunt in packs. Packs of six. Packs of SIXTY!',
  'Stampede! Trample their little spools flat!',
  'My pteros have very sharp beaks and very poor manners.',
  'Extinct? Nonsense. I simply knitted them back!',
];
let dinoIndex = 0;
export const nextDinoTaunt = () => DINO_TAUNTS[dinoIndex++ % DINO_TAUNTS.length];
export const REX_LINE = 'And now, the king of the toy box: REX, THE YARNASAUR! Six metres of pure acrylic fury!';

export const BOSS_LINE = 'Behold my masterpiece: THE UNRAVELLER! Felted by hand... by MY hands. The irony is delicious!';
export const WIN_LINE = "The Heartspools are safe! That's the finest bit of knitting I've seen since the Great Jumper War.";
export const LOSE_LINE = "We'll get the needles out and knit ourselves back together. Again!";

let tauntIndex = 0;
let tipIndex = 0;
export const nextTaunt = () => TAUNTS[tauntIndex++ % TAUNTS.length];
export const nextTip = () => TIPS[tipIndex++ % TIPS.length];

// ---------------------------------------------------------------- portraits

function portrait(who: Speaker): string {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const knit = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.fill();
    // Knit texture: rows of little Vs.
    g.strokeStyle = 'rgba(0,0,0,.12)';
    g.lineWidth = 1.5;
    for (let yy = y - h; yy < y + h; yy += 6) for (let xx = x - w; xx < x + w; xx += 6) {
      if (((xx - x) / w) ** 2 + ((yy - y) / h) ** 2 > 0.9) continue;
      g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + 3, yy + 4); g.lineTo(xx + 6, yy); g.stroke();
    }
  };
  g.fillStyle = who === 'sarge' ? '#3a5a3a' : '#4a1a34';
  g.fillRect(0, 0, 128, 128);
  if (who === 'sarge') {
    knit(64, 74, 38, 42, '#d9b89a');
    knit(64, 36, 46, 16, '#5a6a3a'); // beret
    g.fillStyle = '#ffc94a'; g.beginPath(); g.arc(84, 32, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1e1e22'; g.beginPath(); g.ellipse(50, 66, 11, 9, 0, 0, Math.PI * 2); g.fill(); // eyepatch
    g.strokeStyle = '#1e1e22'; g.lineWidth = 3; g.beginPath(); g.moveTo(30, 58); g.lineTo(98, 50); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.arc(78, 66, 5, 0, Math.PI * 2); g.fill();
    knit(64, 92, 30, 10, '#7e7e84'); // bushy mustache
    g.fillStyle = '#d8262e'; g.fillRect(40, 116, 48, 12);
  } else {
    knit(64, 76, 36, 40, '#e6ccb0');
    g.fillStyle = '#1e1e24'; g.fillRect(30, 4, 68, 38); g.fillRect(18, 38, 92, 8); // top hat
    g.fillStyle = '#d8262e'; g.fillRect(30, 30, 68, 7);
    g.fillStyle = '#111'; g.beginPath(); g.arc(50, 68, 5, 0, Math.PI * 2); g.arc(80, 68, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d9b24a'; g.lineWidth = 3; g.beginPath(); g.arc(80, 68, 11, 0, Math.PI * 2); g.stroke(); // monocle
    g.strokeStyle = '#2a1c14'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(64, 90); g.bezierCurveTo(50, 84, 40, 96, 34, 86); g.moveTo(64, 90); g.bezierCurveTo(78, 84, 88, 96, 94, 86); g.stroke();
    g.fillStyle = '#6a2a4a'; g.fillRect(36, 116, 56, 12);
  }
  return c.toDataURL();
}

// ---------------------------------------------------------------- the speech panel

export class Briefing {
  private el: HTMLDivElement;
  private text: HTMLDivElement;
  private queue: { who: Speaker; line: string }[] = [];
  private busy = false;
  private ctx: AudioContext | null = null;
  private portraits: Record<Speaker, string> = { sarge: portrait('sarge'), baron: portrait('baron') };

  /** With subtitles off, the speaker's portrait and voice stay but the line isn't printed. */
  constructor(private volume: () => number, subtitles = true) {
    this.el = document.createElement('div');
    this.el.id = 'briefing';
    this.el.className = 'hud hidden';
    if (!subtitles) this.el.dataset.nosubs = '1';
    this.el.innerHTML = '<img alt="" /><div class="who"></div><div class="line"></div>';
    document.body.appendChild(this.el);
    this.text = this.el.querySelector('.line')!;
  }

  say(who: Speaker, line: string): void {
    this.queue.push({ who, line });
    if (!this.busy) this.next();
  }

  /** Drop anything queued (e.g. a new match started). */
  clear(): void {
    this.queue = [];
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) { this.busy = false; this.el.classList.add('hidden'); return; }
    this.busy = true;
    this.el.className = `hud ${item.who}`;
    (this.el.querySelector('img') as HTMLImageElement).src = this.portraits[item.who];
    (this.el.querySelector('.who') as HTMLElement).textContent = NAMES[item.who];
    let i = 0;
    this.text.textContent = '';
    const type = () => {
      i = Math.min(item.line.length, i + 2);
      this.text.textContent = item.line.slice(0, i);
      if (i % 6 === 0) this.babble(item.who);
      if (i < item.line.length) setTimeout(type, 28);
      else setTimeout(() => this.next(), 1800 + item.line.length * 22);
    };
    type();
  }

  /** Cartoon gibberish voice: a short formant-ish blip per syllable. */
  private babble(who: Speaker): void {
    const v = this.volume();
    if (v <= 0) return;
    try { this.ctx ??= new AudioContext(); } catch { return; }
    const ctx = this.ctx;
    if (ctx.state === 'suspended') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = who === 'sarge' ? 'sawtooth' : 'square';
    const base = who === 'sarge' ? 110 : 190;
    o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.4), t);
    o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.5), t + 0.08);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 600 + Math.random() * 900;
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.1);
  }

  unlock(): void {
    try { this.ctx ??= new AudioContext(); void this.ctx.resume(); } catch { /* no audio */ }
  }
}
