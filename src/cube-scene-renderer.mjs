function required(adapters, name) {
  if (typeof adapters?.[name] !== 'function') {
    throw new TypeError(`fn_6167a requires the ${name} adapter`);
  }
  return adapters[name];
}

const u32 = value => value >>> 0;
const s32 = value => value | 0;
const s16 = value => (value << 16) >> 16;

function setLowWord(cpu, register, value) {
  cpu.set(register, (cpu.get(register) & 0xffff0000) | (value & 0xffff));
}

function shrd32(destination, source, amount) {
  return ((destination >>> amount) | (source << (32 - amount))) >>> 0;
}

function signedImulShift16(left, right) {
  const lowProduct = BigInt.asIntN(32, BigInt(s32(left)) * BigInt(s32(right)));
  return {
    value: Number(BigInt.asIntN(32, lowProduct) >> 16n) >>> 0,
    source: Number(BigInt.asUintN(32, lowProduct)),
  };
}

// sub_61611 preserves EBX, but deliberately leaves EDX=1000 and returns the
// two signed table products in EAX/ECX.
function __coverage_impl_fn_61611(runtime) {
  const { cpu, memory } = runtime;
  const savedEbx = cpu.get('ebx');
  const ssBase = runtime.segments?.ssBase;
  if (ssBase === null || ssBase === undefined) throw new Error('fn_61611 requires a resolved SS base for PUSH EBX scratch');
  memory.write32((ssBase + ((cpu.get('esp') - 4) >>> 0)) >>> 0, savedEbx);
  cpu.set('edx', 1000);
  let index = cpu.get('ebx') & 0xfff;
  const eaxResult = signedImulShift16(memory.read32(0x2198c + index * 4), 1000);
  cpu.set('eax', eaxResult.value);
  index = cpu.get('ebx') & 0xfff;
  const ecxResult = signedImulShift16(memory.read32(0x2298c + index * 4), 1000);
  cpu.set('ecx', ecxResult.value);
  cpu.setSarFlags32(ecxResult.source, ecxResult.value, 16);
  cpu.set('ebx', savedEbx);
}

function signedImulPair(cpu, right) {
  const product = BigInt.asIntN(64, BigInt(s32(cpu.get('eax'))) * BigInt(s32(right)));
  cpu.set('eax', Number(BigInt.asIntN(32, product)));
  cpu.set('edx', Number(BigInt.asIntN(32, product >> 32n)));
}

function translateFsRead(cpu, readFs8, targetRegister) {
  let ebx = cpu.get('ebx');
  const ch = (cpu.get('ecx') >>> 8) & 0xff;
  ebx = (ebx & 0xffffff00) | ch; // MOV BL,CH
  // SHLD EBX,ECX,8: (EBX << 8) | (ECX >> 24), modulo 32 bits.
  ebx = ((ebx << 8) | (cpu.get('ecx') >>> 24)) >>> 0;
  cpu.set('ebx', ebx);
  cpu.set('ecx', u32(cpu.get('ecx') - cpu.get('esi')));
  const byte = readFs8((cpu.get('ebx') & 0xffff)) & 0xff;
  if (targetRegister === 'ah') {
    cpu.set('eax', (cpu.get('eax') & 0xffff00ff) | (byte << 8));
  } else {
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | byte);
  }
}

function drawTwentyPixels(runtime, readFs8, { blend, source }) {
  const { cpu, memory } = runtime;
  cpu.set('ebp', 0x4c);
  if (blend) cpu.set('edx', source);
  for (let slot = 0; slot < 20; slot += 1) {
    translateFsRead(cpu, readFs8, 'ah');
    translateFsRead(cpu, readFs8, 'al');
    cpu.set('eax', u32(cpu.get('eax') << 16));
    translateFsRead(cpu, readFs8, 'ah');
    translateFsRead(cpu, readFs8, 'al');

    let pixel = cpu.get('eax');
    if (blend) {
      pixel = u32(pixel | memory.read32(cpu.get('edx')));
      cpu.set('edx', u32(cpu.get('edx') - 4));
    }
    memory.write32(u32(cpu.get('edi') + cpu.get('ebp')), pixel);
    cpu.set('ebp', u32(cpu.get('ebp') - 4));
  }
}

