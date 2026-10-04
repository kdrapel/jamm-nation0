const MASK32 = 0xffffffff;
const HISTOGRAM = 0x2cb28;
const COUNTER = 0x2cb20;
const SHIFT = 0x2cb24;
const KEY_SCRATCH = 0x2f958;
const VALUE_SCRATCH = 0x2cf28;

function repMovsdToEs(runtime, source, destination, count) {
  const { memory } = runtime;
  for (let index = 0; index < count; index += 1) {
    runtime.writeEs32((destination + index * 4) >>> 0, memory.read32((source + index * 4) >>> 0));
  }
}

// 0x37feb..0x380e7. Stable two-pass byte radix transfer of paired DS arrays.
// REP STOSD and the final REP MOVSD instructions explicitly target ES; the
// histogram and scratch accesses without an ES override remain in DS.
// The caller at 0x3818c skips this helper when ECX (the item count) is zero.
function __coverage_impl_fn_37feb(runtime) {
  const { cpu, memory } = runtime;
  const esBase = runtime.segments.esBase;
  if (esBase === null || !Number.isInteger(esBase) || esBase < 0 || esBase > MASK32) {
    throw new Error('ES base is unresolved for fn_37feb string operations');
  }

  const source = cpu.get('esi');
  const destination = cpu.get('edi');
  const count = cpu.get('ecx');
  if (count === 0) {
    throw new RangeError('fn_37feb requires nonzero ECX; caller guards the call at 0x3818c');
  }

  const originalEcx = cpu.get('ecx');
  const originalEdx = cpu.get('edx');
  memory.write32(COUNTER, 0);
  memory.write32(SHIFT, 0);

  for (let pass = 0; pass < 2; pass += 1) {
    // PUSH EDI / REP STOSD / POP EDI. The zeroing is ES-relative, while the
    // following histogram updates are ordinary DS accesses.
    let edi = HISTOGRAM;
    for (let index = 0; index < 0x100; index += 1) {
      runtime.writeEs32(edi, 0);
      edi = (edi + 4) >>> 0;
    }

    // Count the selected byte of every DS key.
    let ebp = 0;
    let edx = originalEcx;
    const shift = memory.read8(SHIFT);
    while (edx !== 0) {
      const key = memory.read32((source + ebp) >>> 0);
      const bucket = (key >>> shift) & 0xff;
      const histogramAddress = HISTOGRAM + bucket * 4;
      memory.write32(histogramAddress, (memory.read32(histogramAddress) + 1) >>> 0);
      ebp = (ebp + 4) >>> 0;
      edx = (edx - 1) >>> 0;
    }

    // Convert bucket counts to exclusive starting positions. The source and
    // destination ranges intentionally overlap by one dword, as in the raw
    // loop from 0x38050 through 0x38061.
    ebp = 0xfffffc04;
    do {
      const countAddress = (0x2cf24 + ebp) >>> 0;
      const prefixAddress = (0x2cf28 + ebp) >>> 0;
      memory.write32(prefixAddress, (memory.read32(prefixAddress) + memory.read32(countAddress)) >>> 0);
      ebp = (ebp + 4) >>> 0;
    } while (ebp !== 0);

    // Reverse traversal plus decrementing cumulative ends preserves the
    // order of associated values for keys with equal radix bytes.
    ebp = (originalEcx << 2) >>> 0;
    do {
      const key = memory.read32((source + ebp - 4) >>> 0);
      const bucket = (key >>> memory.read8(SHIFT)) & 0xff;
      const histogramAddress = HISTOGRAM + bucket * 4;
      const rank = (memory.read32(histogramAddress) - 1) >>> 0;
      memory.write32(histogramAddress, rank);
      const scratchOffset = Math.imul(rank, 4) >>> 0;
      const associatedValue = memory.read32((destination + ebp - 4) >>> 0);
      memory.write32((KEY_SCRATCH + scratchOffset) >>> 0, key);
      memory.write32((VALUE_SCRATCH + scratchOffset) >>> 0, associatedValue);
      ebp = (ebp - 4) >>> 0;
    } while (ebp !== 0);

    // REP MOVSD DS:2f958 -> ES:source, followed by DS:2cf28 -> ES:destination.
    repMovsdToEs(runtime, KEY_SCRATCH, source, originalEcx);
    repMovsdToEs(runtime, VALUE_SCRATCH, destination, originalEcx);

    memory.write32(SHIFT, (memory.read32(SHIFT) + 8) >>> 0);
    memory.write32(COUNTER, (memory.read32(COUNTER) + 1) >>> 0);
  }

  cpu.set('eax', source);
  cpu.set('ebx', destination);
  cpu.set('ebp', 0);
  cpu.set('ecx', originalEcx);
  cpu.set('edx', originalEdx);
  cpu.set('esi', source);
  cpu.set('edi', destination);
  cpu.setCarry(false); // final CMP [0x2cb20],2 succeeds without borrow.
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_37feb = instrumentLift('0x37feb', 'fn_37feb', __coverage_impl_fn_37feb);
