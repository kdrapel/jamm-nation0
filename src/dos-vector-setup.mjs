// Translation of the bounded wrapper at 0x21b9a. The DOS vectors remain
// host callbacks because their pointed-to routines and contracts are unknown.
function __coverage_impl_fn_21b9a(runtime, { callDosVector } = {}) {
  const { memory, cpu } = runtime;

  const dispatch = (vector, returnAddress) => {
    const ssBase = runtime.segments?.ssBase;
    if (!Number.isInteger(ssBase)) {
      dispatchDosVector(runtime, vector, callDosVector);
      return;
    }

    // The original indirect CALL leaves its return EIP at SS:ESP-4. The
    // observed runtime trace uses normalized CS:0 EIPs 0x20ca1 and 0x20cb1.
    const entryEsp = cpu.get('esp');
    memory.write32((ssBase + ((entryEsp - 4) >>> 0)) >>> 0, returnAddress);
    cpu.set('esp', (entryEsp - 4) >>> 0);
    try {
      dispatchDosVector(runtime, vector, callDosVector);
    } finally {
      // Translated callees leave RET to this wrapper's call convention.
      cpu.set('esp', entryEsp);
    }
  };

  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | 1);

  dispatch(0x24, 0x20ca1);

  memory.write32(0x20c96, cpu.get('edx'));
  cpu.set('edx', 0x20cb2);

  dispatch(0x28, 0x20cb1);
}
import { callDosVector as dispatchDosVector } from './runtime-adapters.mjs';

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_21b9a = instrumentLift('0x21b9a', 'fn_21b9a', __coverage_impl_fn_21b9a);
