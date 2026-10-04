import { fn_1189 } from './allocator.mjs';
import { fn_20f81 } from './startup-vga.mjs';
import { fn_11f5 } from './pic-mask.mjs';
import { fn_123d } from './phase-helper.mjs';
import { callDosVector as dispatchDosVector } from './runtime-adapters.mjs';

export class Nation0AllocationFailure extends Error {
  constructor() {
    super('Original non-returning allocation-failure branch at 0x21c36.');
    this.name = 'Nation0AllocationFailure';
  }
}

// Translation of the bounded hardware/timing setup at 0x20b08..0x20ce6.
// The DOS vector target and its register effects remain an explicit callback.
function __coverage_impl_fn_20b08(runtime, { callDosVector } = {}) {
  const { memory, cpu } = runtime;
  memory.write16(0x1e42e, 0x40);
  memory.write16(0x1e432, 0);
  memory.write16(0x1e42a, 6);
  memory.write16(0x1e42c, 1);

  cpu.set('esi', 0xd8);
  cpu.set('ebp', (cpu.get('ebp') & 0xffff0000) | 0x6c);
  cpu.set('ecx', 0x321);
  for (let index = 0; index < 0x321; index += 1) {
    const bp = cpu.get('ebp') & 0xffff;
    const numerator = (0x36 * 0x10000) + 0x9de4;
    let eax = Math.floor(numerator / bp) >>> 0;
    let edx = numerator % bp;
    cpu.set('eax', eax);
    cpu.set('edx', edx);

    edx = 0x64;
    const product = (eax & 0xffff) * edx;
    eax = product & 0xffff;
    edx = (product >>> 16) & 0xffff;
    const dividend = (edx * 0x10000) + eax;
    let bx = 0x10cc;
    const quotient = Math.floor(dividend / bx);
    edx = dividend % bx;
    if (quotient > 0xffff) throw new RangeError('Original DIV overflow at 0x20b50');
    eax = quotient;
    const shiftCarry = bx & 1;
    bx >>>= 1;
    bx = (bx + shiftCarry) & 0xffff;
    if (edx >= bx) eax = (eax + 1) & 0xffff;

    memory.write16(0x1e43c + (cpu.get('esi')) , eax);
    cpu.set('eax', eax);
    cpu.set('edx', edx);
    cpu.set('ebx', (cpu.get('ebx') & 0xffff0000) | bx);
    cpu.set('ebp', (cpu.get('ebp') & 0xffff0000) | ((bp + 1) & 0xffff));
    cpu.set('esi', (cpu.get('esi') + 2) >>> 0);
    cpu.set('ecx', 0x320 - index);
  }

  const getDx = () => cpu.get('edx') & 0xffff;
  const setDx = (value) => cpu.set('edx', (cpu.get('edx') & 0xffff0000) | (value & 0xffff));
  const setDl = (value) => cpu.set('edx', (cpu.get('edx') & 0xffffff00) | (value & 0xff));
  const setAl = (value) => cpu.set('eax', (cpu.get('eax') & 0xffffff00) | (value & 0xff));
  const setAx = (value) => cpu.set('eax', (cpu.get('eax') & 0xffff0000) | (value & 0xffff));
  const outAl = () => runtime.out8(getDx(), cpu.get('eax') & 0xff);

  cpu.set('edx', memory.read16(0x1fc04));
  setAl(0x0b); outAl();
  setDx(getDx() + 0x103);
  setAl(0x4c); outAl();
  setDl((cpu.get('edx') & 0xff) + 2);
  setAl(0); outAl();
  cpu.set('ecx', 0x10); fn_20ee9(runtime);
  setAl(1); outAl();
  setDl((cpu.get('edx') & 0xff) - 2);
  cpu.set('ecx', 0x10); fn_20ee9(runtime);
  setAl(0x41); outAl();
  setDl((cpu.get('edx') & 0xff) + 2); setAl(0); outAl();
  setDl((cpu.get('edx') & 0xff) - 2); setAl(0x45); outAl();
  setDl((cpu.get('edx') & 0xff) + 2); setAl(0); outAl();
  setDl((cpu.get('edx') & 0xff) - 2); setAl(0x49); outAl();
  setDl((cpu.get('edx') & 0xff) + 2); setAl(0); outAl();
  setDl((cpu.get('edx') & 0xff) - 2); setAl(0x0e); outAl();
  setDl((cpu.get('edx') & 0xff) + 2); setAl(0x0d); outAl();
  setDl((cpu.get('edx') & 0xff) - 3);

  const savedDx = getDx();
  cpu.set('ecx', 0x0e);
  while (cpu.get('ecx') !== 0) {
    const csPort = memory.read16(0x1e41c);
    setDx(csPort + 0x102); setAl(0x0e - (cpu.get('ecx') & 0xff)); outAl();
    setDx(csPort + 0x103); setAl(6); outAl();
    setAl(0x3f); setDx(csPort + 0x105); outAl();
    setDx(csPort + 0x103); setAl(9); outAl();
    setAx(0x0e00); setDx(csPort + 0x104); runtime.out16(getDx(), cpu.get('eax') & 0xffff);
    cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
  }
  setDx(savedDx);

  setDx(getDx() - 0xf3); setAl(5); outAl();
  setDl((cpu.get('edx') & 0xff) - 0x0f); setAl(8); outAl();
  setDl((cpu.get('edx') & 0xff) + 0x0b); setAl(0); outAl();
  setDl((cpu.get('edx') & 0xff) + 4); outAl();
  setDl((cpu.get('edx') & 0xff) - 0x0f);
  cpu.set('ebx', memory.read8(0x1fc06));
  setAl(0x4b); outAl();
  setDl((cpu.get('edx') & 0xff) + 0x0b); setAl(memory.read8(0x1fbf4 + cpu.get('ebx'))); outAl();
  setDl((cpu.get('edx') & 0xff) - 0x0b); setAl(9); outAl();
  setDx(getDx() + 0x103);
  setDx(memory.read16(0x1fbd4)); setAl(0x4c); outAl();
  setDl((cpu.get('edx') & 0xff) + 2); setAl(3); outAl();
  setDl((cpu.get('edx') & 0xff) - 2); setAl(0x47); outAl();
  setDl((cpu.get('edx') & 0xff) + 2); setAl(0xcc); outAl();
  setDl((cpu.get('edx') & 0xff) - 2); setAl(0x45); outAl();
  setDl((cpu.get('edx') & 0xff) + 2); setAl(8); outAl();
  setDx(getDx() - 0xfd); setAl(4); outAl();
  cpu.set('edx', (cpu.get('edx') + 1) >>> 0); setAl(2); outAl();

  let ebx = cpu.get('ebx');
  if ((ebx & 0xff) === 2) ebx = (ebx & 0xffffff00) | 9;
  cpu.set('ebx', ebx);
  const selected = (ebx & 0xff) > 7 ? 1 : 0;
  cpu.set('eax', selected);
  const selectorValue = memory.read16(0x1fbf0 + selected * 2);
  setAx(selectorValue);
  memory.write16(0x1ed1d, selectorValue);
  cpu.setCarry((ebx & 0xff) < 7);

  cpu.set('edx', 0x1ed16);
  dispatchDosVector(runtime, 0x28, callDosVector);

  cpu.set('edi', 0x1fbda);
  fn_123d(runtime);
  memory.write32(0x1fbca, cpu.get('eax'));
  cpu.set('eax', cpu.get('eax') & 0xffffff00);
  fn_11f5(runtime);
  cpu.set('ebx', (cpu.get('ebx') & 0xffff0000) | 0x32);
  fn_20f5f(runtime);
}

