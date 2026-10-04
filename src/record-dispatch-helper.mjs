const MASK32 = 0xffffffff;
import { popad, pushad, pop32, push32 } from './core/stack-effects.mjs';
const GPRS = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
const POINTER_TABLE = 0x276b0;
const RECORD_COUNT = 0x368c8;
const WORK_RECORD = 0x3239c;

// 0x382fa..0x3833d. Loads the selected record fields into the shared work
// record and delegates the unresolved per-record operation at 0x64e60.
function __coverage_impl_fn_382fa(runtime, { processRecord } = {}) {
  const { cpu, memory } = runtime;
  const saved = Object.fromEntries(GPRS.map(register => [register, cpu.get(register)]));
  pushad(runtime);
  let remaining = memory.read32(RECORD_COUNT);
  cpu.set('ecx', remaining);
  cpu.setCarry(false); // TEST ECX,ECX clears CF.

  if (remaining !== 0 && typeof processRecord !== 'function') {
    throw new Error('fn_382fa requires processRecord callback for unresolved 0x64e60');
  }

  let cursor = POINTER_TABLE;
  cpu.set('esi', cursor);
  while (remaining !== 0) {
    cpu.set('esi', cursor);
    const source = memory.read32(cursor);
    cpu.set('ebx', source);

    cpu.set('eax', memory.read32(source));
    memory.write32(WORK_RECORD, cpu.get('eax'));
    cpu.set('eax', memory.read32((source + 4) >>> 0));
    memory.write32(WORK_RECORD + 4, cpu.get('eax'));
    cpu.set('eax', memory.read32((source + 8) >>> 0));
    memory.write32(WORK_RECORD + 8, cpu.get('eax'));
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | memory.read16((source + 0x12) >>> 0));
    memory.write16(WORK_RECORD + 0x18, cpu.get('eax') & 0xffff);

    cpu.set('ecx', remaining);
    const pushaEsp = (saved.esp - 32) >>> 0;
    push32(runtime, cursor); push32(runtime, remaining); push32(runtime, 0x37434);
    processRecord(cursor, remaining, runtime);
    // RET / POP ECX / POP ESI restore the loop's stack arguments and cursor.
    if (pop32(runtime) !== 0x37434 || pop32(runtime) !== remaining || pop32(runtime) !== cursor) throw new Error('fn_382fa record CALL/RET stack changed');
    cpu.set('ecx', remaining);
    cpu.set('esi', cursor);

    const nextCursor = cursor + 4;
    cursor = nextCursor >>> 0;
    remaining = (remaining - 1) >>> 0;
    cpu.set('esi', cursor);
    cpu.set('ecx', remaining);
    cpu.setCarry(nextCursor > MASK32); // ADD ESI,4; DEC ECX leaves CF unchanged.
  }

  popad(runtime);
}

// Captured original 0x38334, after the active triangle has returned. The
// remaining count, cursor and outer PUSHA frame come from this checkpoint.
export function resumeFn382faAt0x38334(runtime, processRecord) {
  const { cpu, memory } = runtime;
  let remaining = pop32(runtime), cursor = pop32(runtime);
  for (;;) {
    cpu.set('ecx', remaining); cpu.set('esi', cursor);
    const before = cursor; cursor = (cursor + 4) >>> 0; remaining = (remaining - 1) >>> 0;
    cpu.set('esi', cursor); cpu.set('ecx', remaining); cpu.setCarry(before > 0xfffffffb);
    cpu.setDecFlags32((remaining + 1) >>> 0);
    if (!remaining) break;
    const source = memory.read32(cursor); cpu.set('ebx', source);
    for (let i = 0; i < 3; i++) { cpu.set('eax', memory.read32(source + i * 4)); memory.write32(WORK_RECORD + i * 4, cpu.get('eax')); }
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | memory.read16(source + 18)); memory.write16(WORK_RECORD + 24, cpu.get('eax'));
    push32(runtime, cursor); push32(runtime, remaining); push32(runtime, 0x37434);
    processRecord(runtime);
    if (pop32(runtime) !== 0x37434) throw new Error('Resumed triangle return differs');
    remaining = pop32(runtime); cursor = pop32(runtime);
  }
  popad(runtime);
  runtime.translatedPc = pop32(runtime);
  return { originalFunctionCompleted: false };
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_382fa = instrumentLift('0x382fa', 'fn_382fa', __coverage_impl_fn_382fa);
