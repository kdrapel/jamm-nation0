import { fn_1189 } from './allocator.mjs';
import { pop32, push32 } from './core/stack-effects.mjs';

const SIDE = 0x80;
const BUFFER_BYTES = 0x10000;

// Translation of the temporary buffer expansion at 0x21c6f..0x21cc7.
function __coverage_impl_fn_21c6f(runtime) {
  const { memory, cpu } = runtime;
  if (runtime.segments.esBase === null) throw new Error('ES base is unresolved');

  // 0x21c6f pushes DS:[8], DS:[0], then calls fn_1189.  fn_1189 itself
  // pushes EAX and calls fn_1198.  Retain all five temporary stack slots.
  push32(runtime, memory.read32(8));
  push32(runtime, memory.read32(0));
  cpu.set('eax', BUFFER_BYTES);
  push32(runtime, 0x20d83); // 0x21c83 normalized to the capture's CS:0 view.
  push32(runtime, BUFFER_BYTES); // fn_1189 PUSH EAX.
  push32(runtime, 0x28f); // fn_1198 return address, normalized from 0x118f.
  fn_1189(runtime);
  pop32(runtime); // fn_1198 RET
  cpu.set('esp', (cpu.get('esp') + 4) >>> 0); // fn_1189 ADD ESP,4
  pop32(runtime); // fn_1189 RET
  const base = cpu.get('eax');
  cpu.set('ebp', base);

  let source = memory.read32(0x2195c);
  let destination = base;
  let eax = cpu.get('eax');
  let ebx = SIDE;
  let carry = cpu.carry;
  for (let row = 0; row < SIDE; row += 1) {
    let ecx = SIDE;
    for (let column = 0; column < SIDE; column += 1) {
      const value = memory.read8(source);
      source = (source + 1) >>> 0;
      eax = ((eax & 0xffff0000) | value | (value << 8)) >>> 0;
      cpu.set('eax', eax);
      memory.write16((destination + 0x100) >>> 0, eax & 0xffff);
      runtime.writeEs16(destination, eax & 0xffff);
      destination = (destination + 2) >>> 0;
      ecx -= 1;
    }
    cpu.set('ecx', ecx);
    const beforeAdd = destination;
    destination = (destination + 0x100) >>> 0;
    carry = destination < beforeAdd;
    ebx -= 1;
  }

  let copySource = base;
  let copyDestination = memory.read32(0x2195c);
  for (let index = 0; index < BUFFER_BYTES; index += 1) {
    runtime.writeEs8(copyDestination, memory.read8(copySource));
    copySource = (copySource + 1) >>> 0;
    copyDestination = (copyDestination + 1) >>> 0;
  }

  memory.write32(0, pop32(runtime));
  memory.write32(8, pop32(runtime));
  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ecx', 0);
  cpu.set('ebp', base);
  cpu.set('esi', copySource);
  cpu.set('edi', copyDestination);
  cpu.setCarry(carry);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_21c6f = instrumentLift('0x21c6f', 'fn_21c6f', __coverage_impl_fn_21c6f);
