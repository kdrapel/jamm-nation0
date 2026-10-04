function required(adapters, name, address) {
  if (typeof adapters?.[name] !== 'function') {
    throw new TypeError(`record-not-found function requires ${name} for 0x${address.toString(16)}`);
  }
  return adapters[name];
}

const u32 = value => value >>> 0;
const setLowByte = (cpu, value) => cpu.set('eax', (cpu.get('eax') & 0xffffff00) | (value & 0xff));

export class RecordNotFoundTransfer extends Error {
  constructor(address) {
    super(`Original record-not-found flow tail-transferred to 0x${address.toString(16)}`);
    this.name = 'RecordNotFoundTransfer';
    this.address = address;
  }
}

function tailTransfer(runtime, adapters, address) {
  required(adapters, 'tailJump', 0x6bcbf)(address, runtime);
  // This is a JMP in the original image: reaching the next translated caller
  // instruction would be incorrect if the host adapter returned normally.
  throw new RecordNotFoundTransfer(address);
}

// 0x65bb0..0x65bd9. PUSHA/POPA preserve every modeled general register around
// the DOS-style INT 33h request. The meaning of its 0x21 service stays numeric.
function __coverage_impl_fn_65bb0(runtime, adapters = {}) {
  const interrupt33 = required(adapters, 'interrupt33', 0x65bd6);
  const { cpu, memory } = runtime;
  const saved = Object.fromEntries(['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'].map(name => [name, cpu.get(name)]));
  cpu.set('edx', u32(cpu.get('edx') + memory.read32(0x18)));
  const ax = (cpu.get('eax') & 0xffff0000) | (((cpu.get('edx') & 0xff) & 0x0f));
  cpu.set('eax', ax);
  cpu.set('edx', cpu.get('edx') >>> 4);
  memory.write16(0xe8, cpu.get('edx'));
  memory.write16(0xd8, cpu.get('eax'));
  memory.write8(0xe1, 9);
  setLowByte(cpu, 0x21);
  interrupt33(0x33, runtime);
  for (const [name, value] of Object.entries(saved)) cpu.set(name, value);
}

// 0x65bda..0x65bec. This request saves/restores EAX only; the INT 33h adapter
// remains responsible for any other register effects of the opaque service.
function __coverage_impl_fn_65bda(runtime, adapters = {}) {
  const interrupt33 = required(adapters, 'interrupt33', 0x65be9);
  const { cpu, memory } = runtime;
  const savedEax = cpu.get('eax');
  memory.write8(0xd8, cpu.get('eax'));
  memory.write8(0xe1, 2);
  setLowByte(cpu, 0x21);
  interrupt33(0x33, runtime);
  cpu.set('eax', savedEax);
}

// 0x6bcbf..0x6bd03. The key byte at 0xe0 is supplied by the interrupt adapter.
function __coverage_impl_fn_6bcbf(runtime, adapters = {}) {
  const interrupt33 = required(adapters, 'interrupt33', 0x6bcd8);
  const writeEs8 = required(adapters, 'writeEs8', 0x6bcf8);
  const { cpu, memory } = runtime;

  cpu.set('edx', u32(cpu.get('esi') + 1));
  fn_65bb0(runtime, adapters);
  cpu.set('edx', 0x6ac0f);
  fn_65bb0(runtime, adapters);

  for (;;) {
    memory.write8(0xe1, 0);
    setLowByte(cpu, 0x16);
    interrupt33(0x33, runtime);
    const al = memory.read8(0xe0);
    setLowByte(cpu, al);
    if (al === 0x1b) tailTransfer(runtime, adapters, 0x12ea);
    if (al < 0x31 || al > memory.read8(cpu.get('esi'))) continue;

    fn_65bda(runtime, adapters);
    const selection = (cpu.get('eax') - 0x31) & 0xff;
    setLowByte(cpu, selection);
    writeEs8(runtime, cpu.get('edi'), selection);
    cpu.set('edi', u32(cpu.get('edi') + 1)); // Original STOSB, DF assumed clear.
    cpu.set('edx', 0x6ac0a);
    fn_65bb0(runtime, adapters);
    return cpu.get('eax');
  }
}

