// Translation of the stateful arithmetic helper at 0x5f269..0x5f28e.
// Its higher-level role remains unnamed.
function __coverage_impl_fn_5f269(runtime) {
  const { memory, cpu } = runtime;
  const savedEdx = cpu.get('edx');
  const ssBase = runtime.segments?.ssBase;
  if (ssBase === null || ssBase === undefined) throw new Error('fn_5f269 requires a resolved SS base for PUSH EDX scratch');
  memory.write32((ssBase + ((cpu.get('esp') - 4) >>> 0)) >>> 0, savedEdx);
  const productLow = Math.imul(0x41fbf0e7, memory.read32(0x5e365)) >>> 0;
  const state = (productLow + 0x904e19) >>> 0;
  memory.write32(0x5e365, state);

  const shifted = state >>> 15;
  cpu.set('eax', ((shifted & 0xffff0000) | (shifted & 0x0007)) >>> 0);
  cpu.setAndFlags16(cpu.get('eax'));
  const rotated = ((state << 3) | (state >>> 29)) >>> 0;
  memory.write32(0x5e365, rotated);
  cpu.set('edx', savedEdx);
  cpu.setCarry(Boolean(rotated & 1));
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_5f269 = instrumentLift('0x5f269', 'fn_5f269', __coverage_impl_fn_5f269);
