import { fn_1189 } from './allocator.mjs';
import { fn_1295 } from './dos-slots.mjs';
import { fn_216be } from './timing-helper.mjs';
import { fn_28510, fn_2852b } from './vga-helpers.mjs';

const u32 = value => value >>> 0;

function required(adapters, name) {
  if (typeof adapters?.[name] !== 'function') {
    throw new TypeError(`fn_3d5d9 requires the ${name} adapter`);
  }
  return adapters[name];
}

function mul32(left, right) {
  const product = BigInt.asUintN(64,
    BigInt.asIntN(32, BigInt(left >>> 0)) * BigInt.asIntN(32, BigInt(right >>> 0)));
  return { eax: Number(product & 0xffffffffn), edx: Number((product >> 32n) & 0xffffffffn) };
}

function signed32(value) { return value | 0; }

function updateScale(memory, cpu) {
  const height = u32(0x80 - memory.read32(0x3ca8d));
  const ebx = (((height * 8) >>> 0) - 0x200) << 1;
  const index = (ebx >>> 0) & 0xfff;
  const { eax, edx } = mul32(0x46, memory.read32(0x2198c + index * 4));
  const scaled = ((((eax >>> 16) | (edx << 16)) >>> 0) + 0x46) >>> 0;
  const result = u32(0x8c - scaled);
  memory.write32(0x3ca91, result);
  cpu.set('eax', result);
  cpu.set('ebx', index);
}

// One asynchronous frame event from the translated fn_3d5d9 loop. The capture
// resume adapter uses this same state transition after delivering translated
// IRQ0; it does not assign event or phase globals directly.
export function advanceFn3d5d9Event(runtime) {
  const { memory, cpu } = runtime;
  memory.write16(0x3cdbc, memory.read16(0x3cdbc) + 0x10);
  memory.write8(0x3d2d9, memory.read8(0x3d2d9) - 1);
  let phase = memory.read32(0x21958);
  if (phase < 0x253) {
    // Preserve the original unsigned phase comparison.
  } else if (phase <= 0x2d3) {
    const old = memory.read8(0x3cdb9);
    const next = (old - 4) & 0xff;
    memory.write8(0x3cdb9, next);
    if (old < 4) memory.write8(0x3cdb9, 0);
  } else {
    memory.write8(0x3c6d6, 1);
    const next = (memory.read8(0x3cdb9) + 4) & 0xff;
    memory.write8(0x3cdb9, next);
    if (next < 4) memory.write8(0x3cdb9, 0xff);
  }
  if (memory.read8(0x3c6d6) === 1) memory.write32(0x3d2d8, 0x5e58);
  memory.write16(0x3cdb7, memory.read16(0x3cdb7) + 0x10);
  if (signed32(memory.read32(0x3ca8d)) > 0) memory.write32(0x3ca8d, memory.read32(0x3ca8d) - 1);
  phase = memory.read32(0x21958);
  if (phase <= 0x628 && memory.read32(0x3ca8d) === 0 && phase <= 0x200
    && memory.read8(0x3cdb9) !== 0xfe && memory.read16(0x1e432) >= 0x19) {
    memory.write8(0x3cdb9, memory.read8(0x3cdb9) + 2);
  }
  if (phase >= 0x628) {
    memory.write32(0x3ca8d, u32(memory.read32(0x3ca8d) + 2));
    if (memory.read32(0x3ca8d) > 0x80) {
      cpu.setCarry(false);
      return true;
    }
  }
  const oldCounter = memory.read16(0x3ca8b);
  memory.write16(0x3ca8b, oldCounter - 1);
  // 0x3d91d ADD word,-1 sets carry for every nonzero input; ADC at
  // 0x3d925 advances the sine lookup phase on those events.
  memory.write16(0x3c6d7, memory.read16(0x3c6d7) + (oldCounter !== 0 ? 1 : 0));
  if (memory.read16(0x3c6d7) >= 0x200) memory.write16(0x3c6d7, 0);
  return false;
}

