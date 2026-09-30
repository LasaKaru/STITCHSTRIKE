# STITCHSTRIKE roadmap

## Design brief

**STITCHSTRIKE is an indie first- and third-person shooter that blends classic wave-based tower defence with intense action.** It plays like a love letter to 90s childhoods and evokes movies like *Small Soldiers* and *Toy Story*. Its twist: everything is **wool**. The heroes, the invaders and the giant house are all knitted, crocheted and felted.

### Vibe and atmosphere
Pure, distilled nostalgia: the universal memory of smashing action figures together on a messy bedroom floor.
- It doesn't take itself too seriously. It's bright, colourful and packed with retro charm.
- It feels like a weekend morning in the 1990s.
- It has original **90s packaging** aesthetics (blister cards, box art, "Collect them all!").
- The villains are **Saturday-morning-cartoon** style.
- The soundtrack is upbeat and rocking.

### Mission and core loop
A hybrid of hero shooter and tower defence.
- **The mission:** defend the **Heartspools**, glowing spools of hand-spun thread that hold every childhood memory of every hand-made toy, from successive waves of hostile mass-produced toys. If the Heartspools unravel, those memories are lost forever.
- **The flow:**
  - **Build phase:** spend the team's **buttons** on traps, turrets and blockades: building-brick barricades, battery zappers, mousetraps, pin walls, tangle mats and spring pads.
  - **Wave phase:** shooting, platforming and teamwork keep the invaders away from the Heartspools.
- **Modes:** full single-player (with bot teammates), online co-op (up to 4), **local split-screen**, and classic PvP (Free-for-All deathmatch, Team Deathmatch).

### Environments and levels
You are a 5-inch action figure, so the world is **massive**. Levels are everyday domestic and retail places:
- messy bedrooms
- suburban garages
- bathrooms
- back gardens
- toy store aisles

The other pillars of level design:
- **Traversal:** heavy platforming. Jump across shelves, **climb up bedsheets and curtains**, and use **jump pads** to get from the floor to countertops.
- **Collectibles:** every level hides secrets. High shelves and dark corners reward you with **golden thimbles**, **weapon parts** and **credits**.

### Characters
- **Progression:** no hero classes with locked abilities; the focus is on **extreme customisation**. You start as a generic knitted action figure and unlock hundreds of heads, hats, yarn colours, knit patterns, weapon parts and **packaging styles**.
- **Key figures:** you serve under **Sgt. Tuft Buttonsworth**, a moth-eaten knitted war veteran, against **Baron von Ravel** and his **Mass-Knit Army**. The Baron wants to unpick every hand-made toy into factory acrylic.

> The brief was modelled on *Hypercharge: Unboxed*. STITCHSTRIKE keeps its own names and look, so its terms and characters ("Hypercore", "Sgt. Max Ammo", "Major Evil") and real toy trademarks never appear in the game. That is what makes it sellable.

### Development pillars

| Pillar | What it means | How STITCHSTRIKE does it |
|---|---|---|
| **Scale and physics** | Feel like a 5-inch toy: slightly floaty but precise movement. Toys burst like toys instead of ragdolling like humans. | 1.5 u figures in 40–100 u rooms; gravity 25 with a double jump; air control; spring pads and climbable fabric. Unravelled toys burst into yarn, stuffing and knitted pieces. |
| **Verticality** | A desk needs pathways (cords, stacked books, fallen rulers) to become terrain. | Book-stack stairs, crate climbs, a treehouse, climbable blankets and curtains, jump pads, and a shelf and countertop layer in every map. |
| **Zero pay-to-win** | Every skin, head and weapon part is earned by play, never bought. | A local profile with XP, levels, medals and collectibles unlocks all cosmetics. There is no store for power, and weapons are never gated. |
| **Hybrid AI pathfinding** | Blockades anywhere, so routes must recompute instantly. | Flow fields (Dijkstra per Heartspool) re-bake whenever a blockade is built or destroyed; walls cost extra, so enemies go around, and they chew through only when boxed in. |
| **Varied enemies** | Ground swarms, ranged attackers and flyers force both guns and traps. | Chatter-teeth swarms, spinning tops, toy-soldier snipers, RC drones, moths, scissor snips, brutes and a boss per mission. |
| **Performance with dense mess** | 500 static toys plus 100 enemies must not crash the player's hardware. | Merged static mess per material, instanced grass and leaves, pooled figures with distance LOD, shadow-map budgets per quality level, and a hard cap on live enemies. |

