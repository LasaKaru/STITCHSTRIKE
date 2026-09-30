/**
 * Transport abstraction (plan §17.2): gameplay code never knows whether frames
 * travel over a WebSocket, to a Web Worker running the server in-browser, or
 * through an artificial lag line. Swapping in WebRTC/WebTransport later only
 * means another implementation of this interface.
 */

export type Frame = string | Uint8Array;

export interface Transport {
  readonly kind: string;
  send(data: Frame): void;
  close(): void;
  onOpen: () => void;
  onMessage: (data: Frame) => void;
  onClose: (reason: string) => void;
  bytesIn: number;
}

function base(kind: string): Transport {
  return { kind, send() {}, close() {}, onOpen() {}, onMessage() {}, onClose() {}, bytesIn: 0 };
}

export function wsTransport(url: string): Transport {
  const t = base('websocket');
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => t.onOpen();
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') {
      t.bytesIn += e.data.length;
      t.onMessage(e.data);
    } else {
      const bytes = new Uint8Array(e.data as ArrayBuffer);
      t.bytesIn += bytes.byteLength;
      t.onMessage(bytes);
    }
  };
  ws.onclose = (e) => t.onClose(e.reason || `connection closed (${e.code})`);
  ws.onerror = () => { /* onclose follows with details */ };
  t.send = (d) => { if (ws.readyState === WebSocket.OPEN) ws.send(d as string | ArrayBufferView<ArrayBuffer>); };
  t.close = () => ws.close();
  return t;
}

/** Solo play: the exact server code (RoomHost) running in a Web Worker. No network, no server. */
export function workerTransport(fillTo: number, mode: 'coop' | 'pvp' = 'coop'): Transport {
  const t = base('solo worker');
  const worker = new Worker(new URL('./soloWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<Frame>) => {
    const d = e.data;
    t.bytesIn += typeof d === 'string' ? d.length : d.byteLength;
    t.onMessage(d);
  };
  worker.onerror = (e) => t.onClose(`worker error: ${e.message}`);
  worker.postMessage({ init: true, fillTo, mode });
  t.send = (d) => worker.postMessage(d);
  t.close = () => worker.terminate();
  queueMicrotask(() => t.onOpen());
  return t;
}

/** Wraps a transport with artificial latency: half the round trip in each direction. */
export function withFakeLag(inner: Transport, rttMs: number): Transport {
  if (rttMs <= 0) return inner;
  const oneWay = rttMs / 2;
  const t = base(`${inner.kind} +${rttMs}ms`);
  inner.onOpen = () => t.onOpen();
  inner.onClose = (r) => t.onClose(r);
  inner.onMessage = (d) => {
    t.bytesIn = inner.bytesIn;
    setTimeout(() => t.onMessage(d), oneWay);
  };
  t.send = (d) => setTimeout(() => inner.send(d), oneWay);
  t.close = () => inner.close();
  return t;
}
