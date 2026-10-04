// Translation of 0x21be2. INT 33h is the executable's protected-to-real-mode
// gateway; AL selects DOS INT 21h/AH=09h for this call.
function __coverage_impl_fn_21be2(runtime, { callInterrupt } = {}) {
  const { memory, cpu } = runtime;
  const savedAx = cpu.get('eax') & 0xffff;
  const savedEdx = cpu.get('edx');

  const edx = (savedEdx + memory.read32(0x18)) >>> 0;
  cpu.set('edx', edx);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | (edx & 0x0f));
  cpu.set('edx', edx >>> 4);
  memory.write16(0xe8, cpu.get('edx'));
  memory.write16(0xd8, cpu.get('eax'));
  memory.write8(0xe1, 0x09);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x21);

  if (typeof callInterrupt !== 'function') {
    throw new Error('Unresolved INT 0x33 call (function 0x21) at 0x21c06');
  }
  callInterrupt(0x33, runtime);

  cpu.set('edx', savedEdx);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | savedAx);
}

// Translation of 0x21cc8. This gateway call forwards DOS INT 21h/AH=02h with
// DL=0x6f, as established by the register block set up below.
function __coverage_impl_fn_21cc8(runtime, { callInterrupt } = {}) {
  const { memory, cpu } = runtime;
  memory.write8(0xe1, 0x02);
  memory.write8(0xd8, 0x6f);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x21);

  if (typeof callInterrupt !== 'function') {
    throw new Error('Unresolved INT 0x33 call at 0x21cd6');
  }
  callInterrupt(0x33, runtime);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_21be2 = instrumentLift('0x21be2', 'fn_21be2', __coverage_impl_fn_21be2);
export const fn_21cc8 = instrumentLift('0x21cc8', 'fn_21cc8', __coverage_impl_fn_21cc8);
