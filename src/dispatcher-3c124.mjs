import { fn_1189 } from './allocator.mjs';
import { fn_1295 } from './dos-slots.mjs';
import { fn_3731f } from './cube-geometry-helpers.mjs';
import { fn_3734f } from './cube-animation-state.mjs';
import { fn_372bc } from './cube-phase-helpers.mjs';
import { fn_377d4 } from './cube-record-generator.mjs';
import { fn_37963 } from './cube-setup.mjs';
import { fn_3798b } from './record-allocation-setup.mjs';
import { fn_216be } from './timing-helper.mjs';
import { fn_2852b, fn_28542, fn_28559, fn_28574 } from './vga-helpers.mjs';
import { fn_380e8 } from './cube-controller.mjs';

const u32 = value => value >>> 0;
function requireAdapter(adapters, name) {
  if (typeof adapters[name] !== 'function') throw new TypeError(`fn_3c124 requires ${name} adapter`);
  return adapters[name];
}

// One pass beginning at the main loop head (0x3c2b1). Capture-resume runners
// use this only when the same checkpoint supplies the self-patched operands,
// segment state, and memory read by the pass.
export function resumeFn3c124FrameIteration(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const readLookup16 = requireAdapter(adapters, 'readLookup16');
  const u16 = value => value & 0xffff;
  let eax;
  let esi;
  let edi;
  if (memory.read8(0x3b4bd) !== 0xff) {
    fn_2852b(runtime);
    esi = 0x3b0b9;
    cpu.set('ecx', 0x180);
    cpu.set('edx', 0x3c8);
    runtime.out8(0x3c8, 0);
    cpu.set('edx', 0x3c9);
    eax = 0;
    for (let i = 0; i < 0x180; i += 1) {
      const bl = memory.read8(0x3b4bd);
      const source = memory.read8(esi++);
      eax = (Math.imul(source, bl) >>> 0) >>> 8;
      runtime.out8(0x3c9, eax & 0xff);
    }
  }

  edi = u32(0xa0000 - memory.read32(0x18));
  esi = memory.read32(0x32394);
  for (let i = 0; i < 0x3e80; i += 1) { runtime.writeEs32(edi, memory.read32(esi)); edi = u32(edi + 4); esi = u32(esi + 4); }
  edi = memory.read32(0x32394);
  esi = memory.read32(0x3b0b8);
  for (let i = 0; i < 0x3e80; i += 1) { runtime.writeEs32(edi, memory.read32(esi)); edi = u32(edi + 4); esi = u32(esi + 4); }

  edi = 0x3b4c0;
  let ebp = 0xfffff700;
  const ebx = memory.read16(0x3bdc1);
  const ecx = (0x1ff - ebx) >>> 0;
  let frameEax = 0;
  let frameEdx = 0;
  let frameEsi = 0;
  while (ebp !== 0) {
    const a = signed16(memory.read16(u32(ebp + 0x33392)));
    const first = BigInt.asIntN(64, BigInt(a) * BigInt(ebx));
    frameEsi = Number(BigInt.asIntN(32, first >> 9n));
    const b = signed16(memory.read16(u32(ebp + 0x34e92)));
    const second = BigInt.asIntN(64, BigInt(b) * BigInt(signed32(ecx)));
    frameEax = (Number(BigInt.asIntN(32, second >> 9n)) + frameEsi) | 0;
    frameEdx = Number(BigInt.asUintN(32, second >> 32n));
    runtime.writeEs16(edi, frameEax);
    edi = u32(edi + 2);
    ebp = u32(ebp + 2);
  }
  memory.write32(0x3b485, u32(memory.read32(0x3611a) + 0x900));
  // 0x3b494 is an in-image self-modified lookup displacement carried across
  // iterations in the original. On the first entry to this scene, there is
  // no previous iteration to have patched it, so initialize the operand from
  // the same scene-owned source used by the loop epilogue below.
  memory.write32(0x3b494, u32(memory.read32(0x360e2) + 0x900));

  edi = memory.read32(0x36152);
  ebp = 0xfffff700;
  const lookupBase0 = memory.read32(0x3b485);
  const lookupBase1 = memory.read32(0x3b494);
  while (ebp !== 0) {
    const a = signed16(readLookup16(u32(ebp + lookupBase0), runtime));
    const first = BigInt.asIntN(64, BigInt(a) * BigInt(ebx));
    frameEsi = Number(BigInt.asIntN(32, first >> 9n));
    const b = signed16(readLookup16(u32(ebp + lookupBase1), runtime));
    const second = BigInt.asIntN(64, BigInt(b) * BigInt(signed32(ecx)));
    frameEax = (Number(BigInt.asIntN(32, second >> 9n)) + frameEsi) | 0;
    frameEdx = Number(BigInt.asUintN(32, second >> 32n));
    runtime.writeEs16(edi, frameEax);
    edi = u32(edi + 2);
    ebp = u32(ebp + 2);
  }
  memory.write32(0x3b494, u32(memory.read32(0x360e2) + 0x900));

  cpu.set('eax', frameEax);
  cpu.set('edx', frameEdx);
  cpu.set('ebx', ebx);
  cpu.set('ecx', ecx);
  cpu.set('esi', frameEsi);
  cpu.set('edi', edi);
  cpu.set('ebp', ebp);
  return { exitRequested: memory.read16(0x361f4) === 0xff, eax: frameEax, edx: frameEdx, ebx, ecx, esi: frameEsi, edi, ebp };
}

