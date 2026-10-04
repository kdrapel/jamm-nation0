import { fn_64644 } from './fn-64644.mjs';
import { pop16, pop32, push16, push32 } from './core/stack-effects.mjs';

const u32 = value => value >>> 0;

// 0x645bd..0x64639. Assign a per-row color, draw each adjacent point pair
// through fn_64644, and advance over the generated 0x7a-byte records.
function __coverage_impl_fn_645bd(runtime) {
  const { cpu, memory } = runtime;
  runtime.diagnosticHooks?.fn645bdEntry?.(runtime);
  const initialEax = cpu.get('eax');
  const initialEbx = cpu.get('ebx');
  const initialEcx = cpu.get('ecx');
  const initialEdx = cpu.get('edx');
  let esi = 0x60f80;
  let edi = 0;
  let eax = initialEax;
  let ebx = initialEbx;
  let ecx = initialEcx;
  let edx = initialEdx;

  while (esi < 0x6333e) {
    memory.write8(0x63c10, 0x15);
    const depth = memory.read16(esi + 0x3c);
    const shade = (depth >>> 5) & 0xff;
    const rawColor = 0x15 - shade;
    const color = rawColor < 0 ? 0 : rawColor & 0xff;
    memory.write8(0x63c10, color);
    if (memory.read32(0x21958) >= 0x442) memory.write8(0x63c10, 0);

    edi = 0xffffffc8;
    let x0 = memory.read16(esi + 0x3e);
    let y0 = memory.read16(esi + 0x40);
    do {
      let x1 = memory.read16((esi + (edi | 0) + 0x7a) >>> 0);
      let y1 = memory.read16((esi + (edi | 0) + 0x7c) >>> 0);
      if (runtime.diagnosticLimits?.fn64644ClipPasses !== undefined) {
        runtime.rasterCaller = { record: `0x${esi.toString(16)}`, edgeOffset: edi | 0, color: memory.read8(0x63c10) };
      }
      // 0x6460a..0x64614: PUSH EDI/ESI, four 16-bit endpoint words, CALL.
      // The line helper's frame starts at the return slot and leaves EBP there.
      push32(runtime, edi);
      push32(runtime, esi);
      push16(runtime, y1);
      push16(runtime, x1);
      push16(runtime, y0);
      push16(runtime, x0);
      push32(runtime, 0x63719); // 0x64619 in normalized CS:0 coordinates.
      fn_64644(runtime, x0, y0, x1, y1);
      pop32(runtime); // RET from fn_64644
      pop16(runtime); // clipped x0 argument
      pop16(runtime); // clipped y0 argument
      x1 = pop16(runtime); // CX receives clipped x1
      y1 = pop16(runtime); // DX receives clipped y1
      pop32(runtime);
      pop32(runtime);
      // fn_64644 assigns EBP=ESP at entry and does not restore EBP. The
      // renderer's two saved dwords and four pushed words plus CALL place it
      // twenty bytes below fn_645bd's entry stack pointer.
      cpu.set('ebp', u32(cpu.get('esp') - 20));
      eax = (eax & 0xffff0000) | x1;
      ebx = (ebx & 0xffff0000) | y1;
      ecx = (initialEcx & 0xffff0000) | x1;
      edx = (edx & 0xffff0000) | y1;
      x0 = x1;
      y0 = y1;
      edi = (edi + 4) >>> 0;
    } while (edi !== 0);

    esi = (esi + 0x7a) >>> 0;
  }

  cpu.set('eax', eax >>> 0);
  cpu.set('ebx', ebx >>> 0);
  cpu.set('ecx', ecx);
  cpu.set('edx', edx >>> 0);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  // The final CMP ESI,0x6333e follows the record loop at 0x64631.
  cpu.setCmpFlags32(esi, 0x6333e);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_645bd = instrumentLift('0x645bd', 'fn_645bd', __coverage_impl_fn_645bd);
