const PIXEL_COUNT = 0x10000;
const DIVISOR = 10;
const MASK16 = 0xffff;
const SAMPLE_OFFSETS = [0, 0, -1, 1, -0x100, 0x100, -0x101, -0xff, 0xff, 0x101];

// Translation of the stencil loop at 0x2165b..0x216b9.
// Source lookups use FS with 16-bit SI plus the encoded displacement. The
// unprefixed MOV [EDI],AL writes through DS, represented by Memory's base.
function __coverage_impl_fn_2165b(runtime, { fsBase } = {}) {
  if (!Number.isInteger(fsBase) || fsBase < 0) {
    throw new Error('FS base is unresolved');
  }

  const { memory, cpu } = runtime;
  const originalEdi = cpu.get('edi');
  let si = 0;
  let eax = 0;
  let ebx = 0;
  let edx = 0;
  let ebp = DIVISOR;

  for (let pixel = 0; pixel < PIXEL_COUNT; pixel += 1) {
    // 0x216b6 JNE branches to 0x2165e; XOR EAX/EBX and the XOR EDX at
    // 0x216ad execute for every output byte. DIV receives a zero high half;
    // retaining its previous remainder in EDX turns this average into a
    // feedback chain and corrupts the terrain height field.
    eax = 0;
    ebx = 0;
    edx = 0;

    // Center is accumulated twice, followed by the eight adjacent pixels.
    for (const displacement of SAMPLE_OFFSETS) {
      const offset = (si + displacement) & MASK16;
      ebx = memory.read8(fsBase + offset);
      eax = (eax + ebx) >>> 0;
    }

    const dividend = edx * 0x100000000 + eax;
    eax = Math.floor(dividend / ebp) >>> 0;
    edx = dividend % ebp;
    memory.write8((originalEdi + pixel) >>> 0, eax & 0xff);
    si = (si + 1) & MASK16; // 16-bit INC SI; its wrap ends the loop.
  }

  cpu.set('esi', 0);
  cpu.set('edi', originalEdi); // PUSH/POP EDI
  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('edx', edx);
  cpu.set('ebp', ebp);
  cpu.setCarry(false); // final ADD did not overflow; INC preserves CF.
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_2165b = instrumentLift('0x2165b', 'fn_2165b', __coverage_impl_fn_2165b);
