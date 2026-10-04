import { instrumentLift } from './core/function-coverage.mjs';

// Original 0x3bfb0: MOV byte ptr DS:[0x3bdc0],1; RET.
function __coverage_impl_fn_3bfb0(runtime) {
  runtime.memory.write8(0x3bdc0, 1);
}

export const fn_3bfb0 = instrumentLift('0x3bfb0', 'fn_3bfb0', __coverage_impl_fn_3bfb0);
