import { fn_37732 } from './table-index.mjs';
import { fn_1189 } from './allocator.mjs';

function signed32(value) { return BigInt.asIntN(32, BigInt(value >>> 0)); }

function signedWord(value) { return (value << 16) >> 16; }

function multiplySigned32(left, right) {
  const product = BigInt.asIntN(64, signed32(left) * signed32(right));
  return {
    eax: Number(BigInt.asUintN(32, product)),
    edx: Number(BigInt.asUintN(32, product >> 32n)),
  };
}

function divideSigned64ByWord(edx, eax, divisor, address) {
  const denominator = signedWord(divisor);
  if (denominator === 0) throw new Error(`Divide error at 0x${address.toString(16)}: zero divisor`);
  const bits = (BigInt(edx >>> 0) << 32n) | BigInt(eax >>> 0);
  const dividend = BigInt.asIntN(64, bits);
  const quotient = dividend / BigInt(denominator);
  if (quotient < -0x80000000n || quotient > 0x7fffffffn) {
    throw new Error(`Divide error at 0x${address.toString(16)}: quotient overflow`);
  }
  const remainder = dividend % BigInt(denominator);
  return {
    eax: Number(BigInt.asUintN(32, quotient)),
    edx: Number(BigInt.asUintN(32, remainder)),
  };
}

// Translation of 0x2143d. Uses BigInt only to preserve the original signed
// 32x32 -> 64-bit IMUL, SHRD, and IDIV mechanics exactly.
function __coverage_impl_fn_2143d(runtime) {
  const { cpu } = runtime;
  let edi = (cpu.get('edi') + 1) >>> 0;
  const esi = cpu.get('esi');
  let eax = cpu.get('ebp');
  let ebx = 1n;
  let ecx = edi;
  do {
    const product = BigInt.asIntN(64, signed32(esi) * signed32(eax));
    const bits = BigInt.asUintN(64, product);
    eax = Number(BigInt.asUintN(32, bits >> 30n));
    ebx = BigInt.asIntN(32, ebx * BigInt(ecx));
    ecx = (ecx - 1) >>> 0;
  } while (ecx !== 0);
  const dividend = signed32(eax);
  const quotient = BigInt.asIntN(32, dividend / ebx);
  const remainder = BigInt.asIntN(32, dividend % ebx);
  cpu.set('eax', Number(BigInt.asUintN(32, quotient)));
  cpu.set('edx', Number(BigInt.asUintN(32, remainder)));
  cpu.set('ebx', Number(BigInt.asUintN(32, ebx)));
  cpu.set('ecx', 0);
  cpu.set('edi', edi);
}

// Translation of 0x2137f..0x2143c, preserving the original four-helper
// accumulation sequence and the 0..0x800 group stride.
function __coverage_impl_fn_2137f(runtime) {
  const { memory, cpu } = runtime;
  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('fn_2137f requires resolved SS base for PUSH ECX and CALL scratch');
  const entryEsp = cpu.get('esp');
  const callScratch = (ssBase + entryEsp - 8) >>> 0;
  const savedEcxScratch = (ssBase + entryEsp - 4) >>> 0;
  let ebp = 0x40000000;
  let esi = 0;
  for (let group = 0; group <= 0x800; group += 4) {
    memory.write32(0x21988, esi);
    memory.write32(0x21984, ebp);
    let edi = 1;
    for (;;) {
      cpu.set('edi', edi);
      cpu.set('esi', esi);
      cpu.set('ebp', ebp);
      fn_2143d(runtime);
      edi = cpu.get('edi');
      memory.write32(0x21984, memory.read32(0x21984) - cpu.get('eax'));

      fn_2143d(runtime);
      edi = cpu.get('edi');
      memory.write32(0x21988, memory.read32(0x21988) - cpu.get('eax'));

      fn_2143d(runtime);
      edi = cpu.get('edi');
      memory.write32(0x21984, memory.read32(0x21984) + cpu.get('eax'));

      fn_2143d(runtime);
      edi = cpu.get('edi');
      memory.write32(0x21988, memory.read32(0x21988) + cpu.get('eax'));
      if ((edi & 0xffff) === 0x0d) break;
    }
    // The original balances PUSH ECX/POP ECX and four nested CALL/RET pairs
    // for each group. Preserve the final stack bytes left by the last group.
    memory.write32(savedEcxScratch, group);
    memory.write32(callScratch, 0x204be); // runtime return EIP for the fourth call at original 0x213b9
    const x = memory.read32(0x21988) >> 14;
    const y = memory.read32(0x21984) >> 14;
    const base = 0x2198c + group;
    memory.write32(base, x);
    memory.write32(base + 0x1000, y);
    memory.write32(base + 0x4000, x);
    memory.write32(0x2198c - group + 0x2000, x);
    memory.write32(0x2198c - group + 0x1000, y);
    memory.write32(0x2198c - group + 0x5000, y);
    memory.write32(0x2198c - group + 0x4000, -x);
    memory.write32(0x2198c - group + 0x3000, -y);
    memory.write32(base + 0x2000, -x);
    memory.write32(base + 0x3000, -y);
    cpu.set('edi', base);
    cpu.set('eax', -x);
    cpu.set('ebx', -y);
    esi = (esi + 0x1921f6) >>> 0;
    cpu.set('ecx', group + 4);
  }
  cpu.set('esi', esi);
  cpu.set('ebp', ebp);
  cpu.setCmpFlags32(0x804, 0x800); // final CMP ECX,800h after the last group
}

