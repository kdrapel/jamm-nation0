import { fn_1189 } from './allocator.mjs';
import { fn_28510, fn_2852b, fn_28559, fn_2858b } from './vga-helpers.mjs';
import { fn_216be } from './timing-helper.mjs';
import { fn_3e529 } from './effect-helper.mjs';

const u32 = n => n >>> 0;
const s32 = n => n | 0;
const requireAdapter = (adapters, key) => {
  if (typeof adapters?.[key] !== 'function') throw new TypeError(`fn_3e1f0 requires ${key} adapter`);
  return adapters[key];
};

// Original event-consumption block at 0x3e48b..0x3e505. Capture-resume
// diagnostics use this same translated state update after a helper surface;
// the downstream per-pixel transform remains a separate operation.
export function consumeFn3e1f0FrameEvents(runtime) {
  const { memory } = runtime;
  let ecx = memory.read32(0x21954);
  const pendingEvents = ecx;
  memory.write32(0x21954, 0);
  let eventsConsumed = 0;
  if (ecx !== 0) {
    while (ecx !== 0) {
      eventsConsumed += 1;
      memory.write16(0x3d6d8, (memory.read16(0x3d6d8) + 0xa) & 0xffff);
      memory.write32(0x3d6cc, u32(memory.read32(0x3d6cc) + 0x10));
      let eax = memory.read32(0x2298c + ((memory.read32(0x3d6cc) & 0xfff) * 4));
      eax = (eax >> 5) + 0x1000;
      memory.write16(0x3d6f6, eax & 0xffff);
      if (memory.read32(0x21958) <= 0x40) {
        memory.write8(0x3d6cb, (memory.read8(0x3d6cb) - 1) & 0xff);
        if ((memory.read8(0x3d6cb) & 0x80) !== 0) memory.write8(0x3d6cb, 0);
      }
      if (memory.read32(0x21958) >= 0x276) {
        memory.write8(0x3d6cb, (memory.read8(0x3d6cb) + 1) & 0xff);
        if (memory.read8(0x3d6cb) > 0x40) return { pendingEvents, eventsConsumed, sceneCompleted: true };
      }
      memory.write32(0x3d6d0, u32(memory.read32(0x3d6d0) + 0x19));
      memory.write32(0x3d6d4, u32(memory.read32(0x3d6d4) - 0x1e));
      ecx = u32(ecx - 1);
    }
    // Original 0x3e4f4 branches to the scene exit only from the
    // tick>=0x276 arm above. A phase byte already above 0x40 must not end the
    // scene while the timer is still in its initial/early range.
  }
  return { pendingEvents, eventsConsumed, sceneCompleted: false };
}

