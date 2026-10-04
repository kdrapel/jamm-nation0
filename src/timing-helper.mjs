import { fn_2852b } from './vga-helpers.mjs';

// Lift of sub_216BE: samples the original timer counter and reloads it.
function __coverage_impl_fn_216be(runtime) {
  const { cpu } = runtime;
  let eax = cpu.get('eax');
  let edx = cpu.get('edx');
  cpu.interruptsEnabled = false;

  fn_2852b(runtime);
  eax = (eax & 0xffffff00) | 0x30;
  runtime.out8(0x43, eax & 0xff);
  eax &= 0xffffff00;
  runtime.out8(0x40, eax & 0xff);
  runtime.out8(0x40, eax & 0xff);

  fn_2852b(runtime);
  eax = (eax & 0xffffff00) | runtime.in8(0x40);
  eax = (eax & 0xffff00ff) | ((eax & 0xff) << 8);
  eax = (eax & 0xffffff00) | runtime.in8(0x40);
  eax = ((eax & 0xffff0000) | ((eax & 0xff) << 8) | ((eax >>> 8) & 0xff)) >>> 0;

  const sampled = eax & 0xffff;
  const reload = (-sampled) & 0xffff;
  cpu.setCarry(sampled !== 0);
  edx = (edx & 0xffff0000) | reload;
  eax = (eax & 0xffff0000) | 0x36;
  runtime.out8(0x43, eax & 0xff);
  eax = (eax & 0xffffff00) | (edx & 0xff);
  runtime.out8(0x40, eax & 0xff);
  eax = (eax & 0xffffff00) | ((edx >>> 8) & 0xff);
  runtime.out8(0x40, eax & 0xff);
  cpu.interruptsEnabled = true;
  cpu.set('eax', eax);
  cpu.set('edx', edx);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_216be = instrumentLift('0x216be', 'fn_216be', __coverage_impl_fn_216be);
