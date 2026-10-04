import { fn_1189 } from './allocator.mjs';
import { fn_28510, fn_2852b, fn_28574 } from './vga-helpers.mjs';
import { fn_60d8b, fn_60df8, fn_60e96, fn_60eda } from './table-transfer.mjs';

const u32 = value => value >>> 0;

function requireAdapter(adapters, key, address) {
  if (typeof adapters?.[key] !== 'function') throw new TypeError(`fn_6098c requires ${key} adapter for ${address}`);
  return adapters[key];
}

// Original exit block at 0x60d40..0x60d7a. Kept separate so a captured
// fn_6098c invocation can continue through the real cleanup and RET instead
// of stopping at the scene predicate.
export function runFn6098cExitEpilogue(runtime, { writeEs32 = (host, address, value) => host.writeEs32(address, value) } = {}) {
  const { cpu, memory } = runtime;
  fn_2852b(runtime);
  fn_28574(runtime);
  const edi = u32(0xa0000 - memory.read32(0x18));
  cpu.set('edi', edi);
  for (let i = 0; i < 0x3e80; i += 1) writeEs32(runtime, u32(edi + i * 4), 0);
  runtime.out16(0x3d4, 0x4109);
  let esi = memory.read32(0x21960);
  for (let i = 0; i < 0x10000; i += 1) {
    memory.write8(esi, ((memory.read8(esi) >>> 1) ^ 0x0f) & 0xff);
    esi = u32(esi + 1);
  }
  cpu.set('eax', 0);
  cpu.setOrFlags32(0); // Original XOR EAX,EAX at 0x60d59; LOOP preserves these flags.
  cpu.set('eax', 0x4109);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03d4);
  cpu.set('esi', esi);
  cpu.set('ecx', 0);
  cpu.set('edi', u32(edi + 0xfa00));
}

