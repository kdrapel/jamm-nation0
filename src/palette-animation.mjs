import { fn_1189 } from './allocator.mjs';
import { fn_2852b, fn_28574 } from './vga-helpers.mjs';
import { fn_5fd80 } from './glyph-helper.mjs';
import { fn_5fe03 } from './byte-glyph-helper.mjs';
import { fn_216be } from './timing-helper.mjs';

const u32 = value => value >>> 0;

function clearEsDwords(runtime, start, count) {
  for (let i = 0; i < count; i += 1) runtime.writeEs32(u32(start + i * 4), 0);
}

function clearEsBytes(runtime, start, count) {
  for (let i = 0; i < count; i += 1) runtime.writeEs8(u32(start + i), 0);
}

// Original fn_5fbf5 entry/setup through its asynchronous loop at 0x5fc80.
// Exported separately so a capture-backed caller can continue the routine on
// its existing runtime while delivering timer/retrace events between frames.
export function beginFn5fbf5(runtime, { advanceVgaFrame } = {}) {
  const { cpu, memory } = runtime;
  let edi = u32(0xa0000 - memory.read32(0x18));
  cpu.set('edi', edi);
  cpu.set('eax', 0);
  cpu.set('ecx', 0x3e80);
  clearEsDwords(runtime, edi, 0x3e80);
  cpu.set('edi', u32(edi + 0xfa00));
  cpu.set('ecx', 0);

  fn_2852b(runtime);
  fn_28574(runtime);

  cpu.set('eax', 0xfa00);
  fn_1189(runtime);
  let eax = u32(cpu.get('eax') + 4) & 0xfffffffc;
  memory.write32(0x5eba7, eax);
  edi = eax;
  clearEsBytes(runtime, edi, 0xf9fc);

  cpu.set('edi', memory.read32(0x5eba7));
  cpu.set('esi', memory.read32(0x5ee78));
  fn_5fd80(runtime);
  cpu.set('edi', memory.read32(0x5eba7));
  cpu.set('esi', memory.read32(0x5ee7c));
  fn_5fe03(runtime);
  const progression = runtime.vga?.retraceProgression;
  const originalOnRead = progression?.onRead ?? null;
  if (advanceVgaFrame !== undefined) {
    if (typeof advanceVgaFrame !== 'function' || !progression) throw new Error('fn_5fbf5 PIT calibration requires an active retrace clock adapter');
    let previousHigh = null;
    progression.onRead = sample => {
      originalOnRead?.(sample);
      if (previousHigh === false && sample.retraceHigh) advanceVgaFrame();
      previousHigh = sample.retraceHigh;
    };
  }
  try {
    fn_216be(runtime);
  } finally {
    if (progression && advanceVgaFrame !== undefined) progression.onRead = originalOnRead;
  }

  memory.write32(0x21954, 0);
  memory.write16(0x5e319, 0);
  memory.write32(0x5e0cb, 0);
}

// Original fn_5fbf5 fade exit at 0x5fd5a..0x5fd77, excluding its RET.
export function finishFn5fbf5(runtime) {
  const { cpu, memory } = runtime;
  const edi = u32(0xa0000 - memory.read32(0x18));
  cpu.set('edi', edi);
  cpu.set('eax', 0);
  cpu.set('ecx', 0x3e80);
  clearEsDwords(runtime, edi, 0x3e80);
  cpu.set('edi', u32(edi + 0xfa00));
  cpu.set('ecx', 0);
  memory.write32(0x5effd, 0);
  cpu.setOrFlags32(0); // Original XOR EAX,EAX; the store and RET preserve flags.
}

// Lift of the dispatcher routine at 0x5fbf5..0x5fd77. Hardware/interrupt
// events that advance its animation globals are supplied at exact wait/tick
// boundaries; the original loop remains otherwise unbounded.
function __coverage_impl_fn_5fbf5(runtime, { hardwareCheckpoint, advanceVgaFrame } = {}) {
  if (typeof hardwareCheckpoint !== 'function') {
    throw new Error('fn_5fbf5 requires a hardwareCheckpoint for asynchronous animation events');
  }
  const { memory } = runtime;
  beginFn5fbf5(runtime, { advanceVgaFrame });

  for (;;) {
    fn_2852b(runtime);
    hardwareCheckpoint(runtime, 0x5fc80);
    if (resumeFn5fbf5At0x5fc85(runtime).sceneCompleted) break;
  }

  finishFn5fbf5(runtime);
}

import { instrumentLift } from './core/function-coverage.mjs';

// Original post-retrace frame, 0x5fc85..0x5fd55. The caller owns timing,
// CALL/RET and scene entry. No target checkpoint or hardware input is used.
export function resumeFn5fbf5At0x5fc85(runtime) {
  const { cpu, memory } = runtime;
  let factor = memory.read8(0x5effd);
  if (factor >= 0x40) factor ^= 0x7f;
  factor *= 0x2d;
  cpu.set('ebx', factor);
  cpu.set('esi', 0x5ebab);
  runtime.out8(0x3c8, 0);
  for (let i = 0; i < 96; i++) {
    let value = (memory.read8(cpu.get('esi')) * factor) >>> 8;
    cpu.set('esi', cpu.get('esi') + 1);
    if ((value & 0xffff) >= 0x40) value = (value & 0xffffff00) | 0x3f;
    runtime.out8(0x3c9, value & 255);
  }
  cpu.set('edx', 0x3c9); // MUL clears EDX; MOV DX,3c9 follows each byte.
  const esi = memory.read32(0x5eba7);
  const image = memory.read32(0x20333 + (memory.read32(0x5e0cb) >>> 1) * 4);
  const ebp = u32(image + Math.imul(u32(memory.read32(0x5effd) + 0x2c), 320));
  const edi = u32(0xa1400 - memory.read32(0x18));
  let eax = 0;
  for (let offset = 0; offset < 0xd200; offset += 4) {
    eax = memory.read32(u32(esi + offset)) | memory.read32(u32(ebp + offset));
    memory.write32(u32(edi + offset), eax); // Original store uses DS.
  }
  cpu.set('eax', eax); cpu.set('esi', esi); cpu.set('ebp', ebp); cpu.set('edi', edi);
  let events = memory.read32(0x21954);
  if (events > 4096) throw new Error('Compositor event loop exceeds bounded frame replay');
  memory.write32(0x21954, 0);
  cpu.setOrFlags32(0); // XOR ECX,ECX; XCHG/JECXZ do not alter flags.
  while (events !== 0) {
    const sum = memory.read16(0x5e319) + 0x8000;
    memory.write16(0x5e319, sum);
    memory.write32(0x5effd, memory.read32(0x5effd) + (sum > 0xffff ? 1 : 0));
    cpu.setCmpFlags32(memory.read32(0x5effd), 0x80);
    if (memory.read32(0x5effd) >= 0x80) {
      cpu.set('ecx', events);
      runtime.translatedPc = 0x5ee5a;
      return { originalFunctionCompleted: false, sceneCompleted: true, nextStaticAddress: '0x5fd5a' };
    }
    events--;
  }
  const index = u32(memory.read32(0x5e0cb) + 1);
  cpu.setCmpFlags32(index, 12);
  memory.write32(0x5e0cb, index >= 12 ? 0 : index);
  cpu.set('ecx', 0);
  runtime.translatedPc = 0x5ed80;
  return { originalFunctionCompleted: false, sceneCompleted: false, nextStaticAddress: '0x5fc80' };
}

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_5fbf5 = instrumentLift('0x5fbf5', 'fn_5fbf5', __coverage_impl_fn_5fbf5);
