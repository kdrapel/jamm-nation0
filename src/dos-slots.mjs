// Translation of 0x1295. The table's ownership is unresolved; retain its
// original addresses and carry contract rather than assigning a host meaning.
function __coverage_impl_fn_1295(runtime) {
  const { memory, cpu } = runtime;
  const esBase = runtime.segments?.esBase;
  const ssBase = runtime.segments?.ssBase;
  if (esBase === null || esBase === undefined) throw new Error('fn_1295 requires a resolved ES base for SCASB');
  if (ssBase === null || ssBase === undefined) throw new Error('fn_1295 requires a resolved SS base for PUSH scratch');
  const entryEsp = cpu.get('esp');
  const savedEcx = cpu.get('ecx');
  const savedEdi = cpu.get('edi');
  memory.write32((ssBase + ((entryEsp - 4) >>> 0)) >>> 0, savedEcx);
  memory.write32((ssBase + ((entryEsp - 8) >>> 0)) >>> 0, savedEdi);
  let freeIndex = -1;
  let lastByte = 0;
  for (let index = 0; index < 8; index += 1) {
    lastByte = memory.read8((esBase + 0x11f + index) >>> 0);
    if (lastByte === 0) {
      freeIndex = index;
      break;
    }
  }
  if (freeIndex < 0) {
    cpu.setCmpFlags8(0, lastByte);
    cpu.setCarry(true);
    return;
  }
  memory.write8((esBase + 0x11f + freeIndex) >>> 0, 1);
  const left = memory.read16(0x11b);
  const right = Math.imul(freeIndex, memory.read16(0x11d)) & 0xffff;
  const ax = (left + right) & 0xffff;
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | ax);
  cpu.setAddFlags16(left, right);
  cpu.setCarry(false);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_1295 = instrumentLift('0x1295', 'fn_1295', __coverage_impl_fn_1295);