function drawTransformedRow(runtime, adapters, { blend }) {
  const { cpu, memory } = runtime;
  const originalEcx = cpu.get('ecx');
  const originalEdi = cpu.get('edi');
  const originalEsi = cpu.get('esi');
  const outPort16 = adapters.outPort16;
  const duplicatePattern = ((memory.read16(0x60778) << 16) | memory.read16(0x60778)) >>> 0;

  cpu.set('esi', u32(cpu.get('esi') * 2));
  const ch = (((cpu.get('ecx') >>> 8) & 0xff) - memory.read8(0x60ed8)) & 0xff;
  cpu.set('ecx', (cpu.get('ecx') & 0xffff00ff) | (ch << 8));
  cpu.set('ecx', u32(cpu.get('ecx') - 0x80008000));

  setLowWord(cpu, 'edx', 0x03c4);
  setLowWord(cpu, 'eax', 0x0302);
  outPort16(runtime, 0x3c4, 0x0302);
  if (!blend) cpu.set('edx', duplicatePattern);
  drawTwentyPixels(runtime, offset => adapters.readFs8(runtime, offset), {
    blend,
    source: u32(memory.read32(0x60ebd) + Math.imul(u32(memory.read32(0x60744) - 0x74), 0x140) + 0x4c),
  });

  // The callee-saved registers are restored by POP ESI/EDI/ECX. EBX, EBP,
  // EAX and EDX remain caller-visible clobbers, as in the original.
  cpu.set('esi', originalEsi);
  cpu.set('edi', originalEdi);
  cpu.set('ecx', originalEcx);
  setLowWord(cpu, 'edx', 0x03c4);
  setLowWord(cpu, 'eax', 0x0c02);
  outPort16(runtime, 0x3c4, 0x0c02);
  if (!blend) cpu.set('edx', duplicatePattern);
  cpu.set('ecx', u32(cpu.get('ecx') + cpu.get('esi')));
  cpu.set('esi', u32(cpu.get('esi') * 2));
  const secondCh = (((cpu.get('ecx') >>> 8) & 0xff) - memory.read8(0x60ed8)) & 0xff;
  cpu.set('ecx', (cpu.get('ecx') & 0xffff00ff) | (secondCh << 8));
  cpu.set('ecx', u32(cpu.get('ecx') - 0x80008000));
  setLowWord(cpu, 'edx', 0x03c4);
  drawTwentyPixels(runtime, offset => adapters.readFs8(runtime, offset), {
    blend,
    source: u32(memory.read32(0x60ebd) + Math.imul(u32(memory.read32(0x60744) - 0x74), 0x140) + 0x4d),
  });
}

