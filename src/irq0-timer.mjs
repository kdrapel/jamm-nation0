import { push16, pop16, push32, pop32 } from './core/stack-effects.mjs';
import { instrumentLift } from './core/function-coverage.mjs';

// Complete original IRQ0 handler, 0x21c51..0x21c6e. Its interrupt frame
// belongs to the delivery adapter, not to a near-CALL/synthetic RET sentinel.
function executeIrq0(runtime) {
  const { cpu, memory, segments } = runtime;
  const context = runtime.hostInterruptContext ?? {
    cs: runtime.capturedSegments?.cs,
    ds: runtime.capturedSegments?.ds,
  };
  if (!context?.cs || !context?.ds) throw new Error('IRQ0 requires explicit CS/DS interrupt context');
  const entryDs = segments.dsSelector;
  push16(runtime, cpu.get('eax'));                         // PUSH AX
  push32(runtime, entryDs);                               // PUSH DS (32-bit stack slot)
  const selector = memory.read16(0x1e);                    // MOV DS,CS:[0x1e]
  if (selector !== context.ds.selector || context.ds.normalizedBase !== 0) {
    throw new Error('IRQ0 handler requires the evidence-backed flat DS descriptor');
  }
  segments.dsSelector = selector;
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x20);
  runtime.out8(0x20, cpu.get('eax') & 0xff);                // PIC EOI
  cpu.interruptsEnabled = true;                           // STI
  for (const address of [0x21954, 0x21958]) {
    const value = memory.read32(address);
    memory.write32(address, (value + 1) >>> 0);            // Original INC instructions
    cpu.setIncFlags32(value);
  }
  segments.dsSelector = pop32(runtime) & 0xffff;          // POP DS
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | pop16(runtime));
  const returnPc = pop32(runtime);                        // IRET: EIP, CS, EFLAGS
  const returnCs = pop32(runtime) & 0xffff;
  const returnFlags = pop32(runtime);
  if (returnCs !== context.cs.selector) throw new Error('IRQ0 IRET changed CS outside its evidence-backed contract');
  runtime.translatedPc = returnPc;
  cpu.setEflags(returnFlags);
}

export const fn_21c51 = instrumentLift('0x21c51', 'fn_21c51', executeIrq0);

// Narrow channel-0 terminal-count / master IRQ0 model. No unrelated IRQs,
// DOS services, timing reconstruction, or target-capture state are supplied.
export class Irq0Timer {
  constructor(runtime, {
    pitHz = 1193182,
    reload = 17045,
    masterMask = 0xfe,
    handlerRuntimeAddress = 0x20d51,
    handlerStaticAddress = 0x21c51,
    executeHandler = executeIrq0,
    resolveHandler = (address, host) => host.translatedInterruptHandlers?.get(address),
    deferGateValidation = false,
  } = {}) {
    if (!Number.isInteger(reload) || reload < 1 || reload > 65536) throw new RangeError('PIT reload must be 1..65536');
    if (!Number.isInteger(pitHz) || pitHz < 1) throw new RangeError('PIT input frequency must be a positive integer');
    const context = runtime.hostInterruptContext ?? {
      cs: runtime.capturedSegments?.cs,
      ds: runtime.capturedSegments?.ds,
      ss: runtime.capturedSegments?.ss,
      idtrNormalizedBase: runtime.captureEvidence?.idtrNormalizedBase,
    };
    const cs = context?.cs;
    const ss = context?.ss;
    if (!cs || !context?.ds || !ss || cs.normalizedBase !== 0 || ss.normalizedBase !== 0 || !cs.default32Bit) throw new Error('IRQ0 requires evidence-backed 32-bit CS and flat SS backing');
    this.runtime = runtime;
    this.interruptContext = context;
    this.pitHz = pitHz;
    this.reload = reload;
    this.masterMask = masterMask & 0xff;
    this.handlerRuntimeAddress = handlerRuntimeAddress >>> 0;
    this.handlerStaticAddress = handlerStaticAddress >>> 0;
    this.executeHandler = executeHandler;
    this.resolveHandler = resolveHandler;
    this.elapsedUs = 0;
    this.inputTicks = 0;
    this.opportunities = 0;
    this.deliveries = 0;
    this.eois = 0;
    this.pending = false;
    this.inService = false;
    this.executing = false;
    this.pitMode = 3;
    this.epochTicks = 0;
    this.epochOpportunities = 0;
    this.readHigh = false;
    this.writeLow = null;
    this.provenance = 'spec-backed synthetic PIT/PIC progression: channel-0 periodic terminal counts; initial counter phase, IRQ0-enabled mask and empty IRR/ISR are assumptions, not captured state';
    runtime.segments.dsSelector = context.ds.selector;
    runtime.irq0Clock = this;
    if (!deferGateValidation) this.validateGate();
  }

