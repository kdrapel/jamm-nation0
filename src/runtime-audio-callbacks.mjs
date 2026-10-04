import { fn_123d } from './phase-helper.mjs';
import { fn_127f } from './hardware-setup.mjs';
import { fn_11de, fn_11f5 } from './pic-mask.mjs';

const u32 = value => value >>> 0;

// Original 0x6e365. It initializes the captured device port and checks for
// response signature 0xaa with the original 0xc8-read bound. Port inputs stay
// host-supplied through runtime.in8; no device response is assumed here.
function __coverage_impl_fn_6e365(runtime) {
  const { cpu, memory } = runtime;
  const savedAx = cpu.get('eax') & 0xffff;
  const savedCx = cpu.get('ecx');
  const savedDx = cpu.get('edx') & 0xffff;
  const port = memory.read16(0x6bba2);

  runtime.out8(port, 1);
  for (let read = 0; read < 4; read += 1) runtime.in8(port);
  runtime.out8(port, 0);

  const responsePort = (port + 4) & 0xffff;
  let ready = false;
  for (let count = 0xc8; count > 0; count -= 1) {
    if (runtime.in8(responsePort) === 0xaa) {
      ready = true;
      break;
    }
  }

  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | savedAx);
  cpu.set('ecx', savedCx);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | savedDx);
  cpu.setCarry(!ready);
}

function invokeInt31(runtime, adapters, callSite) {
  const invoke = adapters.interrupt31
    ?? ((host, context) => host.interrupt(0x31, context));
  invoke(runtime, { vector: 0x31, callSite, ax: runtime.cpu.get('eax') & 0xffff });
}

function callDosVector28(runtime, adapters, callSite) {
  const target = runtime.memory.read32(0x28);
  if (target === 0x08cc) return fn_17cc(runtime);
  if (typeof adapters.callDosVector28 !== 'function') {
    throw new Error(`Unresolved [DS:0x28] target 0x${target.toString(16)} at 0x${callSite.toString(16)}`);
  }
  return adapters.callDosVector28(target, runtime, { callSite });
}

// Original offset 0x17cc (runtime address 0x08cc): update a vector descriptor
// through the table rooted at DS:[0x65f]. The callback pointer and body were
// recovered from the existing protected-mode memory captures.
function __coverage_impl_fn_17cc(runtime) {
  const { cpu, memory, segments } = runtime;
  if (!Number.isInteger(segments?.ssBase)) {
    throw new Error('fn_17cc requires an explicit SS base for PUSH EBX/EDX/EFLAGS scratch');
  }
  const entryEsp = cpu.get('esp');
  const savedEbx = cpu.get('ebx');
  const savedEdx = cpu.get('edx');
  const savedEflags = cpu.eflags;

  memory.write32((segments.ssBase + ((entryEsp - 4) >>> 0)) >>> 0, savedEbx);
  memory.write32((segments.ssBase + ((entryEsp - 8) >>> 0)) >>> 0, savedEdx);
  memory.write32((segments.ssBase + ((entryEsp - 12) >>> 0)) >>> 0, savedEflags);

  cpu.interruptsEnabled = false;
  const vectorIndex = memory.read8(0x100 + (savedEbx & 0xff));
  const descriptor = u32(memory.read32(0x65f) + vectorIndex * 8);
  memory.write16(descriptor, savedEdx & 0xffff);
  cpu.set('edx', savedEdx >>> 16);
  memory.write16(descriptor + 6, cpu.get('edx') & 0xffff);

  cpu.set('ebx', savedEbx);
  cpu.set('edx', savedEdx);
  cpu.setEflags(savedEflags); // POPFD restores the complete incoming flags word.
}

// Original offset 0x6e399: write AL to the captured device port after its
// status bit 7 clears, preserving AX and DX as the original routine does.
function __coverage_impl_fn_6e399(runtime) {
  const { cpu, memory } = runtime;
  const savedEax = cpu.get('eax');
  const savedEdx = cpu.get('edx');
  let eax = savedEax;
  const value = eax & 0xff;
  eax = (eax & 0xffff00ff) | (value << 8);
  cpu.set('eax', eax);

  const port = memory.read16(0x6bba4);
  cpu.set('edx', (savedEdx & 0xffff0000) | port);
  for (;;) {
    const status = runtime.in8(port);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | status);
    cpu.setCarry(false); // OR AL,AL
    if ((status & 0x80) === 0) break;
  }

  const ah = (cpu.get('eax') >>> 8) & 0xff;
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | ah);
  runtime.out8(port, ah);
  cpu.set('eax', savedEax);
  cpu.set('edx', savedEdx);
}