export function updateFn3d5d9Scale(runtime) {
  updateScale(runtime.memory, runtime.cpu);
}

// Lift of the dispatcher target at 0x3d5d9..0x3d98a. Hardware/selector
// boundaries remain explicit while both direct rasterization helpers are
// translated below.
function __coverage_impl_fn_3d5d9(runtime, adapters = {}) {
  const interrupt33 = required(adapters, 'interrupt33');
  const hardwareCheckpoint = required(adapters, 'hardwareCheckpoint');
  const loadFsSelector = required(adapters, 'loadFsSelector');
  const readFs8 = required(adapters, 'readFs8');
  const rasterizerAdapters = {
    getGsSelector: required(adapters, 'getGsSelector'),
    loadGsSelector: required(adapters, 'loadGsSelector'),
    loadFsSelector,
    readGs8: required(adapters, 'readGs8'),
    readFs8,
    writeEs32ForSelector: required(adapters, 'writeEs32ForSelector'),
  };
  const dosVector30 = required(adapters, 'dosVector30');
  const { memory, cpu } = runtime;

  memory.write16(0xe0, 0x13);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x10);
  interrupt33(runtime, 0x33);

  let edi = 0x3c0d6;
  for (let count = 0; count < 0x100; count += 1) {
    let ebp = (count * 0x80) & 0xfff;
    const { eax, edx } = mul32(0x64, memory.read32(0x2198c + ebp * 4));
    const value = ((((eax >>> 16) | (edx << 16)) + 0x64) >>> 0) & 0xff;
    runtime.writeEs8(edi, value);
    edi = u32(edi + 1);
  }
  for (let count = 0; count < 0x100; count += 1) {
    const ebp = (count * 0x40) & 0xfff;
    const { eax, edx } = mul32(0x64, memory.read32(0x2198c + ebp * 4));
    const value = ((((eax >>> 16) | (edx << 16)) + 0x64) >>> 0) & 0xff;
    runtime.writeEs8(edi, value);
    edi = u32(edi + 1);
  }
  for (let index = 0; index < 0x100; index += 1) {
    runtime.writeEs8(edi + index, memory.read8(0x3c0d6 + index));
  }
  edi = u32(edi + 0x100);

  runtime.out16(0x3c4, 0x0604);
  runtime.out16(0x3d4, 0x0014);
  runtime.out16(0x3d4, 0xe317);
  runtime.out16(0x3c4, 0x0f02);
  edi = u32(0xa0000 - memory.read32(0x18));
  for (let count = 0; count < 0x3e80; count += 1) runtime.writeEs32(edi + count * 4, 0);

  fn_216be(runtime);
  fn_2852b(runtime);
  cpu.set('eax', cpu.get('eax') & 0xffffff00);
  cpu.set('ecx', 0x100);
  cpu.set('esi', 0x3bdd0);
  fn_28510(runtime);
  // The original pushes words 0xff and [0x3d700] for fn_28559. That helper
  // consumes the first four argument bytes as DAC index plus three colors.
  runtime.out8(0x3c8, 0xff);
  runtime.out8(0x3c9, 0);
  runtime.out8(0x3c9, memory.read8(0x3d700));
  runtime.out8(0x3c9, memory.read8(0x3d701));
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | memory.read8(0x3d701));
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x3c9);
  cpu.set('eax', memory.read32(0x21970));
  cpu.set('edx', cpu.get('eax'));
  fn_1295(runtime);
  cpu.set('edx', u32(cpu.get('edx') + memory.read32(0x18)));
  dosVector30(runtime);
  memory.write16(0x3c0d4, cpu.get('eax'));

  cpu.set('eax', 0xfa04);
  fn_1189(runtime);
  let allocation = u32(cpu.get('eax') + 4) & 0xfffffffc;
  memory.write32(0x3d2c8, allocation);
  cpu.set('eax', 0x10000);
  fn_1189(runtime);
  memory.write32(0x3cdbe, cpu.get('eax'));
  cpu.set('edx', u32(cpu.get('eax') + memory.read32(0x18)));
  fn_1295(runtime);
  dosVector30(runtime);
  memory.write16(0x3d2c4, cpu.get('eax'));
  memory.write32(0x21954, 0);
  memory.write32(0x21958, 0);

  for (;;) {
    allocation = memory.read32(0x3d2c8);
    for (let count = 0; count < 0x3e80; count += 1) runtime.writeEs32(allocation + count * 4, 0);
    fn_3dbd4(runtime, { loadFsSelector, readFs8 });
    fn_3d997(runtime, rasterizerAdapters);
    hardwareCheckpoint(runtime, 0x3d722);
    fn_2852b(runtime);

    edi = u32(0xa0fa0 - memory.read32(0x18));
    let esi = u32(memory.read32(0x3d2c8) + 0x3e80);
    for (let row = 0; row < 0x96; row += 1) {
      const rowBase = esi;
      // 0x3d758: ECX starts at -0x50 and advances by four until zero.
      // [EDI+ECX+0x50] therefore covers exactly EDI..EDI+0x4c: twenty
      // dword writes (80 bytes) per plane, not 80 dwords.  The remaining
      // 160 bytes of this 320-byte source row are intentionally untouched.
      const rowOutput = edi;
      runtime.out16(0x3c4, 0x0302);
      for (let x = 0; x < 0x14; x += 1) {
        const source = u32(rowBase + x * 8);
        // 0x3d75d..0x3d76b: AL=[ESI+4], AH=[ESI+6], SHL EAX,16,
        // AL=[ESI], AH=[ESI+2].  The little-endian store is therefore
        // [ESI], [ESI+2], [ESI+4], [ESI+6].  The old lift swapped the two
        // byte pairs, visibly permuting every four-pixel terrain strip.
        const value = (memory.read8(source) | (memory.read8(source + 2) << 8)
          | (memory.read8(source + 4) << 16) | (memory.read8(source + 6) << 24)) >>> 0;
        runtime.writeEs32(u32(rowOutput + x * 4), value);
      }
      runtime.out16(0x3c4, 0x0c02);
      for (let x = 0; x < 0x14; x += 1) {
        const source = u32(rowBase + 1 + x * 8);
        const value = (memory.read8(source) | (memory.read8(source + 2) << 8)
          | (memory.read8(source + 4) << 16) | (memory.read8(source + 6) << 24)) >>> 0;
        runtime.writeEs32(u32(rowOutput + x * 4), value);
      }
      esi = u32(esi + 0x140);
      edi = u32(edi + 0x50);
    }
    allocation = memory.read32(0x3d2c8) + 0x3e80;
    for (let count = 0; count < 0x2ee0; count += 1) runtime.writeEs32(allocation + count * 4, 0);

    if (memory.read8(0x3c6d6) === 1) {
      let edx = memory.read32(0x202f0);
      edi = memory.read32(0x21978);
      for (let outer = 0; outer < 0x80; outer += 1) {
        const esi = memory.read16(0x3c6d7);
        for (let index = 0; index < 0x40; index += 1) {
          const ebp = (0xffffff80 + index * 2) >>> 0;
          const first = memory.read8(0x80 + u32(ebp + edx)) + esi;
          const second = memory.read8(0x81 + u32(ebp + edx)) + esi;
          const firstByte = memory.read8(0x3c0d6 + first);
          const secondByte = memory.read8(0x3c0d6 + second);
          const packed = (firstByte | (firstByte << 8) | (secondByte << 16) | (secondByte << 24)) >>> 0;
          runtime.writeEs32(edi, packed);
          runtime.writeEs32(edi + 0x100, packed);
          edi = u32(edi + 4);
        }
        edx = u32(edx + 0x80);
        edi = u32(edi + 0x100);
      }
    }

    fn_3d997(runtime, rasterizerAdapters);
    hardwareCheckpoint(runtime, 0x3d830);
    fn_3dbd4(runtime, { loadFsSelector, readFs8 });
    let ecx = memory.read32(0x21954);
    memory.write32(0x21954, 0);
    if (ecx === 0) {
      updateScale(memory, cpu);
      continue;
    }

    do {
      if (advanceFn3d5d9Event(runtime)) return;
      ecx = u32(ecx - 1);
    } while (ecx !== 0);

    updateScale(memory, cpu);
  }
}