// Translated body for the per-frame texture transform at 0x3e318..0x3e48b.
// The original code uses two immediate lookup bases that are patched at
// runtime; callers may provide them from same-capture code bytes.
export function renderFn3e1f0Frame(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const readLookupByte = adapters.readLookupByte ?? ((address) => memory.read8(address));
  const savedAngle = memory.read16(0x3d700);
  memory.write32(0x3d6f8, 0x50);
  let edi = u32(0xa0c80 - memory.read32(0x18));
  memory.write32(0x3cfa0 + 0x59c, memory.read32(0x3d6e2));
  memory.write32(0x3cfa0 + 0x5a2, memory.read32(0x3d702));
  // These DS fields alias the two original absolute operands at runtime
  // 0x3d53c/0x3d542 (static 0x3e43c/0x3e442). The x86 stores above patch the
  // operands before the first texture read; sampling a cached value from the
  // unpatched executable would dereference the 0x12345678 placeholder.
  const lookupBaseA = (adapters.lookupBaseA ?? memory.read32(0x3d53c)) >>> 0;
  const lookupBaseB = (adapters.lookupBaseB ?? memory.read32(0x3d542)) >>> 0;

  while (memory.read32(0x3d6f8) !== 0) {
    // 0x3e44f/0x3e459 advance the self-modified lookup operands each row.
    const row = 0x50 - memory.read32(0x3d6f8);
    const rowLookupA = u32(lookupBaseA + row * 0x100);
    const rowLookupB = u32(lookupBaseB + row * 0xa0);
    let ebx = memory.read16(0x3d6d8) & 0xfff;
    let edx = Math.imul(memory.read32(0x2198c + ebx * 4), 0x12c) >> 16;
    edx = (edx + 0x14a + memory.read32(0x3d6da)) | 0;
    ebx = memory.read16(0x3d6f6) & 0xfff;
    let eax = s32(Math.imul(memory.read32(0x2198c + ebx * 4), edx) >> 8);
    memory.write32(0x3d6e6, eax);
    eax = s32(Math.imul(memory.read32(0x2298c + ebx * 4), edx) >> 8);
    memory.write32(0x3d6ea, eax);

    let left = s32(memory.read32(0x3d6f8) - 0x32);
    let p1 = Math.imul(left, s32(memory.read32(0x3d6e6)));
    let p2 = Math.imul(-0x50, s32(memory.read32(0x3d6ea)));
    let rotated = u32(p1 + p2);
    rotated = ((rotated << 16) | (rotated >>> 16)) >>> 0;
    memory.write32(0x3d6ee, rotated);
    left = s32(memory.read32(0x3d6f8) - 0x32);
    p1 = Math.imul(left, s32(memory.read32(0x3d6ea)));
    p2 = Math.imul(-0x50, s32(memory.read32(0x3d6e6)));
    rotated = u32(p2 - p1); // SUB EAX,EBX at 0x3e3e1.
    rotated = ((rotated << 16) | (rotated >>> 16)) >>> 0;
    memory.write32(0x3d6f2, rotated);

    let esi = memory.read32(0x3d6ea);
    esi = ((esi << 16) | (esi >>> 16)) >>> 0;
    const dl = esi & 0xff;
    esi = ((esi << 16) | (esi >>> 16)) >>> 0;
    let height = memory.read32(0x3d6e6);
    height = ((height << 16) | (height >>> 16)) >>> 0;
    const dh = height & 0xff; // MOV DH,CL at 0x3e403.
    let ecx = height & 0xffff0000;
    memory.write32(0x3d6de, cpu.get('esp'));
    let ebp = 0, eax2 = 0, ebx2 = 0;
    cpu.interruptsEnabled = false;
    ebx2 = ((memory.read8(0x3d6ee) << 8) | memory.read8(0x3d6f2)) >>> 0;
    let esp = 0x9f;
    [ecx, esp] = [esp, ecx];
    for (;;) {
      const bp = (ebp + (esi & 0xffff)) & 0xffff;
      ebp = u32((ebp & 0xffff0000) | bp);
      const bh = ((ebx2 >>> 8) + dl + (bp < (esi & 0xffff) ? 1 : 0)) & 0xff;
      ebx2 = ((ebx2 & 0xffff00ff) | (bh << 8)) >>> 0;
      const beforeEbp = ebp;
      ebp = u32(ebp + esp);
      const carry = ebp < beforeEbp ? 1 : 0;
      const bl = ((ebx2 & 0xff) + dh + carry) & 0xff;
      ebx2 = (ebx2 & 0xffffff00) | bl;
      eax2 = (eax2 & 0xffff0000) | memory.read16(0x3d706 + ebx2 * 2);
      const first = readLookupByte(u32(rowLookupA + eax2 + ecx * 2), runtime) & 0xff;
      const al = (first + (readLookupByte(u32(rowLookupB + ecx), runtime) & 0xff)) & 0xff;
      eax2 = (eax2 & 0xffff0000) | (al * 0x101);
      memory.write16(u32(edi + ecx * 2), eax2 & 0xffff);
      ecx = u32(ecx - 1);
      if ((ecx & 0x80000000) !== 0) break;
    }
    memory.write32(0x3cfa0 + 0x59c, u32(memory.read32(0x3cfa0 + 0x59c) + 0x100));
    memory.write32(0x3cfa0 + 0x5a2, u32(memory.read32(0x3cfa0 + 0x5a2) + 0xa0));
    cpu.set('esp', memory.read32(0x3d6de));
    cpu.interruptsEnabled = true;
    edi = u32(edi + 0x140);
    memory.write16(0x3d700, (memory.read16(0x3d700) - 7) & 0xffff);
    memory.write32(0x3d6f8, u32(memory.read32(0x3d6f8) - 1));
  }
  memory.write16(0x3d700, savedAngle);
  return { address: u32(0xa0c80 - memory.read32(0x18)), width: 320, height: 80, bytes: 320 * 80, lookupBaseA, lookupBaseB };
}

