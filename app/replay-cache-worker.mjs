import { decodeReplayPackets, REPLAY_INTERVAL_US } from './replay-packets.mjs';

const LEAD_MS = 450;
async function loadSegment(segment) {
  const url = new URL(`./replay-cache/${segment.file}`, import.meta.url).href;
  const cache = await caches.open('nation0-translated-replay-v1').catch(() => null);
  let response = await cache?.match(url);
  if (!response) {
    response = await fetch(url);
    if (!response.ok) throw new Error(`Replay segment request returned ${response.status}`);
    await cache?.put(url, response.clone()).catch(() => {});
  }
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

let playbackControl = null;
self.onmessage = async ({ data }) => {
  if (data.type === 'control') {
    if (playbackControl) Atomics.store(playbackControl, 0, data.value);
    return;
  }
  if (data.type !== 'start-cache') return;
  const control = new Int32Array(data.control);
  playbackControl = control;
  const targetUs = data.seekUs;
  let realStart = performance.now(), started = false;
  let previousFrame = null, overlappingPcm = null;
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const wait = async elapsedUs => {
    Atomics.store(control, 4, elapsedUs);
    while (Atomics.load(control, 0) === 1) {
      const start = performance.now(); await sleep(20);
      realStart += performance.now() - start;
    }
    if (Atomics.load(control, 0) === 2) throw new Error('Playback stopped');
    let delay = realStart + (elapsedUs - targetUs) / 1000 - LEAD_MS - performance.now();
    while (delay > 0 && Atomics.load(control, 0) === 0) {
      await sleep(Math.min(delay, 25));
      delay = realStart + (elapsedUs - targetUs) / 1000 - LEAD_MS - performance.now();
    }
  };
  const send = packet => {
    if (packet.type === 'frame') {
      const indices = packet.indices.slice(), palette = packet.palette.slice();
      self.postMessage({ ...packet, indices: indices.buffer, palette: palette.buffer }, [indices.buffer, palette.buffer]);
    } else {
      const offset = Math.max(0, Math.ceil((targetUs-packet.elapsedUs)*packet.sampleRate/1e6));
      const pcm = packet.pcm.slice(offset * 2);
      if (pcm.length) self.postMessage({ type:'pcm', elapsedUs:Math.max(targetUs,packet.elapsedUs), sampleRate:packet.sampleRate, pcm:pcm.buffer }, [pcm.buffer]);
    }
  };
  try {
    const first = Math.floor(targetUs / REPLAY_INTERVAL_US);
    let pending = loadSegment(data.manifest.segments[first]);
    for (let index = first; index < data.manifest.segments.length; index++) {
      const bytes = await pending;
      if (index + 1 < data.manifest.segments.length) pending = loadSegment(data.manifest.segments[index+1]);
      for (const packet of decodeReplayPackets(bytes)) {
        if (!started && packet.elapsedUs < targetUs) {
          if (packet.type === 'frame') previousFrame = { ...packet, indices:packet.indices.slice(), palette:packet.palette.slice() };
          else if (packet.elapsedUs + packet.pcm.length/2/packet.sampleRate*1e6 > targetUs) overlappingPcm = packet;
          continue;
        }
        if (!started) {
          started = true; realStart = performance.now();
          self.postMessage({ type:'position', elapsedUs:targetUs, seeking:false });
          if (overlappingPcm) send(overlappingPcm);
          if (previousFrame) send({ ...previousFrame, elapsedUs:targetUs });
        }
        await wait(packet.elapsedUs);
        send(packet);
      }
    }
    self.postMessage({ type:'stop', result:{ stop:data.manifest.stop, elapsedUs:data.manifest.endUs } });
  } catch (error) {
    if (Atomics.load(control,0) !== 2) self.postMessage({ type:'error', message:String(error.message ?? error) });
  }
};
