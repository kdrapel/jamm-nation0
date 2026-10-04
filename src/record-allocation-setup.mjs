import { fn_1189 } from './allocator.mjs';

// 0x3798b..0x37a0e. Allocate the per-record buffers addressed from ESI,
// followed by one 0x17-byte record for each item in the record's count.
// PUSHA/POPA bracket the whole routine, so all general registers (including
// the caller's ESI pointer) are restored while memory and flags are retained.
function __coverage_impl_fn_3798b(runtime) {
  const { cpu, memory } = runtime;
  const saved = Object.fromEntries(['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi']
    .map(register => [register, cpu.get(register)]));
  const record = cpu.get('esi');
  const count = memory.read32((record + 0x0c) >>> 0);

  const allocateAligned = size => {
    cpu.set('eax', size >>> 0);
    fn_1189(runtime);
    const aligned = ((cpu.get('eax') + 4) & 0xfffffffc) >>> 0;
    // ADD EAX,4 followed by AND EAX,-4. The latter clears CF.
    cpu.setCarry(false);
    return aligned;
  };

  const sixByteTableSize = (Math.imul(count, 6) + 3) >>> 0;
  memory.write32((record + 0x14) >>> 0, allocateAligned(sixByteTableSize));
  memory.write32((record + 0x18) >>> 0, allocateAligned(sixByteTableSize));

  const itemCount = memory.read32((record + 0x08) >>> 0);
  const threeWordTableSize = (Math.imul(itemCount, 6) + 3) >>> 0;
  memory.write32((record + 0x1c) >>> 0, allocateAligned(threeWordTableSize));

  if ((memory.read8((record + 0x37) >>> 0) & 1) === 0) {
    const optionalTableSize = ((itemCount * 2) + 3) >>> 0;
    memory.write32((record + 0x20) >>> 0, allocateAligned(optionalTableSize));
  }

  // The machine code always enters this LOOP body once. A zero count would
  // wrap ECX and cause 2^32 iterations; preserve that raw behavior explicitly.
  let remaining = count;
  let index = 0;
  do {
    const tableEntry = allocateAligned(0x17);
    memory.write32((0x276b0 + index) >>> 0, tableEntry);
    const nextIndex = index + 4;
    index = nextIndex >>> 0;
    // ADD EBP,4 follows the allocator's AND and supplies the flags observed
    // after the final iteration (LOOP and POPA leave them unchanged).
    cpu.setCarry(nextIndex > 0xffffffff);
    remaining = (remaining - 1) >>> 0;
  } while (remaining !== 0);

  for (const [register, value] of Object.entries(saved)) cpu.set(register, value);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_3798b = instrumentLift('0x3798b', 'fn_3798b', __coverage_impl_fn_3798b);
