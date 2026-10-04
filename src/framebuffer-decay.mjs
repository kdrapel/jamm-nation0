import { fn_5f269 } from './random-helper.mjs';

const BYTE_COUNT = 0x1f400;

// Translation of the bounded byte transform at 0x212ad..0x212f1.
// EBP-based source reads use SS; destination writes through EDI use DS.
function __coverage_impl_fn_212ad(runtime) {
  const { memory, cpu } = runtime;
  if (runtime.segments.ssBase === null) throw new Error('SS base is unresolved');

  const destination = cpu.get('eax');
  const source = memory.read32(0x2034b);
  let edx = cpu.get('edx');
  let carry = cpu.carry;

  for (let index = 0; index < BYTE_COUNT; index += 1) {
    fn_5f269(runtime);
    let al = cpu.get('eax') & 0xff;
    const decay = (cpu.get('eax') & 0xffff) > 5;
    al = decay ? 1 : 0;

    let value = runtime.readSs8((source + index) >>> 0);
    edx = ((edx & 0xffffff00) | value) >>> 0;
    if (decay) {
      edx &= 0xffff00ff; // XOR DH,DH
      let dx = (((edx & 0xffff) * 7) & 0xffff) >>> 3;
      const belowOne = dx < 1;
      if (belowOne) dx = 1;
      edx = ((edx & 0xffff0000) | dx) >>> 0;
      carry = belowOne;
      value = dx & 0xff;
    } else {
      carry = false; // TEST AL,1 clears CF
    }

    memory.write8((destination + index) >>> 0, value);
    cpu.set('eax', ((cpu.get('eax') & 0xffffff00) | al) >>> 0);
  }

  cpu.set('edi', destination);
  cpu.set('ebp', source);
  cpu.set('ebx', 0);
  cpu.set('edx', edx);
  cpu.setCarry(carry);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_212ad = instrumentLift('0x212ad', 'fn_212ad', __coverage_impl_fn_212ad);