// Mechanical translation of 0x3e1f0..0x3e528. The mouse driver, ES mapping,
// and changing frame/event state remain explicit adapters or runtime state.
function __coverage_impl_fn_3e1f0(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const interrupt33 = requireAdapter(adapters, 'interrupt33');
  const readLookupByte = adapters.readLookupByte ?? ((address) => memory.read8(address));
  const frameCheckpoint = requireAdapter(adapters, 'frameCheckpoint');
  const writeEs32 = adapters.writeEs32 ?? ((offset, value) => runtime.writeEs32(offset, value));

  cpu.set('eax', 0x3e80); fn_1189(runtime);
  memory.write32(0x3d702, cpu.get('eax'));
  cpu.set('eax', 0x20000); fn_1189(runtime);
  memory.write32(0x3d6e2, cpu.get('eax'));
  let edi = cpu.get('eax') >>> 0;
  let esi = memory.read32(0x21960);
  // Two 0x4000-dword copies fill the allocated 0x20000-byte span.
  for (let i = 0; i < 0x4000; i++) writeEs32(u32(edi + 4 * i), memory.read32(esi + 4 * i));
  edi = u32(edi + 0x4000 * 4);
  esi = memory.read32(0x21960);
  for (let i = 0; i < 0x4000; i++) writeEs32(u32(edi + 4 * i), memory.read32(esi + 4 * i));

  // 256x256 packed table. The signed IMUL / SHRD sequence extracts product
  // bits 16..31, then the first coordinate is narrowed to a byte.
  for (let bx = 0; bx < 0x10000; bx++) {
    let ecx = ((bx & 0xff) << 4) & 0xfff;
    let product = Math.imul(0x40, memory.read32(0x2198c + ecx * 4) | 0);
    const low = (product >>> 16) & 0xff;
    ecx = (((bx >>> 8) & 0xff) << 4) & 0xfff;
    product = Math.imul(0x40, memory.read32(0x2298c + ecx * 4) | 0);
    const high = ((product >>> 16) & 0xffff) & 0xff;
    const ax = ((((high + 0x40) & 0xff) << 8) | low) >>> 0;
    memory.write16(0x3d706 + bx * 2, ax);
  }

  memory.write16(0xe0, 0x13);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x10);
  interrupt33(0x33, runtime);
  cpu.set('edx', 0x3d4); cpu.set('eax', 0x4309); runtime.out16(0x3d4, 0x4309);
  cpu.set('esi', 0x5da06); cpu.set('ecx', 0xff); cpu.set('eax', 0);
  fn_28510(runtime);
  fn_28559(runtime, { index: 0xff, red: 0, green: 0, blue: 0 });
  fn_216be(runtime);
  memory.write32(0x21954, 0); memory.write32(0x21958, 0);
  cpu.set('edi', 0x5d706); cpu.set('ecx', 0x100); cpu.set('eax', 0);
  fn_2858b(runtime);

  let frame = 0;
  while (true) {
    fn_2852b(runtime);
    let ebx = memory.read8(0x3d6cb);
    if (ebx !== 0) {
      const shiftCarry = (ebx & 0x40) !== 0; // SHL BL,2: CF is old bit 6.
      ebx = (ebx << 2) & 0xff;
      if (shiftCarry) ebx = 0xff;
      ebx = (~ebx) & 0xff;
      let esi = 0x5d706;
      runtime.out8(0x3c8, 0);
      for (let i = 0; i < 0x300; i++) {
        const al = memory.read8(esi++);
        const ax = al * ebx;
        runtime.out8(0x3c9, (ax >>> 8) & 0xff);
      }
    }
    fn_3e529(runtime);
    const transformedSurface = renderFn3e1f0Frame(runtime, {
      lookupBaseA: adapters.lookupBaseA,
      lookupBaseB: adapters.lookupBaseB,
      readLookupByte,
    });
    edi = transformedSurface.address;
    const events = consumeFn3e1f0FrameEvents(runtime);
    if (events.sceneCompleted) break;
    frameCheckpoint(runtime, ++frame);
  }

  edi = u32(0xa0000 - memory.read32(0x18));
  cpu.set('edi', edi); cpu.set('ecx', 0x3e80); cpu.set('eax', 0);
  for (let i = 0; i < 0x3e80; i++) writeEs32(edi + i * 4, 0);
  cpu.set('eax', 0x4109); cpu.set('edx', 0x3d4); runtime.out16(0x3d4, 0x4109);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_3e1f0 = instrumentLift('0x3e1f0', 'fn_3e1f0', __coverage_impl_fn_3e1f0);