// Translation of the lookup pair at 0x3dba3..0x3dbc5. EBX is saved and
// restored by the original helper; SAR sets carry from bit 7 of its final
// shifted input.
function __coverage_impl_fn_3dba3(runtime) {
  const { cpu, memory } = runtime;
  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('fn_3dba3 requires a resolved SS base for PUSH/POP EBX scratch');
  const originalEsp = cpu.get('esp');
  const pushedEsp = (originalEsp - 4) >>> 0;
  memory.write32((ssBase + pushedEsp) >>> 0, cpu.get('ebx'));
  cpu.set('esp', pushedEsp);
  const ebx = cpu.get('ebx') & 0xfff;
  const eaxInput = memory.read32(0x2198c + ebx * 4);
  const ecxInput = memory.read32(0x2298c + ebx * 4);
  cpu.set('eax', signed32(eaxInput) >> 8);
  cpu.set('ecx', signed32(ecxInput) >> 8);
  cpu.set('ebx', memory.read32((ssBase + pushedEsp) >>> 0));
  cpu.set('esp', originalEsp);

  const result = signed32(ecxInput) >> 8;
  let flags = cpu.eflags & ~0xc5; // CF/PF/ZF/SF from SAR; OF/AF undefined at count 8.
  if ((ecxInput >>> 7) & 1) flags |= 1;
  if (result === 0) flags |= 0x40;
  if (result < 0) flags |= 0x80;
  let lowByte = result & 0xff;
  lowByte ^= lowByte >>> 4;
  lowByte &= 0x0f;
  if (((0x6996 >>> lowByte) & 1) === 0) flags |= 0x04;
  cpu.setEflags(flags >>> 0);
}

