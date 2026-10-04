const MASK32 = 0xffffffff;
const GPRS = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
import { loadSegmentSelector } from './runtime-adapters.mjs';

// 0x37f74..0x37fea. Copies each record referenced by the global pointer table
// into the shared 0x3239c record, then calls unresolved 0x332b6. The callee's
// stack arguments are the current table cursor and remaining count, in that
// order; the wrapper restores both after each call and PUSHA/POPA preserves
// every incoming general register. MOV FS is not undone by POPA.
function __coverage_impl_fn_37f74(runtime, { resolveFsSelector, processRecord } = {}) {
  const { cpu, memory } = runtime;
  const saved = Object.fromEntries(GPRS.map(register => [register, cpu.get(register)]));

  const fsSelector = memory.read16(0x32388);
  loadSegmentSelector(runtime, 'fs', fsSelector, resolveFsSelector);

  let remaining = memory.read32(0x368c8);
  cpu.set('ecx', remaining);
  cpu.setCarry(false); // TEST ECX,ECX
  if (remaining === 0) {
    for (const [register, value] of Object.entries(saved)) cpu.set(register, value);
    return;
  }

  if (typeof processRecord !== 'function') {
    throw new Error('Unresolved call from fn_37f74 to fn_332b6 at 0x37fdc');
  }

  let cursor = 0x276b0;
  cpu.set('esi', cursor);
  while (remaining !== 0) {
    cpu.set('esi', cursor);
    const source = memory.read32(cursor);
    cpu.set('ebx', source);

    cpu.set('eax', memory.read32(source));
    memory.write32(0x3239c, cpu.get('eax'));
    cpu.set('eax', memory.read32((source + 4) >>> 0));
    memory.write32(0x323a0, cpu.get('eax'));
    cpu.set('eax', memory.read32((source + 8) >>> 0));
    memory.write32(0x323a4, cpu.get('eax'));

    let eax = cpu.get('eax');
    for (const [sourceOffset, destinationOffset] of [[0x0c, 0x323a8], [0x0e, 0x323ac], [0x10, 0x323b0]]) {
      const word = memory.read16((source + sourceOffset) >>> 0);
      eax = ((eax & 0xffff0000) | word) >>> 0;
      cpu.set('eax', eax);
      memory.write8(destinationOffset, eax & 0xff);
      memory.write8(destinationOffset + 2, (eax >>> 8) & 0xff);
    }
    const finalWord = memory.read16((source + 0x12) >>> 0);
    eax = ((eax & 0xffff0000) | finalWord) >>> 0;
    cpu.set('eax', eax);
    memory.write16(0x323b4, finalWord);

    cpu.set('ecx', remaining);
    // PUSH ESI / PUSH ECX / CALL: the callback gets those two stack values
    // through the same SS:ESP frame the original callee reads.
    const pushaEsp = (saved.esp - 32) >>> 0;
    cpu.set('esp', (pushaEsp - 12) >>> 0); // two args and the CALL return address
    const ssBase = runtime.segments?.ssBase ?? 0;
    memory.write32((ssBase + cpu.get('esp')) >>> 0, 0x370e1);
    memory.write32((ssBase + cpu.get('esp') + 4) >>> 0, remaining);
    memory.write32((ssBase + cpu.get('esp') + 8) >>> 0, cursor);
    processRecord(cursor, remaining, runtime);
    // RET followed by POP ECX / POP ESI; PUSHA is balanced when the routine exits.
    cpu.set('esp', pushaEsp);
    cpu.set('ecx', remaining);
    cpu.set('esi', cursor);

    const nextCursor = cursor + 4;
    cursor = nextCursor >>> 0;
    remaining = (remaining - 1) >>> 0;
    cpu.set('esi', cursor);
    cpu.set('ecx', remaining);
    // ADD ESI,4 sets CF; DEC ECX (including the terminating DEC) preserves it.
    cpu.setCarry(nextCursor > MASK32);
  }

  for (const [register, value] of Object.entries(saved)) cpu.set(register, value);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_37f74 = instrumentLift('0x37f74', 'fn_37f74', __coverage_impl_fn_37f74);
