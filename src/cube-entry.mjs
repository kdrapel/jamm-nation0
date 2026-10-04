import { fn_216be } from './timing-helper.mjs';
import { fn_3731f, fn_38257 } from './cube-geometry-helpers.mjs';
import { fn_3734f } from './cube-animation-state.mjs';
import { fn_37963 } from './cube-setup.mjs';
import { fn_3798b } from './record-allocation-setup.mjs';
import { fn_28510, fn_2852b } from './vga-helpers.mjs';

const REGISTERS = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];

function requiredAdapter(adapters, name) {
  if (typeof adapters?.[name] !== 'function') {
    throw new TypeError(`fn_38351 requires the ${name} adapter`);
  }
  return adapters[name];
}

function createExecutionRuntime(runtime, adapters) {
  const inPort = requiredAdapter(adapters, 'inPort');
  const outPort = requiredAdapter(adapters, 'outPort');
  const writeEs16 = requiredAdapter(adapters, 'writeEs16');
  const writeEs32 = requiredAdapter(adapters, 'writeEs32');

  const executionRuntime = Object.create(runtime);
  executionRuntime.in8 = port => inPort(runtime, port);
  executionRuntime.out8 = (port, value) => outPort(runtime, port, value & 0xff);
  executionRuntime.writeEs16 = (offset, value) => writeEs16(runtime, offset >>> 0, value & 0xffff);
  executionRuntime.writeEs32 = (offset, value) => writeEs32(runtime, offset >>> 0, value >>> 0);
  return executionRuntime;
}

function setLowByte(cpu, register, value) {
  cpu.set(register, (cpu.get(register) & 0xffffff00) | (value & 0xff));
}

function setLowWord(cpu, register, value) {
  cpu.set(register, (cpu.get(register) & 0xffff0000) | (value & 0xffff));
}

function drawPaletteFrame(runtime) {
  const { cpu, memory } = runtime;
  fn_2852b(runtime);

  const bl = memory.read8(0x3b4bd);
  const bh = (~bl) & 0xff;
  cpu.set('ebx', (cpu.get('ebx') & 0xffff0000) | (bh << 8) | bl);
  cpu.set('esi', 0);
  setLowWord(cpu, 'edx', 0x3c8);
  setLowByte(cpu, 'eax', 0);
  runtime.out8(cpu.get('edx') & 0xffff, cpu.get('eax') & 0xff);
  setLowWord(cpu, 'edx', ((cpu.get('edx') & 0xffff) + 1) & 0xffff);

  while ((cpu.get('esi') >>> 0) < 0x60) {
    const index = cpu.get('esi') >>> 0;
    setLowByte(cpu, 'eax', memory.read8(0x375c0 + index));
    const redTimesInverse = (cpu.get('eax') & 0xff) * ((cpu.get('ebx') >>> 8) & 0xff);
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | redTimesInverse);
    setLowWord(cpu, 'ecx', cpu.get('eax'));

    setLowByte(cpu, 'eax', memory.read8(0x37560 + index));
    const greenTimesCurrent = (cpu.get('eax') & 0xff) * (cpu.get('ebx') & 0xff);
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | greenTimesCurrent);
    setLowWord(cpu, 'eax', (cpu.get('eax') + cpu.get('ecx')) & 0xffff);

    const ax = cpu.get('eax') & 0xffff;
    setLowWord(cpu, 'eax', ((ax & 0xff) << 8) | (ax >>> 8));
    const product = (cpu.get('eax') & 0xff) * memory.read8(0x3744e);
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | product);
    const multiplied = cpu.get('eax') & 0xffff;
    setLowWord(cpu, 'eax', ((multiplied & 0xff) << 8) | (multiplied >>> 8));
    runtime.out8(cpu.get('edx') & 0xffff, cpu.get('eax') & 0xff);

    cpu.set('esi', (index + 1) >>> 0);
  }
}

function copyAndClearFramebuffer(runtime) {
  const { cpu, memory } = runtime;
  cpu.set('edi', (0xa0000 - memory.read32(0x18)) >>> 0);
  cpu.set('esi', memory.read32(0x32394));
  cpu.set('ecx', 0x3e80);
  while (cpu.get('ecx') !== 0) {
    runtime.writeEs32(cpu.get('edi'), memory.read32(cpu.get('esi')));
    cpu.set('edi', (cpu.get('edi') + 4) >>> 0);
    cpu.set('esi', (cpu.get('esi') + 4) >>> 0);
    cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
  }

  cpu.set('edi', memory.read32(0x32394));
  cpu.set('ecx', 0x3e80);
  cpu.set('eax', 0);
  while (cpu.get('ecx') !== 0) {
    runtime.writeEs32(cpu.get('edi'), 0);
    cpu.set('edi', (cpu.get('edi') + 4) >>> 0);
    cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
  }
}

