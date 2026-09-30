# Desktop build and Steam release

STITCHSTRIKE ships as an Electron app (`packages/desktop`). The app embeds the real game server:
- It serves the built client on `http://127.0.0.1:8787`, so WebGL, Web Workers, pointer lock and WebSockets behave exactly as on the web.
- It hosts online rooms on the same port.
- Solo play runs the server in a Web Worker and needs no network.

## Build

```bash
pnpm install
pnpm desktop          # build the client, bundle, and launch the app (windowed dev run: add -- --windowed)
pnpm desktop:win      # Windows: release/win-unpacked/STITCHSTRIKE.exe + a single-file portable .exe (+ NSIS installer on Windows)
pnpm desktop:dist     # every target configured for the current OS
```

Output goes to `packages/desktop/release/`:

| Artifact | Use |
|---|---|
| `win-unpacked/` | The folder you upload to Steam (SteamPipe). Launch `STITCHSTRIKE.exe`. |
| `STITCHSTRIKE-<ver>-portable.exe` | A single file for itch.io, testers or direct download. |
| `STITCHSTRIKE-<ver>-x64.exe` (NSIS) | An installer. Building it on Linux needs Wine, so build it on Windows. |

Launch flags:
- `--windowed`: start windowed instead of fullscreen. F11 toggles either way.
- `--lan`: host rooms for other PCs on your network. Friends put `YOUR_IP:8787` in Settings, then Game server.
- `--steam-overlay`: in-process GPU so the Steam overlay can hook the window. Add it to the Steam launch options if the overlay doesn't show.

## Getting it onto Steam

1. **Steamworks account.** Sign up at partner.steamgames.com, pay the Steam Direct fee (US$100 per app) and finish the tax and bank forms. You get an **App ID** and a **Depot ID**.
2. **Store page** (it needs to be live for about 2 weeks before release):
   - capsule art at every required size, 5+ screenshots and a trailer
   - description, tags (Action, Tower Defense, Co-op, FPS, Cute) and a content survey
   - a "Coming soon" page starts collecting wishlists, which is the single biggest driver of launch sales
3. **Build upload with SteamPipe.** Download the Steamworks SDK, then:
   - Put your IDs into `packages/desktop/steam/app_build.vdf` and `depot_build_windows.vdf`.
   - Run `pnpm desktop:win`.
   - Run `steamcmd +login <builder account> +run_app_build <abs path>/packages/desktop/steam/app_build.vdf +quit`.
   - In Steamworks, set the launch option to `STITCHSTRIKE.exe`.
   - Set the build live on a beta branch, test it, then set it live on default.
4. **Steamworks features.** Add them with [steamworks.js](https://github.com/ceifa/steamworks.js), a native Node module loaded in the Electron main process and exposed through `preload.ts`:
   - achievements and stats
   - rich presence
   - **Steam lobbies and invites** ("Join game" from the friends list)
   - **Steam Networking Sockets**, a relay so friends connect without port forwarding
   - cloud saves for settings and unlocks

   `steam/steam_appid.txt` holds 480 (Valve's Spacewar test app) for local testing. Put your own App ID there during development. The depot excludes it from release builds.
5. **Steam Deck.** Controller support plus a 1280×800 layout get you "Verified". The menu already works with a gamepad; the arena needs gamepad aiming (see the roadmap).
6. **Review.** Valve reviews the store page and the build (a few business days each). Plan a demo for **Steam Next Fest**.
7. **Code signing (recommended).** An unsigned `.exe` triggers Windows SmartScreen warnings outside Steam. Set `CSC_LINK` / `CSC_KEY_PASSWORD` before `pnpm desktop:win`, or sign on Windows. Games launched through Steam are not affected.

## Legal checklist before selling

- Keep every name, logo and character original. STITCHSTRIKE's Heartspools, knitted cast and wool look are its own. Do **not** reuse another game's terms or characters (for example Hypercharge's "Hypercore", "Sgt. Max Ammo" or "Major Evil").
- No real toy or brand trademarks: say "building bricks", not LEGO, and "battery", not Duracell.
- Music and sound: the current music-box theme and all effects are synthesized in code. Anything you add must be your own or properly licensed (royalty-free or commissioned) for commercial use.
- Ship the third-party licences: Electron and Chromium (`LICENSES.chromium.html` is already in the build), three.js (MIT) and ws (MIT).