## Build status

The checklist tracks what is in the game (✅) and what is still ahead (⬜).

**In the game now**
- ✅ Hero-shooter × tower-defence loop: build phase, then waves, three Heartspools
- ✅ Single-player with bot teammates who fight, build, upgrade and re-stitch
- ✅ Online co-op up to 4 (server-authoritative, lag-compensated)
- ✅ LAN hosting from the desktop app
- ✅ Local split-screen for 2–4 players (halves or quadrants), keyboard + mouse and gamepads
- ✅ PvP: Free-for-All (up to 8), Team Deathmatch and King of the Spool (hold the hopping Golden Spool)
- ✅ Missions: 10 waves with a boss, a 5-wave skirmish and Endless, at four difficulties
- ✅ Survivability: 150 stitches, Stitch-up regeneration, spawn protection, thimble armour, down and re-stitch, pickups and drops
- ✅ Weapons: Pom-Pom Popper, Button Buster, Needle Lance (pierces), Crochet Hook, Yarn-Ball Launcher (lobbed splash, tangle), Glue Gun (sticky globs), Static Sock (chain zap)
- ✅ Traps: Turret, Pin Wall, Brick Barricade, Tangle Mat, Battery Zapper, Mousetrap and Spring Pad, all upgradable to tier 3
- ✅ Dynamic mazing: flow fields re-bake whenever a blockade changes
- ✅ Mass-Knit Army:
  - ground swarms: chatter teeth, scuttlers
  - rushers: spinning tops
  - ranged: tin soldiers
  - flyers: moths, RC drones that drop teeth
  - saboteurs: scissor snips
  - tanks: brutes
  - support: Tin Drummers (speed up everyone nearby)
  - ambushers: Jack-in-the-Boxes (spring out at toys)
  - boss: The Unraveller
- ✅ Maps at toy scale: The Bedroom, The Back Garden, The Garage, The Bathroom, The Toy Store Aisle
- ✅ Verticality: climbable fabric and bark, jump pads, book and crate steps, shelves and roofs, ledge mantle, the yarn-swing grapple
- ✅ Collectibles: 8 secrets per map (golden thimbles, weapon parts, credit stashes)
- ✅ Customisation with zero pay-to-win:
  - 11 cosmetic slots, 6 packaging styles, weapon charms and grip wraps unlocked by the weapon parts you find
  - levels, credits and 10 medals
  - Customise and Progress screens, and an end-of-match packaging card
- ✅ Saturday-morning framing: Sgt. Tuft Buttonsworth's briefings and tips, Baron von Ravel's taunts
- ✅ Synthesized audio: music-box menu theme, garage-rock combat score that follows the match, all effects
- ✅ Toy physics: knitted pieces pop off and bounce, stuffing puffs; damage-direction arcs; camera shake
- ✅ AAA-style cinematic main menu with gamepad navigation
- ✅ Electron desktop app: Windows `.exe`, unpacked build ready for SteamPipe, portable exe
- ✅ Steamworks scaffold: medals unlock achievements and rich presence shows mode, map and wave (optional steamworks.js; no-op without it)
- ✅ Key rebinding; accessibility: colour-blind palettes, subtitles and sound captions, reduced camera shake
- ✅ Performance: distance LOD for invaders (proxies and no posing when far)