// Original offset 0x6cdcd (runtime 0x6becd): DPMI virtual-interrupt
// save/restore around the DMA unmask, vector update, ES descriptor copy, and
// captured device-port acknowledgement.
function __coverage_impl_fn_6cdcd(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('fn_6cdcd requires a resolved SS base for PUSH/POP scratch');
  const push32 = value => {
    const esp = (cpu.get('esp') - 4) >>> 0;
    cpu.set('esp', esp);
    memory.write32((ssBase + esp) >>> 0, value >>> 0);
  };
  const pop32 = name => {
    const esp = cpu.get('esp') >>> 0;
    const value = memory.read32((ssBase + esp) >>> 0);
    cpu.set('esp', (esp + 4) >>> 0);
    cpu.set(name, value);
  };
  const push16 = value => {
    const esp = (cpu.get('esp') - 2) >>> 0;
    cpu.set('esp', esp);
    memory.write16((ssBase + esp) >>> 0, value & 0xffff);
  };
  const pop16 = () => {
    const esp = cpu.get('esp') >>> 0;
    const value = memory.read16((ssBase + esp) >>> 0);
    cpu.set('esp', (esp + 2) >>> 0);
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | value);
  };

  // The original PUSH EAX / PUSH EBX / PUSH EDX order is observable scratch
  // at entry ESP-4, ESP-8, and ESP-12. PUSH AX below occupies ESP-14.
  push32(cpu.get('eax'));
  push32(cpu.get('ebx'));
  push32(cpu.get('edx'));
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0900);
  invokeInt31(runtime, adapters, 0x6cdd4);
  push16(cpu.get('eax'));

  if (memory.read8(0x6bbef) & 0x10) {
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0xd0);
    fn_6e399(runtime);
    runtime.out8(0x0a, 5);

    cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | memory.read8(0x6bb9e));
    cpu.set('edx', 0x6d45c);
    callDosVector28(runtime, adapters, 0x6cdf7);
    cpu.set('edi', 0x6bb7c);
    fn_123d(runtime);

    const port = memory.read16(0x6bba6);
    cpu.set('edx', (cpu.get('edx') & 0xffff0000) | port);
    const input = runtime.in8(port);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | input);
    memory.write8(0x6bbef, memory.read8(0x6bbef) & 0xef);
  }

  pop16();
  invokeInt31(runtime, adapters, 0x6ce18);
  pop32('edx');
  pop32('ebx');
  pop32('eax');
}

// Original offset 0x6cc70 (runtime callback address 0x6bd70). Its body and
// target slot match all 45 usable checked-in memory snapshots.
function __coverage_impl_fn_6cc70(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const gate = memory.read8(0x6bbef);
  cpu.setCarry(false); // TEST byte ptr [6bbef],1
  if ((gate & 1) === 0) return;

  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('fn_6cc70 requires a resolved SS base for PUSHA/POPAD scratch');
  const originalEsp = cpu.get('esp') >>> 0;
  const pushaEsp = (originalEsp - 32) >>> 0;
  cpu.set('esp', pushaEsp);
  const stack = (ssBase + pushaEsp) >>> 0;
  // PUSHA stores EDI, ESI, EBP, the pre-PUSHA ESP, EBX, EDX, ECX, EAX.
  for (const [index, name] of ['edi', 'esi', 'ebp', null, 'ebx', 'edx', 'ecx', 'eax'].entries()) {
    memory.write32(stack + index * 4, name === null ? originalEsp : cpu.get(name));
  }
  const pushAx = value => {
    const esp = (cpu.get('esp') - 2) >>> 0;
    cpu.set('esp', esp);
    memory.write16((ssBase + esp) >>> 0, value & 0xffff);
  };
  const popAx = () => {
    const esp = cpu.get('esp') >>> 0;
    const ax = memory.read16((ssBase + esp) >>> 0);
    cpu.set('esp', (esp + 2) >>> 0);
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | ax);
  };
  const popa = () => {
    const esp = cpu.get('esp') >>> 0;
    const base = (ssBase + esp) >>> 0;
    for (const [index, name] of ['edi', 'esi', 'ebp', null, 'ebx', 'edx', 'ecx', 'eax'].entries()) {
      if (name !== null) cpu.set(name, memory.read32(base + index * 4));
    }
    cpu.set('esp', (esp + 32) >>> 0);
  };

  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0900);
  invokeInt31(runtime, adapters, 0x6cc7e);
  pushAx(cpu.get('eax'));

  fn_6cdcd(runtime, adapters);
  memory.write8(0x6bbef, 0);

  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | memory.read8(0x6bb9e));
  cpu.set('edx', memory.read32(0x6bb98));
  callDosVector28(runtime, adapters, 0x6cc9a);

  cpu.set('eax', memory.read32(0x6bb94));
  fn_127f(runtime);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | memory.read8(0x6bb9c));
  fn_11f5(runtime);

  popAx();
  invokeInt31(runtime, adapters, 0x6ccb6);
  popa();
}

