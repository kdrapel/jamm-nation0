// Captured indexed callback at runtime 0x6c13b, original file offset 0x6d03b.
// Its code bytes matched the executable in the existing usable memory dumps.
function __coverage_impl_fn_6d03b(runtime) {
  const { memory, cpu } = runtime;
  if ((memory.read8(0x6bbef) & 0x02) === 0) {
    cpu.setCarry(true);
    return;
  }

  const savedEbx = cpu.get('ebx');
  const savedEdx = cpu.get('edx');
  const ssBase = runtime.segments?.ssBase;
  if (ssBase === null || ssBase === undefined) throw new Error('fn_6d03b requires a resolved SS base for PUSH scratch');
  const esp = cpu.get('esp');
  // PUSH EBX; PUSH EDX. POP restores ESP but leaves these bytes observable.
  memory.write32((ssBase + ((esp - 4) >>> 0)) >>> 0, savedEbx);
  memory.write32((ssBase + ((esp - 8) >>> 0)) >>> 0, savedEdx);
  let divisor = memory.read16(0x6bbb0);
  const limit = (divisor << 4) >>> 0;
  let eax = cpu.get('eax');
  if (eax >= limit) {
    cpu.setCmpFlags32(eax, limit);
    cpu.set('eax', 0xffff);
    cpu.set('ebx', savedEbx);
    cpu.set('edx', savedEdx);
    cpu.setCarry(false);
    return;
  }

  eax = Math.max(eax, 0x400);
  divisor >>>= 0;
  const dividend = (eax * 0x1000) >>> 0;
  cpu.set('eax', Math.floor(dividend / divisor));
  cpu.set('edx', savedEdx);
  cpu.set('ebx', savedEbx);
  cpu.setCarry(false);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_6d03b = instrumentLift('0x6d03b', 'fn_6d03b', __coverage_impl_fn_6d03b);
