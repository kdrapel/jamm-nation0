import { fn_1189 } from './allocator.mjs';
import { fn_216be } from './timing-helper.mjs';
import { fn_28510, fn_2852b } from './vga-helpers.mjs';
import { fn_64471 } from './fn-64471.mjs';
import { fn_644e8 } from './fn-644e8.mjs';
import { fn_645bd } from './fn-645bd.mjs';
import { fn_64b19 } from './fn-64b19.mjs';

const u32 = value => value >>> 0;
const s16 = value => (value << 16) >> 16;

function required(adapters, name) {
  if (typeof adapters?.[name] !== 'function') throw new TypeError(`fn_6424a requires the ${name} adapter`);
  return adapters[name];
}

function setAl(cpu, value) { cpu.set('eax', (cpu.get('eax') & 0xffffff00) | (value & 0xff)); }
function setAx(cpu, value) { cpu.set('eax', (cpu.get('eax') & 0xffff0000) | (value & 0xffff)); }

function allocateAndClearEs(runtime, slotAddress) {
  const { cpu, memory } = runtime;
  cpu.set('eax', 0xfa04);
  fn_1189(runtime);
  const base = u32((cpu.get('eax') + 4) & 0xfffffffc);
  memory.write32(slotAddress, base);
  if (slotAddress === 0x63346) memory.write32(0x60f7c, base);
  // PUSH EDI/ECX/EAX and POP restore these registers around REP STOSB.
  for (let i = 0; i < 0xfa00; i += 1) runtime.writeEs8(base + i, 0);
  cpu.set('eax', base);
}

function blurBuffer(runtime) {
  const { cpu, memory } = runtime;
  let esi = u32(memory.read32(0x60f7c) + 0x1540);
  let ecx = 0x67c0;
  let ebx = 0;
  let eax = 0;
  while (ecx !== 0) {
    const dl = memory.read8(esi + 1);
    let al = memory.read8(esi - 1);
    al = (al + dl) & 0xff;
    al = (al + memory.read8(esi - 0x140)) & 0xff;
    ebx = (ebx & 0xffffff00) | memory.read8(esi);
    al = (al + (ebx & 0xff)) & 0xff;
    let ah = ebx & 0xff;
    ah = (ah + memory.read8(esi + 2)) & 0xff;
    ah = (ah + memory.read8(esi - 0x13f)) & 0xff;
    ah = (ah + dl) & 0xff;
    eax = ((ah << 8) | al) & 0xffff;
    eax = ((eax & 0xfffffcfc) >>> 2) >>> 0;
    memory.write16(esi, eax);
    esi = u32(esi + 2);
    ecx = (ecx - 1) >>> 0;
  }
  cpu.set('esi', esi);
  cpu.set('ecx', ecx);
  cpu.set('ebx', ebx);
  cpu.set('eax', eax);
}

function copyRowsToEs(runtime) {
  const { cpu, memory } = runtime;
  let edi = u32(0xa1900 - memory.read32(0x18));
  let esi = u32(memory.read32(0x60f7c) + 0x1900);
  let ebx = 0xa0;
  let ecx = 0x4f;
  while (ebx !== 0) {
    let count = ecx;
    while (count !== 0) {
      runtime.writeEs32(edi, memory.read32(esi));
      esi = u32(esi + 4);
      edi = u32(edi + 4);
      count -= 1;
    }
    esi = u32(esi + 4);
    edi = u32(edi + 4);
    ebx = (ebx - 1) >>> 0;
  }
  cpu.set('edi', edi);
  cpu.set('esi', esi);
  cpu.set('ebx', ebx);
  cpu.set('ecx', 0);
}

function clearEsFrame(runtime) {
  const { cpu, memory } = runtime;
  let edi = memory.read32(0x60f7c);
  let count = 0x3e80;
  while (count !== 0) {
    runtime.writeEs32(edi, 0);
    edi = u32(edi + 4);
    count -= 1;
  }
  cpu.set('edi', edi);
  cpu.set('ecx', 0);
  cpu.set('eax', 0);
}

// Exact per-frame operations from the translated fn_6424a loop. Capture-resume
// adapters reuse these helpers when their checkpoint begins inside the loop.
export function prepareFn6424aFrame(runtime) {
  const { memory } = runtime;
  fn_2852b(runtime);
  let esiPalette = 0x63c41;
  let bx = memory.read8(0x63c3b);
  let ax = memory.read16(0x63c3c);
  ax = (ax << 2) & 0xffff;
  bx = (bx + ax) & 0xffff;
  let ecxPalette = 0xbd;
  runtime.out8(0x3c8, 1);
  while (ecxPalette !== 0) {
    const al = memory.read8(esiPalette);
    esiPalette = u32(esiPalette + 1);
    const product = al * bx;
    ax = (product >>> 8) & 0xffff;
    runtime.out8(0x3c9, ax >= 0x40 ? 0x3f : ax & 0xff);
    ecxPalette -= 1;
  }

  blurBuffer(runtime);
  copyRowsToEs(runtime);
  if (memory.read32(0x21958) <= 0x29e) clearEsFrame(runtime);
}

