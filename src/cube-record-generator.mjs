import { fn_372e1, fn_37657 } from './cube-phase-helpers.mjs';

function signed16(value) { return (value << 16) >> 16; }
function signed32(value) { return value | 0; }
// Raw body 0x377d4..0x37962. Each item gathers three indexed vertices,
// computes one cross-product vector, then the second pass averages vectors
// that share an index before applying the opaque fn_37732 normalization.
function __coverage_impl_fn_377d4(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const call37732 = adapters.call37732;
  const record = cpu.get('esi');
  const saved = Object.fromEntries(['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi']
    .map(name => [name, cpu.get(name)]));
  memory.write32(0x368ac, record);
  cpu.set('esp', (cpu.get('esp') - 32) >>> 0); // PUSHA

  const sourcePoints = memory.read32(record);
  const sourceIndices = memory.read32(record + 4);
  const itemCount = memory.read32(record + 0x0c);
  const pointTable = memory.read32(record + 0x14);
  const outputTable = memory.read32(record + 0x18);
  memory.write32(0x368b0, sourcePoints);
  memory.write32(0x368cc, pointTable);
  memory.write32(0x368d0, sourceIndices);

  if (itemCount === 0) throw new RangeError('fn_377d4 LOOP with ECX=0 requires 2^32 iterations');
  let outputEdi = pointTable;
  for (let item = 0; item < itemCount; item += 1) {
    memory.write32(0x3681e, 0); // MOV [3681e],0 at the outer-loop head.
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const index = memory.read16(sourceIndices + (item * 3 + vertex) * 2);
      const source = (sourcePoints + index * 6) >>> 0;
      const coordinateSlot = memory.read32(0x3681e);
      const destination = (0x36386 + coordinateSlot * 12) >>> 0;
      for (let axis = 0; axis < 3; axis += 1) {
      const coordinate = signed16(memory.read16(source + axis * 2));
      memory.write32(destination + axis * 4, coordinate >>> 0);
      cpu.set('eax', coordinate);
      }
      memory.write32(0x3681e, (coordinateSlot + 1) >>> 0);
    }

    // The caller pushes ESI, ECX, and EDI around fn_37657. EDI therefore
    // remains the sequential ES output pointer while BX/CX/BP carry the vector.
    cpu.set('edi', outputEdi);
    fn_37657(runtime, { call37732 });
    const packed = (((cpu.get('ecx') & 0xffff) << 16) | (cpu.get('ebx') & 0xffff)) >>> 0;
    runtime.writeEs32(outputEdi, packed);
    runtime.writeEs16((outputEdi + 4) >>> 0, cpu.get('ebp'));
    cpu.set('eax', (((cpu.get('ecx') & 0xffff) << 16) | (cpu.get('ebp') & 0xffff)) >>> 0);
    outputEdi = (outputEdi + 6) >>> 0;
  }

  memory.write32(0x368c8, 0);
  memory.write32(0x3681e, sourceIndices);
  memory.write32(0x368b4, itemCount);
  const scanCount = Math.imul(itemCount, 3) >>> 0;
  if (scanCount === 0) throw new RangeError('fn_377d4 inner LOOP count wraps to zero and requires 2^32 iterations');
  let outputEdiAverage = outputTable;
  for (let index = 0; index < itemCount; index += 1) {
    memory.write32(0x368c4, 0);
    memory.write32(0x368b8, 0);
    memory.write32(0x368bc, 0);
    memory.write32(0x368c0, 0);
    for (let candidate = 0; candidate < scanCount; candidate += 1) {
      if (memory.read16(sourceIndices + candidate * 2) !== index) continue;
      memory.write32(0x368c4, (memory.read32(0x368c4) + 1) >>> 0);
      const source = (pointTable + Math.floor(candidate / 3) * 6) >>> 0;
      for (let axis = 0; axis < 3; axis += 1) {
        const sumAddress = 0x368b8 + axis * 4;
        memory.write32(sumAddress, (memory.read32(sumAddress) + signed16(memory.read16(source + axis * 2))) >>> 0);
      }
    }

    const matches = memory.read32(0x368c4);
    if (matches !== 0) {
      const means = [0x368b8, 0x368bc, 0x368c0]
        .map(address => Math.trunc(signed32(memory.read32(address)) / matches));
      for (let axis = 0; axis < 3; axis += 1) runtime.writeEs16(outputEdiAverage + axis * 2, means[axis]);
      cpu.set('edi', outputEdiAverage); // SUB EDI,6 before fn_372e1.
      fn_372e1(runtime, { call37732 });
    }
    outputEdiAverage = (outputEdiAverage + 6) >>> 0;
    memory.write32(0x3681e, (memory.read32(0x3681e) + 6) >>> 0);
    memory.write32(0x368c8, (memory.read32(0x368c8) + 1) >>> 0);
  }

  cpu.set('esp', saved.esp);
  for (const [name, value] of Object.entries(saved)) cpu.set(name, value);
  cpu.setCarry(false); // The final CMP ECX,[368b4] is equal at exit.
  return runtime;
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_377d4 = instrumentLift('0x377d4', 'fn_377d4', __coverage_impl_fn_377d4);
