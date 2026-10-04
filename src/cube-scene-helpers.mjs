import { fn_5ef7f } from './glyph-string-helper.mjs';
import { pop32, push32 } from './core/stack-effects.mjs';
import { instrumentLift } from './core/function-coverage.mjs';

// Translation of the paired-row text loop at 0x61d94..0x61da5. LODSB
// advances ESI even for the terminating NUL; each nonzero byte is rendered
// with DL=0x20, then the destination advances by eight bytes.
function __coverage_impl_fn_61d94(runtime) {
  const { cpu, memory } = runtime;
  for (;;) {
    const character = memory.read8(cpu.get('esi'));
    cpu.set('esi', (cpu.get('esi') + 1) >>> 0);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | character);
    cpu.set('edx', (cpu.get('edx') & 0xffffff00) | 0x20);
    if (character === 0) return;
    fn_5ef7f(runtime);
    cpu.set('edi', (cpu.get('edi') + 8) >>> 0);
  }
}

// Translation of the CRTC cursor register writer at 0x61600..0x61610.
// The original uses 16-bit OUT DX,AX writes; BH and BL are the supplied
// cursor coordinates, and AX/DX are left as produced by the final OUT.
function __coverage_impl_fn_61600(runtime, adapters = {}) {
  if (typeof adapters.outPort16 !== 'function') {
    throw new TypeError('fn_61600 requires the outPort16 adapter');
  }
  const { cpu } = runtime;
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x3d4);
  let ax = (((cpu.get('ebx') >>> 8) & 0xff) << 8) | 0x0c;
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | ax);
  adapters.outPort16(runtime, 0x3d4, ax);
  ax = ((cpu.get('ebx') & 0xff) << 8) | 0x0d;
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | ax);
  adapters.outPort16(runtime, 0x3d4, ax);
}

function setLowByte(cpu, register, value) {
  cpu.set(register, (cpu.get(register) & 0xffffff00) | (value & 0xff));
}

function setLowWord(cpu, register, value) {
  cpu.set(register, (cpu.get(register) & 0xffff0000) | (value & 0xffff));
}

// Translation of the timer initialization leaf at 0x619b5..0x61a03.
// The VGA status polls remain literal polling loops: a host port model must
// provide the real retrace transitions or this routine waits indefinitely.
function __coverage_impl_fn_619b5(runtime) {
  const { cpu } = runtime;
  cpu.interruptsEnabled = false;

  setLowByte(cpu, 'eax', 0x30);
  runtime.out8(0x43, cpu.get('eax') & 0xff);
  setLowWord(cpu, 'edx', 0x3da);

  while ((runtime.in8(cpu.get('edx') & 0xffff) & 8) !== 0) {}
  while ((runtime.in8(cpu.get('edx') & 0xffff) & 8) === 0) {}

  setLowByte(cpu, 'eax', 0);
  runtime.out8(0x40, 0);
  runtime.out8(0x40, 0);

  while ((runtime.in8(cpu.get('edx') & 0xffff) & 8) !== 0) {}
  while ((runtime.in8(cpu.get('edx') & 0xffff) & 8) === 0) {}

  let ax = runtime.in8(0x40) & 0xff;
  ax |= ax << 8; // MOV AH,AL.
  ax = (ax & 0xff00) | (runtime.in8(0x40) & 0xff);
  ax = ((ax & 0xff) << 8) | (ax >>> 8); // XCHG AL,AH.
  ax = ((-ax) - 0xc0) & 0xffff;
  setLowWord(cpu, 'eax', ax);
  runtime.memory.write16(0x60b04, ax);
  setLowWord(cpu, 'ebx', ax);

  while ((runtime.in8(cpu.get('edx') & 0xffff) & 8) === 0) {}
  while ((runtime.in8(cpu.get('edx') & 0xffff) & 8) !== 0) {}

  setLowByte(cpu, 'eax', cpu.get('ebx') & 0xff);
  runtime.out8(0x40, cpu.get('eax') & 0xff);
  setLowByte(cpu, 'eax', (cpu.get('ebx') >>> 8) & 0xff);
  runtime.out8(0x40, cpu.get('eax') & 0xff);
  cpu.interruptsEnabled = true;
  cpu.setCarry(false); // Final TEST of retrace status clears CF.
}

