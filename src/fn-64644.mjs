function s16(value) { return (value << 16) >> 16; }
function w16(value) { return value & 0xffff; }

function idiv32(numerator, divisor) {
  const dividend = numerator | 0;
  const signedDivisor = divisor | 0;
  if (signedDivisor === 0) throw new RangeError('fn_64644 reached an x86 IDIV by zero');
  // Both operands are exact signed 32-bit integers. Number division followed
  // by truncation is exact for this quotient range and avoids BigInt work in
  // the per-edge clipping hot path.
  const quotient = Math.trunc(dividend / signedDivisor);
  if (quotient < -0x80000000 || quotient > 0x7fffffff) {
    throw new RangeError('fn_64644 reached an x86 IDIV quotient overflow');
  }
  return quotient;
}

function clippedProductDivide(left16, right16, divisor16) {
  return idiv32(Math.imul(s16(left16), s16(right16)), s16(divisor16));
}

function writePixel(memory, address, color) {
  const target = address >>> 0;
  if (target >= memory.bytes.length) {
    throw new RangeError(`Memory access outside mapped range: 0x${target.toString(16)} (1 bytes)`);
  }
  memory.bytes[target] = color & 0xff;
}

// 0x64644..0x64b0f. Clip the signed word endpoints against x=0..0x13e and
// DS:[0x6373c..0x6373e], then walk inward from both ends, preserving the raw
// 16-bit error arithmetic, signed IDIV faults, and paired DS pixel writes.
function __coverage_impl_fn_64644(runtime, x0Value, y0Value, x1Value, y1Value, frameAddressValue = null) {
  const { cpu, memory } = runtime;
  const ssBase = runtime.segments?.ssBase;
  const entryRegisters = Object.fromEntries(['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp'].map(name => [name, cpu.get(name) >>> 0]));
  const entryEflags = cpu.eflags >>> 0;
  const entryFrameAddress = Number.isInteger(frameAddressValue)
    ? frameAddressValue >>> 0
    : Number.isInteger(ssBase) ? (ssBase + cpu.get('esp')) >>> 0 : cpu.get('esp') >>> 0;
  let x0 = s16(x0Value);
  let y0 = s16(y0Value);
  let x1 = s16(x1Value);
  let y1 = s16(y1Value);
  const initialEndpoints = { x0, y0, x1, y1 };
  const yMin = s16(memory.read16(0x6373c));
  const yMax = s16(memory.read16(0x6373e));
  const returnEndpoints = () => {
    // x86 clipping writes the modified words back to the caller's argument
    // frame. fn_645bd pops CX/DX after RET and chains from those clipped words.
    const args = (entryFrameAddress + 4) >>> 0;
    memory.write16(args, x0);
    memory.write16(args + 2, y0);
    memory.write16(args + 4, x1);
    memory.write16(args + 6, y1);
    return { x0, y0, x1, y1 };
  };

  // Endpoint clipping loops back to the top after each intersection, matching
  // the repeated CMP/Jcc structure and its exact edge priority.
  let clipPasses = 0;
  for (;;) {
    clipPasses += 1;
    if (runtime.diagnosticLimits?.fn64644ClipPasses !== undefined && clipPasses > runtime.diagnosticLimits.fn64644ClipPasses) {
      runtime.rasterDiagnostic = {
        kind: 'clip-pass-limit', clipPasses, endpoints: { x0, y0, x1, y1 }, bounds: { yMin, yMax },
        initialEndpoints,
        meshFrame: runtime.currentFn6424aFrame ?? null,
        entryFrameAddress: `0x${entryFrameAddress.toString(16)}`,
        entryRegisters: Object.fromEntries(Object.entries(entryRegisters).map(([name, value]) => [name, `0x${value.toString(16)}`])),
        entryEflags: `0x${entryEflags.toString(16)}`,
        caller: runtime.rasterCaller ?? null,
      };
      throw new Error(`fn_64644 diagnostic clip-pass limit at ${JSON.stringify(runtime.rasterDiagnostic)}`);
    }
    if (y0 < yMin && y1 < yMin) return returnEndpoints();
    if (y0 > yMax && y1 > yMax) return returnEndpoints();
    if (x0 > 0x13e && x1 > 0x13e) return returnEndpoints();
    if (x0 < 0 && x1 < 0) return returnEndpoints();
    if (x1 < 0) {
      const dy = s16(y0 - y1);
      const dx = s16(x0 - x1);
      y1 = s16(y0 - clippedProductDivide(dy, x0, dx));
      x1 = 0;
      continue;
    }
    if (y1 < yMin) {
      const dx = s16(x0 - x1);
      const dy = s16(y0 - yMin);
      const denom = s16(y0 - y1);
      x1 = s16(x0 - clippedProductDivide(dx, dy, denom));
      y1 = yMin;
      continue;
    }
    if (x0 < 0) {
      const dy = s16(y1 - y0);
      const dx = s16(x1 - x0);
      y0 = s16(y1 - clippedProductDivide(dy, x1, dx));
      x0 = 0;
      continue;
    }
    if (y0 < yMin) {
      const dx = s16(x1 - x0);
      const dy = s16(y1 - yMin);
      const denom = s16(y1 - y0);
      x0 = s16(x1 - clippedProductDivide(dx, dy, denom));
      y0 = yMin;
      continue;
    }
    if (x1 > 0x13e) {
      const dy = s16(y0 - y1);
      const dx = s16(0x13e - x0);
      const denom = s16(x0 - x1);
      y1 = s16(y0 + clippedProductDivide(dy, dx, denom));
      x1 = 0x13e;
      continue;
    }
    if (x0 > 0x13e) {
      const dy = s16(y1 - y0);
      const dx = s16(0x13e - x1);
      const denom = s16(x1 - x0);
      y0 = s16(y1 + clippedProductDivide(dy, dx, denom));
      x0 = 0x13e;
      continue;
    }
    if (y1 > yMax) {
      const dx = s16(x0 - x1);
      const dy = s16(yMax - y0);
      const denom = s16(y0 - y1);
      x1 = s16(x0 + clippedProductDivide(dx, dy, denom));
      y1 = yMax;
      continue;
    }
    if (y0 > yMax) {
      const dx = s16(x1 - x0);
      const dy = s16(yMax - y1);
      const denom = s16(y1 - y0);
      x0 = s16(x1 + clippedProductDivide(dx, dy, denom));
      y0 = yMax;
      continue;
    }
    break;
  }

  const dxSigned = s16(x1 - x0);
  const dySigned = s16(y1 - y0);
  const dx = dxSigned < 0 ? s16(-dxSigned) : dxSigned;
  const dy = dySigned < 0 ? s16(-dySigned) : dySigned;
  const xMajor = dx >= dy;
  const major = xMajor ? dx : dy;
  const minor = xMajor ? dy : dx;
  const steps = w16(major + 1);
  const twiceMinor = w16(minor << 1);
  let error = xMajor ? w16(w16(dy << 1) - dx) : w16(w16(dx << 1) - dy);
  const errorPlus = s16(minor << 1);
  const errorMinus = s16((minor - major) << 1);

  // Four local word step components become the two linear pointer deltas.
  let stepA = xMajor ? 0 : 1; // local -0x12
  let stepB = xMajor ? 1 : 0; // local -0xe
  let stepC = 1; // local -0x14
  let stepD = 1; // local -0x10
  if (x0 > x1) { stepB = s16(-stepB); stepD = s16(-stepD); }
  if (y0 > y1) { stepA = s16(-stepA); stepC = s16(-stepC); }
  // Final BP-relative locals remain in guest RAM after RET. The original
  // stores these words even when a short line exits before its first pixel.
  memory.write16((entryFrameAddress - 0x2) >>> 0, dx);
  memory.write16((entryFrameAddress - 0x4) >>> 0, dy);
  memory.write16((entryFrameAddress - 0x6) >>> 0, steps);
  memory.write16((entryFrameAddress - 0x8) >>> 0, error);
  memory.write16((entryFrameAddress - 0xa) >>> 0, errorPlus);
  memory.write16((entryFrameAddress - 0xc) >>> 0, errorMinus);
  memory.write16((entryFrameAddress - 0xe) >>> 0, stepB);
  memory.write16((entryFrameAddress - 0x10) >>> 0, stepD);
  memory.write16((entryFrameAddress - 0x12) >>> 0, stepA);
  memory.write16((entryFrameAddress - 0x14) >>> 0, stepC);
  const deltaA = s16(stepA * 0x140 + stepB);
  const deltaB = s16(stepC * 0x140 + stepD);

  // Raw pointer formation uses 16-bit IMUL/ADD and sign extends the result.
  let start = w16(Math.imul(y0, 0x140) + x0);
  let end = w16(Math.imul(y1, 0x140) + x1);
  const color = memory.read8(0x63c10);
  const buffer = memory.read32(0x60f7c);
  error = w16(error + 0x4000);
  // The x86 routine pre-steps the second endpoint using the initial error
  // comparison before its first paired pixel store (0x64a81..0x64a9a).
  // Leaving it at the raw endpoint draws an extra, shifted pixel row.
  if (error >= 0x4000) end = (end - deltaB) >>> 0;
  else end = (end - deltaA) >>> 0;
  memory.write32(0x63f3e, deltaA >>> 0);
  memory.write32(0x63f42, deltaB >>> 0);
  let iterations = s16(steps - 2) >> 1;
  if (iterations <= 0) return returnEndpoints();
  memory.write32(0x63c11, errorPlus >>> 0);

  let rasterPasses = 0;
  // The x86 loop decrements the count stored in ECX's high word and uses JNB;
  // it executes once more when that high word reaches zero.
  while (iterations >= 0) {
    rasterPasses += 1;
    if (runtime.diagnosticLimits?.fn64644RasterPasses !== undefined && rasterPasses > runtime.diagnosticLimits.fn64644RasterPasses) {
      runtime.rasterDiagnostic = {
        kind: 'raster-pass-limit', rasterPasses, endpoints: { x0, y0, x1, y1 },
        bounds: { yMin, yMax }, state: { start, end, error, iterations },
      };
      throw new Error(`fn_64644 diagnostic raster-pass limit at ${JSON.stringify(runtime.rasterDiagnostic)}`);
    }
    writePixel(memory, buffer + start, color);
    writePixel(memory, buffer + end, color);
    if (error < 0x4000) {
      error = (error + errorPlus) >>> 0;
      end = (end - deltaA) >>> 0;
      start = (start + deltaA) >>> 0;
    } else {
      error = (error + errorMinus) >>> 0;
      end = (end - deltaB) >>> 0;
      start = (start + deltaB) >>> 0;
    }
    iterations -= 1;
  }
  if (start !== end) writePixel(memory, buffer + start, color);
  writePixel(memory, buffer + end, color);
  return returnEndpoints();
}