// Translation of the bounded vector restore helper at 0x21b86.
function __coverage_impl_fn_21b86(runtime) {
  const { memory, cpu } = runtime;
  let esi = 0x20c68;
  let eax = memory.read32(esi);
  esi += 4;
  memory.write32(0, eax);
  eax = memory.read32(esi);
  esi += 4;
  memory.write32(8, eax);
  cpu.set('esi', esi);
  cpu.set('eax', eax);
}

// Translation of 0x21b70..0x21b85. MOV ES,CS:[0x1e] is kept as an explicit
// host boundary because the runtime does not model CS selectors or resolve
// them to linear bases.
function __coverage_impl_fn_21b70(runtime, { loadEsFromCs } = {}) {
  const { memory, cpu } = runtime;
  if (typeof loadEsFromCs !== 'function') {
    throw new Error('Unresolved MOV ES, CS:[0x1e] selector load at 0x21b70');
  }
  loadEsFromCs(0x1e, runtime);
  if (runtime.segments.esBase === null) {
    throw new Error('loadEsFromCs must resolve and set runtime.segments.esBase');
  }

  let eax = memory.read32(0);
  cpu.set('eax', eax);
  let edi = 0x20c68;
  cpu.set('edi', edi);
  runtime.writeEs32(edi, eax);
  edi += 4;
  eax = memory.read32(8);
  cpu.set('eax', eax);
  runtime.writeEs32(edi, eax);
  edi += 4;
  cpu.set('edi', edi);
}

// Translation of 0x123d..0x127e. ES and GS remain explicit runtime segments.
function __coverage_impl_fn_123d(runtime) {
  const { memory, cpu, segments } = runtime;
  if (!Number.isInteger(segments?.ssBase)) throw new Error('Unresolved SS base for original PUSH ESI/PUSH EDI');

  // The original pushes ESI then EDI. Preserve both stack writes and restore
  // the registers by popping the saved values, as the machine code does.
  const push32 = value => {
    const esp = (cpu.get('esp') - 4) >>> 0;
    cpu.set('esp', esp);
    memory.write32((segments.ssBase + esp) >>> 0, value);
  };
  push32(cpu.get('esi'));
  push32(cpu.get('edi'));
  let esi = 0x328;
  let edi = cpu.get('edi');
  let eax = (edi + 0x0d) >>> 0;
  memory.write32(esi + 4, eax);
  eax = (eax + 7 - cpu.get('edx')) >>> 0;
  eax = (-eax) >>> 0;
  memory.write32(esi + 0x10, eax);
  eax = edi;
  for (let offset = 0; offset < 20; offset += 4) {
    const value = memory.read32(esi);
    runtime.writeEs16(edi, value & 0xffff);
    runtime.writeEs16(edi + 2, value >>> 16);
    esi += 4;
    edi += 4;
  }
  runtime.writeEs8(edi, memory.read8(esi));
  eax = (eax + memory.read32(0x18)) >>> 0;
  eax = (eax << 12) >>> 0;
  eax = ((eax & 0xffff0000) | ((eax & 0xffff) >>> 12)) >>> 0;
  let slot = cpu.get('ebx') & 0xff;
  if (slot >= 8) slot += 0x60;
  eax = runtime.exchangeGs32(0x20 + slot * 4, eax);
  cpu.set('eax', eax);

  // POP EDI then POP ESI leaves the PUSH data visible below the restored ESP.
  let esp = cpu.get('esp') >>> 0;
  cpu.set('edi', memory.read32((segments.ssBase + esp) >>> 0));
  cpu.set('esp', (esp + 4) >>> 0);
  esp = cpu.get('esp') >>> 0;
  cpu.set('esi', memory.read32((segments.ssBase + esp) >>> 0));
  cpu.set('esp', (esp + 4) >>> 0);
}