function requireCallbackAdapter(adapters, name, boundary) {
  if (typeof adapters[name] !== 'function') {
    throw new Error(`fn_6caf0 requires ${name} adapter for ${boundary}`);
  }
  return adapters[name];
}

// Original offset 0x6caf0 (runtime callback address 0x6bbf0). This is the
// complete captured device-initialization callback. Hardware, segmented
// memory, DPMI, and DOS vectors are deliberately supplied by the host.
function __coverage_impl_fn_6caf0(runtime, adapters = {}) {
  const { cpu, memory, segments } = runtime;
  const interrupt31 = requireCallbackAdapter(adapters, 'interrupt31', 'INT 31h at 0x6caf5/0x6cc36/0x6cc66');
  const portIn8 = requireCallbackAdapter(adapters, 'portIn8', 'device/PIC port reads');
  const portOut8 = requireCallbackAdapter(adapters, 'portOut8', 'device/PIC port writes');
  const callDs24 = requireCallbackAdapter(adapters, 'callDs24', 'CALL DWORD PTR DS:[0x24] at 0x6cbf6');
  const callDs28 = requireCallbackAdapter(adapters, 'callDs28', 'CALL DWORD PTR DS:[0x28] at 0x6cc11');
  const writeEs8 = requireCallbackAdapter(adapters, 'writeEs8', 'STOSD at 0x6cbcd');
  const writeEs16 = requireCallbackAdapter(adapters, 'writeEs16', 'fn_123d descriptor transfer');
  const gsExchange32 = requireCallbackAdapter(adapters, 'gsExchange32', 'fn_123d GS descriptor exchange');
  if (!Number.isInteger(segments?.ssBase)) throw new Error('fn_6caf0 requires resolved SS base for PUSHA/PUSH AX');

  const original = Object.fromEntries(['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi']
    .map(name => [name, cpu.get(name)]));
  const pushaEsp = (original.esp - 32) >>> 0;
  cpu.set('esp', pushaEsp);
  const stack = (pushaEsp + segments.ssBase) >>> 0;
  // PUSHA's final memory layout is EDI, ESI, EBP, original ESP, EBX, EDX, ECX, EAX.
  for (const [index, name] of ['edi', 'esi', 'ebp', null, 'ebx', 'edx', 'ecx', 'eax'].entries()) {
    memory.write32(stack + index * 4, name === null ? original.esp : original[name]);
  }
  const pushAx = value => {
    const esp = (cpu.get('esp') - 2) >>> 0;
    cpu.set('esp', esp);
    memory.write16((segments.ssBase + esp) >>> 0, value & 0xffff);
  };
  const popAx = () => {
    const esp = cpu.get('esp') >>> 0;
    const ax = memory.read16((segments.ssBase + esp) >>> 0);
    cpu.set('esp', (esp + 2) >>> 0);
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | ax);
  };

  const host = Object.create(runtime);
  host.in8 = port => portIn8(runtime, port & 0xffff, { callSite: cpu.get('eip') });
  host.out8 = (port, value) => portOut8(runtime, port & 0xffff, value & 0xff);
  host.writeEs8 = (offset, value) => writeEs8(runtime, offset >>> 0, value & 0xff);
  host.writeEs16 = (offset, value) => writeEs16(runtime, offset >>> 0, value & 0xffff);
  host.writeEs32 = (offset, value) => writeEs8(runtime, offset >>> 0, value & 0xff); // STOSD below is explicitly emitted as four bytes.
  host.exchangeGs32 = (offset, value) => gsExchange32(runtime, offset >>> 0, value >>> 0);

  const callInt31 = callSite => interrupt31(runtime, { vector: 0x31, callSite, ax: cpu.get('eax') & 0xffff });
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0900);
  callInt31(0x6caf5);
  pushAx(cpu.get('eax'));
  cpu.setCarry(false); // TEST [0x6bbef],1
  if (memory.read8(0x6bbef) & 1) fn_6cc70(host, adapters);

  let ax = memory.read16(0x64738);
  memory.write16(0x6bba0, ax);
  ax = (ax + 6) & 0xffff; memory.write16(0x6bba2, ax);
  ax = (ax + 6) & 0xffff; memory.write16(0x6bba4, ax);
  ax = (ax + 2) & 0xffff; memory.write16(0x6bba6, ax);

  fn_6e365(host);
  if (cpu.carry) {
    memory.write8(0x6bbed, 0x12);
    cpu.setCarry(false); // AND [0x6bbef],0xfe
    memory.write8(0x6bbef, memory.read8(0x6bbef) & 0xfe);
    popAx(); callInt31(0x6cc66);
    for (const [name, value] of Object.entries(original)) cpu.set(name, value);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x12);
    cpu.setCarry(true); // STC
    return;
  }

  cpu.set('eax', 0x000000d1); fn_6e399(host);
  cpu.set('ebx', 0x2a71);
  if (memory.read32(0x64728) < 0x2a71) {
    memory.write8(0x6bbed, 0x10);
    cpu.setCarry(false); memory.write8(0x6bbef, memory.read8(0x6bbef) & 0xfe);
    popAx(); callInt31(0x6cc66);
    for (const [name, value] of Object.entries(original)) cpu.set(name, value);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x10); cpu.setCarry(true); return;
  }
  memory.write32(0x64724, 0x2a71);
  let eax = (memory.read32(0x6472c) + memory.read32(0x18)) >>> 0;
  let ebx = (eax + 0x2a71) >>> 0;
  if (ebx < eax || ebx >= 0xa0000) {
    memory.write8(0x6bbed, 0x11);
    cpu.setCarry(false); memory.write8(0x6bbef, memory.read8(0x6bbef) & 0xfe);
    popAx(); callInt31(0x6cc66);
    for (const [name, value] of Object.entries(original)) cpu.set(name, value);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x11); cpu.setCarry(true); return;
  }

  ebx = (eax + 0x38a) >>> 0;
  if ((eax >>> 16) !== (ebx >>> 16)) eax = (memory.read32(0x6472c) + 0x38a) >>> 0;
  memory.write32(0x6b968, eax);
  eax = (eax + 0x38a) >>> 0;
  if (eax & 1) eax = (eax + 1) >>> 0;
  memory.write32(0x6b920, eax);
  eax = (eax + 0x25c) >>> 0;
  let aligned = eax & 0xffffff00;
  if ((eax & 0xff) !== 0) aligned = (aligned + 0x100) >>> 0;
  cpu.directionFlag = false;
  cpu.set('eax', aligned);
  for (let i = 0; i < 0x10; i++) {
    const offset = (0x6b928 + i * 4) >>> 0;
    for (let byte = 0; byte < 4; byte++) writeEs8(runtime, (offset + byte) >>> 0, (aligned >>> (byte * 8)) & 0xff, { callSite: 0x6cbcd });
    aligned = (aligned + 0x100) >>> 0;
  }
  memory.write32(0x6b924, aligned);

  const bitIndex = memory.read8(0x6473a) & 0xff;
  const mask = (1 << (bitIndex & 31)) & 0xff;
  if ((mask & memory.read8(0x6bb9d)) === 0) {
    memory.write8(0x6bbed, 0x13);
    cpu.setCarry(false); memory.write8(0x6bbef, memory.read8(0x6bbef) & 0xfe);
    popAx(); callInt31(0x6cc66);
    for (const [name, value] of Object.entries(original)) cpu.set(name, value);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x13); cpu.setCarry(true); return;
  }

  memory.write8(0x6bb9e, bitIndex);
  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | bitIndex);
  const vector24 = memory.read32(0x24);
  const callResult = callDs24(vector24, host, { callSite: 0x6cbf6 });
  if (callResult && Number.isInteger(callResult.edx)) cpu.set('edx', callResult.edx >>> 0);
  memory.write32(0x6bb98, cpu.get('edx'));
  fn_11de(host, { portIn8: port => portIn8(runtime, port, { callSite: 0x11de }) });
  memory.write8(0x6bb9c, cpu.get('eax') & 0xff);
  cpu.set('edx', 0x6d45c);
  const vector28 = memory.read32(0x28);
  callDs28(vector28, host, { callSite: 0x6cc11 });
  cpu.set('eax', 0); fn_11f5(host);
  cpu.set('edi', 0x6bb7c); fn_123d(host);
  memory.write32(0x6bb94, cpu.get('eax'));
  memory.write8(0x6bbef, memory.read8(0x6bbef) | 1);
  cpu.setCarry(false); // OR [0x6bbef],1
  popAx(); callInt31(0x6cc36);
  for (const [name, value] of Object.entries(original)) cpu.set(name, value);
  cpu.setCarry(false); // CLC immediately before RET on success.
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_17cc = instrumentLift('0x17cc', 'fn_17cc', __coverage_impl_fn_17cc);
export const fn_6caf0 = instrumentLift('0x6caf0', 'fn_6caf0', __coverage_impl_fn_6caf0);
export const fn_6cc70 = instrumentLift('0x6cc70', 'fn_6cc70', __coverage_impl_fn_6cc70);
export const fn_6cdcd = instrumentLift('0x6cdcd', 'fn_6cdcd', __coverage_impl_fn_6cdcd);
export const fn_6e365 = instrumentLift('0x6e365', 'fn_6e365', __coverage_impl_fn_6e365);
export const fn_6e399 = instrumentLift('0x6e399', 'fn_6e399', __coverage_impl_fn_6e399);
