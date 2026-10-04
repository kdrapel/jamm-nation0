import { fn_2852b } from './vga-helpers.mjs';

// Translation of the bounded palette transform at 0x5f517..0x5f53f.
function __coverage_impl_fn_5f517(runtime, { callRetrace = fn_2852b, onPass = null } = {}) {
  if (typeof callRetrace !== 'function') throw new TypeError('fn_5f517 callRetrace must be a function');
  for (;;) {
    callRetrace(runtime);
    const pass = resumeFn5f517At0x5f51c(runtime);
    onPass?.(runtime, pass);
    if (!pass.repeat) break;
  }
}

// Exact post-retrace palette pass, 0x5f51c..0x5f53d. No hardware input.
export function resumeFn5f517At0x5f51c(runtime) {
  const { cpu, memory } = runtime;
  const bl = cpu.get('ebx') & 255;
  const ch = (cpu.get('ecx') >>> 8) & 255;
  cpu.set('esi', cpu.get('edi'));
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x3c8);
  cpu.set('eax', cpu.get('eax') & 0xffffff00);
  runtime.out8(0x3c8, 0);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x3c9);
  cpu.set('ebp', 384);
  for (let i = 0; i < 384; i++) {
    const product = ((memory.read8(cpu.get('esi')) << 2) & 255) * bl;
    const al = (product >>> 8) >>> 2;
    cpu.set('esi', cpu.get('esi') + 1);
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | ((product & 255) << 8) | al);
    runtime.out8(0x3c9, al);
    cpu.setDecFlags32(384 - i);
    cpu.set('ebp', 383 - i);
  }
  const next = (bl + ch) & 255;
  cpu.setAddFlags8(bl, ch);
  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | next);
  runtime.translatedPc = next ? 0x5e617 : 0x5e63f;
  return { repeat: next !== 0, multiplier: bl, nextMultiplier: next };
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_5f517 = instrumentLift('0x5f517', 'fn_5f517', __coverage_impl_fn_5f517);
