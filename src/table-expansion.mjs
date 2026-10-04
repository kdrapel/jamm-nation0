import { fn_11b0 } from './allocator.mjs';

// Translation of 0x214ed..0x2150e. Expands the 8192-byte packed source into
// 65536 DS bytes, scanning each source byte from its most significant bit.
function __coverage_impl_fn_214ed(runtime) {
  const { memory, cpu } = runtime;
  const savedEax = cpu.get('eax');
  const savedEsi = cpu.get('esi');
  const savedEdi = cpu.get('edi');
  let esi = savedEsi;
  let edi = savedEdi;
  let ebx = cpu.get('ebx');
  let finalBit = 0;
  // The original MOV BL immediate is at normalized CS:0 address 0x20602.
  // The startup dispatcher patches it to 0x1f before its fn_2150f calls;
  // later siblings inherit that modified code byte.
  const setBitValue = memory.read8(0x20602);

  for (let sourceIndex = 0; sourceIndex < 0x2000; sourceIndex += 1) {
    let al = memory.read8(esi);
    esi = (esi + 1) >>> 0;
    for (let bit = 0; bit < 8; bit += 1) {
      finalBit = al >>> 7;
      al = (al << 1) & 0xff;
      ebx = (ebx & 0xffffff00) | (finalBit ? setBitValue : 0x01);
      memory.write8(edi, ebx);
      edi = (edi + 1) >>> 0;
    }
  }

  cpu.set('eax', savedEax);
  cpu.set('esi', savedEsi);
  cpu.set('edi', savedEdi);
  cpu.set('ebx', ebx);
  cpu.set('ebp', 0);
  cpu.set('ecx', 0);
  cpu.setCarry(Boolean(finalBit));
}

function signedWord(value) {
  return (value << 16) >> 16;
}

function fn_215xx(runtime, { divisor, coefficientWords, coefficientBytes, divideAddress }) {
  const { memory, cpu } = runtime;
  const savedEsi = cpu.get('esi');
  const savedEdi = cpu.get('edi');
  const savedHighPool = memory.read32(8);
  const dimensions = cpu.get('edx');
  const height = dimensions >>> 16;
  const width = dimensions & 0xffff;

  cpu.set('eax', 0x10000);
  fn_11b0(runtime);
  const temporary = cpu.get('eax');
  cpu.set('edi', temporary);
  fn_214ed(runtime);

  cpu.set('edi', savedEdi);
  cpu.set('esi', temporary);
  let ecx = dimensions;
  let eax = height << 16;
  let ebx = 0;
  let ebp;
  let finalRemainder = 0;
  let outerCount = height;

  // The original uses decrement-and-branch loops. A zero dimension wraps and
  // therefore runs 65536 iterations, so use do/while counters here.
  do {
    ecx = (dimensions & 0xffff0000) | width;
    let innerCount = width;
    do {
      ebp = 0xffffffe7;
      ebx = 0;
      for (let term = 0; term < 25; term += 1) {
        const wordAddress = (coefficientWords + ((ebp << 1) >>> 0)) >>> 0;
        const displacement = signedWord(memory.read16(wordAddress));
        const pixel = memory.read8((cpu.get('esi') + displacement) >>> 0);
        const highByte = memory.read8((coefficientBytes + ebp) >>> 0);
        const lookup = (highByte << 8) | pixel;
        const sample = memory.read8(0x26990 + lookup);
        const lowSum = (ebx & 0xff) + sample;
        const carry = lowSum > 0xff ? 1 : 0;
        ebx = (((((ebx >>> 8) + carry) & 0xff) << 8) | (lowSum & 0xff)) >>> 0;
        ebp = (ebp + 1) >>> 0;
      }

      const sum = ebx & 0xffff;
      const quotient = Math.floor(sum / divisor);
      if (quotient > 0xff) {
        throw new Error(`Divide error at 0x${divideAddress.toString(16)}: byte quotient overflow`);
      }
      finalRemainder = sum % divisor;
      ebx = (ebx & 0xffffff00) | divisor;
      eax = ((finalRemainder << 8) | quotient) >>> 0;
      memory.write8(cpu.get('edi'), quotient);
      cpu.set('edi', (cpu.get('edi') + 1) >>> 0);
      cpu.set('esi', (cpu.get('esi') + 1) >>> 0);
      innerCount = (innerCount - 1) & 0xffff;
    } while (innerCount !== 0);

    ecx = ((ecx - 0x10000) >>> 0);
    outerCount = (outerCount - 1) & 0xffff;
  } while (outerCount !== 0);

  memory.write32(8, savedHighPool);
  cpu.set('esi', savedEsi);
  cpu.set('edi', savedEdi);
  cpu.set('edx', dimensions);
  cpu.set('ecx', width);
  cpu.set('ebp', 0);
  cpu.set('ebx', ebx);
  cpu.set('eax', eax);
  cpu.setCarry(false);
}

