import { fn_1fc16 } from './music-tracker.mjs';

const NATION0_IMAGE_BIAS = 0x0f00;
const FN_1FC16_RUNTIME = 0x1fc16 - NATION0_IMAGE_BIAS;
const FN_1FC16_ENTRY_BYTES = [0x60, 0x1e, 0x06, 0xb0, 0x20, 0xe6, 0x20];

function resolveSelectorBase(runtime, selector) {
  const key = selector & 0xffff;
  if (runtime.hostSelectorBases.has(key)) return runtime.hostSelectorBases.get(key) >>> 0;
  for (const name of ['cs', 'ds', 'es', 'ss', 'fs', 'gs']) {
    if ((runtime.segments[`${name}Selector`] & 0xffff) === key
      && Number.isInteger(runtime.segments[`${name}Base`])) return runtime.segments[`${name}Base`] >>> 0;
    const descriptor = runtime.hostInterruptContext?.[name];
    if (descriptor?.selector === key && Number.isInteger(descriptor.normalizedBase)) return descriptor.normalizedBase >>> 0;
  }
  return undefined;
}

function push32(runtime, value) {
  const esp = (runtime.cpu.get('esp') - 4) >>> 0;
  runtime.cpu.set('esp', esp);
  runtime.memory.write32((runtime.segments.ssBase + esp) >>> 0, value >>> 0);
}

function pop32(runtime) {
  const esp = runtime.cpu.get('esp') >>> 0;
  const value = runtime.memory.read32((runtime.segments.ssBase + esp) >>> 0);
  runtime.cpu.set('esp', (esp + 4) >>> 0);
  return value;
}

function enterTranslatedGusHandler(runtime, gate) {
  const { cpu, memory, segments } = runtime;
  if (!Number.isInteger(segments.ssBase)) throw new Error('Native GUS IRQ needs an explicit SS stack mapping');
  const dataSelector = memory.read16(0x1e);
  const dataBase = resolveSelectorBase(runtime, dataSelector);
  if (!Number.isInteger(dataBase)) throw new Error(`Native GUS IRQ data selector 0x${dataSelector.toString(16)} has no evidence-backed base`);

  const original = {
    registers: Object.fromEntries(['eax', 'ecx', 'edx', 'ebx', 'ebp', 'esi', 'edi'].map(name => [name, cpu.get(name)])),
    eflags: cpu.eflags,
    eip: cpu.get('eip'),
    esp: cpu.get('esp'),
    dsSelector: segments.dsSelector,
    dsBase: segments.dsBase,
    esSelector: segments.esSelector,
    esBase: segments.esBase,
    translatedPc: runtime.translatedPc,
  };
  const returnEip = Number.isInteger(runtime.translatedPc) ? runtime.translatedPc : original.eip;

  // The present 32-bit interrupt gate pushes EFLAGS, CS, and EIP, then clears IF.
  push32(runtime, original.eflags);
  push32(runtime, gate.codeSelector);
  push32(runtime, returnEip);
  cpu.interruptsEnabled = false;
  runtime.translatedPc = FN_1FC16_RUNTIME;

  // fn_1fc16 begins PUSHA; PUSH DS; PUSH ES; then acknowledges IRQ7 and STI.
  const pushaEntryEsp = cpu.get('esp');
  for (const name of ['eax', 'ecx', 'edx', 'ebx']) push32(runtime, cpu.get(name));
  push32(runtime, pushaEntryEsp);
  for (const name of ['ebp', 'esi', 'edi']) push32(runtime, cpu.get(name));
  push32(runtime, segments.dsSelector ?? dataSelector);
  push32(runtime, segments.esSelector ?? dataSelector);
  segments.dsSelector = dataSelector;
  segments.dsBase = dataBase;
  segments.esSelector = dataSelector;
  segments.esBase = dataBase;

  runtime.out8(0x20, 0x20); // Original handler's PIC EOI at 0x1fc1f..0x1fc20.
  cpu.interruptsEnabled = true; // Original STI at 0x1fc1f.
  const result = fn_1fc16(runtime);

  // Original 0x208e7 restores the GF1 selected register before POP ES/DS/AD/IRET.
  const gf1RegisterSelect = memory.read8(0x1fbef);
  const gf1PortBase = memory.read16(0x1e41c);
  runtime.out8((gf1PortBase + 0x102) & 0xffff, gf1RegisterSelect);

  segments.esSelector = pop32(runtime) & 0xffff;
  segments.dsSelector = pop32(runtime) & 0xffff;
  segments.esBase = original.esBase;
  segments.dsBase = original.dsBase;
  // POPA discards its saved ESP slot.
  for (const name of ['edi', 'esi', 'ebp']) cpu.set(name, pop32(runtime));
  pop32(runtime);
  for (const name of ['ebx', 'edx', 'ecx', 'eax']) cpu.set(name, pop32(runtime));

  const returnAddress = pop32(runtime);
  const returnSelector = pop32(runtime) & 0xffff;
  const returnFlags = pop32(runtime);
  if (returnAddress !== returnEip || returnSelector !== gate.codeSelector) {
    throw new Error('Native GUS IRET frame changed during translated handler execution');
  }
  if (cpu.get('esp') !== original.esp) {
    throw new Error('Native GUS IRQ stack did not balance through POPAD/IRET');
  }
  cpu.set('eip', returnAddress);
  cpu.setEflags(returnFlags);
  segments.dsSelector = original.dsSelector;
  segments.dsBase = original.dsBase;
  segments.esSelector = original.esSelector;
  segments.esBase = original.esBase;
  runtime.translatedPc = original.translatedPc;
  return result;
}