// Original callback target 0x64780, an interior entry in sub_64644. The mixer
// invokes it with EBP still addressing the foreground line frame; it clips
// that frame's first endpoint to yMin, then resumes the translated clip/raster
// walk using the same BP-relative arguments and locals.
function __coverage_impl_fn_64780(runtime) {
  const { cpu, memory } = runtime;
  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('fn_64780 requires the original SS base for its EBP-relative frame');
  const frameAddress = (ssBase + cpu.get('ebp')) >>> 0;
  let x0 = s16(memory.read16(frameAddress + 4));
  let y0 = s16(memory.read16(frameAddress + 6));
  const x1 = s16(memory.read16(frameAddress + 8));
  const y1 = s16(memory.read16(frameAddress + 0x0a));
  const yMin = s16(memory.read16(0x6373c));

  // 0x64780..0x647be: signed IMUL/IDIV intersection with yMin, wrapped back
  // to word coordinates, then store x0/y0 before the branch resumes at 0x64649.
  const xDelta = s16(x1 - x0);
  const yDelta = s16(y1 - yMin);
  const ySpan = s16(y1 - y0);
  x0 = s16(x1 - clippedProductDivide(xDelta, yDelta, ySpan));
  y0 = yMin;
  memory.write16(frameAddress + 4, x0);
  memory.write16(frameAddress + 6, y0);

  return __coverage_impl_fn_64644(runtime, x0, y0, x1, y1, frameAddress);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_64644 = instrumentLift('0x64644', 'fn_64644', __coverage_impl_fn_64644);
export const fn_64780 = instrumentLift('0x64780', 'fn_64780', __coverage_impl_fn_64780);