// Complete original routine at 0x6bc28..0x6bd03, including its two table
// driven tail jumps. Meanings of the numeric globals and table contents remain
// deliberately unresolved.
function __coverage_impl_fn_6bc28(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  required(adapters, 'interrupt33', 0x6bcbf);
  required(adapters, 'writeEs8', 0x6bcf8);
  required(adapters, 'tailJump', 0x6bc84);

  cpu.set('edi', 0x64d11);
  cpu.set('esi', 0x6ac1e);
  fn_6bcbf(runtime, adapters);
  if ((cpu.get('eax') & 0xff) !== 0) {
    cpu.set('esi', 0x6ac4e);
    fn_6bcbf(runtime, adapters);
    const choiceIndex = memory.read8(0x64d11);
    cpu.set('ebx', choiceIndex);
    cpu.set('esi', memory.read32(0x64cf8 + choiceIndex * 4));
    fn_6bcbf(runtime, adapters);
    if ((cpu.get('ebx') & 0xff) === 1) {
      cpu.set('esi', 0x6acf3);
      fn_6bcbf(runtime, adapters);
    }
  }

  cpu.set('esi', 0x64d11);
  cpu.set('eax', 0);
  let al = memory.read8(cpu.get('esi'));
  cpu.set('esi', u32(cpu.get('esi') + 1));
  setLowByte(cpu, al);
  const selector = u32(al + al * 2 - 3);
  cpu.set('edx', selector);
  cpu.set('ebx', memory.read32(0x64cf0 + al * 4));
  memory.write32(0x64d0a, cpu.get('ebx'));
  al = (al + 0x31) & 0xff;
  setLowByte(cpu, al);
  if (al === 0x31) tailTransfer(runtime, adapters, 0x1197);

  al = memory.read8(cpu.get('esi'));
  cpu.set('esi', u32(cpu.get('esi') + 1));
  setLowByte(cpu, al);
  cpu.set('ebx', u32((cpu.get('eax') + 0x21) << 4));
  memory.write16(0x64738, cpu.get('ebx'));
  al = memory.read8(cpu.get('esi'));
  cpu.set('esi', u32(cpu.get('esi') + 1));
  setLowByte(cpu, al);
  const tableByteAddress = u32(0x64d15 + cpu.get('edx') + cpu.get('eax'));
  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | memory.read8(tableByteAddress));
  memory.write8(0x6473a, cpu.get('ebx'));
  if ((cpu.get('edx') & 0xff) !== 0) tailTransfer(runtime, adapters, 0x1197);

  al = memory.read8(cpu.get('esi'));
  cpu.set('esi', u32(cpu.get('esi') + 1));
  setLowByte(cpu, al);
  cpu.set('ebx', (cpu.get('ebx') & 0xffff0000) | memory.read16(0x64d04 + al * 2));
  memory.write16(0x64d0e, cpu.get('ebx'));
}

// 0x6bd04..0x6bd1f. The large selected-record worker at 0x65897 retains its
// own unresolved/opaque boundary and is provided by call65897.
function __coverage_impl_fn_6bd04(runtime, adapters = {}) {
  const call65897 = required(adapters, 'call65897', 0x6bd1a);
  const { cpu, memory } = runtime;
  memory.write8(0x645cd, 4);
  cpu.set('esi', memory.read32(0x64d0a));
  cpu.set('ebx', (cpu.get('ebx') & 0xffff0000) | memory.read16(0x64d0e));
  cpu.set('eax', (cpu.get('eax') & 0xffff00ff) | 0x0800);
  call65897(runtime);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_65bb0 = instrumentLift('0x65bb0', 'fn_65bb0', __coverage_impl_fn_65bb0);
export const fn_65bda = instrumentLift('0x65bda', 'fn_65bda', __coverage_impl_fn_65bda);
export const fn_6bc28 = instrumentLift('0x6bc28', 'fn_6bc28', __coverage_impl_fn_6bc28);
export const fn_6bcbf = instrumentLift('0x6bcbf', 'fn_6bcbf', __coverage_impl_fn_6bcbf);
export const fn_6bd04 = instrumentLift('0x6bd04', 'fn_6bd04', __coverage_impl_fn_6bd04);
