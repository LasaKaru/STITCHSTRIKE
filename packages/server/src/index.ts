import { DEFAULT_PORT } from '@stitchstrike/shared';
import { startGameServer } from './server.ts';

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
/** Artificial one-way delay per direction, for testing netcode (total RTT = 2x). */
const FAKE_LAG_MS = Number(process.env.FAKE_LAG_MS ?? 0);
/** Bots top each room up to this many players (0 disables). */
const FILL_BOTS = Number(process.env.FILL_BOTS ?? 4);
/** Optionally serve the built client too (e.g. STATIC_DIR=packages/client/dist for a one-process deploy). */
const STATIC_DIR = process.env.STATIC_DIR;

const server = await startGameServer({ port: PORT, fillBots: FILL_BOTS, fakeLagMs: FAKE_LAG_MS, staticDir: STATIC_DIR });
console.log(`STITCHSTRIKE server on :${server.port}${FAKE_LAG_MS ? ` (fake lag ${FAKE_LAG_MS} ms each way)` : ''}${STATIC_DIR ? ` serving ${STATIC_DIR}` : ''}`);
