const TRANSFORM_IMUL_OPERANDS = Object.freeze({
  // Original runtime addresses correspond to static executable offsets
  // 0x6454c, 0x64552, 0x6455d, and 0x64563 after the 0x0f00 CS:0 bias.
  eaxDepth: 0x6364c,
  eaxPoint: 0x63652,
  ebxDepth: 0x6365d,
  ebxPoint: 0x63663,
});

function signed16(value) { return (value << 16) >> 16; }

function signedProductDivide(value, divisor) {
  const dividend = BigInt(value | 0) * 250n;
  if (divisor === 0) throw new RangeError('fn_644e8 reached an x86 IDIV by zero');
  const quotient = dividend / BigInt(divisor | 0);
  const remainder = dividend % BigInt(divisor | 0);
  if (quotient < -0x80000000n || quotient > 0x7fffffffn) {
    throw new RangeError('fn_644e8 reached an x86 IDIV quotient overflow');
  }
  return { quotient: Number(BigInt.asIntN(32, quotient)), remainder: Number(BigInt.asIntN(32, remainder)) };
}

// 0x644e8..0x645bc. Update the projected endpoint words for each generated
// 0x7a-byte record. All coordinate differences and outputs retain x86 word
// wrapping; IMUL is signed and each IDIV retains #DE conditions.
function __coverage_impl_fn_644e8(runtime) {
  const { cpu, memory } = runtime;
  const tableIndex = (memory.read32(0x63f46) & 0xfff) * 4;
  const sine = memory.read32(0x2298c + tableIndex) >> 7;
  const cosine = memory.read32(0x2198c + tableIndex) >> 7;
  memory.write32(0x63f4a, sine);
  memory.write32(0x6364c, sine);
  memory.write32(0x63663, -sine);
  memory.write32(0x63f4e, cosine);
  memory.write32(0x63652, cosine);
  memory.write32(0x6365d, cosine);

  // The original stores the current sine/cosine values into the four live
  // IMUL immediates before entering loc_64530. Read the just-patched operands,
  // not the previous frame's immediates from the captured code image.
  const eaxDepthScale = memory.read32(TRANSFORM_IMUL_OPERANDS.eaxDepth) | 0;
  const eaxPointScale = memory.read32(TRANSFORM_IMUL_OPERANDS.eaxPoint) | 0;
  const ebxDepthScale = memory.read32(TRANSFORM_IMUL_OPERANDS.ebxDepth) | 0;
  const ebxPointScale = memory.read32(TRANSFORM_IMUL_OPERANDS.ebxPoint) | 0;

  let esi = 0x60f80;
  let eax = 0;
  let ebx = 0;
  let ecx = 0;
  let edx = 0;
  let edi = 0;
  let ebp = 0;
  while (esi < 0x6333e) {
    ecx = 0xffffffc4;
    do {
      const recordOffset = ecx | 0;
      const pointAddress = (esi + recordOffset + 0x3c) >>> 0;
      const depth = signed16(memory.read16(pointAddress));
      const pointX = signed16(memory.read16(pointAddress + 2));
      eax = (Math.imul(depth, eaxDepthScale) + Math.imul(pointX, eaxPointScale)) | 0;
      eax >>= 9;
      ebx = (Math.imul(depth, ebxDepthScale) + Math.imul(pointX, ebxPointScale)) | 0;
      ebx >>= 9;

      // IDIV consumes the signed 64-bit result of IMUL EAX,250.
      ebp = pointX;
      edi = signed16(memory.read16(esi + 0x3c));
      let divided = signedProductDivide(eax, edi);
      eax = (divided.quotient + 0xa0) | 0;
      edx = divided.remainder;
      memory.write16(esi + recordOffset + 0x7a, eax);

      divided = signedProductDivide(ebx, edi);
      eax = (divided.quotient + 0x64) | 0;
      edx = divided.remainder;
      memory.write16(esi + recordOffset + 0x7c, eax);

      ecx = (ecx + 4) >>> 0;
    } while (ecx !== 0);

    const depthAddress = esi + 0x3c;
    let depth = signed16(memory.read16(depthAddress));
    depth = (depth - 8) & 0xffff;
    memory.write16(depthAddress, depth);
    if (signed16(depth) < 1) memory.write16(depthAddress, 0x2bc);
    esi = (esi + 0x7a) >>> 0;
  }

  cpu.set('eax', eax >>> 0);
  cpu.set('ebx', ebx >>> 0);
  cpu.set('ecx', ecx);
  cpu.set('edx', edx >>> 0);
  cpu.set('esi', esi);
  cpu.set('edi', edi >>> 0);
  cpu.set('ebp', ebp >>> 0);
  cpu.setCmpFlags32(esi, 0x6333e);
}

