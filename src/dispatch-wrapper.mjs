// Mechanical lifts of the small dispatcher wrappers around 0x6bd20 and
// 0x6bd3f.  The indirect call stored at 0x645e0 remains an explicit host
// boundary until its target and register contract are recovered.

function __coverage_impl_fn_65b95(runtime) {
  const { memory, cpu } = runtime;
  memory.write8(0x645d7, 1);
  memory.write8(0x645d8, cpu.get('eax') & 0xff);
  memory.write8(0x645d9, 0);
}

function __coverage_impl_fn_6bd3f(runtime) {
  const { cpu } = runtime;
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 2);
  fn_65b95(runtime);
}

function __coverage_impl_fn_65b59(runtime) {
  const { memory, cpu } = runtime;
  const active = memory.read8(0x645ce);
  cpu.setCmpFlags8(active, 0); // CMP byte [0x645ce],0; JZ preserves these flags.
  if (active === 0) return;

  const savedEax = cpu.get('eax');
  if (runtime.segments.ssBase === null) throw new Error('fn_65b59 requires an explicit SS base for PUSH EAX scratch');
  memory.write32(runtime.segments.ssBase + cpu.get('esp') - 4, savedEax);
  memory.write32(0x64600, 0x297);
  memory.write8(0x645ce, 0);

  const count = memory.read8(0x645cd);
  for (let index = count - 1; index >= 0; index -= 1) {
    memory.write8(0x64714 + index, 0);
    memory.write8(0x64604 + index, 1);
  }

  // The raw SUB AL,1 loop exits on its extra terminal decrement 0 -> 0xff.
  // POP EAX/RET preserve those final arithmetic flags.
  cpu.setCmpFlags8(0, 1);
  cpu.set('eax', savedEax);
}

// Translation of the independent state-reset helper at 0x65ade..0x65b58.
function __coverage_impl_fn_65ade(runtime) {
  const { memory, cpu } = runtime;
  fn_65b59(runtime);
  const savedEax = cpu.get('eax');
  const savedEbx = cpu.get('ebx');
  if (runtime.segments.ssBase === null) throw new Error('fn_65ade requires an explicit SS base for PUSH EAX/PUSH EBX scratch');
  memory.write32(runtime.segments.ssBase + cpu.get('esp') - 4, savedEax);
  memory.write32(runtime.segments.ssBase + cpu.get('esp') - 8, savedEbx);
  const record = memory.read32(0x64450);
  for (let index = 0; index < 4; index += 1) {
    cpu.set('eax', memory.read32(record + 0x22 + index * 4));
    memory.write32(0x644a4 + index * 4, cpu.get('eax'));
  }
  cpu.set('eax', 0);
  for (let index = 0; index < 4; index += 1) memory.write32(0x644b4 + index * 4, 0);
  memory.write8(0x645d7, 0);
  memory.write8(0x645ce, 1);
  memory.write8(0x645d5, 1);
  memory.write8(0x645d2, 1);
  memory.write8(0x645d6, 0x10);
  memory.write8(0x645d1, 7);
  memory.write8(0x645d3, 0xff);
  memory.write32(0x64600, 0x64780);
  cpu.set('ebx', savedEbx);
  cpu.set('eax', savedEax);
  cpu.setOrFlags32(0); // XOR EAX,EAX; subsequent MOV/POP/RET preserve defined flags.
}

function __coverage_impl_fn_65909(runtime, { callIndirect } = {}) {
  const { memory } = runtime;
  if (memory.read8(0x645d0) === 0) return;

  memory.write8(0x645d0, 0);
  fn_65b59(runtime);

  const target = memory.read32(0x645e0);
  if (typeof callIndirect !== 'function') {
    throw new Error(`Unresolved indirect call through [0x645e0] to 0x${target.toString(16)}`);
  }
  callIndirect(target, runtime, { callSite: 0x65922 });
}

// Bounded at 0x6bd2f..0x6bd3e. fn_65929's record processor remains a
// callback boundary; its PUSHA/POPA register preservation is enforced here.
function __coverage_impl_fn_6bd2f(runtime, { processRecord } = {}) {
  const { cpu } = runtime;
  cpu.set('edx', 0x64d1f);
  if (typeof processRecord !== 'function') {
    throw new Error('Unresolved call from fn_6bd2f to fn_65929 at 0x6bd34');
  }

  const savedRegisters = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi']
    .map((register) => [register, cpu.get(register)]);
  processRecord(0x64d1f, runtime);
  for (const [register, value] of savedRegisters) cpu.set(register, value);
  fn_65ade(runtime);
}

function __coverage_impl_fn_6bd20(runtime, options) {
  // The original JNZ at 0x6bd27 has a zero displacement and lands directly
  // on the call either way; preserve the read but do not invent a branch.
  runtime.memory.read8(0x64d10);
  fn_65909(runtime, options);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_65909 = instrumentLift('0x65909', 'fn_65909', __coverage_impl_fn_65909);
export const fn_65ade = instrumentLift('0x65ade', 'fn_65ade', __coverage_impl_fn_65ade);
export const fn_65b59 = instrumentLift('0x65b59', 'fn_65b59', __coverage_impl_fn_65b59);
export const fn_65b95 = instrumentLift('0x65b95', 'fn_65b95', __coverage_impl_fn_65b95);
export const fn_6bd20 = instrumentLift('0x6bd20', 'fn_6bd20', __coverage_impl_fn_6bd20);
export const fn_6bd2f = instrumentLift('0x6bd2f', 'fn_6bd2f', __coverage_impl_fn_6bd2f);
export const fn_6bd3f = instrumentLift('0x6bd3f', 'fn_6bd3f', __coverage_impl_fn_6bd3f);
