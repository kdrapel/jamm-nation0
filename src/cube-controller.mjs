import { fn_37a2a, fn_37bba, fn_37cf7 } from './cube-math-helpers.mjs';
import { fn_37dac } from './cube-record-rasterizer.mjs';
import { fn_37feb } from './radix-transfer.mjs';
import { fn_37f74 } from './record-process-wrapper.mjs';
import { fn_382fa } from './record-dispatch-helper.mjs';
import { fn_3734f } from './cube-animation-state.mjs';
import { push32, pop32 } from './core/stack-effects.mjs';

const ACTOR_TABLE = 0x36172;

function setAx(cpu, value) {
  cpu.set('eax', ((cpu.get('eax') & 0xffff0000) | (value & 0xffff)) >>> 0);
}

function setAl(cpu, value) {
  cpu.set('eax', ((cpu.get('eax') & 0xffffff00) | (value & 0xff)) >>> 0);
}

function requiredAdapter(adapter, name) {
  if (typeof adapter !== 'function') throw new Error(`fn_380e8 requires ${name} adapter`);
  return adapter;
}
function call(runtime, returnPc, body) {
  push32(runtime, returnPc); body();
  if(pop32(runtime)!==returnPc)throw new Error('Cube controller direct CALL/RET changed');
}

// Source-level continuation shared by the normal controller and capture
// resumes that arrive at the post-record pending-event exchange (0x381a7).
export function resumeFn380e8PendingEvents(runtime, { callEventHandler } = {}) {
  const { cpu, memory } = runtime;
  cpu.set('ecx', 0);
  const pending = memory.read32(0x21954);
  memory.write32(0x21954, 0);
  cpu.set('ecx', pending);
  cpu.setCarry(false);
  let remaining = pending;
  while (remaining !== 0) {
    push32(runtime, remaining);
    cpu.set('ebp', 0);
    do {
      const offset = cpu.get('ebp');
      const actor = memory.read32((ACTOR_TABLE + offset) >>> 0);
      cpu.set('esi', actor);
      push32(runtime, offset); push32(runtime, 0x372c7);
      fn_3734f(runtime, { callEventHandler });
      if (pop32(runtime) !== 0x372c7) throw new Error('Cube event return changed');
      cpu.set('ebp', pop32(runtime));

      if (memory.read8(0x3bdc0) === 1 && memory.read16(0x3bdc1) < 0x1ff) {
        memory.write16(0x3bdc1, (memory.read16(0x3bdc1) + 1) & 0xffff);
      }

      if (memory.read8((cpu.get('esi') + 0x37) >>> 0) === 1) {
        const before = memory.read32(0x2cb1c);
        const after = (before - 0x0a) >>> 0; // original SUB dword [0x2cb1c],0Ah
        memory.write32(0x2cb1c, after);
        if (before < 0x0a) memory.write32(0x2cb1c, 0xd7);
      }

      if (memory.read8(0x3628c) === 1) {
        if (memory.read8(0x3b4bd) !== 0) memory.write8(0x3b4bd, (memory.read8(0x3b4bd) - 1) & 0xff);
      } else if (memory.read8(0x3b4bd) !== 0xff) {
        memory.write8(0x3b4bd, (memory.read8(0x3b4bd) + 1) & 0xff);
      }

      if (memory.read8(0x37450) === 1) memory.write16(0x3744e, (memory.read16(0x3744e) - 2) & 0xffff); // original CMP byte, not word

      cpu.set('ebp', (offset + 4) >>> 0);
    } while (cpu.get('ebp') < 4);

    cpu.set('ecx', pop32(runtime)); // POP ECX
    remaining = (remaining - 1) >>> 0;
    cpu.set('ecx', remaining);
  }
  cpu.setCarry(false); // final CMP EBP,4 (and all early TEST paths) clear CF.
  return { pendingEvents: pending, completedEvents: pending };
}