export class NativeMusicIrqRouter {
  constructor(runtime) {
    this.runtime = runtime;
    this.delivered = 0;
    this.lastGate = null;
    this.lastBlockedReason = null;
  }

  readGate(irq) {
    const { memory } = this.runtime;
    const idtBase = memory.read32(0x65f) >>> 0;
    const vector = memory.read8(0x100 + (irq & 0xff));
    const gate = (idtBase + vector * 8) >>> 0;
    const offset = ((memory.read16(gate + 6) << 16) | memory.read16(gate)) >>> 0;
    const codeSelector = memory.read16(gate + 2);
    const attributes = memory.read8(gate + 5);
    const codeBase = resolveSelectorBase(this.runtime, codeSelector);
    return { irq, vector, idtBase, gate, offset, codeSelector, attributes, codeBase,
      linearTarget: Number.isInteger(codeBase) ? (codeBase + offset) >>> 0 : null };
  }

  deliver(device) {
    if (device !== this.runtime.nativeMusic) throw new Error('Native GUS IRQ arrived from an unexpected device');
    const { runtime } = this;
    const gate = this.readGate(device.irq);
    this.lastGate = gate;
    if (gate.vector !== 15) throw new Error(`GUS IRQ${device.irq} maps to unexpected vector ${gate.vector}`);
    if (gate.attributes !== 0x8e) throw new Error(`GUS IRQ gate is not a present 32-bit interrupt gate (attributes 0x${gate.attributes.toString(16)})`);
    if (gate.codeSelector !== runtime.hostInterruptContext?.cs?.selector) {
      throw new Error(`GUS IRQ gate selector 0x${gate.codeSelector.toString(16)} differs from captured CS selector`);
    }
    if (gate.linearTarget !== FN_1FC16_RUNTIME) {
      throw new Error(`GUS IRQ gate resolves to 0x${gate.linearTarget?.toString(16) ?? 'unresolved'}, expected translated fn_1fc16 at 0x${FN_1FC16_RUNTIME.toString(16)}`);
    }
    for (let index = 0; index < FN_1FC16_ENTRY_BYTES.length; index += 1) {
      if (runtime.memory.read8(FN_1FC16_RUNTIME + index) !== FN_1FC16_ENTRY_BYTES[index]) {
        throw new Error(`GUS IRQ target code bytes differ from original fn_1fc16 at +0x${index.toString(16)}`);
      }
    }
    const pic = runtime.pic8259;
    if (!pic) throw new Error('Native GUS IRQ requires the runtime master PIC');
    const dispatched = pic.requestMasterIrq(device.irq, irq => {
      if (irq !== device.irq) throw new Error(`Native GUS IRQ${device.irq} dispatched as IRQ${irq}`);
      enterTranslatedGusHandler(runtime, gate);
      this.delivered += 1;
      return true;
    });
    this.lastBlockedReason = dispatched.delivered ? null : 'PIC masked, IF clear, or a higher-priority IRQ is in service';
    return dispatched.delivered;
  }

  snapshot() {
    return { delivered: this.delivered, lastGate: this.lastGate, lastBlockedReason: this.lastBlockedReason };
  }
}
