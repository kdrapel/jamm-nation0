// Explicit DOS-owned input used to select the executable's original
// ULTRASND/GF1 branch. The environment is represented in the runtime's GS
// address space; fn_210ef still parses it and establishes program globals.
export function initializeStartupUltrasoundEnvironment(runtime, {
  basePort = 0x220,
  dma1 = 1,
  dma2 = 1,
  irq = 7,
} = {}) {
  for (const [name, value] of Object.entries({ basePort, dma1, dma2, irq })) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`ULTRASND ${name} must be a 16-bit non-negative integer`);
  }
  const environmentPointer = 0x20;
  const environmentSegment = 0x1000;
  const environmentOffset = environmentSegment << 4;
  const text = `ULTRASND=${basePort.toString(16)},${dma1.toString(16)},${dma2.toString(16)},${irq}`;
  const bytes = Array.from(text, character => character.charCodeAt(0));
  const gsMemory = runtime.gsMemory;
  if (environmentOffset + bytes.length + 2 > gsMemory.bytes.length) throw new RangeError('ULTRASND environment does not fit in GS memory');

  gsMemory.write32(0x10, environmentPointer);
  gsMemory.write16(environmentPointer + 0x2c, environmentSegment);
  bytes.forEach((value, index) => gsMemory.write8(environmentOffset + index, value));
  gsMemory.write8(environmentOffset + bytes.length, 0);
  gsMemory.write8(environmentOffset + bytes.length + 1, 0);
  runtime.segments.gsSelector = 0x18;
  runtime.segments.gsBase = 0;

  return {
    pointerOffset: environmentPointer,
    environmentSegment,
    environmentOffset,
    record: `${text}\\0\\0`,
    values: { basePort: `0x${basePort.toString(16)}`, dma1, dma2, irq },
    note: 'DOS environment configuration input; fn_210ef parses and stores the original program fields. DMA fields are parsed but discarded by that routine.',
  };
}
