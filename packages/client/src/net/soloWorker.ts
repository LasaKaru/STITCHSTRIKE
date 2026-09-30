/// <reference lib="webworker" />
import { RoomHost, type GameMode, type MapId } from '@stitchstrike/shared';

// The authoritative server, unchanged, inside the browser (plan §17.6).
declare const self: DedicatedWorkerGlobalScope;

let handlers: ReturnType<RoomHost['connect']> | null = null;

self.onmessage = (e: MessageEvent<string | Uint8Array | { init: true; fillTo: number; mode: GameMode; map: MapId; waves: number; difficulty: number; startWave: number }>) => {
  const d = e.data;
  if (typeof d === 'object' && !(d instanceof Uint8Array) && 'init' in d) {
    const host = new RoomHost({ code: 'SOLO', fillTo: d.fillTo, mode: d.mode, map: d.map, waves: d.waves, difficulty: d.difficulty, startWave: d.startWave });
    handlers = host.connect({
      send: (frame) => self.postMessage(frame),
      close: () => self.close(),
    });
    host.start();
    return;
  }
  handlers?.onMessage(d as string | Uint8Array);
};
