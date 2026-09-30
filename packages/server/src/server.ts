import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { MAPS, RoomHost, type Connection, type GameMode, type MapId } from '@stitchstrike/shared';

/**
 * The game server as a library: WebSocket rooms (by mode, map and code), a
 * /health endpoint, and optionally the built client as static files. The
 * standalone server (index.ts) and the desktop app both start it.
 */

export interface GameServerOptions {
  port: number;
  /** Interface to bind; 127.0.0.1 keeps a desktop host private, 0.0.0.0 opens it to the LAN. */
  host?: string;
  /** Serve the built client from here (the desktop app does; the dev server leaves this to Vite). */
  staticDir?: string;
  /** Bots top each room up to this many players (0 disables). */
  fillBots?: number;
  /** Artificial one-way delay per direction, for testing netcode (total RTT = 2x). */
  fakeLagMs?: number;
  log?: (msg: string) => void;
}

export interface GameServer {
  port: number;
  http: Server;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

function roomCode(raw: string | null): string {
  const code = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return code || 'LOBBY';
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

export function startGameServer(o: GameServerOptions): Promise<GameServer> {
  const log = o.log ?? ((m: string) => console.log(m));
  const fillBots = o.fillBots ?? 4;
  const fakeLag = o.fakeLagMs ?? 0;
  const rooms = new Map<string, RoomHost>();
  const root = o.staticDir ? resolve(o.staticDir) : null;

  function getRoom(code: string, fillTo: number, mode: GameMode, map: MapId, waves: number, difficulty: number): RoomHost {
    // Rooms are keyed by mode, map and mission settings too, so each combination is its own match.
    const key = `${mode}:${map}:${waves}:${difficulty}:${code}`;
    let host = rooms.get(key);
    if (!host) {
      host = new RoomHost({ code, fillTo, mode, map, waves, difficulty });
      host.start();
      rooms.set(key, host);
      log(`[room ${key}] opened (bots fill to ${fillTo})`);
    }
    return host;
  }

  const http = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (path === '/health' || (!root && path === '/')) {
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
    if (root && (req.method === 'GET' || req.method === 'HEAD')) {
      // Static client files; never outside the client directory.
      const file = normalize(join(root, path === '/' ? 'index.html' : path));
      if ((file === root || file.startsWith(root + sep)) && existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, {
          'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        });
        if (req.method === 'HEAD') res.end();
        else createReadStream(file).pipe(res);
        return;
      }
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server: http, maxPayload: 4096 });

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const code = roomCode(url.searchParams.get('room'));
    const botParam = url.searchParams.get('bots');
    const fill = botParam === null ? fillBots : Math.max(0, Math.min(8, Number(botParam) || 0));
    const m = url.searchParams.get('mode');
    const mode: GameMode = m === 'pvp' || m === 'tdm' ? m : 'coop';
    const wavesParam = Number(url.searchParams.get('waves') ?? 10);
    const waves = [0, 5, 10].includes(wavesParam) ? wavesParam : 10;
    const difficulty = Math.max(0, Math.min(3, Math.floor(Number(url.searchParams.get('difficulty') ?? 1)) || 0));
    const mapParam = url.searchParams.get('map');
    const map: MapId = MAPS.some((m) => m.id === mapParam) ? (mapParam as MapId) : 'bedroom';
    const host = getRoom(code, fill, mode, map, waves, difficulty);
    const key = `${mode}:${map}:${waves}:${difficulty}:${code}`;

    const delay = (fn: () => void) => (fakeLag > 0 ? setTimeout(fn, fakeLag) : fn());
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
        log(`[room ${key}] closed`);
      }
    });
    ws.on('error', () => ws.close());
  });

  return new Promise((resolvePromise, reject) => {
    http.once('error', reject);
    http.listen(o.port, o.host ?? '0.0.0.0', () => {
      http.off('error', reject);
      const addr = http.address();
      const port = typeof addr === 'object' && addr ? addr.port : o.port;
      resolvePromise({
        port,
        http,
        close: () => new Promise<void>((done) => {
          for (const r of rooms.values()) r.stop();
          rooms.clear();
          for (const c of wss.clients) c.terminate();
          wss.close();
          http.close(() => done());
        }),
      });
    });
  });
}