// The original caller consumes event counts only after transformation and
// rasterization. Return true at its original scene-exit condition.
export function finishFn6424aFrame(runtime) {
  const { cpu, memory } = runtime;
  let pending = memory.read32(0x21954);
  memory.write32(0x21954, 0);
  cpu.set('ecx', pending);
  while (pending !== 0) {
    let timer = (memory.read16(0x63c3c) - 1) & 0xffff;
    if (s16(timer) < 0) timer = 0;
    memory.write16(0x63c3c, timer);
    pending = (pending - 1) >>> 0;
  }
  cpu.set('ecx', 0);

  if (memory.read32(0x21958) > 0x488) {
    cpu.setCarry(false);
    return true;
  }
  memory.write32(0x63f46, u32(memory.read32(0x63f46) + 8));
  return false;
}

// 0x6424a..0x64468. The DOS mouse interrupt is an explicit host boundary;
// ES buffer writes resolve through runtime.segments.esBase. VGA retrace and
// PIT effects remain the imported raw helpers, so absent hardware transitions
// the corresponding polling loops remain unbounded as in the executable.
function __coverage_impl_fn_6424a(runtime, adapters = {}) {
  const interrupt33 = required(adapters, 'interrupt33');
  const { cpu, memory } = runtime;

  memory.write16(0xe0, 0x13);
  setAl(cpu, 0x10);
  interrupt33(runtime, 0x33);
  fn_2852b(runtime);
  cpu.set('esi', 0x63c3e);
  cpu.set('ecx', 0x40);
  setAl(cpu, 0);
  fn_28510(runtime);

  allocateAndClearEs(runtime, 0x63342);
  allocateAndClearEs(runtime, 0x63346);

  let ebx = 0x2bc;
  let ecx = 0x4b;
  let edi = 0x60f80;
  let esi = 0;
  do {
    let ebp = 0x0f;
    // The original outer-loop back edge targets 0x642cc, which reloads
    // ESI=0x60f40 for each row while EDI continues across the output table.
    esi = 0x60f40;
    cpu.set('ebx', ebx);
    cpu.set('ecx', ecx);
    cpu.set('edi', edi);
    cpu.set('esi', esi);
    cpu.set('ebp', ebp);
    if (ecx === 0x4b && ebp === 0x0f) adapters.pointTableStage?.(runtime, 'begin');
    fn_64b19(runtime);
    setAx(cpu, cpu.get('eax') & 0xfff);
    memory.write16(0x63340, cpu.get('eax'));

    fn_64b19(runtime);
    let ax = cpu.get('eax') & 0x1ff;
    ax = (Math.imul(ax, 0x0b) >>> 0) & 0xffff;
    ax = (ax >>> 4) & 0xffff;
    ax = (ax - 0xb0) & 0xffff;
    memory.write16(0x6333e, ax);

    // Original 0x64300 runs once per row, before the 15-point loop; its AX
    // offset is reused for every point in this row.
    fn_64b19(runtime);
    ax = cpu.get('eax') & 0x1ff;
    ax = (Math.imul(ax, 0x0b) >>> 0) & 0xffff;
    ax = ((ax >>> 4) - 0xb0) & 0xffff;

    do {
      let edx = memory.read32(esi);
      edx = (edx & 0xffff0000) | ((edx + ax) & 0xffff);
      edx = ((edx << 16) | (edx >>> 16)) >>> 0;
      edx = (edx & 0xffff0000) | ((edx + memory.read16(0x6333e)) & 0xffff);
      cpu.set('edx', edx);
      fn_64471(runtime);
      memory.write32(edi, cpu.get('edx'));
      edi = u32(edi + 4);
      esi = u32(esi + 4);
      ebp = (ebp - 1) >>> 0;
      cpu.set('edi', edi);
      cpu.set('esi', esi);
      cpu.set('ebp', ebp);
    } while (ebp !== 0);

    memory.write16(edi, ebx);
    ebx = u32(ebx - 9);
    edi = u32(edi + 0x3e);
    ecx = (ecx - 1) >>> 0;
  } while (ecx !== 0);
  cpu.set('ebx', ebx);
  cpu.set('ecx', ecx);
  cpu.set('edi', edi);
  cpu.set('esi', esi);
  adapters.pointTableStage?.(runtime, 'complete');

  fn_216be(runtime);
  memory.write32(0x21958, 0);
  memory.write32(0x21954, 0);

  let frameNumber = 0;
  for (;;) {
    const currentFrame = frameNumber + 1;
    adapters.frameStage?.(runtime, currentFrame, 'begin');
    prepareFn6424aFrame(runtime);
    adapters.frameStage?.(runtime, currentFrame, 'prepared');
    fn_644e8(runtime);
    adapters.frameStage?.(runtime, currentFrame, 'transformed');
    fn_645bd(runtime);
    adapters.frameStage?.(runtime, currentFrame, 'rasterized');
    const sceneCompleted = finishFn6424aFrame(runtime);
    adapters.frameStage?.(runtime, currentFrame, 'finished', sceneCompleted);
    adapters.afterFrame?.(runtime, ++frameNumber, sceneCompleted);
    if (sceneCompleted) break;
  }
  cpu.setCarry(false); // final unsigned CMP is strictly greater
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_6424a = instrumentLift('0x6424a', 'fn_6424a', __coverage_impl_fn_6424a);