**Still ahead**
- ⬜ Steam, the rest (needs your App ID): lobbies and invites, relay networking, cloud saves
- ⬜ More maps: kitchen counter, sewing room, attic, a seasonal Christmas living room
- ⬜ A boss per map (only The Unraveller exists)
- ⬜ Mission variety: escort, salvage and daily challenges
- ⬜ PvP variety: Capture the Yarn
- ⬜ Weapon parts with stat-free variants per weapon (charms and wraps exist; per-weapon skins do not yet)
- ⬜ Gamepad aim assist; gamepad button remapping
- ⬜ More weapons: Stuffing Blaster, Safety-Pin Crossbow; gadgets
- ⬜ More invaders: Yo-Yo Slinger, Paper-Plane squadron, Moth Queen
- ⬜ More traps: Fan, Marble Chute, Sewing-Machine Turret, Hot-Water-Bottle Mortar, Healing Sewing Kit
- ⬜ Performance: LOD for player figures, per-room occlusion culling, baked lighting, meshing in a Web Worker
- ⬜ Presentation: a commissioned rock soundtrack and voice acting, a trailer, store capsules, code signing
- ⬜ Accessibility: toggle vs hold options, UI scale, a one-handed control preset
- ⬜ Dedicated servers, matchmaking and reconnect

Priorities: **P1** makes the game fun enough to sell, **P2** makes it rich, **P3** is polish and long tail.

---

## 1. Survivability and game feel (P1)

Done in this update:
- 150 stitches of health (up from 100)
- **Stitch-up**: after 4 s without damage you regenerate 18/s
- 2 s spawn protection
- enemy hits on toys in co-op at 70%

Next:
- **Down, not out (co-op):** at 0 stitches you fall "unravelled" for 15 s and a teammate holds E to re-stitch you. You only respawn at the next wave if nobody helps. Solo gets one self-revive per wave. The figures already have a `downed` pose.
- **Pickups:** Stuffing (+50 health), Thimble armour (+50 shield that soaks damage first), Bobbin ammo.
- **Hit feedback:** directional damage arcs, a low-health heartbeat and desaturation, a knitted "stitches popping" hit sound, and a squash on the enemy you hit.
- **Toy physics:** unravelled enemies should burst into yarn and stuffing that stays on the floor for a while (the mess becomes a scoreboard), not ragdoll like a human. Knitted limbs can pop off on headshots.
- **Floaty but precise movement:** slightly longer air time, air control, a ledge grab/mantle (essential for climbing furniture), and a **yarn swing** (grapple onto a hanging thread) as the signature traversal move.

## 2. Weapons (P1 → P2)

The loadout is two primaries plus a gadget, with weapon **parts** (barrel, magazine, sight, charm) unlocked by play:

| Weapon | Role | Feel |
|---|---|---|
| Pom-Pom Popper *(have)* | assault | fast fluffy balls |
| Button Buster *(have)* | shotgun | spray of buttons, knock-back |
| **Knitting-Needle Lance** | sniper | charge shot that pins enemies to walls |
| **Crochet-Hook Chain** | SMG | very fast, low damage, heats up |
| **Yarn-Ball Launcher** | grenade launcher | bouncing balls that tangle (slow) on impact |
| **Static Sock** | beam | zaps and chains between enemies (battery-powered) |
| **Safety-Pin Crossbow** | precision | headshots do triple damage |
| **Glue Gun** | support | sticks enemies in place; heals buildables |
| **Stuffing Blaster** | flamethrower-style | short cone that knocks things flying |

Gadgets (with a cooldown): a thimble shield wall, a decoy toy, a spring jump pad, a yarn trap line and a battery EMP that stuns wind-up enemies.

## 3. Traps and buildables (P1 → P2)

Have: Pom-Pom Turret, Pin Wall, Tangle Mat.

