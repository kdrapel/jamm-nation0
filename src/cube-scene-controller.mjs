import { fn_1189 } from './allocator.mjs';
import { fn_1295 } from './dos-slots.mjs';
import { fn_28510, fn_2852b } from './vga-helpers.mjs';
import { fn_619a3, fn_61600, fn_61d94 } from './cube-scene-helpers.mjs';
import { fn_5ef7f } from './glyph-string-helper.mjs';
import { fn_6167a } from './cube-scene-renderer.mjs?v=2026-10-03-r16';

function required(adapters, name) {
  if (typeof adapters?.[name] !== 'function') {
    throw new TypeError(`fn_61a47 requires the ${name} adapter`);
  }
  return adapters[name];
}

function setLowByte(cpu, register, value) {
  cpu.set(register, (cpu.get(register) & 0xffffff00) | (value & 0xff));
}

function setLowWord(cpu, register, value) {
  cpu.set(register, (cpu.get(register) & 0xffff0000) | (value & 0xffff));
}

function signed32(value) {
  return value | 0;
}

function signed16(value) {
  return (value << 16) >> 16;
}

function add32(memory, address, value) {
  memory.write32(address, (memory.read32(address) + value) >>> 0);
}

function signedProductShift16(left, right) {
  const product = BigInt.asIntN(64, BigInt.asIntN(32, BigInt(left)) * BigInt.asIntN(32, BigInt(right)));
  return {
    eax: Number(BigInt.asIntN(32, product >> 16n)) >>> 0,
    edx: Number(BigInt.asIntN(32, product >> 32n)) >>> 0,
  };
}

function clearEsDwords(runtime, offset, count, writeEs32) {
  const { cpu } = runtime;
  cpu.set('edi', offset >>> 0);
  cpu.set('ecx', count >>> 0);
  cpu.set('eax', 0);
  for (let index = 0; index < count; index += 1) {
    writeEs32(runtime, cpu.get('edi'), 0);
    cpu.set('edi', (cpu.get('edi') + 4) >>> 0);
    cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
  }
}

export function writeCubeScenePalette(runtime) {
  const { cpu, memory } = runtime;
  setLowWord(cpu, 'edx', 0x3c8);
  setLowByte(cpu, 'eax', 0x20);
  runtime.out8(0x3c8, 0x20);
  setLowWord(cpu, 'edx', 0x3c9);

  let esi = 0x60edd;
  let ecx = 0x60;
  const bl = memory.read8(0x60eb9);
  const bh = (~bl) & 0xff;
  cpu.set('ebx', (cpu.get('ebx') & 0xffff0000) | (bh << 8) | bl);
  while (ecx !== 0) {
    const source = memory.read8(esi);
    esi = (esi + 1) >>> 0;
    const first = source * bh;
    const bp = first & 0xffff;
    const second = 0x3f * bl;
    let ax = (second + bp) & 0xffff;
    ax = ((ax & 0xff) << 8) | (ax >>> 8);
    setLowWord(cpu, 'eax', ax);
    runtime.out8(0x3c9, ax & 0xff);
    ecx = (ecx - 1) >>> 0;
  }
  cpu.set('esi', esi);
  cpu.set('ecx', ecx);
}

function waitForTickChange(runtime, timerInterruptCheckpoint) {
  const { cpu, memory } = runtime;
  for (;;) {
    const al = memory.read8(0x21954);
    setLowByte(cpu, 'eax', al);
    // Give the host a precise asynchronous boundary between MOV AL,[tick]
    // and CMP AL,[tick], where the original timer IRQ may update the byte.
    timerInterruptCheckpoint(runtime);
    if (al !== memory.read8(0x21954)) return;
  }
}

