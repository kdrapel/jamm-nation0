// Verified short helper at 0x372bc..0x372e0 called by dispatcher fn_3c124.
import { pop32, popad, push32, pushad } from './core/stack-effects.mjs';
function __coverage_impl_fn_372bc(runtime) {
  const { cpu, memory } = runtime;
  const esi = cpu.get('esi');
  const savedEdi = cpu.get('edi');
  const savedEcx = cpu.get('ecx');
  let edi = memory.read32(esi + 4);
  let ecx = Math.imul(memory.read32(esi + 0x0c), 3) >>> 0;
  if (ecx === 0) throw new RangeError('fn_372bc LOOP with ECX=0 requires 2^32 iterations');
  let bx = 0;
  let dx = 0;
  while (ecx !== 0) {
    bx = (memory.read16(edi) + dx) & 0xffff;
    memory.write16(edi, bx);
    dx = bx;
    edi = (edi + 2) >>> 0;
    ecx = (ecx - 1) >>> 0;
  }
  cpu.set('ebx', (cpu.get('ebx') & 0xffff0000) | bx);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | dx);
  cpu.set('edi', savedEdi);
  cpu.set('ecx', savedEcx);
}

// Raw range 0x372e1..0x3731e. The call at 0x372fc is kept opaque: previous
// analysis rejected assigning fn_37732 a square-root meaning without proof.
function __coverage_impl_fn_372e1(runtime, { call37732 = fn_37732 } = {}) {
  if (typeof call37732 !== 'function') throw new TypeError('fn_372e1 requires fn_37732');
  const { cpu, memory } = runtime;
  const edi = cpu.get('edi');
  const registers = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi']
    .map(name => [name, cpu.get(name)]);
  pushad(runtime); // 0x372e1
  const x = memory.read16(edi) << 16 >> 16;
  const y = memory.read16(edi + 2) << 16 >> 16;
  const z = memory.read16(edi + 4) << 16 >> 16;
  let eax = Math.imul(x, x) >>> 0;
  let ebx = eax;
  eax = Math.imul(y, y) >>> 0;
  ebx = (ebx + eax) >>> 0;
  eax = Math.imul(z, z) >>> 0;
  ebx = (ebx + eax) >>> 0;
  cpu.set('eax', ebx);
  cpu.set('ebx', ebx); // MOV EAX,EBX leaves the sum live in EBX for PUSHA.
  cpu.set('edx', 0); // Final one-operand IMUL squares a sign-extended word.
  push32(runtime, 0x36401); // CALL 0x37732 return, normalized from 0x37301.
  const normalized = call37732(runtime, 0x372fc);
  pop32(runtime);
  let divisor = typeof normalized === 'number' ? normalized | 0 : cpu.get('eax') | 0;
  for (let index = 0; index < 3; index += 1) {
    const value = memory.read16(edi + index * 2) << 16 >> 16;
    const numerator = (value << 6) | 0;
    if (divisor !== 0) {
      const quotient = Math.trunc(numerator / divisor);
      if (quotient < -0x80000000 || quotient > 0x7fffffff) throw new RangeError('fn_372e1 IDIV quotient overflow');
      memory.write16(edi + index * 2, quotient & 0xffff);
    } else {
      memory.write16(edi + index * 2, numerator & 0xffff);
    }
  }
  // The translated x86 loop ends with ADD EDI,2 after its third store;
  // LOOP and POPA preserve those final arithmetic flags.
  const addLeft = (edi + 4) >>> 0;
  const addResult = (addLeft + 2) >>> 0;
  const flagMask = 0x8d5; // CF, PF, AF, ZF, SF, OF
  let flags = cpu.eflags & ~flagMask;
  if (addResult < addLeft) flags |= 0x001;
  if ((addResult & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 0x004;
  if (((addLeft ^ 2 ^ addResult) & 0x10) !== 0) flags |= 0x010;
  if (addResult === 0) flags |= 0x040;
  if (addResult & 0x80000000) flags |= 0x080;
  if (((~(addLeft ^ 2) & (addLeft ^ addResult)) & 0x80000000) !== 0) flags |= 0x800;
  cpu.setEflags(flags >>> 0);
  popad(runtime);
}

// Raw range 0x37657..0x3771d. Builds the cross product of two DS-backed
// vectors, then delegates the evidence-uncertain fn_372e1 normalization path.
function __coverage_impl_fn_37657(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const call37732 = adapters.call37732 ?? fn_37732;
  if (typeof call37732 !== 'function') throw new TypeError('fn_37657 requires fn_37732');
  const savedEdi = cpu.get('edi');
  push32(runtime, savedEdi); // 0x37657 PUSH EDI
  const bxBase = memory.read32(0x36386);
  const cxBase = memory.read32(0x3638a);
  const bpBase = memory.read32(0x3638e);
  for (const [address, base] of [[0x36392,bxBase],[0x36396,cxBase],[0x3639a,bpBase],[0x3639e,bxBase],[0x363a2,cxBase],[0x363a6,bpBase]]) {
    memory.write32(address, (memory.read32(address) - base) >>> 0);
  }

  const products = [
    [memory.read32(0x36396), memory.read32(0x363a6), memory.read32(0x3639a), memory.read32(0x363a2), 0x363b6],
    [memory.read32(0x3639a), memory.read32(0x3639e), memory.read32(0x36392), memory.read32(0x363a6), 0x363b8],
    [memory.read32(0x36392), memory.read32(0x363a2), memory.read32(0x36396), memory.read32(0x3639e), 0x363ba],
  ];
  for (const [leftA, leftB, rightA, rightB, destination] of products) {
    memory.write16(destination, (Math.imul(leftA, leftB) - Math.imul(rightA, rightB)) & 0xffff);
  }

  // State entering fn_372e1 follows the final MUL/SUB pair and MOV EDI.
  const eax = memory.read32(0x36396);
  const ebx = memory.read32(0x3639e);
  const signed32 = value => BigInt.asIntN(32, BigInt(value >>> 0));
  const lastProduct = signed32(eax) * signed32(ebx);
  const previousProduct = signed32(memory.read32(0x36392)) * signed32(memory.read32(0x363a2));
  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ecx', Number((previousProduct - lastProduct) & 0xffffffffn));
  cpu.set('edx', Number(BigInt.asUintN(32, lastProduct >> 32n)));
  cpu.set('ebp', bpBase);
  cpu.set('edi', 0x363b6);
  push32(runtime, 0x36807); // CALL 0x372e1 return, normalized from 0x37707.
  fn_372e1(runtime, { call37732 });
  pop32(runtime);

  cpu.set('ebx', (cpu.get('ebx') & 0xffff0000) | memory.read16(0x363b6));
  cpu.set('ecx', (cpu.get('ecx') & 0xffff0000) | memory.read16(0x363b8));
  cpu.set('ebp', (cpu.get('ebp') & 0xffff0000) | memory.read16(0x363ba));
  cpu.set('edi', pop32(runtime)); // 0x3771c POP EDI
}
import { fn_37732 } from './table-index.mjs';

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_372bc = instrumentLift('0x372bc', 'fn_372bc', __coverage_impl_fn_372bc);
export const fn_372e1 = instrumentLift('0x372e1', 'fn_372e1', __coverage_impl_fn_372e1);
export const fn_37657 = instrumentLift('0x37657', 'fn_37657', __coverage_impl_fn_37657);