// Translation of 0x3dbd4..0x3dcb6. FS selector resolution and reads remain
// explicit runtime adapters; output writes are DS-relative within the buffer
// allocated by fn_3d5d9.
function __coverage_impl_fn_3dbd4(runtime, adapters = {}) {
  const loadFsSelector = required(adapters, 'loadFsSelector');
  const readFs8 = required(adapters, 'readFs8');
  const { cpu, memory } = runtime;
  cpu.set('edx', 0x384);
  cpu.set('ebx', memory.read16(0x3cdbc));
  fn_3dba3(runtime);
  let edx = cpu.get('edx');
  let ecx = Math.imul(signed32(cpu.get('ecx')), edx) >>> 0;
  let eax = Math.imul(signed32(cpu.get('eax')), edx) >>> 0;
  const eaxBeforeSar = eax;
  ecx = signed32(ecx) >> 9;
  eax = signed32(eax) >> 9;
  cpu.setCarry(((eaxBeforeSar >>> 8) & 1) !== 0);
  memory.write32(0x3ccc8, ecx);
  memory.write32(0x3cccc, eax);
  memory.write32(0x3ccd0, 0x80);
  let edi = memory.read32(0x3cdbe);
  const selector = memory.read16(0x3c0d4);
  loadFsSelector(runtime, selector);
  let finalEsi = 0;
  let finalEbp = 0;
  let finalEcx = 0;
  let finalEax = 0;
  let finalEbx = cpu.get('ebx');
  let finalEdx = cpu.get('edx');

  while (memory.read32(0x3ccd0) !== 0) {
    eax = u32(memory.read32(0x3ccd0) - 0x40);
    let ebp = Math.imul(signed32(eax), signed32(memory.read32(0x3cccc))) >>> 0;
    let product = Math.imul(-0x40, signed32(memory.read32(0x3ccc8))) >>> 0;
    let ecxValue = u32(product + ebp);
    ecxValue = (ecxValue << 16) >>> 0;
    eax = u32(memory.read32(0x3ccd0) - 0x40);
    ebp = Math.imul(signed32(eax), signed32(memory.read32(0x3ccc8))) >>> 0;
    product = Math.imul(-0x40, signed32(memory.read32(0x3cccc))) >>> 0;
    finalEdx = mul32(-0x40, memory.read32(0x3cccc)).edx;
    eax = u32(product - ebp);
    ecxValue = (ecxValue & 0xffff0000) | (eax & 0xffff);
    ecxValue = u32(ecxValue + 0x80008000);
    const esi = u32((memory.read32(0x3ccc8) << 16) | memory.read16(0x3cccc));
    ebp = 0xffffff00;
    let ebx = finalEbx;
    while (ebp !== 0) {
      ebx = u32((ebx & 0xffffff00) | ((ecxValue >>> 8) & 0xff));
      ebx = u32((ebx << 8) | (ecxValue >>> 24));
      ecxValue = u32(ecxValue + esi);
      const first = readFs8(runtime, ebx & 0xffff) & 0xff;

      ebx = u32((ebx & 0xffffff00) | ((ecxValue >>> 8) & 0xff));
      ebx = u32((ebx << 8) | (ecxValue >>> 24));
      ecxValue = u32(ecxValue + esi);
      const second = readFs8(runtime, ebx & 0xffff) & 0xff;
      eax = u32(((second | (second << 8)) << 16) | first | (first << 8));

      memory.write32(u32(edi + ebp + 0x100), eax);
      memory.write32(u32(edi + ebp + 0x200), eax);
      ebp = u32(ebp + 4);
      finalEbx = ebx;
    }
    finalEsi = esi;
    finalEbp = ebp;
    finalEcx = ecxValue;
    finalEax = eax;
    edi = u32(edi + 0x200);
    memory.write32(0x3ccd0, memory.read32(0x3ccd0) - 1);
  }

  cpu.set('eax', finalEax);
  cpu.set('ecx', finalEcx);
  cpu.set('edx', finalEdx);
  cpu.set('edi', edi);
  cpu.set('esi', finalEsi);
  cpu.set('ebp', finalEbp);
  cpu.set('ebx', finalEbx);
  cpu.setCarry(false);
}

