import { fn_11f5 } from './pic-mask.mjs';

// Translation of the bounded GS slot writer at 0x127f..0x1294.
function __coverage_impl_fn_127f(runtime) {
  const { cpu } = runtime;
  const savedEbx = cpu.get('ebx');
  let slot = savedEbx & 0xff;
  if (slot >= 8) slot = (slot + 0x60) & 0xff;
  runtime.writeGs32(0x20 + slot * 4, cpu.get('eax'));
  cpu.set('ebx', savedEbx);
}

// Translation of the bounded DMA/counter setup routine at 0x20a53..0x20ac9.
function __coverage_impl_fn_20a53(runtime) {
  const { memory, cpu } = runtime;

  let ebx = cpu.get('ebx');
  let bl = memory.read8(0x1fc06);
  if (bl === 2) bl = 9;
  ebx = ((ebx & 0xffffff00) | bl) >>> 0;
  cpu.set('ebx', ebx);

  cpu.set('eax', memory.read32(0x1fbca));
  fn_127f(runtime);

  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 1);
  fn_11f5(runtime);

  let dx = memory.read16(0x1fbd4);
  let al = 0x4c;
  runtime.out8(dx, al);
  dx = (dx & 0xff00) | (((dx & 0xff) + 2) & 0xff);
  al = 0;
  runtime.out8(dx, al);
  dx = (dx - 0x105) & 0xffff;
  al = 0x0b;
  runtime.out8(dx, al);

  dx = memory.read16(0x1e41c);
  al = 3;
  runtime.out8(dx, al);
  dx = (dx + 0x102) & 0xffff;
  for (let ecx = 0x0e; ecx !== 0; ecx -= 1) {
    al = ((ecx & 0xff) - 1) & 0xff;
    runtime.out8(dx, al);
    dx = (dx + 1) & 0xffff;
    al = 0;
    runtime.out8(dx, al);
    dx = (dx + 2) & 0xffff;
    al = 3;
    runtime.out8(dx, al);
    dx = (dx - 2) & 0xffff;
    al = 0x0d;
    runtime.out8(dx, al);
    dx = (dx + 2) & 0xffff;
    al = 3;
    runtime.out8(dx, al);
    dx = (dx - 3) & 0xffff;
  }

  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | al);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | dx);
  cpu.set('ecx', 0);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_127f = instrumentLift('0x127f', 'fn_127f', __coverage_impl_fn_127f);
export const fn_20a53 = instrumentLift('0x20a53', 'fn_20a53', __coverage_impl_fn_20a53);
