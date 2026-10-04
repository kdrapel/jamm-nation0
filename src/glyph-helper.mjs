const GPR = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];

function saveRegisters(cpu) {
  return Object.fromEntries(GPR.map(register => [register, cpu.get(register)]));
}

function restoreRegisters(cpu, saved) {
  for (const [register, value] of Object.entries(saved)) cpu.set(register, value);
}

// Translation of the 33-byte character lookup at 0x5ef31..0x5ef4a.
function __coverage_impl_fn_5ef31(runtime) {
  const { cpu, memory } = runtime;
  const al = cpu.get('eax') & 0xff;
  let ebp = 0;
  let ecx = 0x21;
  const esi = 0x5e010;

  while (ecx !== 0) {
    if (memory.read8(esi + ebp) === al) {
  cpu.set('esi', esi);
  cpu.set('ebp', ebp);
  cpu.set('ecx', ecx);
      cpu.setOrFlags32(ecx);
      return ebp;
    }
    ebp = (ebp + 1) >>> 0;
    ecx -= 1;
  }

  cpu.set('esi', esi);
  cpu.set('ebp', ebp);
  cpu.set('ecx', 0);
  cpu.setOrFlags32(0);
  return null;
}

// Translation of the word-mask glyph writer at 0x5fe47..0x5fe7f.
function __coverage_impl_fn_5fe47(runtime) {
  const { cpu, memory } = runtime;
  const saved = saveRegisters(cpu);
  const index = fn_5ef31(runtime);
  if (index === null) {
    // The original miss branch shares the neighboring glyph routine's POPA/RET.
    restoreRegisters(cpu, saved);
    return;
  }

  let esi = 0x18289 + index;
  let edi = saved.edi;
  let edx = (saved.edx & 0xffff0000) | 0x2020;
  for (let row = 0; row < 0x0b; row += 1) {
    let al = memory.read8(esi);
    esi = (esi + 1) >>> 0;
    for (let column = 0; column < 8; column += 1) {
      const carry = (al & 0x80) !== 0;
      al = (al << 1) & 0xff;
      if (carry) memory.write16(edi, memory.read16(edi) | (edx & 0xffff));
      edi = (edi + 2) >>> 0;
    }
    edi = (edi + 0x130) >>> 0;
    esi = (esi + 0x9f) >>> 0;
  }

  restoreRegisters(cpu, saved);
}

// Translation of the DS zero-terminated glyph string writer at 0x5fd80..0x5fda1.
function __coverage_impl_fn_5fd80(runtime) {
  const { cpu } = runtime;
  let ebp = cpu.get('edi');
  cpu.set('ebp', ebp);

  for (;;) {
    const esi = cpu.get('esi');
    const al = runtime.memory.read8(esi);
    cpu.set('esi', (esi + 1) >>> 0);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | al);

    if ((al & 0x80) !== 0) {
      ebp = (ebp + 0xdc0) >>> 0;
      cpu.set('ebp', ebp);
      cpu.set('edi', ebp);
      continue;
    }
    if (al === 0) return;

    fn_5fe47(runtime);
    cpu.set('edi', (cpu.get('edi') + 0x12) >>> 0);
  }
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_5ef31 = instrumentLift('0x5ef31', 'fn_5ef31', __coverage_impl_fn_5ef31);
export const fn_5fd80 = instrumentLift('0x5fd80', 'fn_5fd80', __coverage_impl_fn_5fd80);
export const fn_5fe47 = instrumentLift('0x5fe47', 'fn_5fe47', __coverage_impl_fn_5fe47);
