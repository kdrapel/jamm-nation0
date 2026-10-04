import { fn_1189 } from './allocator.mjs';
import { fn_212ad } from './framebuffer-decay.mjs';

const FRAME_BYTES = 0x1f400;
const FRAME_DWORDS = FRAME_BYTES >>> 2;
const INITIAL_COPY_DWORDS = 0x32f0;

// Translation of the bounded ES/DS setup at 0x2124f..0x212ac.
function __coverage_impl_fn_2124f(runtime) {
  const { memory, cpu } = runtime;
  if (runtime.segments.esBase === null) throw new Error('ES base is unresolved');
  if (runtime.segments.ssBase === null) throw new Error('SS base is unresolved');

  cpu.set('eax', 0x28a04);
  fn_1189(runtime);
  const base = (((cpu.get('eax') + 4) >>> 0) & 0xfffffffc) >>> 0;
  cpu.set('eax', base);
  memory.write32(0x2034b, base);
  cpu.set('ebp', base);
  cpu.set('edi', base);
  cpu.set('ecx', FRAME_DWORDS);
  cpu.set('eax', 0x1f1f1f1f);
  for (let index = 0; index < FRAME_DWORDS; index += 1) runtime.writeEs32(base + index * 4, 0x1f1f1f1f);
  cpu.set('ecx', 0);
  cpu.set('edi', (base + FRAME_BYTES) >>> 0);

  let destination = (base + 0xa000) >>> 0;
  let source = (memory.read32(0x2196c) + 0x140) >>> 0;
  cpu.set('edi', destination);
  cpu.set('esi', source);
  cpu.set('ecx', INITIAL_COPY_DWORDS);
  for (let index = 0; index < INITIAL_COPY_DWORDS; index += 1) {
    runtime.writeEs32(destination, memory.read32(source));
    destination = (destination + 4) >>> 0;
    source = (source + 4) >>> 0;
  }
  cpu.set('edi', destination);
  cpu.set('esi', source);
  cpu.set('ecx', 0);

  let ecx = 0xffffffe8;
  cpu.set('ecx', ecx);
  do {
    cpu.set('eax', FRAME_BYTES);
    fn_1189(runtime);
    const allocated = cpu.get('eax');
    memory.write32((0x2034b + ecx) >>> 0, allocated);
    fn_212ad(runtime);
    const previousEcx = ecx;
    ecx = (ecx + 4) >>> 0;
    cpu.set('ecx', ecx);
    cpu.setCarry(ecx < previousEcx);
  } while (ecx !== 0);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_2124f = instrumentLift('0x2124f', 'fn_2124f', __coverage_impl_fn_2124f);
