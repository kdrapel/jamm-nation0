// Minimal protected-mode DPMI host state consumed by the original IRQ-vector
// routines. Values come from 36 post-initialization protected-mode captures;
// this seeds only the host-owned IRQ7 table/gate before Nation0 installs its
// own handler. It is not audio output state or a substitute for fn_17a6/fn_17cc.
export const NATION0_DPMI_IRQ7_HOST_STATE = Object.freeze({
  vectorTableBase: 0x74168,
  irq7VectorIndex: 15,
  previousGateOffset: 0x845,
  gateSelector: 0x0008,
  gateAttributes: 0x8e,
});

// The normalized IDT snapshots consistently show IRQ0 mapped to vector 8,
// selector 8, and a present 32-bit interrupt gate. Startup's translated
// vector update owns the handler offset, so seed only these host-owned gate
// fields here and leave the four offset bytes to the original program path.
export const NATION0_DPMI_IRQ0_HOST_STATE = Object.freeze({
  irq0VectorIndex: 8,
  gateSelector: 0x0008,
  gateReserved: 0x00,
  gateAttributes: 0x8e,
});

export function initializeDpmiHostIrqVectors(runtime, { seedIrq0Gate = false } = {}) {
  const { memory } = runtime;
  const state = NATION0_DPMI_IRQ7_HOST_STATE;
  const vectorTableBase = runtime.dpmiHostIrqVectorTableBase ?? state.vectorTableBase;
  const gate = vectorTableBase + state.irq7VectorIndex * 8;
  if (memory.bytes.length < gate + 8) throw new RangeError('DPMI IRQ7 gate is outside runtime memory');

  // The DOS extender's IRQ map and IDT base are host inputs used by fn_17a6
  // and fn_17cc. Seed only the observed IRQ7 map entry and prior gate.
  memory.write32(0x65f, vectorTableBase);
  memory.write8(0x100 + 7, state.irq7VectorIndex);
  memory.write16(gate, state.previousGateOffset & 0xffff);
  memory.write16(gate + 2, state.gateSelector);
  memory.write8(gate + 5, state.gateAttributes);
  memory.write16(gate + 6, state.previousGateOffset >>> 16);
  const irq0 = NATION0_DPMI_IRQ0_HOST_STATE;
  let irq0Gate = null;
  if (seedIrq0Gate) {
    irq0Gate = vectorTableBase + irq0.irq0VectorIndex * 8;
    memory.write16(irq0Gate + 2, irq0.gateSelector);
    memory.write8(irq0Gate + 4, irq0.gateReserved);
    memory.write8(irq0Gate + 5, irq0.gateAttributes);
  }
  const { csSelector, dsSelector, esSelector, fsSelector, ssSelector } = runtime.segments ?? {};
  if ([csSelector, dsSelector, ssSelector].every(Number.isInteger)) {
    runtime.hostInterruptContext = {
      cs: { selector: csSelector, normalizedBase: 0, default32Bit: true },
      ds: { selector: dsSelector, normalizedBase: 0 },
      es: Number.isInteger(esSelector) ? { selector: esSelector, normalizedBase: 0 } : null,
      fs: Number.isInteger(fsSelector) ? { selector: fsSelector, normalizedBase: 0 } : null,
      ss: { selector: ssSelector, normalizedBase: 0 },
      idtrNormalizedBase: vectorTableBase,
      provenance: 'host CS/DS/SS selectors from the translated startup profile; normalized IDT address and gate fields from protected-mode captures',
    };
  }
  return { ...state, gateAddress: gate, irq0: seedIrq0Gate ? { ...irq0, gateAddress: irq0Gate } : null };
}