// Branch target, not an original callable function. The original performs its
// failure presentation path and jumps away without returning to fn_20ce7.
export function branch_21c36() {
  throw new Nation0AllocationFailure();
}

// Lifted from original byte range 0x20ce7..0x20ee8.  The fixed source at
// runtime 0x940 is the embedded 31-sample MOD (file offset 0x1840): this
// copies its 1084-byte header, allocates/copies its pattern data, and decodes
// its delta-coded sample streams into the original player state.  It remains
// the translated player path, rather than a host MOD-player substitute.
function __coverage_impl_fn_20ce7(runtime) {
  const { memory, cpu } = runtime;
  memory.write16(0x1e436, 0x28);
  memory.write16(0x1e424, 4);
  fn_20f81(runtime);

  let dx = (memory.read16(0x1fc04) + 0x102) & 0xffff;
  memory.write16(0x1fbd2, dx);
  memory.write16(0x1fbd4, (dx + 1) & 0xffff);
  memory.write16(0x1fbd6, (dx + 2) & 0xffff);
  memory.write16(0x1fbd8, (dx + 5) & 0xffff);

  // 0x43c is the canonical MOD header size: title, 31 sample headers, order
  // table, and M.K. signature.  Pattern data immediately follows at 0xd7c.
  for (let offset = 0; offset < 0x43c; offset += 1) memory.write8(0x1d501 + offset, memory.read8(0x940 + offset));
  memory.write8(0x1d500, 1);

  let esi = 0x1d8b9;
  memory.write16(0x1d93d, memory.read16(esi - 2));
  for (let offset = 0; offset < 0x80; offset += 1) memory.write8(0x1d93f + offset, memory.read8(esi + offset));

  let maximum = 0;
  for (let offset = 0; offset < 0x80; offset += 1) maximum = Math.max(maximum, memory.read8(0x1d93f + offset));
  const requested = (((maximum + 1) << 8) * memory.read16(0x1e424)) >>> 0;
  cpu.set('eax', requested);
  fn_1189(runtime);
  if (cpu.carry) branch_21c36();

  const allocated = cpu.get('eax');
  memory.write32(0x1eb58, allocated);
  memory.write32(0x1e420, (requested + 0xd7c) >>> 0);
  for (let offset = 0; offset < requested; offset += 1) memory.write8(allocated + offset, memory.read8(0xd7c + offset));
  memory.write32(0x1eb62, 0);

  esi = 0x1d52b;
  for (let entry = 0; entry < 0x1f; entry += 1) {
    const field = entry * 2;
    const length = ((memory.read8(esi) << 8) | memory.read8(esi + 1)) & 0xffff;
    esi += 2;
    memory.write16(0x1e2e6 + field, length <= 2 ? 0 : (length << 1) & 0xffff);
    if (length > 2) {
      const byteLength = memory.read16(0x1e2e6 + field);
      memory.write32(0x1e26a + entry * 4, memory.read32(0x1eb62));
      const output = memory.read32(0x1eb62);
      memory.write32(0x1eb62, (output + byteLength) >>> 0);
      const stream = memory.read32(0x1e420);
      memory.write32(0x1e420, (stream + byteLength) >>> 0);
      cpu.set('ebx', output);
      cpu.set('ecx', byteLength);
      cpu.set('edx', stream);
      fn_20eff(runtime);
    }

    memory.write16(0x1e362 + field, memory.read8(esi));
    esi += 1;
    memory.write8(0x1e324 + field, memory.read8(esi));
    esi += 1;
    const available = memory.read16(0x1e2e6 + field);
    let start = ((memory.read8(esi) << 8) | memory.read8(esi + 1)) & 0xffff;
    esi += 2;
    let span = ((memory.read8(esi) << 8) | memory.read8(esi + 1)) & 0xffff;
    esi += 2;
    if (memory.read8(0x1d500) === 1) { start = (start << 1) & 0xffff; span = (span << 1) & 0xffff; }
    if (((start + span) & 0xffff) > available) span = (available - start) & 0xffff;
    memory.write16(0x1e3de + field, span);
    memory.write16(0x1e3a0 + field, start);
    esi += 0x16;
  }

  let ebx = ((memory.read16(0x1e424) >>> 1) - 2) << 4;
  for (let count = memory.read16(0x1e424); count > 0; count -= 1) {
    runtime.out8((memory.read16(0x1e41c) + 0x102) & 0xffff, (memory.read8(0x1e424) - count) & 0xff);
    runtime.out8((memory.read16(0x1e41c) + 0x103) & 0xffff, 0x0c);
    runtime.out8((memory.read16(0x1e41c) + 0x105) & 0xffff, memory.read8(0x1dd38 + ebx));
    ebx += 1;
  }
}

