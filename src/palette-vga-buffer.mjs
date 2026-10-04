import { fn_2852b, fn_28574 } from './vga-helpers.mjs';
import { fn_5f517 } from './palette-helper.mjs';

function required(adapters, name) {
  if (typeof adapters?.[name] !== 'function') {
    throw new Error(`fn_5f48d requires a ${name} adapter`);
  }
  return adapters[name];
}

// Translation of the dispatcher-selected routine at 0x5f48d..0x5f516.
// INT 33h, VGA port I/O, and ES writes stay behind host adapters.
function __coverage_impl_fn_5f48d(runtime, adapters = {}) {
  const callInterrupt = required(adapters, 'callInterrupt');
  const inPort = required(adapters, 'inPort');
  const outPort = required(adapters, 'outPort');
  const writeEs8 = required(adapters, 'writeEs8');
  const writeEs32 = required(adapters, 'writeEs32');
  const { cpu, memory } = runtime;

  const executionRuntime = Object.create(runtime);
  executionRuntime.in8 = port => inPort(runtime, port & 0xffff) & 0xff;
  executionRuntime.out8 = (port, value) => outPort(runtime, port & 0xffff, value & 0xff);
  executionRuntime.writeEs8 = (offset, value) => writeEs8(runtime, offset >>> 0, value & 0xff);
  executionRuntime.writeEs32 = (offset, value) => writeEs32(runtime, offset >>> 0, value >>> 0);

  memory.write16(0xe0, 0x13);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x10);
  callInterrupt(0x33, runtime);

  fn_2852b(executionRuntime);
  fn_28574(executionRuntime);

  let edi = (0xa0000 - memory.read32(0x18)) >>> 0;
  cpu.set('edi', edi);
  cpu.set('eax', 0);
  cpu.set('ecx', 0x3e80);
  for (let count = 0; count < 0x3e80; count += 1) {
    writeEs32(runtime, edi, 0);
    edi = (edi + 4) >>> 0;
  }
  cpu.set('edi', edi);
  cpu.set('ecx', 0);

  let esi = (memory.read32(0x21964) + 0x280) >>> 0;
  edi = (0xa1900 - memory.read32(0x18)) >>> 0;
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ecx', 0x32a0);
  for (let count = 0; count < 0x32a0; count += 1) {
    writeEs32(runtime, edi, memory.read32(esi));
    esi = (esi + 4) >>> 0;
    edi = (edi + 4) >>> 0;
  }
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ecx', 0);

  cpu.set('ebx', 0xc8);
  edi = (0xa0000 - memory.read32(0x18)) >>> 0;
  cpu.set('edi', edi);
  cpu.set('eax', cpu.get('eax') & 0xffffff00);
  let ebx = 0xc8;
  do {
    writeEs8(runtime, edi, 0);
    edi = (edi + 1) >>> 0;
    edi = (edi + 0x13f) >>> 0;
    ebx = (ebx - 1) >>> 0;
  } while (ebx !== 0);
  cpu.set('edi', edi);
  cpu.set('ebx', 0);

  // This is the first point where the cleared page, copied artwork, and the
  // per-row edge bytes are all complete. A continuous host may use it to
  // switch its scanout source; changing presentation on the first copy store
  // exposes a partially initialized WARD page at the preceding retrace.
  adapters.afterSurfaceWrite?.(runtime);

  cpu.set('edi', 0x18a81);
  cpu.set('ebx', cpu.get('ebx') & 0xffffff00);
  cpu.set('ecx', (cpu.get('ecx') & 0xffff00ff) | 0x0200);
  fn_5f517(executionRuntime);

  cpu.set('ecx', 0xaa);
  do {
    fn_2852b(executionRuntime);
    cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
  } while (cpu.get('ecx') !== 0);

  cpu.set('edi', 0x18a81);
  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | 0xfc);
  cpu.set('ecx', (cpu.get('ecx') & 0xffff00ff) | 0xfc00);
  fn_5f517(executionRuntime);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_5f48d = instrumentLift('0x5f48d', 'fn_5f48d', __coverage_impl_fn_5f48d);