function signed16(value) { return (value << 16) >> 16; }

function divU32(value, divisor) {
  const den = divisor >>> 0;
  if (den === 0) throw new RangeError('fn_3d997 reached unsigned division by zero');
  return Math.floor((value >>> 0) / den) >>> 0;
}

function shrd10(eax, edx) { return ((eax >>> 10) | (edx << 22)) >>> 0; }

// Translation of the rasterizer at 0x3d997..0x3dba2. Segment lookup and
// selector resolution remain host-provided; the 60-row loops and all fixed-
// point/span calculations follow the executable directly.
function __coverage_impl_fn_3d997(runtime, adapters = {}) {
  const getGsSelector = required(adapters, 'getGsSelector');
  const loadGsSelector = required(adapters, 'loadGsSelector');
  const loadFsSelector = required(adapters, 'loadFsSelector');
  const readGs8 = required(adapters, 'readGs8');
  const readFs8 = required(adapters, 'readFs8');
  const writeEs32ForSelector = required(adapters, 'writeEs32ForSelector');
  const { cpu, memory } = runtime;
  const savedGs = getGsSelector(runtime);
  const gsSelector = memory.read16(0x20c66);
  const fsSelector = memory.read16(0x3d2c4);
  loadGsSelector(runtime, gsSelector);
  loadFsSelector(runtime, fsSelector);

  memory.write32(0x3d2cc, 0x226);
  memory.write32(0x3d2d0, 0x3d);
  let edi = 0x3d042;
  for (let i = 0; i < 0xa0; i += 1) runtime.writeEs32(edi + i * 4, 0x00a000a0);
  let esi = u32((memory.read32(0x3d2d8) & 0xffff0000) | ((memory.read16(0x3d2d8) + 0x28) & 0xffff));
  memory.write32(0x3d2d4, 0x3c);

  let eax = 0;
  let ebx = 0;
  let ebp = 0;
  let ecx = 0;
  let edx = 0;
  for (let outer = 0; outer < 0x3c; outer += 1) {
    // The original jumps back to 0x3d9df for each row. Recalculate the
    // self-patched coordinate step and the row's scale/center from the
    // counters that the previous row just advanced.
    const quotient = divU32(0x2b6d30, memory.read32(0x3d2d0));
    memory.write32(0x3d2e4, u32(quotient * 2));
    memory.write32(0x3cb46, u32(quotient * 2));
    const scaleQuotient = divU32(0x11170, memory.read32(0x3d2cc));
    memory.write32(0x3d2e8, Math.imul(scaleQuotient, 0x168) >>> 8);
    memory.write32(0x3d2dc, -Math.imul(0x50, memory.read32(0x3d2e4)));
    const ebpBase = u32(divU32(0xcb20, memory.read32(0x3d2cc)) + 0x0a);
    ebp = ebpBase;

    // Build the two per-row coordinates into DS:[0x3cf02..0x3cf41].
    ecx = 0xfffffec0;
    while (ecx !== 0) {
      // The original ADD's immediate at runtime 0x3cb46 is self-patched above
      // from the current terrain scale. Re-read it for every sample; using the
      // executable's initial 0x12345678 placeholder produces noisy terrain.
      memory.write32(0x3d2dc, memory.read32(0x3d2dc) + memory.read32(0x3cb46));
      ebx = memory.read8(0x3d2de);
      const gsOffset = ((ebx & 0xffff) + (esi & 0xffff)) & 0xffff;
      eax = readGs8(runtime, gsOffset, gsSelector) & 0xff;
      const product8 = eax * memory.read8(0x3cdb9);
      eax = (product8 >>> 8) & 0xff; // XOR AL,AL; XCHG AL,AH
      const product32 = BigInt(eax) * BigInt(memory.read32(0x3d2e8));
      eax = Number(product32 & 0xffffffffn);
      edx = Number((product32 >> 32n) & 0xffffffffn);
      eax = shrd10(eax, edx);

      const savedEax = eax;
      const savedEsi = esi;
      esi = u32(esi - memory.read32(0x3d2d8) - 0x28);
      const fsOffset = ((ebx & 0xffff) + (esi & 0xffff) + 0x5580) & 0xffff;
      ebx = readFs8(runtime, fsOffset) & 0xff;
      esi = savedEsi;
      eax = savedEax;
      let ax = (-(eax & 0xffff) + (ebpBase & 0xffff)) & 0xffff;
      if ((ax & 0xff00) !== 0) ax = (ax & 0xff00) | 0xff;
      ax = ((((ebx + 1) & 0xff) << 8) | (ax & 0xff)) & 0xffff;
      memory.write16(u32(ecx + 0x3cf02), ax);
      ecx = u32(ecx + 2);
    }

    // Rasterize the 160 signed row pairs to the allocated DS work buffer.
    let pixelSource = 0xfffffec0;
    while (pixelSource !== 0) {
      eax = memory.read8(u32(pixelSource + 0x3d182));
      ebx = memory.read8(u32(pixelSource + 0x3cf02));
      eax = u32(eax + memory.read32(0x3ca91));
      ebx = u32(ebx + memory.read32(0x3ca91));
      ecx = ebx;
      ebx = u32(ebx - eax);
      if (signed32(ebx) > 0) {
        memory.write16(0x3d2c2, 0);
        edx = ebx;
        if (edx >= 0xc8) {
          edx = u32(edx - 0xc8);
          memory.write16(0x3d2c2, edx);
        }

        eax = u32(ebx + ecx);
        edi = memory.read8(u32(pixelSource + 0x3d182));
        edi = u32(edi + memory.read32(0x3ca91));
        edi = u32(Math.imul(edi, 5) << 6);
        edx = u32(pixelSource + 0x140) >>> 1;
        edi = u32(edi + edx + memory.read32(0x3d2c8));
        edx = 0;
        eax = 0;
        let ah = memory.read8(u32(pixelSource + 0x3cf03));
        ah = (ah - memory.read8(u32(pixelSource + 0x3d183))) & 0xff;
        const numerator = signed16(ah << 8); // CWD makes DX:AX sign-extended.
        const divisor = signed16(ebx & 0xffff);
        if (divisor === 0) throw new RangeError('fn_3d997 reached signed IDIV by zero');
        const quotient16 = Math.trunc(numerator / divisor);
        if (quotient16 < -0x8000 || quotient16 > 0x7fff) {
          throw new RangeError('fn_3d997 signed IDIV quotient overflow');
        }
        const remainder16 = numerator - quotient16 * divisor;
        eax = quotient16 & 0xffff;
        edx = remainder16 & 0xffff;
        ecx = ebx;
        ebx = eax; // EAX was zero-extended before the 16-bit IDIV.
        ecx = (ecx & 0xffff0000) | (((ecx & 0xffff) - memory.read16(0x3d2c2)) & 0xffff);
        ah = memory.read8(u32(pixelSource + 0x3d183));
        eax = ah << 8;
        ecx = Math.imul(ecx, 5) << 6;
        edi = u32(edi + ecx);
        ecx = (-ecx) >>> 0;
        while (ecx !== 0) {
          // AH aliases EAX in the original x86. ADD EAX,EBX below changes
          // the next pixel's high byte, so reread AH instead of retaining
          // the initial span color across the whole rasterized column.
          memory.write8(u32(edi + ecx), (eax >>> 8) & 0xff);
          eax = u32(eax + ebx);
          ecx = u32(ecx + 0x140);
        }
      }
      pixelSource = u32(pixelSource + 2);
    }

    // The ES selector is temporarily replaced by DS:[0x1e] for this copy.
    const esSelector = memory.read16(0x1e);
    for (let i = 0; i < 0xa0; i += 1) {
      writeEs32ForSelector(runtime, esSelector, 0x3d042 + i * 4, memory.read32(0x3cdc2 + i * 4));
    }
    esi = u32(esi + 0x200);
    memory.write32(0x3d2cc, memory.read32(0x3d2cc) - 8);
    memory.write32(0x3d2d0, memory.read32(0x3d2d0) + 4);
    memory.write32(0x3d2d4, memory.read32(0x3d2d4) - 1);
  }

  loadGsSelector(runtime, savedGs);
  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ecx', 0);
  cpu.set('edx', edx);
  cpu.set('ebp', ebp);
  cpu.set('esi', esi);
  cpu.set('edi', 0x3d2c2);
  // The last x86 outer-loop instruction decrements [0x3d2d4] from one to
  // zero, then returns with DEC's arithmetic flags (CF preserved by DEC).
  cpu.setDecFlags32(1);
  cpu.setCarry(false);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_3d5d9 = instrumentLift('0x3d5d9', 'fn_3d5d9', __coverage_impl_fn_3d5d9);
export const fn_3d997 = instrumentLift('0x3d997', 'fn_3d997', __coverage_impl_fn_3d997);
export const fn_3dba3 = instrumentLift('0x3dba3', 'fn_3dba3', __coverage_impl_fn_3dba3);
export const fn_3dbd4 = instrumentLift('0x3dbd4', 'fn_3dbd4', __coverage_impl_fn_3dbd4);