// Captured controller continuation after fn_37dac, original 0x3816b. The
// actor flag selects the same fn_37f74 or fn_382fa record path as the complete
// controller; each branch keeps its external callback explicit.
export function resumeFn380e8At0x3816b(runtime, adapters = {}) {
  const {cpu,memory}=runtime;
  memory.write16(0x36eaa,0); cpu.set('ebp',cpu.get('ebp')+4);
  if(cpu.get('ebp')!==4)throw new Error('Captured controller resume is not the final actor');
  cpu.set('edi',0x276b0);cpu.set('esi',0x2a0e0);cpu.set('ecx',memory.read32(0x368c8));
  if(cpu.get('ecx')) {
    push32(runtime,0x37295);fn_37feb(runtime);if(pop32(runtime)!==0x37295)throw new Error('Captured sort return differs');
    if((memory.read8(cpu.get('edx')+0x37)&1)===0) {
      push32(runtime,0x372a0);fn_37f74(runtime,{
        resolveFsSelector:requiredAdapter(adapters.resolveFsSelector,'resolveFsSelector'),
        processRecord:requiredAdapter(adapters.processFsRecord,'processFsRecord'),
      });if(pop32(runtime)!==0x372a0)throw new Error('Captured FS record-list return differs');
    } else {
      push32(runtime,0x372a7);fn_382fa(runtime,{processRecord:requiredAdapter(adapters.process64e60,'process64e60')});if(pop32(runtime)!==0x372a7)throw new Error('Captured triangle record-list return differs');
    }
  }
  return resumeFn380e8PendingEvents(runtime,adapters);
}

// Raw controller at 0x380e8..0x3824a. Its two EBP-indexed loops each execute
// one record: EBP advances from 0 to 4 and is compared with 4 before looping.
// Memory outside the translated image and indirect calls remain explicit
// adapters, forwarded to the leaf helpers that own those boundaries.
function __coverage_impl_fn_380e8(runtime, adapters = {}) {
  const { cpu, memory } = runtime;

  memory.write32(0x368c8, 0);
  memory.write32(0x2cb14, 0x276b0);
  memory.write32(0x2cb10, 0x2a0e0);
  memory.write16(0x36eaa, 0);

  cpu.set('ebp', 0);
  do {
    const offset = cpu.get('ebp');
    const actor = memory.read32((ACTOR_TABLE + offset) >>> 0);
    cpu.set('esi', actor);
    cpu.set('edx', actor);

    cpu.set('eax', memory.read32((actor + 0x28) >>> 0));
    memory.write32(0x36380, cpu.get('eax'));
    setAx(cpu, memory.read16((actor + 0x2c) >>> 0));
    memory.write16(0x36384, cpu.get('eax') & 0xffff);
    setAx(cpu, memory.read16((actor + 0x34) >>> 0));
    memory.write16(0x36295, cpu.get('eax') & 0xffff);
    setAl(cpu, memory.read8((actor + 0x36) >>> 0));
    memory.write8(0x36297, cpu.get('eax') & 0xff);
    call(runtime, 0x37243, () => fn_37a2a(runtime));

    push32(runtime, cpu.get('esi'));
    cpu.set('ecx', memory.read32((actor + 8) >>> 0));
    cpu.set('edi', memory.read32((actor + 0x1c) >>> 0));
    cpu.set('esi', memory.read32(actor));
    call(runtime, 0x37251, () => fn_37bba(runtime));

    if ((memory.read8((actor + 0x37) >>> 0) & 1) === 0) {
      cpu.set('ecx', memory.read32((actor + 8) >>> 0));
      cpu.set('edi', memory.read32((actor + 0x20) >>> 0));
      cpu.set('esi', memory.read32((actor + 0x18) >>> 0));
      call(runtime, 0x37265, () => fn_37cf7(runtime));
    }

    cpu.set('esi', pop32(runtime));
    call(runtime, 0x3726b, () => fn_37dac(runtime));
    memory.write16(0x36eaa, 0);
    cpu.set('ebp', (offset + 4) >>> 0);
  } while (cpu.get('ebp') < 4);

  cpu.set('edi', 0x276b0);
  cpu.set('esi', 0x2a0e0);
  const recordCount = memory.read32(0x368c8);
  cpu.set('ecx', recordCount);
  cpu.setCarry(false); // TEST ECX,ECX
  if (recordCount !== 0) {
    call(runtime, 0x37295, () => fn_37feb(runtime));
    if ((memory.read8((cpu.get('edx') + 0x37) >>> 0) & 1) === 0) {
      call(runtime, 0x372a0, () => fn_37f74(runtime, {
        resolveFsSelector: requiredAdapter(adapters.resolveFsSelector, 'resolveFsSelector'),
        processRecord: requiredAdapter(adapters.processFsRecord, 'processFsRecord'),
      }));
    } else {
      call(runtime, 0x372a7, () => fn_382fa(runtime, {
        processRecord: requiredAdapter(adapters.process64e60, 'process64e60'),
      }));
    }
  }

  resumeFn380e8PendingEvents(runtime, { callEventHandler: adapters.callEventHandler });
  return runtime;
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_380e8 = instrumentLift('0x380e8', 'fn_380e8', __coverage_impl_fn_380e8);
