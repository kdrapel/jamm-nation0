// Integration input for the original setup branch at 0x6bc28.  This is not
// an audio initializer: it writes precisely the state that the original menu
// stores for the fixed Sound Blaster selection, then lets 0x6bd04 and its
// selected-record callbacks perform the normal setup.

const SOUND_BLASTER_SELECTION = 1;
const PORT_0X220_SELECTION = 1;
const IRQ_7_SELECTION = 2;
const RATE_44000_SELECTION = 2;
const ORIGINAL_44_KHZ_TABLE_RATE = 44100;

function setLow8(cpu, register, value) {
  cpu.set(register, (cpu.get(register) & 0xffffff00) | (value & 0xff));
}

function setLow16(cpu, register, value) {
  cpu.set(register, (cpu.get(register) & 0xffff0000) | (value & 0xffff));
}

// Equivalent to the successful non-zero-sound return from fn_6bc28, with the
// four input bytes fixed to Sound Blaster / 0x220 / IRQ 7 / 44000 Hz.  The
// selected callback, IRQ, and rate remain table-derived, exactly as in the
// executable; rejecting a different table value prevents this adapter from
// manufacturing downstream device state.
export function applyFixedSoundBlasterConfiguration(runtime) {
  const { cpu, memory } = runtime;
  const soundRecord = memory.read32(0x64cf0 + SOUND_BLASTER_SELECTION * 4);
  const port = (PORT_0X220_SELECTION + 0x21) << 4;
  const selector = SOUND_BLASTER_SELECTION * 3 - 3;
  const irq = memory.read8(0x64d15 + selector + IRQ_7_SELECTION);
  const sampleRate = memory.read16(0x64d04 + RATE_44000_SELECTION * 2);

  if (soundRecord === 0 || port !== 0x220 || irq !== 7 || sampleRate !== ORIGINAL_44_KHZ_TABLE_RATE) {
    throw new Error(
      `Fixed Sound Blaster setup tables disagree with SB/0x220/IRQ7/44-kHz selection: record=0x${soundRecord.toString(16)}, port=0x${port.toString(16)}, irq=${irq}, rate=${sampleRate}`,
    );
  }

  // fn_6bcbf writes each accepted zero-based menu input with STOSB.  Preserve
  // those bytes because later code can still inspect the setup record.
  memory.write8(0x64d11, SOUND_BLASTER_SELECTION);
  memory.write8(0x64d12, PORT_0X220_SELECTION);
  memory.write8(0x64d13, IRQ_7_SELECTION);
  memory.write8(0x64d14, RATE_44000_SELECTION);

  // These are the five stores performed by fn_6bc28's successful SB branch.
  memory.write32(0x64d0a, soundRecord);
  memory.write16(0x64738, port);
  memory.write8(0x6473a, irq);
  memory.write16(0x64d0e, sampleRate);

  // Match fn_6bc28's observable return registers.  fn_6bd04 overwrites AH,
  // BX, and ESI as in the original path before entering fn_65897.
  setLow8(cpu, 'eax', RATE_44000_SELECTION);
  setLow16(cpu, 'ebx', sampleRate);
  cpu.set('edx', 0);
  cpu.set('esi', 0x64d15);
}

export const fixedSoundBlasterSetup = Object.freeze({
  soundSelection: SOUND_BLASTER_SELECTION,
  portSelection: PORT_0X220_SELECTION,
  irqSelection: IRQ_7_SELECTION,
  rateSelection: RATE_44000_SELECTION,
  basePort: 0x220,
  irq: 7,
  requestedSampleRate: 44000,
  originalTableSampleRate: ORIGINAL_44_KHZ_TABLE_RATE,
});
