// Translations of the two bounded helpers called directly by fn_38351.

// Raw range 0x3731f..0x3734e. The routine only clears the named fields.
function __coverage_impl_fn_3731f(runtime) {
  const { memory } = runtime;
  memory.write32(0x361fa, 0);
  memory.write16(0x361fe, 0);
  memory.write32(0x36200, 0);
  memory.write16(0x36204, 0);
  memory.write16(0x361f4, 0);
}

// Raw range 0x38257..0x382f9. It builds two ES-side coordinate tables:
// 3,000 words from the 5x5x5x8 triple stream, then 4,500 words from the
// 125-row, 36-word stream. ESI restarts at 0x36176 for every inner row. Keep
// each 16-bit LODS/ADD/STOS operation explicit
// because the arithmetic wraps at AX while preserving EAX's high word.
function __coverage_impl_fn_38257(runtime) {
  const { memory, cpu } = runtime;
  let eax = cpu.get('eax');
  let edi = 0x39940;
  let ebx = 0xfffffe48;
  let edx = 0xfffffe48;
  let ebp = 0xfffffe48;
  let esi = 0x36176;

  for (let outer = 0; outer < 5; outer += 1) {
    memory.write32(0x3734b, 5);
    edx = 0xfffffe48;
    for (let middle = 0; middle < 5; middle += 1) {
      memory.write32(0x3734f, 5);
      ebp = 0xfffffe48;
      for (let inner = 0; inner < 5; inner += 1) {
        memory.write32(0x37353, 5);
        esi = 0x36176;
        for (let index = 0; index < 8; index += 1) {
          for (const adjustment of [ebp, edx, ebx]) {
            eax = ((eax & 0xffff0000) | memory.read16(esi)) >>> 0;
            esi = (esi + 2) >>> 0;
            eax = ((eax & 0xffff0000) | (((eax & 0xffff) + adjustment) & 0xffff)) >>> 0;
            runtime.writeEs16(edi, eax & 0xffff);
            edi = (edi + 2) >>> 0;
          }
        }
        ebp = (ebp + 0xdc) >>> 0;
        memory.write32(0x37353, 4 - inner);
      }
      edx = (edx + 0xdc) >>> 0;
      memory.write32(0x3734f, 4 - middle);
    }
    ebx = (ebx + 0xdc) >>> 0;
    memory.write32(0x3734b, 4 - outer);
  }

  edi = 0x37618;
  ebp = 0;
  for (let row = 0; row < 125; row += 1) {
    // The original MOV ESI,0x361a6 is inside the row loop, so each row
    // reuses the same 36 source words while increasing the AX offset.
    esi = 0x361a6;
    for (let index = 0; index < 36; index += 1) {
      eax = ((eax & 0xffff0000) | memory.read16(esi)) >>> 0;
      esi = (esi + 2) >>> 0;
      eax = ((eax & 0xffff0000) | (((eax & 0xffff) + ebp) & 0xffff)) >>> 0;
      runtime.writeEs16(edi, eax & 0xffff);
      edi = (edi + 2) >>> 0;
    }
    ebp = (ebp + 8) >>> 0;
  }

  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ecx', 0);
  cpu.set('edx', edx);
  cpu.set('ebp', ebp);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.setCarry(false); // final CMP EBP,0x3e8 compares equal.
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_3731f = instrumentLift('0x3731f', 'fn_3731f', __coverage_impl_fn_3731f);
export const fn_38257 = instrumentLift('0x38257', 'fn_38257', __coverage_impl_fn_38257);
