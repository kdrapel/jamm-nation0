import { instrumentLift } from './core/function-coverage.mjs';

// Captured indirect target bytes at normalized runtime 0x3628d map to
// original 0x3718d: MOV byte ptr DS:[0x3628c],1; RET.
function __coverage_impl_fn_3718d(runtime) {
  runtime.memory.write8(0x3628c, 1);
}

export const fn_3718d = instrumentLift('0x3718d', 'fn_3718d', __coverage_impl_fn_3718d);