// Mechanical transcription of 0x6167a..0x617b3 and its two row writers at
// 0x617b4..0x6189b and 0x6189c..0x619a0. FS selector/base interpretation is
// delegated to loadFsSelector/readFs8; DS stores use the runtime's linear
// memory, while the source row in the blend path is also DS-relative.
function __coverage_impl_fn_6167a(runtime, adapters = {}) {
  const loadFsSelector = required(adapters, 'loadFsSelector');
  const readFs8 = required(adapters, 'readFs8');
  const outPort16 = required(adapters, 'outPort16');
  const { cpu, memory } = runtime;

  cpu.set('eax', memory.read32(0x60764));
  cpu.set('eax', u32(cpu.get('eax') - memory.read32(0x60760)));
  cpu.set('eax', u32(cpu.get('eax') << 16));
  cpu.set('ebx', 0xc8);
  cpu.set('edx', cpu.get('eax') & 0x80000000 ? 0xffffffff : 0);
  const numerator = BigInt.asIntN(64, (BigInt(s32(cpu.get('edx'))) << 32n) | BigInt(cpu.get('eax')));
  const quotient = numerator / 200n;
  if (quotient < -0x80000000n || quotient > 0x7fffffffn) {
    throw new RangeError('fn_6167a signed quotient overflow at 0x6168e');
  }
  cpu.set('eax', Number(BigInt.asIntN(32, quotient)));
  memory.write32(0x6076c, cpu.get('eax'));

  cpu.set('eax', u32(memory.read32(0x60760) << 16));
  memory.write32(0x60768, cpu.get('eax'));
  loadFsSelector(runtime, memory.read16(0x60ed2));
  memory.write32(0x60744, 0);

  cpu.set('ebx', memory.read32(0x60758));
  fn_61611(runtime);
  memory.write32(0x60748, cpu.get('eax'));
  memory.write32(0x60750, cpu.get('ecx'));

  let edi = u32(0xa0320 - memory.read32(0x18));
  edi = u32(edi + memory.read32(0x60ecd));
  cpu.set('edi', edi);
  for (let row = 0; row < 0xb4; row += 1) {
    // The original back edge returns to 0x617d8, so the scale, texture
    // duplicate, DIV and both IMUL/SHRD coefficients are recalculated for
    // every scanline after 0x60768 advances at the prior row's tail.
    const scale = memory.read16(0x6076a);
    let eax = u32(((scale >>> 5) + 2) << 4);
    const al = eax & 0xff;
    memory.write16(0x60778, (al << 8) | al);
    cpu.set('eax', (eax & 0xffff00ff) | (al << 8));
    cpu.set('ebx', s16(scale) >>> 0);

    // 0x61802 clears EDX, so DIV EBX treats both EDX:EAX and the sign-extended
    // MOVSX divisor as unsigned dwords.
    const dividend = u32(0x18000 + memory.read32(0x60ec9));
    const divisor = cpu.get('ebx');
    if (divisor === 0) throw new RangeError('fn_6167a unsigned division by zero at 0x61804');
    const rowStep = Number(BigInt(dividend) / BigInt(divisor));
    cpu.set('eax', rowStep);
    cpu.set('edx', Number(BigInt(dividend) % BigInt(divisor)));
    cpu.set('ebp', cpu.get('eax'));
    cpu.set('eax', cpu.get('ebp'));
    signedImulPair(cpu, memory.read32(0x60750));
    cpu.set('eax', shrd32(cpu.get('eax'), cpu.get('edx'), 10));
    memory.write32(0x60754, cpu.get('eax'));
    cpu.set('eax', cpu.get('ebp'));
    signedImulPair(cpu, memory.read32(0x60748));
    cpu.set('eax', shrd32(cpu.get('eax'), cpu.get('edx'), 10));
    memory.write32(0x6074c, cpu.get('eax'));

    const index = memory.read32(0x60744);
    cpu.set('eax', u32(index - 0x64));
    signedImulPair(cpu, memory.read32(0x6074c));
    cpu.set('ebp', cpu.get('eax'));
    cpu.set('eax', 0x50);
    signedImulPair(cpu, memory.read32(0x60754));
    cpu.set('eax', u32(cpu.get('eax') + cpu.get('ebp')));
    cpu.set('ecx', u32(cpu.get('eax') << 16));

    cpu.set('eax', u32(index - 0x64));
    signedImulPair(cpu, memory.read32(0x60754));
    cpu.set('ebp', cpu.get('eax'));
    cpu.set('eax', 0x50);
    signedImulPair(cpu, memory.read32(0x6074c));
    cpu.set('eax', u32(cpu.get('eax') - cpu.get('ebp')));
    setLowWord(cpu, 'ecx', cpu.get('eax'));

    cpu.set('esi', u32(memory.read32(0x60754) << 16));
    setLowWord(cpu, 'esi', memory.read32(0x6074c));
    cpu.setCarry(index < 0x74); // CMP [0x60744],0x74 immediately precedes the raw branch.
    adapters.rowCheckpoint?.(runtime, index);
    if (index < 0x74) drawTransformedRow(runtime, { outPort16, readFs8 }, { blend: false });
    else drawTransformedRow(runtime, { outPort16, readFs8 }, { blend: true });

    cpu.set('edi', u32(cpu.get('edi') + 0x50));
    cpu.set('eax', memory.read32(0x6076c));
    memory.write32(0x60768, u32(memory.read32(0x60768) + cpu.get('eax')));
    memory.write32(0x60744, u32(index + 1));
    cpu.setCarry(row + 1 < 0xb4); // CMP counter,0xb4 at the loop tail.
  }

}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_61611 = instrumentLift('0x61611', 'fn_61611', __coverage_impl_fn_61611);
export const fn_6167a = instrumentLift('0x6167a', 'fn_6167a', __coverage_impl_fn_6167a);
