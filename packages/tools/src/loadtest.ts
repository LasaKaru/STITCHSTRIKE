/**
 * Headless load tester: connects N fake clients that run around and fire,
 * then reports downstream bandwidth per client and snapshot rate.
 *
 *   pnpm loadtest -- --url ws://localhost:8787 --clients 4 --seconds 10
 */
import WebSocket from 'ws';
import { Buttons, encodeInputs, INPUT_RATE, INPUTS_PER_PACKET, MSG_SNAPSHOT, type InputCmd } from '@stitchstrike/shared';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg('url', 'ws://localhost:8787');
const clients = Number(arg('clients', '4'));
const seconds = Number(arg('seconds', '10'));
const room = arg('room', `LOAD${Math.floor(Math.random() * 1000)}`);

interface Stats { bytes: number; snapshots: number; welcomed: boolean; first: number; last: number }

function runClient(i: number): Promise<Stats> {
  return new Promise((resolve) => {
    const stats: Stats = { bytes: 0, snapshots: 0, welcomed: false, first: 0, last: 0 };
    const ws = new WebSocket(`${url}/?room=${room}&bots=0`);
    ws.binaryType = 'nodebuffer';
    let seq = 0;
    let yaw = Math.random() * Math.PI * 2;
    let timer: NodeJS.Timeout | undefined;
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hello', name: `Load ${i}` }));
      const batch: InputCmd[] = [];
      timer = setInterval(() => {
        yaw += (Math.random() - 0.5) * 0.2;
        const buttons = Buttons.Forward | Buttons.Fire | (Math.random() < 0.02 ? Buttons.Jump : 0);
        batch.push({ seq: ++seq, buttons, yaw: Math.fround(yaw), pitch: 0, renderTick: 0 });
        if (batch.length >= INPUTS_PER_PACKET) ws.send(encodeInputs(batch.splice(0)));
      }, 1000 / INPUT_RATE);
    });
    ws.on('message', (data: Buffer, isBinary) => {
      stats.bytes += data.byteLength;
      if (isBinary && data[0] === MSG_SNAPSHOT) {
        stats.snapshots++;
        stats.last = performance.now();
        if (!stats.first) stats.first = stats.last;
      }
      if (!isBinary && data.toString().includes('"welcome"')) stats.welcomed = true;
    });
    setTimeout(() => { clearInterval(timer); ws.close(); resolve(stats); }, seconds * 1000);
    ws.on('error', (e) => { console.error(`client ${i}:`, e.message); clearInterval(timer); resolve(stats); });
  });
}

const results = await Promise.all(Array.from({ length: clients }, (_, i) => runClient(i)));
const welcomed = results.filter((r) => r.welcomed).length;
const span = (r: Stats) => Math.max(0.001, (r.last - r.first) / 1000);
const avgKbps = results.reduce((a, r) => a + (r.bytes * 8) / 1000 / span(r), 0) / Math.max(1, results.length);
const avgRate = results.reduce((a, r) => a + (r.snapshots - 1) / span(r), 0) / Math.max(1, results.length);
console.log(`room ${room}: ${welcomed}/${clients} clients joined`);
console.log(`downstream per client: ${avgKbps.toFixed(1)} kbps (budget < 96 kbps PvP)`);
console.log(`snapshot rate: ${avgRate.toFixed(1)} Hz`);
process.exit(welcomed === clients ? 0 : 1);
