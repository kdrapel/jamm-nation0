// Original allocation helpers at 0x1189 and 0x1198.
function __coverage_impl_fn_1198(runtime) {
  const requested = runtime.cpu.get('eax') >>> 0;
  const start = runtime.memory.read32(0x0);
  const next = (requested + start) >>> 0;
  if (next > runtime.memory.read32(0x4)) {
    runtime.cpu.set('eax', next);
    runtime.cpu.setCarry(true);
    return;
  }
  runtime.memory.write32(0x0, next);
  runtime.cpu.set('eax', start);
  runtime.onAllocatorAllocate?.({ pool: 'low', start, size: requested, end: next, staticPc: runtime.translatedPc });
  runtime.cpu.setCarry(false);
}

// Original high-pool allocator at 0x11b0. The wrapped 32-bit sum remains in
// EAX on failure, matching the shared STC epilogue at 0x11ae.
function __coverage_impl_fn_11b0(runtime) {
  const { memory, cpu } = runtime;
  const requested = cpu.get('eax') >>> 0;
  const start = memory.read32(0x8);
  const next = (requested + start) >>> 0;
  if (next > memory.read32(0xc)) {
    cpu.set('eax', next);
    cpu.setCarry(true);
    return;
  }
  memory.write32(0x8, next);
  cpu.set('eax', start);
  runtime.onAllocatorAllocate?.({ pool: 'high', start, size: requested, end: next, staticPc: runtime.translatedPc });
  cpu.setCarry(false);
}

function __coverage_impl_fn_1189(runtime) {
  const requested = runtime.cpu.get('eax');
  if (runtime.forceHighAllocationSize === requested) {
    const limit = runtime.memory.read32(4);
    runtime.memory.write32(4, runtime.memory.read32(0));
    fn_1198(runtime);
    runtime.memory.write32(4, limit);
    if (!runtime.cpu.carry) throw new Error('Forced high allocation unexpectedly succeeded from the low pool');
    runtime.cpu.set('eax', requested);
    fn_11b0(runtime);
    return;
  }
  fn_1198(runtime);
  if (!runtime.cpu.carry) return;

  runtime.cpu.set('eax', requested);
  fn_11b0(runtime);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_1189 = instrumentLift('0x1189', 'fn_1189', __coverage_impl_fn_1189);
export const fn_1198 = instrumentLift('0x1198', 'fn_1198', __coverage_impl_fn_1198);
export const fn_11b0 = instrumentLift('0x11b0', 'fn_11b0', __coverage_impl_fn_11b0);
