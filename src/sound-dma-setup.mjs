const u32 = value => value >>> 0;
const u16 = value => value & 0xffff;

function requireAdapter(adapters, name) {
  if (typeof adapters[name] !== 'function') {
    throw new Error(`fn_6ccba requires explicit ${name} adapter`);
  }
  return adapters[name];
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

function writeEsByte(runtime, adapters, offset, value, callSite) {
  requireAdapter(adapters, 'writeES8')(runtime, u32(offset), value & 0xff, { callSite });
}

function indirectVector28(runtime, adapters, callSite) {
  const target = runtime.memory.read32(0x28);
  requireAdapter(adapters, 'callDS28')(runtime, target, { callSite });
}

// Exact helper body at original offset 0x123d. The descriptor/table exchange
// is intentionally delegated because GS base semantics are capture-specific.
function initializeVectorDescriptor(runtime, adapters, { edi, bl, edx, savedEsi, callSite }) {
  const { cpu, memory } = runtime;
  const source = u32(edi);
  let eax = u32(source + 0x0d);
  memory.write32(0x32c, eax);
  eax = u32(0 - u32(eax + 7 - edx));
  memory.write32(0x338, eax);

  // MOVSD x5 followed by MOVSB. The original helper copies the 21-byte
  // descriptor at DS:[0x328] into ES:[the caller's EDI].
  for (let index = 0; index < 21; index += 1) {
    writeEsByte(runtime, adapters, source + index, memory.read8(0x328 + index), callSite);
  }

  // MOV EAX,EDI occurs before the six string operations, so EAX retains the
  // incoming source offset while EDI advances for the ES destination copy.
  eax = u32(source + memory.read32(0x18));
  eax = u32(eax << 12);
  eax = (eax & 0xffff0000) | ((eax & 0xffff) >>> 12);
  let slot = bl & 0xff;
  if (slot >= 8) slot += 0x60;
  const gsOffset = u32(0x20 + slot * 4);
  const oldValue = requireAdapter(adapters, 'gsExchange32')(runtime, gsOffset, eax, { callSite });
  if (!Number.isInteger(oldValue)) throw new Error('gsExchange32 must return the prior 32-bit GS value');
  cpu.set('eax', u32(oldValue)); // XCHG returns the prior GS table entry in EAX.
  cpu.set('edi', u32(edi)); // PUSH/POP EDI in sub_123d.
  cpu.set('esi', savedEsi);
  cpu.setCarry((bl & 0xff) < 8 || (bl & 0xff) >= 0xa0);
}

function deviceWriteAfterReady(runtime, adapters, value, callSite) {
  const { cpu, memory } = runtime;
  const savedEax = cpu.get('eax');
  const savedEdx = cpu.get('edx');
  const input = requireAdapter(adapters, 'in8');
  const output = requireAdapter(adapters, 'out8');
  const port = memory.read16(0x6bba4); // DS:[dword_6b5d0+0x5d4]

  // PUSH AX / PUSH DX; MOV AH,AL; poll while IN AL,DX has SF=1.
  let eax = (savedEax & 0xffff00ff) | ((value & 0xff) << 8);
  cpu.set('eax', eax);
  cpu.set('edx', (savedEdx & 0xffff0000) | port);
  for (;;) {
    const status = input(runtime, port, { callSite: 0x6e3a6 });
    eax = (cpu.get('eax') & 0xffffff00) | (status & 0xff);
    cpu.set('eax', eax);
    cpu.setCarry(false); // OR AL,AL clears CF.
    if ((status & 0x80) === 0) break;
  }
  const ah = (cpu.get('eax') >>> 8) & 0xff;
  output(runtime, port, ah, { callSite: 0x6e3ad });
  cpu.set('eax', savedEax);
  cpu.set('edx', savedEdx);
}

function fillDwords(memory, address, value, count) {
  for (let index = 0; index < count; index += 1) memory.write32(address + index * 4, value);
}

// Original offset 0x6ccba. It preserves all GPRs through PUSHA/POPA. All
// protected-mode, indirect-vector, segmented-memory, and device effects must
// be supplied explicitly by adapters; absent effects fail at their boundary.
function __coverage_impl_fn_6ccba(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('fn_6ccba requires a resolved SS base for PUSHA/POPA scratch');
  const entryEsp = cpu.get('esp') >>> 0;
  const pushad = [
    cpu.get('eax'), cpu.get('ecx'), cpu.get('edx'), cpu.get('ebx'),
    entryEsp, cpu.get('ebp'), cpu.get('esi'), cpu.get('edi'),
  ];
  for (const value of pushad) {
    const esp = (cpu.get('esp') - 4) >>> 0;
    cpu.set('esp', esp);
    memory.write32((ssBase + esp) >>> 0, value >>> 0);
  }
  const popad = () => {
    for (const name of ['edi', 'esi', 'ebp']) {
      const esp = cpu.get('esp') >>> 0;
      cpu.set(name, memory.read32((ssBase + esp) >>> 0));
      cpu.set('esp', (esp + 4) >>> 0);
    }
    cpu.set('esp', (cpu.get('esp') + 4) >>> 0); // POPA discards the saved ESP slot.
    for (const name of ['ebx', 'edx', 'ecx', 'eax']) {
      const esp = cpu.get('esp') >>> 0;
      cpu.set(name, memory.read32((ssBase + esp) >>> 0));
      cpu.set('esp', (esp + 4) >>> 0);
    }
  };

  const flags = memory.read8(0x6bbef); // DS:[dword_6b5d0+0x61f]
  setTestFlags8(cpu, flags, 0x10); // TEST [flag],10h
  if ((flags & 0x10) !== 0) {
    popad();
    return;
  }
  const lowNibble = flags & 0x0f; // AND AL,0fh
  cpu.setCmpFlags8(lowNibble, 0x0f); // CMP AL,0fh
  if (lowNibble !== 0x0f) {
    popad();
    return;
  }

  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x0900);
  requireAdapter(adapters, 'interrupt31')(runtime, { callSite: 0x6ccd6, vector: 0x31, ax: 0x0900 });
  const savedAx = cpu.get('eax') & 0xffff;
  cpu.directionFlag = false; // CLD; subsequent string instructions advance.

  // CLD; REP STOSW / ADC ECX,ECX / REP STOSB. Exactly three bytes per
  // configured unit are written through ES, including the odd trailing byte.
  const clearBytes = memory.read16(0x6bbae) * 3; // word ptr dword_6b5d0+0x5de
  let clearAddress = memory.read32(0x6b968); // dword_6b5d0+0x398
  const words = Math.floor(clearBytes / 2);
  for (let index = 0; index < words; index += 1) {
    writeEsByte(runtime, adapters, clearAddress++, 0x80, 0x6ccf1);
    writeEsByte(runtime, adapters, clearAddress++, 0x80, 0x6ccf1);
  }
  if ((clearBytes & 1) !== 0) writeEsByte(runtime, adapters, clearAddress, 0x80, 0x6ccf6);

  memory.write8(0x6bb74, 2); // +0x5a4
  memory.write8(0x6bb75, 0); // +0x5a5
  memory.write32(0x6bba8, 1); // +0x5d8

  fillDwords(memory, 0x6b730, memory.read32(0x6b928), 0x10); // +0x358
  fillDwords(memory, 0x6b770, 0, 0x1c);
  fillDwords(memory, 0x6b7e0, 0x6bbec, 0x10);
  fillDwords(memory, 0x6b820, 1, 0x10);
  fillDwords(memory, 0x6b860, 0, 0x30);

  // MOV [flag+0x61e],0 and load BL for the callback at DS:[0x28].
  memory.write8(0x6bbee, 0);
  cpu.set('eax', 0);
  cpu.set('ecx', 0);
  cpu.set('edi', 0x6b920);
  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | memory.read8(0x6bb9e));
  cpu.set('edx', 0x6c1b4);
  indirectVector28(runtime, adapters, 0x6cd5d);

  cpu.set('edi', 0x6bb7c);
  initializeVectorDescriptor(runtime, adapters, {
    edi: 0x6bb7c,
    bl: cpu.get('ebx') & 0xff,
    edx: cpu.get('edx'),
    savedEsi: cpu.get('esi'),
    callSite: 0x6cd68,
  });

  const output = requireAdapter(adapters, 'out8');
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 5);
  output(runtime, 0x0a, 5, { callSite: 0x6cd6f });
  cpu.set('eax', cpu.get('eax') & 0xffffff00);
  cpu.setCarry(false); // XOR AL,AL
  output(runtime, 0x0c, 0, { callSite: 0x6cd73 });
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x59);
  output(runtime, 0x0b, 0x59, { callSite: 0x6cd77 });

  let dmaAddress = u32(memory.read32(0x6b968) + memory.read32(0x18));
  cpu.set('eax', dmaAddress);
  output(runtime, 0x02, dmaAddress & 0xff, { callSite: 0x6cd84 });
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | ((dmaAddress >>> 8) & 0xff));
  output(runtime, 0x02, (dmaAddress >>> 8) & 0xff, { callSite: 0x6cd88 });
  dmaAddress >>>= 16;
  cpu.set('eax', dmaAddress);
  output(runtime, 0x83, dmaAddress & 0xff, { callSite: 0x6cd8d });

  let dmaCount = u32(memory.read16(0x6bbae) * 3);
  cpu.set('eax', dmaCount);
  dmaCount = (dmaCount & 0xffff0000) | u16(dmaCount - 1);
  cpu.set('eax', dmaCount);
  output(runtime, 0x03, dmaCount & 0xff, { callSite: 0x6cd9b });
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | ((dmaCount >>> 8) & 0xff));
  output(runtime, 0x03, (dmaCount >>> 8) & 0xff, { callSite: 0x6cd9f });
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 1);
  output(runtime, 0x0a, 1, { callSite: 0x6cda3 });

  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x14);
  deviceWriteAfterReady(runtime, adapters, 0x14, 0x6cda7);
  const configuredCount = memory.read16(0x6bbae);
  const lowCount = u16(configuredCount - 1);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | lowCount);
  deviceWriteAfterReady(runtime, adapters, lowCount & 0xff, 0x6cdb4);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | ((lowCount >>> 8) & 0xff));
  deviceWriteAfterReady(runtime, adapters, (lowCount >>> 8) & 0xff, 0x6cdbb);

  memory.write8(0x6bbef, memory.read8(0x6bbef) | 0x10);
  cpu.setCarry(false); // OR byte ptr [flag],10h
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | savedAx);
  requireAdapter(adapters, 'interrupt31')(runtime, { callSite: 0x6cdc9, vector: 0x31, ax: savedAx });

  popad();
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_6ccba = instrumentLift('0x6ccba', 'fn_6ccba', __coverage_impl_fn_6ccba);