// Mechanical lift of 0x6098c..0x60d7a. ES/SS memory, the mouse interrupt, and
// the literal lookup table remain explicit host boundaries.
function __coverage_impl_fn_6098c(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const writeEs8 = requireAdapter(adapters, 'writeEs8', 'REP STOS/ES output');
  const writeEs32 = requireAdapter(adapters, 'writeEs32', 'REP STOS/ES output');
  const writeSs32 = requireAdapter(adapters, 'writeSs32', 'SS-relative framebuffer write at 0x60c75');
  const readSs16 = requireAdapter(adapters, 'readSs16', 'SS-relative palette-index loads in fn_60eda');
  const interrupt33 = requireAdapter(adapters, 'interrupt33', 'INT 33h at 0x60ae7');
  const readLookupByte = requireAdapter(adapters, 'readLookupByte', 'literal table 0x12345678 in fn_60e96');
  const frameCheckpoint = requireAdapter(adapters, 'frameCheckpoint', 'asynchronous frame/input state');
  const segmentRuntime = Object.create(runtime);
  segmentRuntime.writeEs8 = (offset, value) => writeEs8(runtime, offset, value);
  segmentRuntime.writeEs32 = (offset, value) => writeEs32(runtime, offset, value);

  // The six address-size-override ADD/AND instructions at entry access DS:0
  // and DS:8 as 32-bit values; preserve the original alignment sequence.
  memory.write32(0, u32(memory.read32(0) + 8) & 0xfffffffc);
  memory.write32(8, u32(memory.read32(8) + 8) & 0xfffffffc);

  cpu.set('eax', 0x2200); fn_1189(runtime);
  memory.write32(0x60030, cpu.get('eax'));
  let edi = cpu.get('eax') >>> 0;
  for (let i = 0; i < 0x500; i += 1) writeEs8(runtime, u32(edi + i), 0);
  edi = u32(edi + 0x500);

  let bx = 0;
  let ebp = 0xc0;
  while (ebp !== 0) {
    let dl = 0;
    for (let i = 0; i < 0x10; i += 1) {
      writeEs8(runtime, edi++, Math.imul(dl, bx & 0xff) >>> 8);
      dl = (dl + 1) & 0xff;
    }
    bx = (bx + 8) & 0xffff;
    if (bx > 0xff) bx = (bx & 0xff00) | 0xff;
    ebp -= 1;
  }
  let esi = u32(memory.read32(0x60030) + 0x6f0);
  let ebx = 0x20;
  while (ebx !== 0) {
    for (let i = 0; i < 0x10; i += 1) writeEs8(runtime, edi++, memory.read8(esi + i));
    // REP MOVSB advances ESI by 0x10 before the original SUB ESI,0x20;
    // net source stride is therefore -0x10, not -0x20.
    esi = u32(esi - 0x10);
    ebx -= 1;
  }
  for (let i = 0; i < 0x700; i += 1) writeEs8(runtime, edi++, 0);

  const allocate = (size, target) => {
    cpu.set('eax', size); fn_1189(runtime);
    const address = cpu.get('eax') >>> 0;
    memory.write32(target, address);
    return address;
  };
  const allocateAndZero = (size, target) => {
    const address = allocate(size, target);
    const save = { eax: cpu.get('eax'), ecx: cpu.get('ecx'), edi: cpu.get('edi') };
    for (let i = 0; i < size; i += 1) writeEs8(runtime, address + i, 0);
    cpu.set('eax', save.eax); cpu.set('ecx', save.ecx); cpu.set('edi', save.edi);
    return address;
  };
  allocateAndZero(0x3e80, 0x5fa74);
  allocateAndZero(0x3e80, 0x5fa78);
  allocate(0x10000, 0x5fa70);
  allocateAndZero(0x3e80, 0x5fa7c);
  allocateAndZero(0x3e80, 0x5fa80);
  const texture = allocate(0x10000, 0x5fa84);

  edi = texture;
  for (ebx = 0; ebx < 0x10000; ebx = (ebx + 1) & 0xffff) {
    const cx = (Math.imul(ebx & 0xff, 0x2d) + Math.imul((ebx >>> 8) & 0xff, 0xd2)) & 0xffff;
    const ch = Math.min(cx >>> 8, 0x0e);
    memory.write8(edi + ebx, ch);
    if (ebx === 0xffff) break;
  }

  memory.write16(0xe0, 0x13);
  // The byte multiply's last iteration is BX=0xffff: AX=0xd12e,
  // CX=0x0e01 after the CH clamp, then INC BX wraps it to zero.
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0xd110);
  cpu.set('ebx', 0);
  cpu.set('ecx', 0x0e01);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x2dd2);
  cpu.set('esi', u32(memory.read32(0x60030) + 0x4f0));
  cpu.set('edi', texture);
  cpu.set('ebp', 0);
  interrupt33(0x33, runtime);
  for (ebp = 0; ebp < 0x100; ebp += 1) {
    const low = ebp & 0x0f;
    const high = ebp >>> 4;
    const a = (low ^ 0x0f) * 3;
    const b = high * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = memory.read8(0x601b4 + a + channel) + memory.read8(0x60334 + b + channel);
      memory.write8(0x603f7 + ebp * 3 + channel, Math.min(value, 0x3f));
    }
  }
  cpu.set('esi', 0x603f7); cpu.set('ecx', 0x100); cpu.set('eax', 0);
  fn_28510(runtime);

  const target = memory.read32(0x5fa84);
  cpu.set('eax', target);
  memory.write32(0x5ffb0, target); memory.write32(0x5ffc4, target);
  // The raw byte stream contains an unconditional JMP-to-next at 0x60b77.
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x4309);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x03d4);
  runtime.out16(0x3d4, 0x4309);
  esi = memory.read32(0x21960);
  cpu.set('esi', esi); cpu.set('ecx', 0x10000);
  for (let i = 0; i < 0x10000; i += 1) {
    memory.write8(esi, ((memory.read8(esi) ^ 0x0f) << 1) & 0xff);
    esi = u32(esi + 1);
  }
  cpu.set('esi', esi); cpu.set('ecx', 0);
  memory.write32(0x21958, 0); memory.write32(0x21954, 0);

  for (;;) {
    fn_2852b(runtime);
    fn_60d8b(segmentRuntime);
    cpu.set('edi', memory.read32(0x5fa74)); fn_60eda(runtime, { readSs16 });
    fn_60df8(segmentRuntime);
    cpu.set('edi', memory.read32(0x5fa7c)); fn_60eda(runtime, { readSs16 });
    esi = memory.read32(0x5fa78); edi = memory.read32(0x5fa74);
    cpu.set('esi', esi); cpu.set('edi', edi);
    fn_60e96(runtime, { readLookupByte });
    esi = memory.read32(0x5fa80); edi = memory.read32(0x5fa7c);
    cpu.set('esi', esi); cpu.set('edi', edi);
    fn_60e96(runtime, { readLookupByte });

    esi = u32(memory.read32(0x5fa78) + 0x640);
    edi = u32(memory.read32(0x5fa80) + 0x640);
    cpu.set('esi', esi); cpu.set('edi', edi);
    ebp = u32(0xa0c80 - memory.read32(0x18));
    memory.write32(0x6001c, 0x50);
    let ecx = 0xffffff60;
    // loc_60C1F reloads EDX for *each* of the 80 output rows.  The inner
    // loop advances it by 0x500 while sampling one row of the 0x2200-byte
    // palette table; carrying that value into the next row walks off the
    // allocation and turns all but the first scanline into heap noise.
    const paletteRowBase = u32(memory.read32(0x60030) + (memory.read32(0x5fa88) << 4));
    let edx = paletteRowBase;
    let rowEbx = 0;
    let rowEax = 0;
    while (memory.read32(0x6001c) !== 0) {
      edx = paletteRowBase;
      for (ecx = 0xffffff60; ecx !== 0; ecx = u32(ecx + 2)) {
        const c = ecx | 0;
        const index = memory.read8(edi + c + 0xa1);
        const previous = memory.read8(esi + c + 0xa1);
        const upper = ((memory.read8(u32(edx + index)) << 4) | memory.read8(u32(edx + previous))) & 0xff;
        const index2 = memory.read8(edi + c + 0xa0);
        const previous2 = memory.read8(esi + c + 0xa0);
        rowEbx = previous2;
        const lower = ((memory.read8(u32(edx + index2)) << 4) | memory.read8(u32(edx + previous2))) & 0xff;
        const packed = (lower | (lower << 8) | (upper << 16) | (upper << 24)) >>> 0;
        rowEax = packed;
        writeSs32(runtime, ebp, packed);
        edx = u32(edx + 0x10); ebp = u32(ebp + 4);
      }
      edi = u32(edi + 0xa0); esi = u32(esi + 0xa0);
      memory.write32(0x6001c, u32(memory.read32(0x6001c) - 1));
    }
    cpu.set('eax', rowEax);
    cpu.set('ebx', rowEbx);
    cpu.set('ecx', 0);
    cpu.set('edx', edx);
    cpu.set('esi', esi);
    cpu.set('edi', edi);
    cpu.set('ebp', ebp);

    let pending = memory.read32(0x21954);
    memory.write32(0x21954, 0);
    if (pending !== 0) {
      for (;;) {
        if (memory.read32(0x21958) <= 0xc0 && memory.read32(0x5fa88) < 0xc0) {
          memory.write32(0x5fa88, u32(memory.read32(0x5fa88) + 1));
        }
        if (memory.read32(0x21958) >= 0x460) {
          memory.write32(0x5fa88, u32(memory.read32(0x5fa88) + 1));
          if (memory.read32(0x5fa88) >= 0x140) break;
        }
        memory.write32(0x5ffd6, u32(memory.read32(0x5ffd6) + 0x17));
        memory.write32(0x5fe83, u32(memory.read32(0x5fe83) + 0x0c));
        memory.write32(0x5fe87, u32(memory.read32(0x5fe87) + 0x16));
        const sum1 = memory.read16(0x5fe7b) + 0x8000;
        memory.write16(0x5fe7b, sum1);
        memory.write8(0x5fe80, memory.read8(0x5fe80) - (sum1 > 0xffff ? 1 : 0));
        const sum2 = memory.read16(0x5fe7d) + 0x8000;
        memory.write16(0x5fe7d, sum2);
        memory.write32(0x5fe7f, u32(memory.read32(0x5fe7f) + (sum2 > 0xffff ? 1 : 0)));
        memory.write32(0x60020, u32(memory.read32(0x60020) + 0x0b));
        memory.write32(0x60024, u32(memory.read32(0x60024) + 0x06));
        memory.write32(0x60028, u32(memory.read32(0x60028) + 0x15));
        memory.write32(0x6002c, u32(memory.read32(0x6002c) + 0x10));
        pending = u32(pending - 1);
        if (pending === 0) break;
      }
      if (memory.read32(0x5fa88) >= 0x140) break;
    }
    frameCheckpoint(runtime, 0x60baa);
  }

  runFn6098cExitEpilogue(runtime, { writeEs32 });
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_6098c = instrumentLift('0x6098c', 'fn_6098c', __coverage_impl_fn_6098c);
