import { fn_17cc, fn_6cdcd, fn_6e399 } from './runtime-audio-callbacks.mjs';
import { fn_6ccba } from './sound-dma-setup.mjs';

const SAVED_REGISTERS = ['eax', 'ebx', 'edx'];

function setLogicalFlags8(cpu, value) {
  const result = value & 0xff;
  const mask = 1 | 4 | 0x40 | 0x80 | 0x800;
  let flags = cpu.eflags & ~mask;
  if (result.toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
  if (result === 0) flags |= 0x40;
  if (result & 0x80) flags |= 0x80;
  cpu.setEflags(flags >>> 0);
}

function setAdcFlags16(cpu, left, carryIn) {
  const a = left & 0xffff;
  const sum = a + (carryIn ? 1 : 0);
  const result = sum & 0xffff;
  const mask = 1 | 4 | 0x10 | 0x40 | 0x80 | 0x800;
  let flags = cpu.eflags & ~mask;
  if (sum > 0xffff) flags |= 1;
  if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
  if (carryIn && (a & 0xf) === 0xf) flags |= 0x10;
  if (result === 0) flags |= 0x40;
  if (result & 0x8000) flags |= 0x80;
  if (((~a & result) & 0x8000) !== 0) flags |= 0x800;
  cpu.setEflags(flags >>> 0);
}

function setCmpFlags16(cpu, left, right) {
  const a = left & 0xffff;
  const b = right & 0xffff;
  const result = (a - b) & 0xffff;
  const mask = 1 | 4 | 0x10 | 0x40 | 0x80 | 0x800;
  let flags = cpu.eflags & ~mask;
  if (a < b) flags |= 1;
  if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
  if (((a ^ b ^ result) & 0x10) !== 0) flags |= 0x10;
  if (result === 0) flags |= 0x40;
  if (result & 0x8000) flags |= 0x80;
  if (((a ^ b) & (a ^ result) & 0x8000) !== 0) flags |= 0x800;
  cpu.setEflags(flags >>> 0);
}

function makeAudioHost(runtime, adapters) {
  const host = Object.create(runtime);
  const portIn = adapters.portIn8 ?? adapters.in8;
  const portOut = adapters.portOut8 ?? adapters.out8;
  if (typeof portIn === 'function') {
    host.in8 = port => portIn(runtime, port & 0xffff, { callSite: runtime.cpu.get('eip') >>> 0 });
  }
  if (typeof portOut === 'function') {
    host.out8 = (port, value) => portOut(runtime, port & 0xffff, value & 0xff);
  }
  return host;
}

function setTestFlags8(cpu, left, right) {
  const result = (left & right) & 0xff;
  const mask = 1 | 4 | 0x40 | 0x80 | 0x800;
  let flags = cpu.eflags & ~mask;
  if (result.toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
  if (result === 0) flags |= 0x40;
  if (result & 0x80) flags |= 0x80;
  cpu.setEflags(flags >>> 0);
}

function pushad(runtime) {
  const { cpu, memory, segments } = runtime;
  if (!Number.isInteger(segments?.ssBase)) throw new Error('fn_6ce24 requires a resolved SS base for PUSHA/POPA scratch');
  const entryEsp = cpu.get('esp') >>> 0;
  for (const value of [cpu.get('eax'), cpu.get('ecx'), cpu.get('edx'), cpu.get('ebx'), entryEsp, cpu.get('ebp'), cpu.get('esi'), cpu.get('edi')]) {
    const esp = (cpu.get('esp') - 4) >>> 0;
    cpu.set('esp', esp);
    memory.write32((segments.ssBase + esp) >>> 0, value >>> 0);
  }
}

function popad(runtime) {
  const { cpu, memory, segments } = runtime;
  for (const name of ['edi', 'esi', 'ebp']) {
    const esp = cpu.get('esp') >>> 0;
    cpu.set(name, memory.read32((segments.ssBase + esp) >>> 0));
    cpu.set('esp', (esp + 4) >>> 0);
  }
  cpu.set('esp', (cpu.get('esp') + 4) >>> 0);
  for (const name of ['ebx', 'edx', 'ecx', 'eax']) {
    const esp = cpu.get('esp') >>> 0;
    cpu.set(name, memory.read32((segments.ssBase + esp) >>> 0));
    cpu.set('esp', (esp + 4) >>> 0);
  }
}

function makeDmaAdapters(runtime, host, adapters) {
  return {
    ...adapters,
    callDS28: (rt, target, context) => {
      if (target === 0x08cc) return fn_17cc(rt);
      if (typeof adapters.callDS28 === 'function') return adapters.callDS28(rt, target, context);
      if (typeof adapters.callDosVector28 === 'function') {
        return adapters.callDosVector28(target, rt, context);
      }
      throw new Error(`Unresolved [DS:0x28] target 0x${target.toString(16)} from fn_6ccba`);
    },
    writeES8: adapters.writeES8 ?? adapters.writeEs8
      ?? (typeof runtime.writeEs8 === 'function' ? (rt, offset, value) => rt.writeEs8(offset, value) : undefined),
    gsExchange32: adapters.gsExchange32,
    in8: adapters.in8 ?? adapters.portIn8
      ?? (typeof runtime.in8 === 'function' ? (rt, port) => rt.in8(port) : undefined),
    out8: adapters.out8 ?? adapters.portOut8
      ?? (typeof runtime.out8 === 'function' ? (rt, port, value) => rt.out8(port, value) : undefined),
    interrupt31: adapters.interrupt31
      ? (rt, context) => adapters.interrupt31(rt, { ...context, vector: 0x31 })
      : undefined,
  };
}

function push32(runtime, value) {
  const { cpu, memory, segments } = runtime;
  if (!Number.isInteger(segments?.ssBase)) {
    throw new Error('fn_6cf53 requires a resolved SS base for PUSH EAX/EBX/EDX scratch');
  }
  const esp = (cpu.get('esp') - 4) >>> 0;
  cpu.set('esp', esp);
  memory.write32((segments.ssBase + esp) >>> 0, value);
}

function pop32(runtime, register) {
  const { cpu, memory, segments } = runtime;
  const esp = cpu.get('esp') >>> 0;
  cpu.set(register, memory.read32((segments.ssBase + esp) >>> 0));
  cpu.set('esp', (esp + 4) >>> 0);
}

// Original offset 0x6cfff. This helper only updates a timing word when both
// status bits are set; AX/BX/DX are restored by the original PUSH/POP sequence.
function __coverage_impl_fn_6cfff(runtime) {
  const { cpu, memory, segments } = runtime;
  if (!Number.isInteger(segments?.ssBase)) {
    throw new Error('fn_6cfff requires a resolved SS base for PUSH AX/BX/DX scratch');
  }
  const entryEsp = cpu.get('esp');
  let esp = entryEsp;
  for (const [name, width] of [['eax', 2], ['ebx', 2], ['edx', 2]]) {
    esp = (esp - width) >>> 0;
    memory.write16((segments.ssBase + esp) >>> 0, cpu.get(name) & 0xffff);
  }
  const saved = Object.fromEntries(SAVED_REGISTERS.map(name => [name, cpu.get(name)]));
  const savedCx = cpu.get('ecx');
  const status = memory.read8(0x6bbef);

  cpu.setAndFlags16(status & 6); // AND AL,6
  cpu.setCmpFlags8(status & 6, 6); // CMP AL,6
  if ((status & 6) === 6) {
    const divisor = memory.read8(0x6bbb4); // DS:[0x6b5d0+0x5e4]
    if (divisor === 0) throw new Error('fn_6cfff reached original DIV with a zero divisor');
    const dividend = memory.read16(0x6bbb0); // DS:[0x6b5d0+0x5e0]
    const quotient = Math.floor(dividend / divisor);
    const remainder = dividend % divisor;
    const carryIn = (divisor >>> 1) < remainder;
    const rounded = (quotient + (carryIn ? 1 : 0)) & 0xffff;
    memory.write16(0x6bbac, rounded); // DS:[0x6b5d0+0x5dc]
    setAdcFlags16(cpu, quotient, carryIn); // CMP BX,DX; ADC AX,0 defines final status flags.
  }

  for (const [name, value] of Object.entries(saved)) cpu.set(name, value);
  cpu.set('ecx', savedCx);
  cpu.set('esp', entryEsp); // POP DX/BX/AX restores the incoming stack pointer.
}

// Original offset 0x6cf26 (captured runtime callback pointer 0x6c026).
// DPMI, vector, segment, and device behavior remains an explicit host boundary.
function __coverage_impl_fn_6cf26(runtime, adapters = {}) {
  const { cpu, memory, segments } = runtime;
  const status = memory.read8(0x6bbef); // DS:[0x6b5d0+0x61f]
  cpu.setAndFlags16(status & 1); // TEST byte ptr [...],1
  if ((status & 1) === 0) return;

  if (!Number.isInteger(segments?.ssBase)) {
    throw new Error('fn_6cf26 requires a resolved SS base for PUSH EAX scratch');
  }
  const savedEax = cpu.get('eax');
  const entryEsp = cpu.get('esp');
  const pushedEsp = (entryEsp - 4) >>> 0;
  memory.write32((segments.ssBase + pushedEsp) >>> 0, savedEax); // PUSH EAX
  cpu.set('esp', pushedEsp);
  const host = makeAudioHost(runtime, adapters);
  fn_6cdcd(host, adapters);

  let eax = cpu.get('eax');
  cpu.setCmpFlags8(eax & 0xff, 0x0f); // CMP AL,0Fh
  if ((eax & 0xff) < 0x0f) {
    eax = (eax & 0xffffff00) | 0x0f;
    cpu.set('eax', eax); // MOV AL,0Fh
  }
  memory.write8(0x6bbb4, cpu.get('eax') & 0xff); // DS:[...+0x5e4]
  const updatedStatus = memory.read8(0x6bbef) | 4;
  memory.write8(0x6bbef, updatedStatus); // OR [...+0x61f],4
  setLogicalFlags8(cpu, updatedStatus);
  fn_6cfff(host);

  fn_6ccba(host, makeDmaAdapters(runtime, host, adapters));
  cpu.set('eax', savedEax); // POP EAX; flags retain effects from the callee chain.
  cpu.set('esp', entryEsp);
}

// Original offset 0x6cf53 (captured runtime callback pointer 0x6c053).
// Timer reprogramming and all DPMI/vector/port effects are forwarded to the
// same explicit host boundaries used by the sibling callback.
function __coverage_impl_fn_6cf53(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const status = memory.read8(0x6bbef); // TEST byte ptr DS:[0x6b5d0+0x61f],1
  cpu.setAndFlags16(status & 1);
  if ((status & 1) === 0) return;

  const entryEsp = cpu.get('esp');
  push32(runtime, cpu.get('eax'));
  push32(runtime, cpu.get('ebx'));
  push32(runtime, cpu.get('edx'));
  const host = makeAudioHost(runtime, adapters);

  fn_6cdcd(host, adapters);
  let ax = cpu.get('eax') & 0xffff;
  setCmpFlags16(cpu, ax, 0x54eb);
  if (ax > 0x54eb) {
    ax = 0x54eb;
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | ax);
  }
  setCmpFlags16(cpu, ax, 0x1f40);
  if (ax < 0x1f40) {
    ax = 0x1f40;
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | ax);
  }

  cpu.set('ebx', ax); // MOVZX EBX,AX
  cpu.set('eax', 0x000f4240);
  cpu.set('edx', 0);
  let quotient = Math.floor(0x000f4240 / cpu.get('ebx'));
  let remainder = 0x000f4240 % cpu.get('ebx');
  cpu.set('eax', quotient);
  cpu.set('edx', remainder);
  cpu.setAndFlags16(remainder); // AND EDX,EDX; only ZF affects the branch.
  if (remainder !== 0) {
    quotient = (quotient + 1) >>> 0;
    cpu.set('eax', quotient);
    const mask = 4 | 0x10 | 0x40 | 0x80 | 0x800; // INC preserves CF.
    let flags = cpu.eflags & ~mask;
    if ((quotient & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if ((quotient & 0xf) === 0) flags |= 0x10;
    if (quotient === 0) flags |= 0x40;
    if (quotient & 0x80000000) flags |= 0x80;
    if (quotient === 0x80000000) flags |= 0x800;
    cpu.setEflags(flags >>> 0);
  }

  cpu.set('ebx', cpu.get('eax'));
  cpu.set('eax', 0x000f4240);
  cpu.set('edx', 0);
  quotient = Math.floor(0x000f4240 / cpu.get('ebx'));
  cpu.set('eax', quotient);
  cpu.set('edx', 0x000f4240 % cpu.get('ebx'));
  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | ((cpu.get('ebx') ^ 0xff) & 0xff)); // NOT BL
  memory.write16(0x6bbb0, cpu.get('eax') & 0xffff); // DS:[0x6b5d0+0x5e0]

  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x40);
  fn_6e399(host);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | (cpu.get('ebx') & 0xff));
  fn_6e399(host);

  const timerWord = memory.read16(0x6bbb0);
  cpu.set('eax', timerWord);
  cpu.set('edx', 0);
  quotient = Math.floor(timerWord / 0x48);
  remainder = timerWord % 0x48;
  cpu.set('eax', quotient);
  cpu.set('edx', remainder);
  cpu.set('ebx', 0x48);
  cpu.set('ebx', cpu.get('ebx') >>> 1); // SHR BX,1
  setCmpFlags16(cpu, cpu.get('ebx'), remainder);
  const carryIn = cpu.get('ebx') < remainder;
  const rounded = (quotient + (carryIn ? 1 : 0)) & 0xffff;
  setAdcFlags16(cpu, quotient, carryIn);
  memory.write16(0x6bbae, rounded); // DS:[0x6b5d0+0x5de]

  cpu.set('ebx', rounded); // MOVZX EBX,AX
  let eax = (memory.read32(0x6b968) + cpu.get('ebx')) >>> 0;
  memory.write32(0x6b96c, eax); // DS:[0x6b5d0+0x39c]
  eax = (eax + cpu.get('ebx')) >>> 0;
  memory.write32(0x6b970, eax); // DS:[0x6b5d0+0x3a0]
  const updatedStatus = memory.read8(0x6bbef) | 2;
  memory.write8(0x6bbef, updatedStatus);
  setLogicalFlags8(cpu, updatedStatus);

  fn_6cfff(host);
  fn_6ccba(host, makeDmaAdapters(runtime, host, adapters));
  pop32(runtime, 'edx');
  pop32(runtime, 'ebx');
  pop32(runtime, 'eax');
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | memory.read16(0x6bbb0));
  // POPs restore the entry stack pointer; retain an explicit invariant check
  // so adapter-side stack corruption is not silently normalized.
  if (cpu.get('esp') !== (entryEsp >>> 0)) {
    throw new Error('fn_6cf53 child call did not preserve its saved stack frame');
  }
}

