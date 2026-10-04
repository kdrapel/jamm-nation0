import { fn_1189 } from './allocator.mjs';
import { pop32, popad, push32, pushad } from './core/stack-effects.mjs';

// Translation of the bounded ES framebuffer initializer at 0x37963..0x3798a.
function __coverage_impl_fn_37963(runtime) {
  const { memory, cpu } = runtime;
  // 0x37963 PUSHA; CALL fn_1189; ...; POPA.
  pushad(runtime);

  cpu.set('eax', 0x10404);
  push32(runtime, 0x36a6e); // 0x3796e return, normalized CS:0.
  push32(runtime, 0x10404); // fn_1189 PUSH EAX.
  push32(runtime, 0x28f); // fn_1198 return.
  fn_1189(runtime);
  pop32(runtime); // fn_1198 RET
  cpu.set('esp', (cpu.get('esp') + 4) >>> 0); // fn_1189 ADD ESP,4
  pop32(runtime); // fn_1189 RET
  let eax = (cpu.get('eax') + 4) >>> 0;
  eax = (eax & 0xfffffffc) >>> 0;
  eax = (eax + 0x280) >>> 0;
  memory.write32(0x32394, eax);

  for (let offset = 0; offset < 0x3e80 * 4; offset += 4) {
    runtime.writeEs32(eax + offset, 0);
  }

  popad(runtime);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_37963 = instrumentLift('0x37963', 'fn_37963', __coverage_impl_fn_37963);
