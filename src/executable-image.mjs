// Map the file-backed protected-runtime bytes into the CS:0 coordinate used
// by the translated routines. The prefix before 0x0f00 is not part of this
// address space; the remaining 4 MiB tail is zero-filled as in runtime-layout.
export const NATION0_FILE_BIAS = 0x0f00;
export const NATION0_EXECUTABLE_LENGTH = 0x6e3f3;
export const NATION0_RUNTIME_IMAGE_LENGTH = 0x6d4f3;

export function loadNation0ExecutableImage(runtime, executableBytes) {
  if (!(executableBytes instanceof Uint8Array)) {
    throw new TypeError('Nation0 executable image must be supplied as Uint8Array bytes');
  }
  if (executableBytes.byteLength !== NATION0_EXECUTABLE_LENGTH) {
    throw new RangeError(`Nation0 executable length mismatch: expected 0x${NATION0_EXECUTABLE_LENGTH.toString(16)}, got 0x${executableBytes.byteLength.toString(16)}`);
  }
  const memoryBytes = runtime?.memory?.bytes;
  if (!(memoryBytes instanceof Uint8Array) || memoryBytes.length < NATION0_RUNTIME_IMAGE_LENGTH) {
    throw new RangeError(`Nation0 runtime memory must cover at least 0x${NATION0_RUNTIME_IMAGE_LENGTH.toString(16)} bytes`);
  }

  // Runtime addresses 0..0x6d4f2 map to executable offsets 0xf00..0x6e3f2.
  // Leave CPU, segment, DOS, and device state untouched; those are separate
  // inputs and must come from evidence or an explicit host setup.
  memoryBytes.fill(0);
  memoryBytes.set(executableBytes.subarray(NATION0_FILE_BIAS), 0);
  return {
    fileBias: NATION0_FILE_BIAS,
    runtimeStart: 0,
    runtimeEndExclusive: NATION0_RUNTIME_IMAGE_LENGTH,
    zeroFillEndExclusive: memoryBytes.length,
  };
}
