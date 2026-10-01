import type { Profile } from './profile.ts';

/**
 * Daily challenges: three a day, picked from a pool by the date (so every
 * toy gets the same three), tracked as you play and paid out in credits and
 * XP the moment they're done. They reset at local midnight.
 */

export type ChallengeEvent =
  | 'kill' | 'dinoKill' | 'glueKill' | 'headshot' | 'pvpKo' | 'wave' | 'win' | 'revive' | 'boss'
  | 'capture' | 'drive' | 'emote' | 'secret' | 'build' | 'match' | 'swing';

export interface ChallengeDef { id: string; text: string; event: ChallengeEvent; target: number; credits: number; xp: number }

export const CHALLENGES: ChallengeDef[] = [
  { id: 'kill60', text: 'Unravel 60 invaders', event: 'kill', target: 60, credits: 120, xp: 300 },
  { id: 'kill150', text: 'Unravel 150 invaders', event: 'kill', target: 150, credits: 220, xp: 500 },
  { id: 'dino25', text: 'Unravel 25 dinosaurs (Dino Stampede)', event: 'dinoKill', target: 25, credits: 180, xp: 400 },
  { id: 'glue15', text: 'Unravel 15 invaders with the Glue Gun', event: 'glueKill', target: 15, credits: 150, xp: 350 },
  { id: 'head30', text: 'Land 30 headshots', event: 'headshot', target: 30, credits: 150, xp: 350 },
  { id: 'pvp10', text: 'Unravel 10 toys in PvP', event: 'pvpKo', target: 10, credits: 160, xp: 400 },
  { id: 'waves6', text: 'Hold off 6 waves', event: 'wave', target: 6, credits: 140, xp: 350 },
  { id: 'win1', text: 'Win a match or a round', event: 'win', target: 1, credits: 200, xp: 500 },
  { id: 'revive3', text: 'Re-stitch 3 teammates', event: 'revive', target: 3, credits: 140, xp: 300 },
  { id: 'boss1', text: 'Unpick a boss', event: 'boss', target: 1, credits: 250, xp: 600 },
  { id: 'capture1', text: "Capture the other team's yarn", event: 'capture', target: 1, credits: 180, xp: 400 },
  { id: 'drive400', text: 'Drive 400 m in a jeep or tank', event: 'drive', target: 400, credits: 120, xp: 250 },
  { id: 'emote5', text: 'Emote 5 times (T)', event: 'emote', target: 5, credits: 80, xp: 150 },
  { id: 'secret1', text: 'Find a hidden secret', event: 'secret', target: 1, credits: 120, xp: 250 },
  { id: 'build12', text: 'Build or upgrade 12 traps', event: 'build', target: 12, credits: 140, xp: 300 },
  { id: 'swing10', text: 'Yarn-swing 10 times', event: 'swing', target: 10, credits: 100, xp: 200 },
];

export interface DailyState { day: string; ids: string[]; progress: number[]; done: boolean[] }

/** Local calendar day, e.g. "2026-10-01". */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today's three, the same for everyone on the same date. */
export function pickDailies(day: string): ChallengeDef[] {
  let h = 2166136261;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const pool = [...CHALLENGES];
  const out: ChallengeDef[] = [];
  for (let i = 0; i < 3; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    out.push(pool.splice((h >>> 0) % pool.length, 1)[0]);
  }
  return out;
}

/** The profile's daily state, starting a fresh day if the date has moved on. */
export function dailies(p: Profile & { daily?: DailyState }, now = new Date()): { state: DailyState; defs: ChallengeDef[] } {
  const day = dayKey(now);
  if (!p.daily || p.daily.day !== day) {
    const defs = pickDailies(day);
    p.daily = { day, ids: defs.map((d) => d.id), progress: [0, 0, 0], done: [false, false, false] };
  }
  const defs = p.daily.ids.map((id) => CHALLENGES.find((c) => c.id === id)!).filter(Boolean);
  return { state: p.daily, defs };
}

/** Counts `amount` towards today's challenges; returns the ones this just completed (pay them out). */
export function trackDaily(p: Profile & { daily?: DailyState }, event: ChallengeEvent, amount = 1, now = new Date()): ChallengeDef[] {
  const { state, defs } = dailies(p, now);
  const finished: ChallengeDef[] = [];
  defs.forEach((d, i) => {
    if (d.event !== event || state.done[i]) return;
    state.progress[i] = Math.min(d.target, state.progress[i] + amount);
    if (state.progress[i] >= d.target) { state.done[i] = true; finished.push(d); }
  });
  return finished;
}
