// Mechanical lift of the independently callable routine at 0x3e529.

function __coverage_impl_fn_3e529(runtime) {
  const { memory, cpu } = runtime;
  const savedX = memory.read32(0x3d6d0);
  const savedY = memory.read32(0x3d6d4);
  const ssBase = runtime.segments?.ssBase;
  if (ssBase === null || ssBase === undefined) throw new Error('fn_3e529 requires a resolved SS base for stack saves');
  const entryEsp = cpu.get('esp');
  memory.write32((ssBase + ((entryEsp - 4) >>> 0)) >>> 0, savedY);
  memory.write32((ssBase + ((entryEsp - 8) >>> 0)) >>> 0, savedX);
  let edi = memory.read32(0x3d702);
  let eax = 0;
  let ebx = 0;
  let esi = 0;
  let ebp = 0;
  memory.write32(0x3d6f8, 0x64);

  while (memory.read32(0x3d6f8) !== 0) {
    eax = memory.read32(0x2198c + ((memory.read32(0x3d6d0) & 0xfff) * 4));
    eax = (eax >> 4) & 0xfff;
    eax = memory.read32(0x2298c + eax * 4);
    ebx = (memory.read32(0x3d6f8) - 0x32) | 0;
    esi = Math.imul(eax, ebx) >>> 0;
    ebp = 0xffffff60;
    ebx = memory.read32(0x3d6d4);

    while (ebp !== 0) {
      ebx &= 0xfff;
      eax = memory.read32(0x2198c + ebx * 4);
      eax = (Math.imul(eax, ebp | 0) + esi) >>> 0;
      eax = (eax >> 16) >>> 0; // SAR EAX,16
      eax = (eax & 0xffffff00) | ((eax & 0xff) & 0xf0); // AND AL,0xf0
      ebx = (ebx - 0xf) >>> 0;
      const destination = (edi + (ebp | 0) + 0xa0) >>> 0;
      memory.write8(destination, eax & 0xff);
      ebp = (ebp + 1) >>> 0;
    }

    memory.write32(0x3d6d4, (memory.read32(0x3d6d4) + 0xd) >>> 0);
    memory.write32(0x3d6d0, (memory.read32(0x3d6d0) - 0x14) >>> 0);
    edi = (edi + 0xa0) >>> 0;
    memory.write32(0x3d6f8, (memory.read32(0x3d6f8) - 1) >>> 0);
  }

  // The original restores the saved coordinates through POP [global], leaving
  // the two pushed dwords observable below ESP.
  memory.write32(0x3d6d0, memory.read32((ssBase + ((entryEsp - 8) >>> 0)) >>> 0));
  memory.write32(0x3d6d4, memory.read32((ssBase + ((entryEsp - 4) >>> 0)) >>> 0));
  const ediBeforeLastAdd = (edi - 0xa0) >>> 0;
  cpu.carry = ediBeforeLastAdd + 0xa0 > 0xffffffff;
  cpu.setDecFlags32(1); // Final DEC [row count] changes 1 to 0; JNZ preserves flags.
  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ebp', ebp);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_3e529 = instrumentLift('0x3e529', 'fn_3e529', __coverage_impl_fn_3e529);