  validateGate() {
    const { runtime } = this;
    const base = this.interruptContext.idtrNormalizedBase;
    if (!Number.isInteger(base)) throw new Error('Evidence-backed IDTR base is unavailable');
    const gate = base + 8 * 8;
    const { memory } = runtime;
    const offset = (memory.read16(gate) | (memory.read16(gate + 6) << 16)) >>> 0;
    const selector = memory.read16(gate + 2);
    if (selector !== this.interruptContext.cs.selector || memory.read8(gate + 5) !== 0x8e) {
      throw new Error(`IRQ0 gate is not the captured present CPL0 32-bit interrupt gate to original 0x${this.handlerStaticAddress.toString(16)}`);
    }
    return offset;
  }

  readPort(port) {
    if (port === 0x21) return this.masterMask;
    if (port === 0x40) {
      if (this.pitMode !== 0) throw new Error('Only the reached mode-0 PIT calibration read is supported');
      const value = Math.max(0, this.reload - (this.inputTicks - this.epochTicks)) & 0xffff;
      const byte = this.readHigh ? value >>> 8 : value & 255;
      this.readHigh = !this.readHigh;
      return byte;
    }
    return null;
  }

  writePort(port, value) {
    if (port === 0x21) this.masterMask = value;
    if (port === 0x20) {
      // A shared master PIC also receives EOI from GUS IRQ7. It owns whether
      // an EOI has a matching ISR bit; this timer only consumes the EOI when
      // its own IRQ0 handler is active.
      if (this.runtime.pic8259 && value === 0x20 && !this.inService) return;
      if (value !== 0x20 || !this.inService) throw new Error('Unsupported PIC command or EOI without IRQ0 in service');
      this.inService = false;
      this.eois++;
    }
    if (port === 0x43) {
      if (value !== 0x30 && value !== 0x36) throw new Error('Unsupported PIT command outside original mode-0/mode-3 calibration');
      this.pitMode = (value >>> 1) & 7;
      this.writeLow = null;
      this.readHigh = false;
    }
    if (port === 0x40) {
      if (this.writeLow === null) this.writeLow = value & 255;
      else {
        this.reload = (this.writeLow | ((value & 255) << 8)) || 65536;
        this.writeLow = null;
        this.epochTicks = this.inputTicks;
        this.epochOpportunities = this.opportunities;
        this.readHigh = false;
      }
    }
  }