function updatePendingTicks(runtime) {
  const { cpu, memory } = runtime;
  let eax = cpu.get('eax');
  let ebx = memory.read32(0x60770) & 0xfff;
  cpu.set('ebx', ebx);
  eax = memory.read32(0x2198c + ebx * 4);
  cpu.set('eax', eax);
  ebx = memory.read32(0x60774) & 0xfff;
  cpu.set('ebx', ebx);
  eax = (eax + memory.read32(0x2298c + ebx * 4)) >>> 0;
  eax = signed32(eax) >> 1;
  eax = Math.imul(eax, 0x17) >>> 0;
  eax = signed32(eax) >> 16;
  eax = (eax + 7) >>> 0;
  cpu.set('eax', eax);

  cpu.set('ecx', 0);
  const pending = memory.read32(0x21954);
  memory.write32(0x21954, 0);
  cpu.set('ecx', pending);
  if (pending === 0) return;

  let ecx = pending;
  while (ecx !== 0) {
    if (memory.read32(0x21958) <= 0xd2 && signed32(memory.read32(0x60ec9)) < 0) {
      add32(memory, 0x60ec9, 0x190);
    }
    add32(memory, 0x60774, 7);
    add32(memory, 0x60770, 6);
    add32(memory, 0x60758, eax);
    add32(memory, 0x60ec1, 8);
    add32(memory, 0x60ec5, -7);
    memory.write8(0x60ed8, (memory.read8(0x60ed8) - 4) & 0xff);

    if (memory.read32(0x21958) >= 0x348) {
      add32(memory, 0x60ec9, -0x190);
      if (signed32(memory.read32(0x60ec9)) < -0x16120) return 'exit';
    }

    const savedEax = cpu.get('eax');
    let value = (memory.read16(0x60eb9) + memory.read16(0x60ebb)) & 0xffff;
    if (signed16(value) > 0xff) {
      value = 0xff;
      memory.write16(0x60ebb, (-memory.read16(0x60ebb)) & 0xffff);
    }
    if (signed16(value) < 0) {
      memory.write16(0x60ebb, (-memory.read16(0x60ebb)) & 0xffff);
      value = 0;
      const phase = (memory.read8(0x60ea6) + 1) & 0xff;
      memory.write8(0x60ea6, phase);
      if (phase >= 2) memory.write16(0x60ebb, 0);
    }
    memory.write16(0x60eb9, value);
    cpu.set('eax', savedEax);
    ecx = (ecx - 1) >>> 0;
    cpu.set('ecx', ecx);
  }
  return 'continue';
}

// The exact post-render half of fn_61a47. It is also the first controller
// boundary available when resuming a later capture inside fn_6167a.
export function finishCubeSceneFrame(runtime, { outPort16, writeEs32 } = {}) {
  const { cpu, memory } = runtime;
  const pending = updatePendingTicks(runtime);
  if (pending === 'exit') return { sceneCompleted: true, pendingEvents: 0, overlayUpdated: false };

  const writeEs = writeEs32 ?? ((host, offset, value) => host.writeEs32(offset, value));
  let overlayUpdated = false;
  if (memory.read8(0x60ea6) === 1) {
    overlayUpdated = true;
    clearEsDwords(runtime, memory.read32(0x60ebd), 0x1400, writeEs);
    cpu.set('esi', 0x60ea7);
    cpu.set('edi', (memory.read32(0x60ebd) + 1) >>> 0);
    fn_61d94(runtime);
    cpu.set('esi', 0x60eaf);
    cpu.set('edi', (memory.read32(0x60ebd) + 0x1404) >>> 0);
    fn_61d94(runtime);
  }

  let ebx = memory.read32(0x60ec1) & 0xfff;
  cpu.set('ebx', ebx);
  let { eax, edx } = signedProductShift16(0x96, memory.read32(0x2198c + ebx * 4));
  cpu.set('edx', edx);
  cpu.set('eax', eax);
  memory.write32(0x60760, (eax + 0xdc) >>> 0);

  ebx = memory.read32(0x60ec5) & 0xfff;
  cpu.set('ebx', ebx);
  ({ eax, edx } = signedProductShift16(0x96, memory.read32(0x2198c + ebx * 4)));
  cpu.set('edx', edx);
  cpu.set('eax', eax);
  memory.write32(0x60764, (eax + 0xdc) >>> 0);

  setLowWord(cpu, 'ebx', memory.read16(0x60ecd));
  fn_61600(runtime, { outPort16: outPort16 ?? ((host, port, value) => host.out16(port, value)) });
  memory.write32(0x60ecd, (memory.read32(0x60ecd) ^ 0x3e80) >>> 0);
  return { sceneCompleted: false, pendingEvents: memory.read32(0x21954), overlayUpdated };
}