// Original offset 0x6ce24 (captured callback pointer 0x6bf24). The transform
// keeps its table and framebuffer writes in DS/ES memory; all hardware and
// descriptor effects remain explicit through the sibling callback adapters.
function __coverage_impl_fn_6ce24(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const gate = memory.read8(0x6bbef);
  setTestFlags8(cpu, gate, 1);
  if ((gate & 1) === 0) return;

  pushad(runtime);
  const host = makeAudioHost(runtime, adapters);
  fn_6cdcd(host, adapters);

  let eax = cpu.get('eax');
  let al = eax & 0xff;
  cpu.setCmpFlags8(al, 0x10);
  if (al > 0x10) al = 0x10;
  setLogicalFlags8(cpu, al); // AND AL,AL
  if (al === 0) al = 1;
  al = (al - 1) & 0xff;
  cpu.set('eax', (eax & 0xffffff00) | al);
  memory.write8(0x6bbb5, al); // DS:[dword_6b5d0+0x5e5]
  cpu.directionFlag = false; // CLD

  const writeEsByte = adapters.writeES8 ?? adapters.writeEs8
    ?? ((rt, offset, value) => rt.writeEs8(offset, value));
  let esi = 0x6b974;
  let edi = memory.read32(0x6b924);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('eax', 0);
  cpu.set('ecx', 0);
  for (let index = 0; index < 0x100; index += 1) {
    const count = memory.read16(esi + (cpu.get('eax') & 0xff) * 2);
    cpu.set('ecx', count);
    for (let byte = 0; byte < count; byte += 1) writeEsByte(runtime, edi++, 0, { callSite: 0x6ce5e });
    cpu.set('ecx', 0); // REP STOSB consumes CX/ECX.
    cpu.set('edi', edi);
    cpu.set('eax', (cpu.get('eax') + 1) & 0xff); // INC AL
  }

  const active = memory.read8(0x6bbb5) + 1;
  memory.write16(0x6bf20, active);
  memory.write16(0x6bf22, (0x10 - active) & 0xffff);

  esi = memory.read32(0x6b924);
  cpu.set('esi', esi);
  cpu.set('edi', 0);
  for (let index = 0; index < 0x1000; index += 1) {
    edi = cpu.get('edi');
    const sample = memory.read8(esi + edi);
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | sample);
    const y = Math.imul(sample, memory.read16(0x6bf20)) & 0xffff;
    let ebx = edi >>> 4;
    ebx = (ebx & 0xffff0000) | (Math.imul(ebx & 0xffff, memory.read16(0x6bf22)) & 0xffff);
    cpu.set('ebx', ebx >>> 0);
    const scaled = ((y + (ebx & 0xffff)) & 0xffff) >>> 4;
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | scaled);
    memory.write8(esi + edi, scaled & 0xff);
    cpu.set('edi', edi + 1);
  }

  const sampleCount = (memory.read8(0x6bbb5) + 1) * 0xff;
  let inputStep = Math.floor(0x1000 / sampleCount);
  const remainder = 0x1000 % sampleCount;
  let fractionStep = Math.floor((remainder * 0x100000000) / sampleCount) >>> 0;
  esi = memory.read32(0x6b924);
  edi = esi;
  cpu.set('eax', 0x1000);
  cpu.set('edx', remainder);
  cpu.set('ebp', inputStep);
  cpu.set('eax', fractionStep);
  cpu.set('edx', fractionStep); // MOV EDX,EAX after the second DIV.
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ebx', 0);
  cpu.set('ecx', sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const source = memory.read8(esi);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | source);
    writeEsByte(runtime, edi++, source, { callSite: 0x6cee1 });
    const oldFraction = cpu.get('ebx') >>> 0;
    const nextFraction = (oldFraction + fractionStep) >>> 0;
    const carry = oldFraction + fractionStep > 0xffffffff ? 1 : 0;
    cpu.set('ebx', nextFraction);
    esi = (esi + inputStep + carry) >>> 0;
    cpu.set('esi', esi);
    cpu.set('edi', edi);
    cpu.set('ecx', sampleCount - index - 1);
  }

  edi = memory.read32(0x6b928);
  cpu.set('edi', edi);
  cpu.set('ebp', (cpu.get('ebp') & 0xffff0000) | 0x0f);
  cpu.set('ecx', 0);
  cpu.set('ebx', 0);
  for (let y = 0; y < 0x10; y += 1) {
    for (let x = 0; x < 0x100; x += 1) {
      const ebx = cpu.get('ebx') >>> 0;
      cpu.set('eax', cpu.get('ecx'));
      const product = Math.imul(y, x < 0x80 ? x : x - 0x100);
      const numerator = (product + 0x780) & 0xffff;
      const divisor = cpu.get('ebp') & 0xffff;
      const quotient = Math.floor(numerator / divisor) & 0xffff;
      const remainder = numerator % divisor;
      cpu.set('eax', (cpu.get('eax') & 0xffff0000) | quotient);
      cpu.set('edx', (cpu.get('edx') & 0xffff0000) | remainder);
      const address = (cpu.get('edi') + ebx) >>> 0;
      memory.write8(address, quotient & 0xff);
      const nextBl = ((cpu.get('ebx') & 0xff) + 1) & 0xff;
      cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | nextBl);
    }
    edi = (edi + 0x100) >>> 0;
    cpu.set('edi', edi);
    cpu.set('ecx', y + 1);
  }

  const updated = memory.read8(0x6bbef) | 8;
  memory.write8(0x6bbef, updated);
  setLogicalFlags8(cpu, updated);
  fn_6ccba(host, makeDmaAdapters(runtime, host, adapters));
  popad(runtime);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_6ce24 = instrumentLift('0x6ce24', 'fn_6ce24', __coverage_impl_fn_6ce24);
export const fn_6cf26 = instrumentLift('0x6cf26', 'fn_6cf26', __coverage_impl_fn_6cf26);
export const fn_6cf53 = instrumentLift('0x6cf53', 'fn_6cf53', __coverage_impl_fn_6cf53);
export const fn_6cfff = instrumentLift('0x6cfff', 'fn_6cfff', __coverage_impl_fn_6cfff);