// Translation of the direct dispatcher dependency at 0x21701..0x2188c.
// The exact table meaning stays unnamed; constants at 0x2110c remain DS reads.
function __coverage_impl_fn_21701(runtime) {
  const { memory, cpu } = runtime;
  let edi = memory.read32(0x21974);
  cpu.set('edi', edi);
  memory.write32(0x207ef, -50);

  for (let row = -50; row < 50; row += 1) {
    memory.write32(0x207ef, row);
    const scaledRow = (Math.imul(row, 0x228) >> 9) | 0;
    memory.write32(0x207ef, scaledRow);
    const ySquare = Math.imul(scaledRow, scaledRow) >>> 0;
    cpu.set('esi', ySquare);

    for (let column = -80; column < 80; column += 1) {
      cpu.set('ecx', column);
      cpu.set('eax', (Math.imul(column, column) + ySquare) >>> 0);
      fn_37732(runtime);

      let eax = cpu.get('eax');
      cpu.set('edx', 0);
      if (eax === 0) eax = 1;
      cpu.set('eax', eax);
      memory.write16(0x207fb, eax);
      memory.write16(0x207ff, eax);

      const absY = scaledRow < 0 ? (-scaledRow) >>> 0 : scaledRow >>> 0;
      const absX = column < 0 ? (-column) >>> 0 : column >>> 0;
      cpu.set('eax', absY);
      cpu.set('ebx', absX);

      let angle;
      if (absY >= absX) {
        eax = (-column) >>> 0;
        let product = multiplySigned32(eax, 0x200);
        cpu.set('eax', product.eax);
        cpu.set('edx', product.edx);
        product = divideSigned64ByWord(product.edx, product.eax, memory.read16(0x207fb), 0x21773);
        eax = (product.eax + 0x200) >>> 0;
        let ebx = eax;
        ebx = (ebx + ebx) >>> 0;
        cpu.set('eax', eax);
        cpu.set('ebx', ebx);
        angle = (eax & 0xffff0000) | memory.read16((0x2110c + ebx) >>> 0);
        memory.write16(0x207fd, angle);
      } else {
        eax = (-scaledRow) >>> 0;
        let product = multiplySigned32(eax, 0x200);
        cpu.set('eax', product.eax);
        cpu.set('edx', product.edx);
        product = divideSigned64ByWord(product.edx, product.eax, memory.read16(0x207fb), 0x217a3);
        eax = (product.eax + 0x1ff) >>> 0;
        let ebx = eax;
        ebx = (ebx + ebx) >>> 0;
        cpu.set('eax', eax);
        cpu.set('ebx', ebx);
        angle = (eax & 0xffff0000) | memory.read16((0x2110c + ebx) >>> 0);
        memory.write16(0x207fd, angle);

        if (scaledRow < 0 && column < 0) {
          angle = (-angle) & 0xffff;
          memory.write16(0x207fd, angle);
        }
        if (scaledRow > 0 && column > 0) {
          angle = (-angle) & 0xffff;
          memory.write16(0x207fd, angle);
        }
        angle = (angle + 0x100) & 0xffff;
        angle &= 0x1ff;
        memory.write16(0x207fd, angle);
        if (scaledRow === 0 && column > 0) {
          angle = 0x200;
          memory.write16(0x207fd, angle);
        }
      }

      if (scaledRow > 0) {
        angle = (-angle + 0x400) & 0xffff;
        memory.write16(0x207fd, angle);
      }

      let ebx = cpu.get('ebx');
      let bx = (angle & 0xffff) >>> 2;
      let edx = Math.imul(memory.read16(0x207ff), 0x1d6) >>> 0;
      edx >>>= 9;
      bx = ((edx & 0xff) << 8) | (bx & 0xff);
      ebx = ((ebx & 0xffff0000) | bx) >>> 0;
      edx = ((edx & 0xffff0000) | (bx & 0x7fff)) >>> 0;
      memory.write16(edi, edx);
      edi = (edi + 2) >>> 0;
      cpu.set('eax', eax);
      cpu.set('ebx', ebx);
      cpu.set('edx', edx);
    }

    memory.write32(0x207ef, row + 1);
  }

  cpu.set('ecx', 80);
  cpu.set('edi', edi);
  cpu.setCarry(false);
}

