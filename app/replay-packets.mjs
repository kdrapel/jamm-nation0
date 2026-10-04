// Lossless transport cache of translated output. Each segment starts with a
// complete frame; subsequent indexed pixels and DAC components are XOR deltas.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const REPLAY_INTERVAL_US = 15_000_000;
export const REPLAY_FORMAT = 1;

export function encodeReplayPackets(packets) {
  let previousPixels = new Uint8Array(0), previousPalette = new Uint8Array(0);
  const parts = [];
  let length = 0;
  for (const packet of packets) {
    let metadata, payload;
    if (packet.type === 'frame') {
      const { indices, palette, ...rest } = packet;
      const delta = new Uint8Array(indices.length + palette.length);
      let changed = false;
      for (let i = 0; i < indices.length; i++) { delta[i] = indices[i] ^ (previousPixels[i] ?? 0); changed ||= delta[i] !== 0; }
      for (let i = 0; i < palette.length; i++) { delta[indices.length+i] = palette[i] ^ (previousPalette[i] ?? 0); changed ||= delta[indices.length+i] !== 0; }
      payload = changed || previousPixels.length !== indices.length ? delta : new Uint8Array(0);
      metadata = { ...rest, pixelBytes: indices.length, paletteBytes: palette.length, bytes: payload.length };
      previousPixels = indices; previousPalette = palette;
    } else {
      const { pcm, ...rest } = packet;
      payload = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      metadata = { ...rest, bytes: payload.length };
    }
    const header = encoder.encode(JSON.stringify(metadata));
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, header.length, true);
    parts.push(size, header, payload); length += 4 + header.length + payload.length;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export function* decodeReplayPackets(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0, indices = new Uint8Array(0), palette = new Uint8Array(0);
  while (offset < bytes.length) {
    const size = view.getUint32(offset, true); offset += 4;
    const metadata = JSON.parse(decoder.decode(bytes.subarray(offset, offset + size))); offset += size;
    const payload = bytes.subarray(offset, offset + metadata.bytes); offset += metadata.bytes;
    if (metadata.type === 'frame') {
      if (indices.length !== metadata.pixelBytes) indices = new Uint8Array(metadata.pixelBytes);
      if (palette.length !== metadata.paletteBytes) palette = new Uint8Array(metadata.paletteBytes);
      if (payload.length) {
        for (let i = 0; i < indices.length; i++) indices[i] ^= payload[i];
        for (let i = 0; i < palette.length; i++) palette[i] ^= payload[indices.length+i];
      }
      yield { ...metadata, indices, palette };
    } else {
      // Record offsets need not be aligned for an Int16Array view.
      yield { ...metadata, pcm: new Int16Array(Uint8Array.from(payload).buffer) };
    }
  }
}
