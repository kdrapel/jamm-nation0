// Host side of the executable's protected-mode INT 33h gateway. The gate
// forwards AL as a real-mode interrupt vector (original 0x215cd), while the
// translated callers pass real-mode register fields through DS memory.
// This is a DOS/BIOS boundary; application code continues through its
// original wrappers and scene dispatcher.

function setReturnedAl(runtime, value) {
  runtime.memory.write8(0xe0, value & 0xff);
}

function realModePointer(runtime, segment, offset) {
  const physical = segment * 16 + offset;
  // fn_21be2 forms real-mode DS:DX from EDX + DS-base-at-[0x18]. The
  // translated image is normalized to DS base zero, so subtracting the same
  // field maps the DOS pointer back to its translated image offset.
  const dataBase = runtime.memory.read32(0x18);
  if (physical < dataBase) throw new RangeError('DPMI DOS pointer precedes the translated DS image');
  const translated = physical - dataBase;
  if (translated >= runtime.memory.bytes.length) {
    throw new RangeError(`DPMI DOS pointer 0x${physical.toString(16)} is outside translated memory`);
  }
  return translated >>> 0;
}

function appendDosBytes(runtime, vector, functionNumber, bytes) {
  runtime.dosOutput ??= [];
  const record = { vector, function: functionNumber, bytes: Array.from(bytes) };
  runtime.dosOutput.push(record);
  runtime.dosOutputText = (runtime.dosOutputText ?? '') + String.fromCharCode(...bytes);
  return record;
}

function dosInt21(runtime, ax) {
  const { memory } = runtime;
  const functionNumber = ax >>> 8;
  if (functionNumber === 0x09) {
    const segment = memory.read16(0xe8);
    let offset = memory.read16(0xd8);
    const bytes = [];
    for (let count = 0; count < 0x10000; count += 1) {
      const address = realModePointer(runtime, segment, offset);
      const value = memory.read8(address);
      if (value === 0x24) {
        appendDosBytes(runtime, 0x21, functionNumber, bytes);
        setReturnedAl(runtime, 0x24);
        return;
      }
      bytes.push(value);
      offset = (offset + 1) & 0xffff;
    }
    throw new Error('DOS INT 21h/AH=09h string has no `$` terminator in one segment');
  }

  if (functionNumber === 0x02) {
    const value = memory.read8(0xd8); // DL in the translated real-mode register block.
    appendDosBytes(runtime, 0x21, functionNumber, [value]);
    setReturnedAl(runtime, value);
    return;
  }

  throw new Error(`Unsupported DOS INT 21h function AH=0x${functionNumber.toString(16).padStart(2, '0')}`);
}

function biosInt10(runtime, ax) {
  const functionNumber = ax >>> 8;
  if (functionNumber !== 0x00) {
    throw new Error(`Unsupported BIOS INT 10h function AH=0x${functionNumber.toString(16).padStart(2, '0')}`);
  }
  const mode = ax & 0xff;
  runtime.biosVideoMode = mode;
  runtime.vga.setBiosVideoMode(mode);
  // INT 10h/AH=00 clears video RAM unless AL bit 7 requests preservation.
  // DS glyph OR-stores also read this packed mirror of the VGA aperture.
  if (mode === 0x13) {
    const base = (0xa0000 - runtime.memory.read32(0x18)) >>> 0;
    runtime.memory.bytes.fill(0, base, base + 0x10000);
    for (const plane of runtime.vga.planes) plane.fill(0);
  }
}

export function handleDpmiRealModeInterrupt(runtime, call) {
  if (call.vector !== 0x33) throw new Error(`Expected protected-mode INT 33h, received 0x${call.vector.toString(16)}`);

  const vector = runtime.cpu.get('eax') & 0xff;
  const ax = runtime.memory.read16(0xe0);
  const dx = runtime.memory.read16(0xd8);
  const ds = runtime.memory.read16(0xe8);
  if (vector === 0x21) dosInt21(runtime, ax);
  else if (vector === 0x10) biosInt10(runtime, ax);
  else throw new Error(`Unsupported real-mode INT 0x${vector.toString(16).padStart(2, '0')} through protected-mode INT 33h`);

  runtime.realModeInterrupts ??= [];
  runtime.realModeInterrupts.push({
    sequence: runtime.realModeInterrupts.length,
    vector,
    ax,
    dx,
    ds,
    serviceByte: call.service,
  });
}