  servicePending() {
    const { runtime } = this;
    const mask = runtime.pic8259?.masterMask ?? this.masterMask;
    if (!this.pending || (mask & 1) || !runtime.cpu.interruptsEnabled || this.inService || this.executing) return false;
    const target = this.validateGate();
    const handler = target === this.handlerRuntimeAddress
      ? this.executeHandler
      : this.resolveHandler?.(target, runtime);
    if (typeof handler !== 'function') {
      throw new Error(`IRQ0 gate target 0x${target.toString(16)} has no translated handler adapter`);
    }
    const dispatch = () => {
      const returnPc = runtime.translatedPc;
      if (!Number.isInteger(returnPc)) throw new Error('IRQ0 delivery needs an explicit translated instruction boundary');
      const beforeEsp = runtime.cpu.get('esp');
      push32(runtime, runtime.cpu.eflags);
      push32(runtime, this.interruptContext.cs.selector);
      push32(runtime, returnPc);
      runtime.cpu.setEflags(runtime.cpu.eflags & ~(0x100 | 0x200 | 0x4000 | 0x10000)); // interrupt-gate TF/IF/NT/RF
      runtime.translatedPc = target;
      this.pending = false;
      this.inService = true;
      this.executing = true;
      try {
        handler(runtime);
        if (this.inService || runtime.translatedPc !== returnPc || runtime.cpu.get('esp') !== beforeEsp) throw new Error('IRQ0 EOI / IRET contract failed');
        this.deliveries++;
      } finally { this.executing = false; }
      return true;
    };
    // Once audio attaches a master PIC, channel 0 must enter that same PIC
    // state before its original OUT 20h,20h acknowledgement. The timer still
    // owns terminal counts and the translated IRQ0 body; the PIC owns IRR/ISR
    // priority and EOI state for both IRQ0 and GUS IRQ7.
    if (runtime.pic8259) {
      const result = runtime.pic8259.requestMasterIrq(0, dispatch);
      return result.delivered;
    }
    return dispatch();
  }

  advanceToUs(elapsedUs) {
    if (!Number.isSafeInteger(elapsedUs) || elapsedUs < this.elapsedUs) throw new RangeError('Emulated time must advance monotonically in integer microseconds');
    this.elapsedUs = elapsedUs;
    const targetTicks = Math.floor(elapsedUs * this.pitHz / 1000000);
    if (this.pitMode === 0) {
      // Mode 0 is a one-shot. If the translated IRQ handler reloads channel 0,
      // that reload starts at the PIT terminal count, not at the next host
      // frame boundary that happened to observe it. Advancing at the frame
      // boundary shifts each re-arm late by up to one 70 Hz frame; with this
      // program's ~14.4 ms reload that quantization drops the scene IRQ rate
      // to about 35 Hz. Replay every terminal count within this elapsed-time
      // interval at its actual PIT input tick, then leave the clock at target.
      while (!this.pending && this.epochOpportunities === this.opportunities) {
        const terminalTick = this.epochTicks + this.reload;
        if (terminalTick > targetTicks) break;
        const previousEpoch = this.epochTicks;
        this.inputTicks = terminalTick;
        this.opportunities = this.epochOpportunities + 1;
        this.pending = true; // Edge-triggered PIC IRR: requests coalesce while blocked.
        this.servicePending();
        // A blocked or masked one-shot remains pending until the original IRQ
        // can run and reprogram the PIT. Do not synthesize additional edges.
        if (this.epochTicks === previousEpoch) break;
      }
      this.inputTicks = targetTicks;
      this.servicePending();
    } else {
      this.inputTicks = targetTicks;
      const elapsedTicks = this.inputTicks - this.epochTicks;
      const due = this.epochOpportunities + Math.floor(elapsedTicks / this.reload);
      while (this.opportunities < due) {
        this.opportunities++;
        this.pending = true; // Edge-triggered PIC IRR: requests coalesce while blocked.
        this.servicePending();
      }
      this.servicePending();
    }
  }

  state() {
    return { elapsedUs: this.elapsedUs, pitHz: this.pitHz, reload: this.reload, mode: this.pitMode, counter: this.pitMode === 0 ? Math.max(0, this.reload - (this.inputTicks - this.epochTicks)) : null, periodTicksRemaining: this.reload - ((this.inputTicks - this.epochTicks) % this.reload), opportunities: this.opportunities, irq0Deliveries: this.deliveries, eois: this.eois, mask: this.masterMask, pending: this.pending, inService: this.inService, provenance: this.provenance };
  }
}