Add:
- **Brick Barricade** (generic building bricks): cheap walls you can stack.
- **Battery Zapper** tower.
- **Mousetrap** (one big snap).
- **Fan** (blows flyers away).
- **Marble Chute** (rolling damage along a lane).
- **Sewing-Machine Turret** (rapid needle fire).
- **Hot-Water-Bottle Mortar**.
- **Healing Sewing Kit** (repairs the Heartspool between waves).

**Upgrades:** each buildable gets tier 2 and 3 (more yarn, more damage) and can be sold back.

**Dynamic pathing:** right now walls block and enemies chew through them. Next step: re-bake the flow field (it's already a fast Dijkstra, ~55 ms on the garden, so it can run in a Worker on every build) and treat walls as costly rather than solid. Players can then **maze** enemies, which is the heart of tower defence.

## 4. Enemies: the Mass-Knit Army (P1 → P2)

Mix swarms, ranged attackers, flyers, tanks and specials so both guns and traps matter.

Have: Knit Grunt (soldier), Scuttler (fast crab-spider), Moth (flyer), Felted Brute (tank).

Add:
- **Wind-up Mice:** a swarm of 20. Fast and fragile, they explode in clouds of fluff.
- **Tin Drummer:** buffs nearby enemies' speed while he drums. Kill him first.
- **Yo-Yo Slinger:** ranged; it snags you and pulls you off ledges.
- **Paper-Plane Squadron:** flyers that dive-bomb turrets.
- **RC Drone:** a flying carrier that drops Mice onto the Heartspool.
- **Jack-in-the-Box:** pops out of the floor behind your defences.
- **Scissor Snip:** cuts through walls and mats instantly. A priority target.
- **Moth Queen:** mini-boss; lays moth eggs on buildables.
- **Bosses** (one per map, wave 10):
  - **The Unraveller**, a giant shears-handed bear
  - **Hoover Hydra**, a vacuum cleaner with three hoses that sucks up yarn and toys
  - **Dryer Tyrant**, a spinning machine in the laundry room

## 5. Missions and modes (P1 → P2)

**Co-op missions** (every map supports several):
- **Defend** (have): hold the Heartspools for N waves. Difficulties: Cosy / Scratchy / Moth-eaten / Unravelled.
- **Escort:** push the Heartspool on a toy train or RC car along a track while waves attack.
- **Salvage:** collect scattered spools of thread and bring them home before the timer runs out.
- **Endless:** waves forever, with online leaderboards.
- **Boss nights:** a single long wave against a boss.
- **Daily and weekly challenges:** fixed seed, weird modifiers ("low gravity", "only Buster", "enemies are huge").

**PvP:** Free-for-All (have), Team Deathmatch, Capture the Yarn, King of the Spool, and Tag (you're "it" while holding the thimble).

**Local split-screen** (2–4 players on one PC with gamepads): render one viewport per local player with several input devices and several `NetClient`s to the same solo worker host. The architecture already supports several clients per host. This fits the couch co-op nostalgia well.

**Campaign framing:** a short intro told as a Saturday-morning cartoon:
- **Commander:** Sgt. Tuft Buttonsworth, an old moth-eaten knitted war veteran.
- **Villain:** Baron von Ravel and his Mass-Knit Army. He wants to unpick every hand-made toy into factory acrylic.

These are original names; don't reuse other games' characters or terms.

## 6. Levels and environments (P1 → P3)

Toy scale means a huge world built for **verticality**.

Have: The Bedroom and the Back Garden (house, shed, treehouse, pond, messy yard).

Add:
- **Garage:** car hood and roof as high ground, a pegboard wall to climb, a paint-tin maze, and an extension cord as a bridge.
- **Kitchen Counter:** the toaster as a jump pad, a sink canyon, a fridge-top sniper nest, and a spice-rack staircase.
- **Bathroom:** a bathtub arena, toilet-roll towers, a slippery floor and rubber ducks.
- **Toy Store Aisle:** shelves of boxed figures (enemies burst out of packaging), shopping trolleys and a checkout conveyor.
- **Sewing Room:** giant spools, the sewing machine as a moving hazard, and pincushion islands. This is the home turf of the wool theme.
- **Attic:** dust, torch-lit darkness, cobwebs to swing on, and an old dollhouse inside it.
- **Christmas Living Room** (seasonal): the tree as a climbable tower, and presents as crates.

**Traversal kit:**
- climbable blankets and curtains (knitted, so literally climbable)
- jump pads (spring toys)
- ziplines along yarn and cords
- stacked books as stairs
- moving platforms: a toy train and an RC car

**Secrets:** golden thimbles, hidden patterns (cosmetic unlocks) and weapon parts on high shelves and in dark corners. Each map has 10–20.

## 7. Characters, customisation and progression (P2)

- **No hero classes; all customisation.** The rig and sculpting pipeline already builds figures from options, so every option is an unlock:
  - heads, hair and beards
  - hats (beanie, helmet, bobble, crown)
  - yarn colours and knit patterns (stripes, cable, Fair Isle, argyle)
  - glasses, patches and buttons
  - **packaging styles**: a 90s cardboard box with a blister window, shown on the victory screen
- **Menu:** add Customise (a figure on a turntable, like the Toy Box), Progress (level, medals, collection %) and Extras (Toy Box, credits, concept art).
- **Zero pay-to-win.** Everything unlocks through play: levels, challenges, secrets and achievements. At most, sell a cosmetic supporter pack plus a soundtrack DLC. Players trust this and Steam reviews reward it.
- Account XP, medals ("Unravel 1,000 Mice") and Steam achievements.

## 8. Online and multiplayer (P1 → P2)

Have: an authoritative 30 Hz server, prediction and reconciliation, lag compensation, rooms by code, LAN hosting in the desktop app, and bots.

Add:
- **Steam lobbies and invites** plus **Steam Networking Sockets relay** through steamworks.js, so friends join without port forwarding (see DESKTOP_AND_STEAM.md).
- Dedicated servers for public quick-play in a few regions (the Node server is light: ~70 µs per tick per room).
- Party system, quick match, a server browser, reconnect and voice (Steam).
- Anti-cheat is already structural: the server owns movement, hits and currency.

## 9. Audio and presentation (P2)

- **Soundtrack:** upbeat 90s pop-punk and rock for the waves, and a music-box theme for menus (already synthesized). Commission or license the rock tracks for commercial use.
- Sound effects per material: felt thud, yarn snap, button clack, a stuffing "poof".
- Enemy barks in Saturday-morning-cartoon voices.
- Cartoon intro and outro stings; a "NEW! Collect them all!" style box-art UI.

## 10. Performance and tech (ongoing)

- **Messy rooms, thousands of objects.** Mess is already merged per material and grass is instanced. Add the rest:
  - instanced props
  - distance LODs for figures (3 cell sizes)
  - frustum and occlusion culling per room zone
  - shadow cascades
  - baked lightmaps and AO for static geometry
- Move figure meshing (the SDF surface nets) into a Web Worker and cache meshes on disk in the desktop build.
- Gamepad aiming with aim assist, key rebinding and a settings UI in the pause menu. The main menu already handles gamepads.
- Accessibility: colour-blind palettes for Heartspool and pad colours, subtitles, toggle vs hold, and reduced motion.

## Suggested order

1. **Vertical slice for a Steam page and demo:**
   - down-and-revive, pickups, 3 new weapons, 3 new enemies, 1 boss
   - dynamic mazing
   - Garage map
   - trailer
2. **Early Access:**
   - Customise and Progress screens with ~100 unlocks
   - 5 maps, Endless mode, Steam lobbies and invites, achievements
   - gamepad and Steam Deck support
3. **1.0:**
   - campaign framing and bosses on every map
   - split-screen, 8 maps, PvP modes, daily challenges, seasonal event
