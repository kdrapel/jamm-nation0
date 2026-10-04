import { fn_5ef31 } from './glyph-helper.mjs';

const GPR = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
const MASK32 = 0xffffffff;

function saveRegisters(cpu) {
  return Object.fromEntries(GPR.map(register => [register, cpu.get(register)]));
}

function restoreRegisters(cpu, saved) {
  for (const [register, value] of Object.entries(saved)) cpu.set(register, value);
}

// Translation of 0x5ef4b..0x5ef7e. A lookup miss follows the original shared
// POPA/RET at 0x5ef7d and therefore emits no glyph.
function __coverage_impl_fn_5ef4b(runtime) {
  const { cpu, memory } = runtime;
  const saved = saveRegisters(cpu);
  const index = fn_5ef31(runtime);
  if (index === null) {
    restoreRegisters(cpu, saved);
    cpu.setCarry(false); // OR ECX,ECX on the original miss branch.
    return;
  }

  let esi = (0x18289 + index) >>> 0;
  let edi = saved.edi;
  const dl = 4;
  for (let row = 0; row < 0x0b; row += 1) {
    let al = memory.read8(esi);
    esi = (esi + 1) >>> 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const carry = (al & 0x80) !== 0;
      al = (al << 1) & 0xff;
      if (carry) memory.write8(edi, memory.read8(edi) | dl);
      edi = (edi + 1) >>> 0;
    }
    edi = (edi + 0x138) >>> 0;
    esi = (esi + 0x9f) >>> 0;
  }

  restoreRegisters(cpu, saved);
  // The final ADD ESI,0x9f sets CF; the fixed lookup-table range cannot wrap.
  cpu.setCarry(false);
}

// Translation of 0x5ef7f..0x5efb6. Each set glyph bit is ORed into two
// vertically separated DS rows, with the caller-provided DL mask.
function __coverage_impl_fn_5ef7f(runtime) {
  const { cpu, memory } = runtime;
  const saved = saveRegisters(cpu);
  const index = fn_5ef31(runtime);
  if (index === null) {
    restoreRegisters(cpu, saved);
    cpu.setCarry(false); // The lookup miss takes the shared OR/POPA/RET path.
    return;
  }

  let esi = (0x18289 + index) >>> 0;
  let edi = saved.edi;
  const dl = saved.edx & 0xff;
  for (let row = 0; row < 0x0b; row += 1) {
    let al = memory.read8(esi);
    esi = (esi + 1) >>> 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const carry = (al & 0x80) !== 0;
      al = (al << 1) & 0xff;
      if (carry) {
        memory.write8(edi, memory.read8(edi) | dl);
        memory.write8((edi + 0x140) >>> 0, memory.read8((edi + 0x140) >>> 0) | dl);
      }
      edi = (edi + 1) >>> 0;
    }
    esi = (esi + 0x9f) >>> 0;
    edi = (edi + 0x278) >>> 0;
  }

  restoreRegisters(cpu, saved);
  // Final ADD EDI,0x278 determines carry; DEC EBP and POPA preserve it.
  const ediBeforeLastStride = (saved.edi + (0x0b * 0x280) - 0x278) >>> 0;
  cpu.setCarry(ediBeforeLastStride + 0x278 > MASK32);
}

// Translation of 0x5f21b..0x5f23c: draw 4-mask glyphs, with signed bytes
// advancing the output origin by 0xb40 and zero terminating the DS string.
function __coverage_impl_fn_5f21b(runtime) {
  const { cpu, memory } = runtime;
  let ebp = cpu.get('edi');
  let esi = cpu.get('esi');

  for (;;) {
    const al = memory.read8(esi);
    esi = (esi + 1) >>> 0;
    cpu.set('esi', esi);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | al);
    if (al & 0x80) {
      ebp = (ebp + 0x0b40) >>> 0;
      cpu.set('ebp', ebp);
      cpu.set('edi', ebp);
      continue;
    }
    if (al === 0) {
      cpu.setCarry(false); // TEST AL,AL at the terminator.
      return;
    }

    fn_5ef4b(runtime);
    cpu.set('edi', (cpu.get('edi') + 8) >>> 0);
  }
}

// Translation of 0x5f23d..0x5f260: draw paired-row 8-mask glyphs, with
// signed bytes advancing the output origin by 0x1cc0.
function __coverage_impl_fn_5f23d(runtime) {
  const { cpu, memory } = runtime;
  let ebp = cpu.get('edi');
  let esi = cpu.get('esi');

  for (;;) {
    const al = memory.read8(esi);
    esi = (esi + 1) >>> 0;
    cpu.set('esi', esi);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | al);
    if (al & 0x80) {
      ebp = (ebp + 0x1cc0) >>> 0;
      cpu.set('ebp', ebp);
      cpu.set('edi', ebp);
      continue;
    }
    if (al === 0) {
      cpu.setCarry(false); // TEST AL,AL at the terminator.
      return;
    }

    cpu.set('edx', (cpu.get('edx') & 0xffffff00) | 0x08);
    fn_5ef7f(runtime);
    cpu.set('edi', (cpu.get('edi') + 8) >>> 0);
  }
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_5ef4b = instrumentLift('0x5ef4b', 'fn_5ef4b', __coverage_impl_fn_5ef4b);
export const fn_5ef7f = instrumentLift('0x5ef7f', 'fn_5ef7f', __coverage_impl_fn_5ef7f);
export const fn_5f21b = instrumentLift('0x5f21b', 'fn_5f21b', __coverage_impl_fn_5f21b);
export const fn_5f23d = instrumentLift('0x5f23d', 'fn_5f23d', __coverage_impl_fn_5f23d);
