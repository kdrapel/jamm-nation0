import { fn_28510, fn_2852b, fn_28574 } from './vga-helpers.mjs';
import { fn_5f517 } from './palette-helper.mjs';

// 0x5f5e2..0x5f650. Extender/BIOS and hardware effects remain external to the
// lifted instructions; the callback can model INT 33h's register effects.
function __coverage_impl_fn_5f5e2(runtime, { callInterrupt } = {}) {
  const { cpu, memory } = runtime;
  memory.write16(0xe0, 0x13);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x10);
  if (typeof callInterrupt !== 'function') {
    throw new Error('unresolved INT 0x33 call at 0x5f5ec');
  }
  callInterrupt(0x33, runtime);

  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0100);
  runtime.out16(cpu.get('edx') & 0xffff, cpu.get('eax'));
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03c2);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0xe3);
  runtime.out8(cpu.get('edx'), cpu.get('eax'));
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03c4);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0300);
  runtime.out16(cpu.get('edx'), cpu.get('eax'));

  cpu.set('ecx', 10);
  cpu.set('esi', 0x5e751);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03c4);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0604);
  runtime.out16(cpu.get('edx'), cpu.get('eax'));
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03d4);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x11);
  runtime.out8(cpu.get('edx'), 0x11);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03d5);
  const al = runtime.in8(cpu.get('edx')) & 0x7f;
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | al);
  runtime.out8(cpu.get('edx'), al);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03d4);
  cpu.setEflags(cpu.eflags & ~0x400); // CLD at original 0x5f62c.
  do {
    const esi = cpu.get('esi');
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | memory.read16(esi));
    cpu.set('esi', (esi + 2) >>> 0);
    runtime.out16(cpu.get('edx'), cpu.get('eax'));
    cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
  } while (cpu.get('ecx') !== 0);

  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03c4);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0f02);
  runtime.out16(cpu.get('edx'), cpu.get('eax'));

  let edi = (0xa0000 - memory.read32(0x18)) >>> 0;
  cpu.set('edi', edi);
  cpu.set('eax', 0);
  cpu.set('ecx', 0x3e80);
  for (let count = 0; count < 0x3e80; count += 1) {
    runtime.writeEs32(edi, 0);
    edi = (edi + 4) >>> 0;
  }
  cpu.set('edi', edi);
  cpu.set('ecx', 0);
}

// 0x5f540..0x5f5e1. This routine configures the VGA planes, transfers the
// interleaved image data, and applies two palette ramps.
function __coverage_impl_fn_5f540(runtime, { callInterrupt, hardwareCheckpoint, withRetraceDrivenPhase, presentationReady } = {}) {
  const { cpu, memory } = runtime;
  fn_5f5e2(runtime, { callInterrupt });
  const runRetraceDriven = withRetraceDrivenPhase ?? ((_host, body) => body());
  return runRetraceDriven(runtime, () => {
  fn_2852b(runtime);
  fn_28574(runtime);

  let ebp = 0;
  do {
    cpu.set('ecx', ebp);
    cpu.set('eax', 0x0102);
    const ah = (1 << (cpu.get('ecx') & 0xff)) & 0xff;
    cpu.set('eax', (cpu.get('eax') & 0xffff00ff) | (ah << 8));
    cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03c4);
    runtime.out16(cpu.get('edx'), cpu.get('eax'));

    let edi = (0xa0780 - memory.read32(0x18)) >>> 0;
    let esi = (0x8827 + ebp) >>> 0;
    cpu.set('edi', edi);
    cpu.set('esi', esi);
    cpu.set('ebx', 0x3e80);
    for (let count = 0; count < 0x3e80; count += 1) {
      runtime.writeEs8(edi, memory.read8(esi));
      edi = (edi + 1) >>> 0;
      // MOVSB increments ESI first; the following ADD ESI,3 makes a 4-byte stride.
      esi = (esi + 4) >>> 0;
    }
    cpu.set('edi', edi);
    cpu.set('esi', esi);
    cpu.set('ebx', 0);
    ebp += 1;
    cpu.set('ebp', ebp);
  } while (ebp < 4);

  presentationReady?.(runtime);

  cpu.set('ecx', 0x1e);
  do {
    fn_2852b(runtime);
    cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
  } while (cpu.get('ecx') !== 0);

  cpu.set('edi', 0x8527);
  cpu.set('ecx', (cpu.get('ecx') & 0xffff00ff) | 0x0200);
  cpu.set('ebx', cpu.get('ebx') & 0xffffff00);
  fn_5f517(runtime);
  fn_2852b(runtime);

  cpu.set('esi', 0x8527);
  cpu.set('ecx', 0x100);
  cpu.set('eax', cpu.get('eax') & 0xffffff00);
  fn_28510(runtime);

  cpu.set('ecx', 0xf0);
  do {
    fn_2852b(runtime);
    cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
  } while (cpu.get('ecx') !== 0);
  while (memory.read16(0x1e432) < 8) {
    if (typeof hardwareCheckpoint !== 'function') {
      throw new Error('fn_5f540 requires IRQ/audio service while original music-order wait is active at 0x5f5be');
    }
    // Original 0x5f5be compares the tracker order and branches back while it
    // is below eight. Timer/music IRQs update the same global asynchronously;
    // resume at the original compare after servicing those hardware events.
    hardwareCheckpoint(runtime, 0x5f5be);
  }

  cpu.set('edi', 0x8527);
  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | 0xfe);
  cpu.set('ecx', (cpu.get('ecx') & 0xffff00ff) | 0xfe00);
  fn_5f517(runtime);
  memory.write16(0xe0, 0x13);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x10);
  if (typeof callInterrupt !== 'function') throw new Error('unresolved INT 0x33 call at 0x5f5df');
  callInterrupt(0x33, runtime);
  });
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_5f540 = instrumentLift('0x5f540', 'fn_5f540', __coverage_impl_fn_5f540);
export const fn_5f5e2 = instrumentLift('0x5f5e2', 'fn_5f5e2', __coverage_impl_fn_5f5e2);