// Lifted from original byte range 0x20eff..0x20f5e.
function __coverage_impl_fn_20eff(runtime) {
  let eax = runtime.cpu.get('eax');
  let ebx = runtime.cpu.get('ebx');
  let ecx = runtime.cpu.get('ecx');
  let edx = runtime.cpu.get('edx');
  let esi = edx;
  let running = 0;

  for (let count = ecx; count > 0; count -= 1) {
    running = (runtime.memory.read8(esi) + running) & 0xff;
    runtime.memory.write8(esi, running);
    esi = (esi + 1) >>> 0;
  }

  esi = edx;
  // 0x20f21 programs the GF1 DRAM page once.  The inner LOOPNE at 0x20f4c
  // then updates only the low address register and writes base+0x107 until
  // BX wraps; it does not reissue the 0x44/0x43 register selects per byte.
  let dx = (runtime.memory.read16(0x1fbd6) - 1) & 0xffff;
  while (ecx !== 0) {
    eax = (eax & 0xffffff00) | 0x44;
    runtime.memory.write8(0x1fbef, 0x44);
    runtime.out8(dx, 0x44);
    runtime.out8((dx + 2) & 0xffff, (ebx >>> 16) & 0xff); // SHLD EAX,EBX,16 → AL
    eax = (eax & 0xffffff00) | 0x43;
    runtime.memory.write8(0x1fbef, 0x43);
    runtime.out8(dx, 0x43);
    const addressPort = (dx + 1) & 0xffff;
    while (ecx !== 0) {
      runtime.out16(addressPort, ebx & 0xffff);
      runtime.out8((addressPort + 3) & 0xffff, runtime.memory.read8(esi));
      esi = (esi + 1) >>> 0;
      // INC BX at 0x20f4a preserves EBX's upper sixteen bits; the explicit
      // ADD EBX,0x10000 below performs the original page carry.
      ebx = ((ebx & 0xffff0000) | ((ebx + 1) & 0xffff)) >>> 0;
      ecx = (ecx - 1) >>> 0;
      if (ecx === 0 || (ebx & 0xffff) === 0) break;
    }
    if (ecx !== 0) ebx = (ebx + 0x10000) >>> 0; // 0x20f50..0x20f56 page rollover.
  }

  runtime.cpu.set('eax', eax);
  runtime.cpu.set('ebx', ebx);
  runtime.cpu.set('ecx', ecx);
  runtime.cpu.set('edx', dx);
  runtime.cpu.set('esi', esi);
}