// Translation of the cube entry at 0x38351..0x3845f. The host supplies the
// unresolved cube updater, INT 33h, VGA port I/O, and ES framebuffer access.
// Retrace waits use the existing fn_2852b helper through the inPort adapter.
function __coverage_impl_fn_38351(runtime, adapters = {}) {
  const callFn380e8 = requiredAdapter(adapters, 'callFn380e8');
  const interrupt33 = requiredAdapter(adapters, 'interrupt33');
  const writeEs32 = requiredAdapter(adapters, 'writeEs32');
  const executionRuntime = createExecutionRuntime(runtime, adapters);
  const { cpu, memory } = executionRuntime;

  if (adapters.resumeAt === '0x3842f') {
    // Resume at the original REP MOVSD in an already-initialized controller.
    // This branch replays that string instruction and the following clear,
    // then continues through the same translated frame body.
    const moveCount = cpu.get('ecx') >>> 0;
    if (moveCount > 0x100000) throw new RangeError(`resume REP MOVSD count is implausible: ${moveCount}`);
    let esi = cpu.get('esi') >>> 0;
    let edi = cpu.get('edi') >>> 0;
    for (let index = 0; index < moveCount; index += 1) {
      executionRuntime.writeEs32(edi, memory.read32(esi));
      esi = (esi + 4) >>> 0;
      edi = (edi + 4) >>> 0;
    }
    cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ecx', 0);
    cpu.set('edi', memory.read32(0x32394));
    cpu.set('ecx', 0x3e80);
    cpu.set('eax', 0);
    while (cpu.get('ecx') !== 0) {
      executionRuntime.writeEs32(cpu.get('edi'), 0);
      cpu.set('edi', (cpu.get('edi') + 4) >>> 0);
      cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
    }
    callFn380e8(executionRuntime);
    adapters.afterResumeController?.(executionRuntime);
    let controllerCalls = 1;
    for (;;) {
      if (signedWord(memory.read16(0x3744e)) < 0 || memory.read16(0x361f4) === 0xff) {
        cpu.setCarry(false);
        return;
      }
      if (controllerCalls >= (adapters.resumeMaxControllers ?? 8)) {
        const error = new Error(`translated capture-resume bounded after ${controllerCalls} controller calls at the 0x3842f suffix`);
        error.code = 'TRANSLATED_RESUME_BOUNDARY';
        throw error;
      }
      drawPaletteFrame(executionRuntime);
      copyAndClearFramebuffer(executionRuntime);
      callFn380e8(executionRuntime);
      adapters.afterResumeController?.(executionRuntime);
      controllerCalls += 1;
    }
  }

  fn_38257(executionRuntime);
  memory.write32(0x361f0, 0x3620c);
  fn_37963(executionRuntime);
  cpu.set('esi', 0x36092);
  memory.write32(0x36172, cpu.get('esi'));
  fn_3798b(executionRuntime);
  fn_3734f(executionRuntime, { callEventHandler: adapters.callAnimationEvent });
  fn_3731f(executionRuntime);

  memory.write16(0x00e0, 0x0013);
  setLowByte(cpu, 'eax', 0x10);
  interrupt33(executionRuntime, 0x33);
  fn_216be(executionRuntime);

  cpu.set('esi', 0x375c0);
  cpu.set('ecx', 0x20);
  setLowByte(cpu, 'eax', 0);
  fn_28510(executionRuntime);

  memory.write32(0x21954, 0);
  memory.write32(0x21958, 0);
  memory.write8(0x3b4bd, 0);
  memory.write16(0x3744e, 0x00ff);

  for (;;) {
    if (memory.read8(0x37450) !== 1 && memory.read8(0x3b4bd) === 0xff) {
      // The original short conditional bypasses only the palette/retrace pass.
    } else {
      drawPaletteFrame(executionRuntime);
    }

    copyAndClearFramebuffer(executionRuntime);
    callFn380e8(executionRuntime);

    if (signedWord(memory.read16(0x3744e)) < 0 || memory.read16(0x361f4) === 0xff) {
      cpu.setCarry(false); // The final CMP at 0x38445 or 0x3844f leaves CF clear.
      return;
    }
  }
}

function signedWord(value) {
  return (value << 16) >> 16;
}

// One original loop body, 0x383ac..0x3845f, for a controller whose entry
// state has already been executed or captured. This does not rerun setup.
export function resumeFn38351Frame(runtime, adapters) {
  const executionRuntime = createExecutionRuntime(runtime, adapters);
  const { memory } = runtime;
  if (memory.read8(0x37450) === 1 || memory.read8(0x3b4bd) !== 255) drawPaletteFrame(executionRuntime);
  copyAndClearFramebuffer(executionRuntime);
  adapters.afterFramebufferCopy?.(runtime);
  adapters.callFn380e8(executionRuntime);
  const sceneCompleted = signedWord(memory.read16(0x3744e)) < 0 || memory.read16(0x361f4) === 255;
  runtime.translatedPc = (sceneCompleted ? 0x3845f : 0x383ac) - 0xf00;
  return { originalFunctionCompleted: false, sceneCompleted };
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_38351 = instrumentLift('0x38351', 'fn_38351', __coverage_impl_fn_38351);

// Original event callback, reached through the captured stream's pointer.
export const fn_38346 = instrumentLift('0x38346', 'fn_38346', runtime => { runtime.memory.write8(0x37450, 1); });
