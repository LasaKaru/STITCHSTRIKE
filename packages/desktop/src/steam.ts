import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Optional Steamworks hookup. When the game ships on Steam, add the
 * `steamworks.js` package to the desktop app (pnpm add steamworks.js in
 * packages/desktop) and it is picked up at runtime; without it, or outside
 * Steam, every call is a harmless no-op, so the same build runs anywhere.
 *
 * Achievements use the API names ACH_<MEDAL_ID> (see docs/DESKTOP_AND_STEAM.md)
 * and rich presence uses the "steam_display" token #Status with a %status%
 * value, defined in the Steamworks partner site's rich presence localisation.
 */

interface SteamClient {
  achievement: { activate(name: string): boolean; isActivated(name: string): boolean };
  localplayer: { getName(): string; setRichPresence(key: string, value?: string): void };
}

export interface Steam {
  available: boolean;
  name: string;
  achievement(id: string): boolean;
  presence(status: string): void;
}

const OFF: Steam = { available: false, name: '', achievement: () => false, presence: () => {} };

function appId(): number {
  const env = Number(process.env.STITCHSTRIKE_STEAM_APPID ?? process.env.SteamAppId);
  if (Number.isInteger(env) && env > 0) return env;
  // steam_appid.txt next to the exe is Valve's convention for local testing.
  for (const dir of [process.cwd(), join(__dirname, '..'), join(__dirname, '..', 'steam')]) {
    const file = join(dir, 'steam_appid.txt');
    if (existsSync(file)) {
      const id = Number(readFileSync(file, 'utf8').trim());
      if (Number.isInteger(id) && id > 0) return id;
    }
  }
  return 0;
}

/** Normalises a medal or event id into its Steam achievement API name. */
export function achievementName(id: string): string {
  return `ACH_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
}

export function initSteam(log: (m: string) => void): Steam {
  if (process.argv.includes('--no-steam')) return OFF;
  const id = appId();
  if (!id) return OFF;
  let client: SteamClient;
  try {
    // Loaded at runtime (kept out of the bundle) so the package stays optional.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const steamworks = require('steamworks.js') as { init(appId: number): SteamClient; electronEnableSteamOverlay?: () => void };
    client = steamworks.init(id);
    steamworks.electronEnableSteamOverlay?.();
  } catch (e) {
    log(`Steam not available (${(e as Error).message.split('\n')[0]}); running without it.`);
    return OFF;
  }
  log(`Steam ready (app ${id}).`);
  return {
    available: true,
    name: client.localplayer.getName(),
    achievement(medal: string): boolean {
      const name = achievementName(medal);
      try {
        if (client.achievement.isActivated(name)) return false;
        return client.achievement.activate(name);
      } catch { return false; }
    },
    presence(status: string): void {
      try {
        client.localplayer.setRichPresence('status', status.slice(0, 250));
        client.localplayer.setRichPresence('steam_display', '#Status');
      } catch { /* the overlay may be gone */ }
    },
  };
}