// Translation of the bounded 0x209f8..0x20a52 state initializer.
function __coverage_impl_fn_209f8(runtime) {
  const { memory, cpu } = runtime;
  let edi = 0x1eb76;
  let ecx = memory.read16(0x1e424);
  do {
    memory.write16(edi + 4, 0);
    memory.write16(edi + 6, 0);
    edi += 0x34;
    ecx = (ecx - 1) >>> 0;
  } while (ecx !== 0);

  let ax = 0;
  let dx = 0x32;
  const bx = 0x3e8;
  let dividend = (dx << 16) | ax;
  ax = Math.floor(dividend / bx);
  dx = dividend % bx;
  memory.write16(0x1eb66, ax);
  dividend = (dx << 16) | 0;
  ax = Math.floor(dividend / bx);
  dx = dividend % bx;
  memory.write16(0x1eb68, ax);
  memory.write16(0x1eb6a, 0);
  memory.write16(0x1eb6c, 0);
  memory.write16(0x1eb6e, 0x14);
  cpu.set('edi', edi);
  cpu.set('ecx', ecx);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | ax);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | dx);
  cpu.set('ebx', bx);
}

// Translation of 0x20ee9..0x20efe: repeated reads from DX, with AX/DX saved.
function __coverage_impl_fn_20ee9(runtime) {
  const { cpu } = runtime;
  const savedAx = cpu.get('eax') & 0xffff;
  const savedDx = cpu.get('edx') & 0xffff;
  const dx = (savedDx & 0xffff0000) | 0x300;
  let ecx = cpu.get('ecx');
  do {
    for (let read = 0; read < 7; read += 1) cpu.set('eax', (cpu.get('eax') & 0xffffff00) | runtime.in8(dx));
    ecx = (ecx - 1) >>> 0;
  } while (ecx !== 0);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | savedAx);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | savedDx);
  cpu.set('ecx', ecx);
}

// Translation of 0x20f5f..0x20f80.
function __coverage_impl_fn_20f5f(runtime) {
  const { memory, cpu } = runtime;
  let eax = cpu.get('eax');
  let ebx = cpu.get('ebx');
  let edx = cpu.get('edx') & 0xffff0000;
  const dividend = 0x0c35;
  const divisor = ebx & 0xffff;
  if (divisor === 0) throw new RangeError('Original DIV fault in fn_20f5f');
  const quotient = Math.floor(dividend / divisor);
  if (quotient > 0xffff) throw new RangeError('Original DIV overflow in fn_20f5f');
  edx = (edx & 0xffff0000) | (dividend % divisor);
  eax = (eax & 0xffff0000) | quotient;
  ebx = (ebx & 0xffffff00) | (-(quotient & 0xff) & 0xff);
  edx = (edx & 0xffff0000) | memory.read16(0x1fbd4);
  eax = (eax & 0xffffff00) | 0x47;
  runtime.out8(edx, 0x47);
  edx = (edx & 0xffffff00) | ((edx + 2) & 0xff);
  eax = (eax & 0xffffff00) | (ebx & 0xff);
  runtime.out8(edx, eax & 0xff);
  edx = (edx & 0xffffff00) | ((edx - 2) & 0xff);
  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('edx', edx);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_209f8 = instrumentLift('0x209f8', 'fn_209f8', __coverage_impl_fn_209f8);
export const fn_20b08 = instrumentLift('0x20b08', 'fn_20b08', __coverage_impl_fn_20b08);
export const fn_20ce7 = instrumentLift('0x20ce7', 'fn_20ce7', __coverage_impl_fn_20ce7);
export const fn_20ee9 = instrumentLift('0x20ee9', 'fn_20ee9', __coverage_impl_fn_20ee9);
export const fn_20eff = instrumentLift('0x20eff', 'fn_20eff', __coverage_impl_fn_20eff);
export const fn_20f5f = instrumentLift('0x20f5f', 'fn_20f5f', __coverage_impl_fn_20f5f);