// Translation of 0x2150f..0x2157d. The 25-entry conversion tables remain
// unnamed; their original signed offsets and byte lookups are preserved.
function __coverage_impl_fn_2150f(runtime) {
  // The dispatcher rewrites the absolute word-table operand at 0x21542
  // (normalized runtime 0x20642) to 0x205eb before its third call here.
  // Earlier calls retain the executable default 0x205b9.
  return fn_215xx(runtime, {
    divisor: 0x0f,
    coefficientWords: runtime.memory.read32(0x20642),
    coefficientBytes: 0x20587,
    divideAddress: 0x21563,
  });
}

// Translation of 0x2157e..0x215ec. It shares the unpacker and 25-term loop
// with fn_2150f but uses its own row-byte table and divides by 0x25.
function __coverage_impl_fn_2157e(runtime) {
  return fn_215xx(runtime, {
    divisor: 0x25,
    coefficientWords: 0x205b9,
    coefficientBytes: 0x2056e,
    divideAddress: 0x215d1,
  });
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_214ed = instrumentLift('0x214ed', 'fn_214ed', __coverage_impl_fn_214ed);
export const fn_2150f = instrumentLift('0x2150f', 'fn_2150f', __coverage_impl_fn_2150f);
export const fn_2157e = instrumentLift('0x2157e', 'fn_2157e', __coverage_impl_fn_2157e);

// Capture-specific continuation from the middle of fn_2150f's 25-sample
// transform loop. All inputs, self-patched operands, and saved caller state
// come from the same capture; the routine stops at its captured RET target.
function __coverage_impl_resumeFn2150fAt0x2155a(runtime) {
  const { cpu, memory } = runtime;
  if (runtime.capturedEip !== 0x2065a) {
    throw new Error(`fn_2150f suffix requires runtime EIP 0x2065a, got 0x${runtime.capturedEip?.toString(16) ?? 'unknown'}`);
  }
  const dsBase = runtime.capturedSegments?.ds?.normalizedBase;
  const ssBase = runtime.capturedSegments?.ss?.normalizedBase;
  if (dsBase !== 0 || ssBase !== 0) throw new Error('fn_2150f suffix requires capture-normalized DS/SS bases of zero');

  let eax = cpu.get('eax');
  let ebx = cpu.get('ebx');
  let ecx = cpu.get('ecx');
  let edx = cpu.get('edx');
  let esi = cpu.get('esi');
  let edi = cpu.get('edi');
  let ebp = cpu.get('ebp');
  let esp = cpu.get('esp');
  const savedWidth = memory.read16(ssBase + esp);
  if (ebp !== 0xfffffff8 || ecx !== 0x007f00c0 || savedWidth !== 0x0140) {
    throw new Error('fn_2150f suffix registers or saved row width differ from capture_000025');
  }
  const savedReturn = memory.read32(ssBase + esp + 14);
  if (savedReturn !== 0x20f40) throw new Error(`fn_2150f captured return mismatch: 0x${savedReturn.toString(16)}`);
  const savedHighPool = memory.read32(ssBase + esp + 2);
  const savedEdi = memory.read32(ssBase + esp + 6);
  const savedEsi = memory.read32(ssBase + esp + 10);
  if (savedEdi !== 0x1d6344 || savedEsi !== 0x6b55) {
    throw new Error('fn_2150f suffix saved caller pointers differ from capture_000025');
  }
  const coefficientWords = memory.read32(0x20642);
  const coefficientBytes = 0x20587;
  let outputPixels = 0;

  const addSample = offset => {
    const wordAddress = (coefficientWords + ((offset << 1) >>> 0)) >>> 0;
    const displacement = signedWord(memory.read16(wordAddress));
    const pixel = memory.read8((esi + displacement) >>> 0);
    const highByte = memory.read8((coefficientBytes + offset) >>> 0);
    const sample = memory.read8(0x26990 + ((highByte << 8) | pixel));
    const lowSum = (ebx & 0xff) + sample;
    const carry = lowSum > 0xff ? 1 : 0;
    ebx = (((((ebx >>> 8) + carry) & 0xff) << 8) | (lowSum & 0xff)) >>> 0;
  };

  let rowsRemaining = ecx >>> 16;
  let columnsRemaining = ecx & 0xffff;
  let firstPixel = true;
  while (rowsRemaining !== 0) {
    while (columnsRemaining !== 0) {
      if (!firstPixel) ebx = 0;
      const firstTerm = firstPixel ? ((ebp + 1) | 0) : -25;
      for (let term = firstTerm; term < 0; term += 1) addSample(term);

      const sum = ebx & 0xffff;
      const quotient = Math.floor(sum / 0x0f);
      if (quotient > 0xff) throw new Error('fn_2150f suffix reached the original byte DIV overflow branch');
      const remainder = sum % 0x0f;
      eax = ((remainder << 8) | quotient) >>> 0;
      ebx = (ebx & 0xffffff00) | 0x0f;
      memory.write8(edi, quotient);
      edi = (edi + 1) >>> 0;
      esi = (esi + 1) >>> 0;
      columnsRemaining = (columnsRemaining - 1) & 0xffff;
      outputPixels += 1;
      firstPixel = false;
    }

    const beforeSubtract = (rowsRemaining << 16) >>> 0;
    const afterSubtract = (beforeSubtract - 0x10000) >>> 0;
    cpu.setCmpFlags32(beforeSubtract, 0x10000); // SUB ECX,0x10000 before POP CX/JNZ.
    rowsRemaining = afterSubtract >>> 16;
    esp = (esp + 2) >>> 0; // POP CX restores the width saved for this row.
    ecx = ((afterSubtract & 0xffff0000) | memory.read16(ssBase + esp - 2)) >>> 0;
    columnsRemaining = savedWidth;
    if (rowsRemaining === 0) break;
    esp = (esp - 2) >>> 0; // next row's PUSH CX
    memory.write16(ssBase + esp, savedWidth);
  }

  memory.write32(8, memory.read32(ssBase + esp)); // POP DS:[8] restores the saved high-pool pointer.
  esp = (esp + 4) >>> 0;
  edi = memory.read32(ssBase + esp); esp = (esp + 4) >>> 0;
  esi = memory.read32(ssBase + esp); esp = (esp + 4) >>> 0;
  const returnAddress = memory.read32(ssBase + esp); esp = (esp + 4) >>> 0;
  if (returnAddress !== savedReturn) throw new Error('fn_2150f suffix return slot changed during the transform');

  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ecx', savedWidth);
  cpu.set('edx', edx);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ebp', 0);
  cpu.set('esp', esp);
  runtime.translatedPc = returnAddress;
  return {
    function: 'fn_2150f',
    originalFunctionCompleted: true,
    resumedFromStaticAddress: '0x2155a',
    returnRuntimeAddress: `0x${returnAddress.toString(16)}`,
    returnStaticAddress: '0x21e40',
    outputPixels,
    remainingSamples: 7 + (outputPixels - 1) * 25,
    coefficientWords: `0x${coefficientWords.toString(16)}`,
  };
}

export function resumeFn2150fAt0x2155a(runtime) {
  return __coverage_impl_resumeFn2150fAt0x2155a(runtime);
}
