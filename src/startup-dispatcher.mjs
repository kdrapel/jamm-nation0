// Mechanical lift of the startup dispatcher at 0x21cd9..0x22001. Direct
// calls whose implementation/options are not wired here are resolved through
// callFunction(address, runtime); this keeps their original order and register
// effects visible without assigning unknown semantics.
import { callDosVector as dispatchDosVector } from './runtime-adapters.mjs';

function required(adapters, name, address) {
  if (typeof adapters?.[name] !== 'function') {
    throw new TypeError(`fn_21cd9 requires ${name} for original operation at 0x${address.toString(16)}`);
  }
  return adapters[name];
}

function call(adapters, address, runtime) {
  const lifted = adapters.functions?.[address];
  if (typeof lifted === 'function') {
    return lifted(runtime, adapters.functionAdapters?.[address] ?? {});
  }
  return required(adapters, 'callFunction', address)(address, runtime);
}

function allocation(adapters, runtime, checked = false) {
  call(adapters, 0x1189, runtime);
  if (checked && runtime.cpu.carry) {
    const fail = adapters.allocationFailure;
    if (typeof fail !== 'function') {
      throw new Error('fn_21cd9 reached the original non-returning allocation-failure path at 0x21c36');
    }
    fail(runtime, 0x21c36);
    throw new Error('allocationFailure returned from original non-returning path at 0x21c36');
  }
}

