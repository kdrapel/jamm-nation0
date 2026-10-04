// Read-only MOD evidence helper.  This parses the original asset for
// validation of Nation0's translated player; it does not render or play it.

const HEADER_BYTES = 1084;
const SAMPLE_COUNT = 31;
const CHANNELS_BY_SIGNATURE = new Map([
  ['M.K.', 4], ['M!K!', 4], ['FLT4', 4], ['4CHN', 4], ['6CHN', 6], ['8CHN', 8],
]);

function ascii(bytes, start, length) {
  return new TextDecoder('latin1').decode(bytes.subarray(start, start + length)).replace(/\0+$/, '');
}

function be16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function invariant(condition, message) {
  if (!condition) throw new Error(`Invalid MOD oracle input: ${message}`);
}

export function parseMusicMod(bytes) {
  invariant(bytes.length >= HEADER_BYTES, 'file is shorter than a 31-sample MOD header');
  const signature = ascii(bytes, 1080, 4);
  const channels = CHANNELS_BY_SIGNATURE.get(signature);
  invariant(channels !== undefined, `unsupported MOD signature ${JSON.stringify(signature)}`);

  const songLength = bytes[950];
  invariant(songLength > 0 && songLength <= 128, `invalid order count ${songLength}`);
  const orders = [...bytes.subarray(952, 952 + songLength)];
  const patternCount = Math.max(...orders) + 1;
  const patternBytes = patternCount * 64 * channels * 4;
  const samples = [];
  let sampleBytes = 0;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const offset = 20 + index * 30;
    const lengthBytes = be16(bytes, offset + 22) * 2;
    const loopStartBytes = be16(bytes, offset + 26) * 2;
    const loopLengthBytes = be16(bytes, offset + 28) * 2;
    invariant(loopStartBytes + loopLengthBytes <= lengthBytes || loopLengthBytes === 0,
      `sample ${index + 1} loop exceeds its sample length`);
    samples.push({
      number: index + 1,
      name: ascii(bytes, offset, 22),
      lengthBytes,
      finetune: bytes[offset + 24] & 0x0f,
      volume: bytes[offset + 25],
      loopStartBytes,
      loopLengthBytes,
    });
    sampleBytes += lengthBytes;
  }
  invariant(HEADER_BYTES + patternBytes + sampleBytes === bytes.length,
    `file length ${bytes.length} does not match header/pattern/sample layout`);

  const patternOffset = HEADER_BYTES;
  const readEvent = (pattern, row, channel) => {
    invariant(pattern < patternCount && row < 64 && channel < channels, 'event index outside module layout');
    const offset = patternOffset + (((pattern * 64 + row) * channels + channel) * 4);
    const a = bytes[offset]; const b = bytes[offset + 1];
    const c = bytes[offset + 2]; const d = bytes[offset + 3];
    return {
      period: ((a & 0x0f) << 8) | b,
      sample: (a & 0xf0) | (c >>> 4),
      effect: c & 0x0f,
      effectParameter: d,
    };
  };
  return Object.freeze({
    title: ascii(bytes, 0, 20), signature, channels, songLength, restartPosition: bytes[951],
    orders: Object.freeze(orders), patternCount, patternOffset, patternBytes, sampleDataOffset: patternOffset + patternBytes,
    samples: Object.freeze(samples), sampleBytes, byteLength: bytes.length, readEvent,
  });
}

// The executable's protected-mode image is observed at runtime address
// fileOffset - 0x0f00.  The embedded MOD begins at file 0x1840 / runtime 0x940.
export const nation0MusicEmbedding = Object.freeze({ executableOffset: 0x1840, runtimeOffset: 0x940 });

export function extractNation0EmbeddedMod(executableBytes) {
  if (!(executableBytes instanceof Uint8Array)) throw new TypeError('embedded MOD extraction requires NATION0.EXE bytes');
  const { executableOffset } = nation0MusicEmbedding;
  if (executableBytes.length < executableOffset + HEADER_BYTES) throw new RangeError('NATION0.EXE is too short for its embedded MOD header');
  const header = executableBytes.subarray(executableOffset, executableOffset + HEADER_BYTES);
  const songLength = header[950];
  invariant(songLength > 0 && songLength <= 128, `invalid embedded order count ${songLength}`);
  const patternCount = Math.max(...header.subarray(952, 952 + songLength)) + 1;
  let sampleBytes = 0;
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) sampleBytes += be16(header, 20 + sample * 30 + 22) * 2;
  const byteLength = HEADER_BYTES + patternCount * 64 * 4 * 4 + sampleBytes;
  if (executableBytes.length < executableOffset + byteLength) throw new RangeError('NATION0.EXE is truncated inside its embedded MOD');
  const embedded = executableBytes.slice(executableOffset, executableOffset + byteLength);
  parseMusicMod(embedded);
  return embedded;
}

export function verifyNation0MusicEmbedding(executableBytes, modBytes, runtimeMemoryBytes) {
  const { executableOffset, runtimeOffset } = nation0MusicEmbedding;
  invariant(executableBytes.subarray(executableOffset, executableOffset + modBytes.length).every((value, index) => value === modBytes[index]),
    'executable embedded MOD differs from original/music.mod');
  if (runtimeMemoryBytes) {
    invariant(runtimeMemoryBytes.subarray(runtimeOffset, runtimeOffset + modBytes.length).every((value, index) => value === modBytes[index]),
      'runtime memory MOD differs from original/music.mod');
  }
  return parseMusicMod(modBytes);
}
