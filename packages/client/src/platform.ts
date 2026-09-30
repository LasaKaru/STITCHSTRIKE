import { desktop } from './settings.ts';

/**
 * Store-platform hooks (Steam on the desktop build): medals become
 * achievements and the current activity shows as rich presence. On the web,
 * or when Steam isn't running, these do nothing.
 */

export function unlockAchievement(medalId: string): void {
  desktop()?.steam?.achievement(medalId);
}

/** Medals earned before Steam was available (or offline) are pushed again; Steam ignores repeats. */
export function syncAchievements(medals: string[]): void {
  for (const m of medals) unlockAchievement(m);
}

let lastPresence = '';
export function setPresence(status: string): void {
  if (status === lastPresence) return;
  lastPresence = status;
  desktop()?.steam?.presence(status);
}