function __coverage_impl_fn_21cd9(runtime, adapters = {}) {
  const { memory, cpu } = runtime;
  cpu.interruptsEnabled = true; // STI at 0x21cd9

  // 0x21cda..0x21cef: 0x800 bytes, with AL = (BL * BH) & 0xff.
  let edi = 0x26990;
  for (let ebx = 0; ebx < 0x800; ebx += 1) {
    const value = (((ebx & 0xff) * ((ebx >>> 8) & 0xff)) & 0xff);
    runtime.writeEs8(edi, value);
    edi = (edi + 1) >>> 0;
  }
  cpu.set('edi', edi);
  cpu.set('ebx', 0x800);

  call(adapters, 0x210ef, runtime);
  if (cpu.carry) {
    memory.write16(0x1e430, 0xff);
    memory.write16(0x1e432, 0xff);
    call(adapters, 0x6bc28, runtime);
    call(adapters, 0x6bd04, runtime);
  }

  call(adapters, 0x21b9a, runtime);
  cpu.set('edx', 0x27190);
  call(adapters, 0x21be2, runtime);

  for (const [address, slot] of [[0x21960, 0x21d23], [0x21970, 0x21d32], [0x21950, 0x21d41]]) {
    cpu.set('eax', 0x10000);
    allocation(adapters, runtime);
    memory.write32(address, cpu.get('eax'));
  }
  cpu.set('edx', memory.read32(0x21950));
  call(adapters, 0x1295, runtime);
  cpu.set('edx', (cpu.get('edx') + memory.read32(0x18)) >>> 0); // 67 changes address size, not operand size.
  const callDosVector = required(adapters, 'callDosVector', 0x21d5c);
  dispatchDosVector(runtime, 0x30, callDosVector);
  memory.write16(0x2194e, cpu.get('eax') & 0xffff);
  call(adapters, 0x1295, runtime);
  memory.write16(0x2194c, cpu.get('eax') & 0xffff);
  const readGs8 = required(adapters, 'readGs8', 0x21d72);
  const writeGs8 = required(adapters, 'writeGs8', 0x21d72);
  writeGs8(0x450, (readGs8(0x450) - 10) & 0xff, runtime);

  cpu.set('eax', 0x7d04);
  allocation(adapters, runtime);
  cpu.set('eax', ((cpu.get('eax') + 4) & 0xfffffffc) >>> 0);
  memory.write32(0x21974, cpu.get('eax'));

  for (const address of [0x21701, 0x21cc8, 0x21aea, 0x21cc8, 0x2137f, 0x212f6, 0x21cc8, 0x211f4, 0x21cc8]) call(adapters, address, runtime);

  cpu.set('eax', 0x10000); allocation(adapters, runtime); memory.write32(0x21964, cpu.get('eax'));
  cpu.set('edi', memory.read32(0x21964)); cpu.set('esi', 0x18aec); cpu.set('edx', 0xa50140);
  memory.write8(0x20602, 0x1f); call(adapters, 0x2150f, runtime); call(adapters, 0x21cc8, runtime);

  cpu.set('eax', 0x10000); allocation(adapters, runtime, true); memory.write32(0x21968, cpu.get('eax'));
  cpu.set('esi', 0x1d504); cpu.set('edx', 0xc80140); cpu.set('edi', memory.read32(0x21968));
  call(adapters, 0x2157e, runtime); call(adapters, 0x21cc8, runtime);

  cpu.set('eax', 0x10000); allocation(adapters, runtime, true); memory.write32(0x2196c, cpu.get('eax'));
  cpu.set('esi', 0x6b55); cpu.set('edi', cpu.get('eax')); cpu.set('edx', 0xa50140);
  call(adapters, 0x2150f, runtime); call(adapters, 0x21cc8, runtime);
  call(adapters, 0x2124f, runtime); call(adapters, 0x21cc8, runtime);

  cpu.set('eax', 0x10000); allocation(adapters, runtime, true); memory.write32(0x2195c, cpu.get('eax'));
  cpu.set('edi', cpu.get('eax')); cpu.set('esi', 0x1a4bf); cpu.set('edx', 0x800080);
  cpu.set('eax', (0x205b9 + 0x32) >>> 0); memory.write32(0x20642, cpu.get('eax'));
  call(adapters, 0x2150f, runtime); call(adapters, 0x21cc8, runtime); call(adapters, 0x21c6f, runtime);

  // 256 rows x 256 bytes, preserving the 16-bit BP + ADC EDX row progression.
  edi = memory.read32(0x21960);
  let edx = 0;
  let esi = 0;
  let bp = cpu.get('ebp') & 0xffff;
  for (let row = 0; row < 0x100; row += 1) {
    esi = (edx + 0x28) >>> 0;
    esi = Math.imul(esi, 0x140) >>> 0;
    esi = (esi + memory.read32(0x21964) + 0x40) >>> 0;
    for (let column = 0; column < 0x100; column += 1) {
      let al = memory.read8(esi);
      esi = (esi + 1) >>> 0;
      al >>>= 1;
      if (al === 0) al = 1;
      runtime.writeEs8(edi, al);
      edi = (edi + 1) >>> 0;
    }
    const sum = bp + 0x6978;
    bp = sum & 0xffff;
    if (sum > 0xffff) edx = (edx + 1) >>> 0;
  }
  cpu.set('edi', edi); cpu.set('esi', esi); cpu.set('ebx', 0); cpu.set('ecx', 0);
  cpu.set('edx', edx); cpu.set('ebp', (cpu.get('ebp') & 0xffff0000) | bp);
  cpu.set('eax', memory.read32(0x21960));
  memory.write32(0x21970, cpu.get('eax'));

  cpu.setCarry(false); // CMP byte [0x1eb70],0 at 0x21ed1.
  const selected = memory.read8(0x1eb70) !== 0;
  if (selected) {
    call(adapters, 0x20ce7, runtime); call(adapters, 0x20b08, runtime); call(adapters, 0x209f8, runtime);
  } else call(adapters, 0x6bd2f, runtime);

  cpu.set('edx', 0x20d51); cpu.set('ebx', cpu.get('ebx') & 0xffffff00);
  dispatchDosVector(runtime, 0x28, callDosVector);

  for (const address of [0x5efd7, 0x21b70, 0x5f540, 0x21b86]) call(adapters, address, runtime);
  memory.write32(0x5ee78, 0x271b8); memory.write32(0x5ee7c, 0x271e8);
  call(adapters, 0x5fbf5, runtime); call(adapters, 0x21b86, runtime); call(adapters, 0x38351, runtime); call(adapters, 0x21b86, runtime);
  memory.write32(0x5ee78, 0x271c7); memory.write32(0x5ee7c, 0x271fb);
  call(adapters, 0x5fbf5, runtime); call(adapters, 0x21b86, runtime); call(adapters, 0x6098c, runtime); call(adapters, 0x21b86, runtime);
  memory.write32(0x5ee78, 0x271d8); memory.write32(0x5ee7c, 0x2720f);
  call(adapters, 0x5fbf5, runtime); call(adapters, 0x21b86, runtime);
  for (const address of [0x61a47, 0x21b86, 0x3d5d9, 0x5f48d, 0x21b86, 0x3e1f0, 0x21b86, 0x6424a, 0x21b86, 0x3c124, 0x21b86, 0x602e4, 0x5ff2f]) call(adapters, address, runtime);

  const int33 = required(adapters, 'interrupt33', 0x21fc9);
  memory.write16(0xe0, 3); cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x10); int33(0x33, runtime);
  cpu.setCarry(false); // CMP byte [0x1eb70],0 at 0x21fcb.
  if (memory.read8(0x1eb70) !== 0) call(adapters, 0x20a53, runtime);
  else { call(adapters, 0x6bd3f, runtime); call(adapters, 0x6bd20, runtime); }

  cpu.interruptsEnabled = false; // CLI at 0x21fe5
  cpu.set('edx', 0x21102); cpu.set('ebx', cpu.get('ebx') & 0xffffff00);
  dispatchDosVector(runtime, 0x28, callDosVector);
  runtime.out8(0x43, 0x36); runtime.out8(0x40, 0); runtime.out8(0x40, 0);
  cpu.interruptsEnabled = true; // STI at 0x21ffc
  if (typeof adapters.tailJump !== 'function') throw new Error('fn_21cd9 requires tailJump for original JMP 0x12ea at 0x21ffd');
  adapters.tailJump(0x12ea, runtime);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_21cd9 = instrumentLift('0x21cd9', 'fn_21cd9', __coverage_impl_fn_21cd9);
