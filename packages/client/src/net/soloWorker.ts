/// <reference lib="webworker" />
import { DECK, RoomHost, type GameMode, type MapId } from '@stitchstrike/shared';

// The authoritative server, unchanged, inside the browser (plan §17.6).
declare const self: DedicatedWorkerGlobalScope;

let handlers: ReturnType<RoomHost['connect']> | null = null;

self.onmessage = (e: MessageEvent<string | Uint8Array | { init: true; fillTo: number; mode: GameMode; map: MapId; waves: number; difficulty: number; startWave: number; mission?: number; showcase?: boolean }>) => {
  const d = e.data;
  if (typeof d === 'object' && !(d instanceof Uint8Array) && 'init' in d) {
    const host = new RoomHost({ code: 'SOLO', fillTo: d.fillTo, mode: d.mode, map: d.map, waves: d.waves, difficulty: d.difficulty, startWave: d.startWave, mission: d.mission });
    handlers = host.connect({
      send: (frame) => self.postMessage(frame),
      close: () => self.close(),
    });
    // Screenshot showcase: every trap in the deck built round the pads, free of charge.
    const coop = host.room.coop;
    if (d.showcase && coop) {
      const buttons = coop.buttons;
      coop.buttons = 1e6;
      host.room.world.coop.pads.forEach((p, i) => coop.build(p.pos[0], p.pos[2], DECK[i % DECK.length], 0));
      coop.buttons = buttons;
    }
    host.start();
    return;
  }
  handlers?.onMessage(d as string | Uint8Array);
};