// Raw dispatcher body 0x3c124..0x3c3bc. ES accesses remain segment-relative,
// the DOS vector and INT 33h are callbacks, and fn_37732's role stays opaque.
function __coverage_impl_fn_3c124(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const callDosVector = requireAdapter(adapters, 'callDosVector');
  const interrupt33 = requireAdapter(adapters, 'interrupt33');
  const readLookup16 = requireAdapter(adapters, 'readLookup16');
  const frameCheckpoint = requireAdapter(adapters, 'frameCheckpoint');
  const call37732 = adapters.call37732;
  const callEventHandler = adapters.callEventHandler;
  const u16 = value => value & 0xffff;

  memory.write32(0x2cb1c, 0);
  cpu.set('eax', 0xfa04);
  fn_1189(runtime);
  let eax = u32((cpu.get('eax') + 4) & 0xfffffffc);
  memory.write32(0x3b0b8, eax);

  let esi = u32(memory.read32(0x21964) + 0x64f0);
  let edi = eax;
  for (let row = 0; row < 0x32; row += 1) {
    for (let column = 0; column < 0x50; column += 1) {
      let al = ((memory.read8(esi++) >>> 1) + 0x21) & 0xff;
      const packed = (al | (al << 8)) >>> 0;
      for (let copy = 0; copy < 4; copy += 1) runtime.writeEs32(u32(edi + copy * 0x140), packed | (packed << 16));
      edi = u32(edi + 4);
    }
    esi = u32(esi + 0xf0);
    edi = u32(edi + 0x3c0);
  }

  edi = memory.read32(0x3b0b8);
  for (let count = 0; count < 0x50; count += 1) {
    runtime.writeEs32(edi, 0xffffffff);
    edi = u32(edi + 4);
  }

  cpu.set('edx', memory.read32(0x2195c));
  fn_1295(runtime);
  cpu.set('edx', u32(cpu.get('edx') + memory.read32(0x18)));
  callDosVector(runtime, { vector: 0x30, callSite: 0x3c1b3 });
  memory.write16(0x32388, cpu.get('eax'));

  memory.write32(0x361f0, 0x36231);
  fn_3731f(runtime);
  fn_37963(runtime);
  edi = 0x3b4c0;
  esi = memory.read32(0x360ca);
  for (let i = 0; i < 0x480; i += 1) {
    runtime.writeEs16(edi, memory.read16(esi));
    edi = u32(edi + 2); esi = u32(esi + 2);
  }
  memory.write16(0x3616a, 0);
  memory.write32(0x36172, 0x3613a);

  for (const record of [0x360ca, 0x36102]) {
    cpu.set('esi', record);
    fn_3798b(runtime);
    cpu.set('esi', record);
    fn_3734f(runtime, { callEventHandler });
    cpu.set('esi', record); // POP ESI surrounding fn_3734f.
    fn_372bc(runtime);
    cpu.set('esi', record);
    fn_377d4(runtime, { call37732 });
  }
  cpu.set('esi', 0x3613a);
  fn_3798b(runtime);
  cpu.set('esi', 0x3613a);
  fn_3734f(runtime, { callEventHandler });
  cpu.set('esi', 0x3613a); // POP ESI surrounding fn_3734f.
  fn_377d4(runtime, { call37732 });

  memory.write16(0xe0, 0x13);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x10);
  interrupt33(runtime, { callSite: 0x3c24e });
  fn_216be(runtime);
  fn_2852b(runtime);
  fn_28574(runtime);
  memory.write32(0x21954, 0);
  memory.write32(0x21958, 0);
  memory.write8(0x3b4bd, 0);
  const fade = memory.read16(0x3b0bf);
  memory.write16(0x3b0bc, fade);
  memory.write16(0x3b0bf, fade);
  const palette = memory.read8(0x3b0c1);
  memory.write8(0x3b0be, palette);
  memory.write8(0x3b0c1, palette);
  fn_28559(runtime, { index: 0xff, red: 0, green: 0, blue: 0 });
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0xff);
  fn_28542(runtime);

  let lastEax = 0, lastEdx = 0, lastEbx = 0, lastEcx = 0, lastEsi = 0, lastEdi = 0, lastEbp = 0;
  while (true) {
    const frame = resumeFn3c124FrameIteration(runtime, { ...adapters, readLookup16 });
    lastEax = frame.eax; lastEdx = frame.edx; lastEbx = frame.ebx; lastEcx = frame.ecx;
    lastEsi = frame.esi; lastEdi = frame.edi; lastEbp = frame.ebp;
    if (frame.exitRequested) break;
    fn_380e8(runtime, adapters);
    frameCheckpoint(runtime, { callSite: 0x3c3b2 });
  }

  cpu.set('edi', lastEdi);
  cpu.set('esi', lastEsi);
  cpu.set('ebp', lastEbp);
  cpu.set('ebx', lastEbx);
  cpu.set('ecx', lastEcx);
  cpu.set('eax', lastEax);
  cpu.set('edx', lastEdx);
  cpu.setCarry(false); // CMP word [0x361f4],0xff exits on equality.
  return runtime;
}

function signed16(value) { return (value << 16) >> 16; }
function signed32(value) { return value | 0; }

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_3c124 = instrumentLift('0x3c124', 'fn_3c124', __coverage_impl_fn_3c124);