// Capture-resume suffix for the exact instruction boundary at 0x6458e.
// The capture is already inside the second IDIV result for the current point,
// so this finishes that store and resumes only the remaining point/row loops.
export function resumeFn644e8At0x6458e(runtime, { expectedReturn = 0x6352d } = {}) {
  if (runtime.captureEvidence?.id !== 'capture_000700' || runtime.capturedEip !== 0x6368e) {
    throw new Error('fn_644e8 suffix is grounded only in capture_000700 at runtime EIP 0x6368e');
  }
  const { cpu, memory } = runtime;
  let eax = cpu.get('eax');
  let ebx = cpu.get('ebx');
  let ecx = cpu.get('ecx');
  let edx = cpu.get('edx');
  let esi = cpu.get('esi');
  let edi = cpu.get('edi');
  let ebp = cpu.get('ebp');
  // These are live self-modified x86 instruction immediates. The EXE contains
  // the placeholder 0x12345678, but capture_000700 records -408, 310, 310,
  // and 408 respectively. Read the active code bytes just as the CPU does.
  const eaxDepthScale = memory.read32(TRANSFORM_IMUL_OPERANDS.eaxDepth) | 0;
  const eaxPointScale = memory.read32(TRANSFORM_IMUL_OPERANDS.eaxPoint) | 0;
  const ebxDepthScale = memory.read32(TRANSFORM_IMUL_OPERANDS.ebxDepth) | 0;
  const ebxPointScale = memory.read32(TRANSFORM_IMUL_OPERANDS.ebxPoint) | 0;

  if (esi !== 0x62384 || ecx !== 0xfffffff8 || edi !== 0x6c || ebp !== 0x13) {
    throw new Error(`capture_000700 suffix registers differ from the recorded boundary: ESI=0x${esi.toString(16)}, ECX=0x${ecx.toString(16)}, EDI=0x${edi.toString(16)}, EBP=0x${ebp.toString(16)}`);
  }

  // 0x6458e: ADD EAX,64h; MOV [ESI+ECX+7Ch],AX.
  eax = (eax + 0x64) >>> 0;
  memory.write16((esi + (ecx | 0) + 0x7c) >>> 0, eax);
  ecx = (ecx + 4) >>> 0;

  while (true) {
    while (ecx !== 0) {
      const pointAddress = (esi + (ecx | 0) + 0x3c) >>> 0;
      const depth = signed16(memory.read16(pointAddress));
      const pointX = signed16(memory.read16(pointAddress + 2));
      eax = (Math.imul(depth, eaxDepthScale) + Math.imul(pointX, eaxPointScale)) | 0;
      eax >>= 9;
      ebx = (Math.imul(depth, ebxDepthScale) + Math.imul(pointX, ebxPointScale)) | 0;
      ebx >>= 9;

      ebp = pointX;
      edi = signed16(memory.read16(esi + 0x3c));
      let divided = signedProductDivide(eax, edi);
      eax = (divided.quotient + 0xa0) | 0;
      edx = divided.remainder;
      memory.write16((esi + (ecx | 0) + 0x7a) >>> 0, eax);

      divided = signedProductDivide(ebx, edi);
      eax = (divided.quotient + 0x64) | 0;
      edx = divided.remainder;
      memory.write16((esi + (ecx | 0) + 0x7c) >>> 0, eax);
      ecx = (ecx + 4) >>> 0;
    }

    let depth = signed16(memory.read16(esi + 0x3c));
    depth = (depth - 8) & 0xffff;
    memory.write16(esi + 0x3c, depth);
    if (signed16(depth) < 1) memory.write16(esi + 0x3c, 0x2bc);
    esi = (esi + 0x7a) >>> 0;
    cpu.setCmpFlags32(esi, 0x6333e);
    if (esi >= 0x6333e) break;
    ecx = 0xffffffc4;
  }

  cpu.set('eax', eax >>> 0);
  cpu.set('ebx', ebx >>> 0);
  cpu.set('ecx', ecx >>> 0);
  cpu.set('edx', edx >>> 0);
  cpu.set('esi', esi >>> 0);
  cpu.set('edi', edi >>> 0);
  cpu.set('ebp', ebp >>> 0);

  const stackAddress = ((runtime.segments.ssBase ?? 0) + cpu.get('esp')) >>> 0;
  const returnAddress = memory.read32(stackAddress);
  if (returnAddress !== expectedReturn) throw new Error(`capture_000700 fn_644e8 return must be 0x${expectedReturn.toString(16)}, got 0x${returnAddress.toString(16)}`);
  cpu.set('esp', (cpu.get('esp') + 4) >>> 0);
  runtime.translatedPc = returnAddress;
  return {
    function: 'fn_644e8',
    suffixReturned: true,
    resumedFromStaticAddress: '0x6458e',
    returnAddress,
    finalRegisters: Object.fromEntries(['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp'].map(name => [name, cpu.get(name) >>> 0])),
  };
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_644e8 = instrumentLift('0x644e8', 'fn_644e8', __coverage_impl_fn_644e8);