// Translation of the timer initializer at 0x619a3..0x619b4. The DOS vector
// call is unresolved and therefore supplied as an explicit host callback.
function __coverage_impl_fn_619a3(runtime, adapters = {}) {
  if (typeof adapters.callDosVector28 !== 'function') {
    throw new TypeError('fn_619a3 requires the callDosVector28 adapter');
  }
  const { cpu } = runtime;
  setLowByte(cpu, 'ebx', 0);
  cpu.set('edx', 0x60b06);
  adapters.callDosVector28(runtime);
  fn_619b5(runtime);
}

// Captured vector 8 in c400 targets runtime 0x60b06 / original 0x61a06.
// This is the scene controller's active IRQ0 handler, distinct from the
// earlier compositor handler at 0x21c51. Retrace phase is supplied by the
// runtime and remains synthetic when only a capture checkpoint is available.
function __coverage_impl_fn_61a06(runtime) {
  const { cpu, memory, segments } = runtime;
  const entryDs = segments.dsSelector;
  push32(runtime, cpu.get('eax'));
  push32(runtime, cpu.get('edx'));
  push32(runtime, entryDs);

  const selector = memory.read16(0x1e);
  const interruptContext = runtime.hostInterruptContext ?? runtime.capturedSegments;
  const interruptDs = interruptContext?.ds;
  if (!interruptDs || selector !== interruptDs.selector || interruptDs.normalizedBase !== 0) {
    throw new Error('fn_61a06 requires the original flat DS descriptor from the active interrupt context');
  }
  segments.dsSelector = selector;
  setLowWord(cpu, 'edx', 0x03da);

  const initialStatus = runtime.in8(0x03da) & 0x08;
  const counterAdjustment = initialStatus === 0 ? 1 : -7;
  memory.write16(0x60b04, (memory.read16(0x60b04) + counterAdjustment) & 0xffff);
  let retraceReads = 0;
  while ((runtime.in8(0x03da) & 0x08) === 0) {
    retraceReads += 1;
    if (retraceReads > 4096) throw new Error('fn_61a06 retrace-high wait exceeded 4096 status reads');
  }

  const reload = memory.read16(0x60b04);
  runtime.out8(0x40, reload & 0xff);
  runtime.out8(0x40, reload >>> 8);
  memory.write32(0x21954, (memory.read32(0x21954) + 1) >>> 0);
  memory.write32(0x21958, (memory.read32(0x21958) + 1) >>> 0);
  setLowByte(cpu, 'eax', 0x20);
  runtime.out8(0x20, 0x20);

  segments.dsSelector = pop32(runtime) & 0xffff;
  cpu.set('edx', pop32(runtime));
  cpu.set('eax', pop32(runtime));
  cpu.interruptsEnabled = true;
  const returnPc = pop32(runtime);
  const returnCs = pop32(runtime) & 0xffff;
  const returnFlags = pop32(runtime);
  if (returnCs !== interruptContext.cs.selector) {
    throw new Error('fn_61a06 IRET changed CS outside the active interrupt context');
  }
  runtime.translatedPc = returnPc;
  cpu.setEflags(returnFlags);
}

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_61600 = instrumentLift('0x61600', 'fn_61600', __coverage_impl_fn_61600);
export const fn_619a3 = instrumentLift('0x619a3', 'fn_619a3', __coverage_impl_fn_619a3);
export const fn_619b5 = instrumentLift('0x619b5', 'fn_619b5', __coverage_impl_fn_619b5);
export const fn_61d94 = instrumentLift('0x61d94', 'fn_61d94', __coverage_impl_fn_61d94);
export const fn_61a06 = instrumentLift('0x61a06', 'fn_61a06', __coverage_impl_fn_61a06);
