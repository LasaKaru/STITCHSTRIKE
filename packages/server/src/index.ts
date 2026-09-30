import { createServer } from 'node:http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { DEFAULT_PORT, MAPS, RoomHost, type Connection, type GameMode, type MapId } from '@stitchstrike/shared';

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
/** Artificial one-way delay per direction, for testing netcode (total RTT = 2x). */
const FAKE_LAG_MS = Number(process.env.FAKE_LAG_MS ?? 0);
/** Bots top each room up to this many players (0 disables). */
const FILL_BOTS = Number(process.env.FILL_BOTS ?? 4);

const rooms = new Map<string, RoomHost>();

function roomCode(raw: string | null): string {
  const code = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return code || 'LOBBY';
}

function getRoom(code: string, fillTo: number, mode: GameMode, map: MapId): RoomHost {
  // Rooms are keyed by mode and map too, so each combination is its own match.
  const key = `${mode}:${map}:${code}`;
  let host = rooms.get(key);
  if (!host) {
    host = new RoomHost({ code, fillTo, mode, map });
    host.start();
    rooms.set(key, host);
    console.log(`[room ${key}] opened (bots fill to ${fillTo})`);
  }
  return host;
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

const http = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const body = JSON.stringify({
      ok: true,
      rooms: [...rooms.values()].map((r) => ({
        code: r.options.code, mode: r.room.mode, map: r.room.world.id, humans: r.humans, players: r.room.players.size, tick: r.room.tick,
        wave: r.room.coop?.wave, enemies: r.room.coop?.enemies.length,
      })),
    });
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(body);
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, maxPayload: 4096 });

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const code = roomCode(url.searchParams.get('room'));
  const botParam = url.searchParams.get('bots');
  const fill = botParam === null ? FILL_BOTS : Math.max(0, Math.min(8, Number(botParam) || 0));
  const mode: GameMode = url.searchParams.get('mode') === 'pvp' ? 'pvp' : 'coop';
  const mapParam = url.searchParams.get('map');
  const map: MapId = MAPS.some((m) => m.id === mapParam) ? (mapParam as MapId) : 'bedroom';
  const host = getRoom(code, fill, mode, map);
  const key = `${mode}:${map}:${code}`;

  const delay = (fn: () => void) => (FAKE_LAG_MS > 0 ? setTimeout(fn, FAKE_LAG_MS) : fn());
  const conn: Connection = {
    send: (data) => delay(() => { if (ws.readyState === ws.OPEN) ws.send(data); }),
    close: () => ws.close(),
  };
  const handlers = host.connect(conn);

  ws.on('message', (data, isBinary) => {
    const payload = isBinary ? toBytes(data) : data.toString();
    delay(() => handlers.onMessage(payload));
  });
  ws.on('close', () => {
    handlers.onClose();
    if (host.humans === 0) {
      host.stop();
      rooms.delete(key);
      console.log(`[room ${key}] closed`);
    }
  });
  ws.on('error', () => ws.close());
});

http.listen(PORT, () => {
  console.log(`STITCHSTRIKE server on :${PORT}${FAKE_LAG_MS ? ` (fake lag ${FAKE_LAG_MS} ms each way)` : ''}`);
});