// Translation of the bounded 0x212f6..0x2137e 320x200 word-table builder.
function __coverage_impl_fn_212f6(runtime) {
  const { memory, cpu } = runtime;
  cpu.set('eax', 0x1f404);
  fn_1189(runtime);
  let edi = (cpu.get('eax') + 4) & 0xfffffffc;
  memory.write32(0x203f2, edi);

  for (let row = 0; row < 0xc8; row += 1) {
    const y = (row - 0x64) | 0;
    for (let column = 0; column < 0x140; column += 1) {
      const x = (column - 0xa0) | 0;
      const magnitude = (Math.imul(y, y) + Math.imul(x, x)) >>> 0;
      cpu.set('eax', magnitude);
      fn_37732(runtime);

      let index = (cpu.get('eax') << 6) & 0xfff;
      const radial = memory.read32(0x2198c + index * 4);
      const radialProduct = BigInt.asIntN(64, 40n * BigInt(signed32(radial)));
      let eax = Number(BigInt.asUintN(32, BigInt.asUintN(64, radialProduct) >> 16n));
      eax = (eax + 0x28) >>> 0;
      const dl = eax & 0xff;

      index = (column << 4) & 0xfff;
      eax = Number(BigInt.asUintN(32, 0x14n * signed32(memory.read32(0x2298c + index * 4))));
      eax = (Number(signed32(eax)) >> 16) + 0x14;
      memory.write16(edi, ((eax & 0xff) | (dl << 8)) & 0xffff);
      edi += 2;
    }
  }
  cpu.set('edi', edi);
  cpu.set('ebp', 0xc8);
  cpu.set('ecx', 0x140);
}

// Translation of fn_211f4. The original uses STOSB through ES, so the segment
// base must be supplied by the recovered startup descriptor setup.
function __coverage_impl_fn_211f4(runtime) {
  const { memory, cpu } = runtime;
  cpu.set('eax', 0x4000);
  fn_1189(runtime);
  let edi = cpu.get('eax');
  memory.write32(0x202f0, edi);
  for (let row = -0x40; row < 0x40; row += 1) {
    for (let column = -0x40; column < 0x40; column += 1) {
      const magnitude = (Math.imul(column, column) + Math.imul(row, row)) >>> 0;
      cpu.set('eax', magnitude);
      fn_37732(runtime);
      runtime.writeEs8(edi, cpu.get('eax'));
      edi += 1;
    }
  }
  cpu.set('edi', edi);
  cpu.set('ebp', 0x40);
  cpu.set('ecx', 0x40);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_123d = instrumentLift('0x123d', 'fn_123d', __coverage_impl_fn_123d);
export const fn_211f4 = instrumentLift('0x211f4', 'fn_211f4', __coverage_impl_fn_211f4);
export const fn_212f6 = instrumentLift('0x212f6', 'fn_212f6', __coverage_impl_fn_212f6);
export const fn_2137f = instrumentLift('0x2137f', 'fn_2137f', __coverage_impl_fn_2137f);
export const fn_2143d = instrumentLift('0x2143d', 'fn_2143d', __coverage_impl_fn_2143d);
export const fn_21701 = instrumentLift('0x21701', 'fn_21701', __coverage_impl_fn_21701);
export const fn_21b70 = instrumentLift('0x21b70', 'fn_21b70', __coverage_impl_fn_21b70);
export const fn_21b86 = instrumentLift('0x21b86', 'fn_21b86', __coverage_impl_fn_21b86);