// Mechanical translation of the scene controller at 0x61a47..0x61d93.
// The original render leaf at 0x6167a and hardware/DOS boundaries are explicit
// adapters; asynchronous timer progress is supplied at the timer compare.
function __coverage_impl_fn_61a47(runtime, adapters = {}) {
  const callDosVector30 = required(adapters, 'callDosVector30');
  const callDosVector28 = required(adapters, 'callDosVector28');
  const callInterrupt33 = required(adapters, 'callInterrupt33');
  const callFn6167a = adapters.callFn6167a ?? (host => fn_6167a(host, {
    loadFsSelector: required(adapters, 'loadFsSelector'),
    readFs8: (rendererRuntime, offset) => rendererRuntime.readFs8(offset),
    outPort16,
  }));
  const timerInterruptCheckpoint = required(adapters, 'timerInterruptCheckpoint');
  const inPort = required(adapters, 'inPort');
  const outPort = required(adapters, 'outPort');
  const outPort16 = required(adapters, 'outPort16');
  const writeEs32 = required(adapters, 'writeEs32');
  const readFs8 = required(adapters, 'readFs8');
  const executionRuntime = Object.create(runtime);
  executionRuntime.in8 = port => inPort(runtime, port) & 0xff;
  executionRuntime.out8 = (port, value) => outPort(runtime, port, value & 0xff);
  executionRuntime.readFs8 = offset => readFs8(runtime, offset >>> 0) & 0xff;
  const { cpu, memory } = executionRuntime;

  cpu.set('eax', memory.read32(0x21960));
  memory.write32(0x60ed4, cpu.get('eax'));
  cpu.set('eax', (cpu.get('eax') + memory.read32(0x18)) >>> 0);
  cpu.set('edx', cpu.get('eax'));
  fn_1295(executionRuntime);
  callDosVector30(executionRuntime);
  memory.write16(0x60ed2, cpu.get('eax') & 0xffff);

  memory.write16(0x00e0, 0x13);
  setLowByte(cpu, 'eax', 0x10);
  callInterrupt33(executionRuntime, 0x33);

  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03c4);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0604);
  outPort16(runtime, 0x03c4, 0x0604);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03d4);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0014);
  outPort16(runtime, 0x03d4, 0x0014);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0xe317);
  outPort16(runtime, 0x03d4, 0xe317);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0f02);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03c4);
  outPort16(runtime, 0x03c4, 0x0f02);

  const videoOffset = (0xa0000 - memory.read32(0x18)) >>> 0;
  clearEsDwords(executionRuntime, videoOffset, 0x3e80, writeEs32);
  fn_619a3(executionRuntime, { callDosVector28 });
  fn_2852b(executionRuntime);
  cpu.set('esi', 0x60edd);
  cpu.set('ecx', 0x10);
  setLowByte(cpu, 'eax', 0);
  fn_28510(executionRuntime);

  setLowWord(cpu, 'edx', 0x03c8);
  setLowByte(cpu, 'eax', 0x20);
  outPort(runtime, 0x03c8, 0x20);
  setLowWord(cpu, 'edx', 0x03c9);
  cpu.set('ecx', 0xc0);
  setLowByte(cpu, 'eax', 0x3f);
  for (let count = 0; count < 0xc0; count += 1) outPort(runtime, 0x03c9, 0x3f);

  memory.write32(0x60ec1, 0);
  memory.write32(0x60ec5, 0);
  memory.write32(0x21954, 0);
  memory.write32(0x21958, 0);
  memory.write32(0x60ecd, 0x3e80);
  cpu.set('eax', 0x5000);
  fn_1189(executionRuntime);
  if (cpu.carry) {
    required(adapters, 'allocationFailure')(executionRuntime);
    return { transferred: true, reason: 'allocation-failure-branch' };
  }

  memory.write32(0x60ebd, cpu.get('eax'));
  cpu.set('edi', cpu.get('eax'));
  cpu.set('ebp', cpu.get('eax'));
  cpu.set('eax', 0);
  cpu.set('ecx', 0x1400);
  for (let count = 0; count < 0x1400; count += 1) {
    writeEs32(runtime, cpu.get('edi'), 0);
    cpu.set('edi', (cpu.get('edi') + 4) >>> 0);
    cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
  }

  cpu.set('edi', (memory.read32(0x60ebd) + 0x24) >>> 0);
  setLowByte(cpu, 'edx', 0x20);
  for (const character of [0x6a, 0x61, 0x6d, 0x6d]) {
    setLowByte(cpu, 'eax', character);
    // fn_5ef7f uses the caller's DS:EDI and preserves GPRs.
    fn_5ef7f(executionRuntime);
    cpu.set('edi', (cpu.get('edi') + 8) >>> 0);
  }

  memory.write32(0x60ec9, 0xfffec780);
  for (;;) {
    waitForTickChange(executionRuntime, timerInterruptCheckpoint);
    writeCubeScenePalette(executionRuntime);
    adapters.beforeRender?.(executionRuntime);
    callFn6167a(executionRuntime);
    adapters.afterRender?.(executionRuntime);
    const afterRender = finishCubeSceneFrame(executionRuntime, { outPort16, writeEs32 });
    // The VGA display page changes only after fn_6167a has filled the draw
    // page and fn_61600 has selected it. Let the continuous host switch its
    // presentation source at that stable boundary, rather than at the timer
    // wait before this scene's first completed frame.
    adapters.afterFrame?.(executionRuntime, afterRender);
    if (afterRender.sceneCompleted) break;

    setLowByte(cpu, 'eax', executionRuntime.in8(0x60));
    if ((cpu.get('eax') & 0xff) === 1) break;
  }

  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0f02);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03c4);
  outPort16(runtime, 0x03c4, 0x0f02);
  clearEsDwords(executionRuntime, videoOffset, 0xfa0, writeEs32);
  cpu.interruptsEnabled = false;
  cpu.set('edx', 0x20d51);
  setLowByte(cpu, 'ebx', 0);
  callDosVector28(executionRuntime);
  cpu.interruptsEnabled = true;
  return { transferred: false };
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_61a47 = instrumentLift('0x61a47', 'fn_61a47', __coverage_impl_fn_61a47);
