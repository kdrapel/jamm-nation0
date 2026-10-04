import { fn_65909 } from './dispatch-wrapper.mjs';

const u32 = value => value >>> 0;

function requireAdapter(adapters, name, boundary) {
  if (typeof adapters?.[name] !== 'function') {
    throw new TypeError(`fn_65897 requires ${name} adapter for ${boundary}`);
  }
  return adapters[name];
}

// Lift of the record-to-dispatch transfer at 0x6563c..0x6567f. The copied
// dispatch record is written through ES, and its four function slots remain
// explicit indirect-call boundaries.
function __coverage_impl_fn_6563c(runtime, adapters = {}) {
  const writeEs32 = requireAdapter(adapters, 'writeEs32', 'REP MOVSD to ES:0x645dc');
  const callIndirect = requireAdapter(adapters, 'callIndirect', 'record callback slots at 0x645dc/e4/e8/ec');
  const { cpu, memory } = runtime;
  const saved = Object.fromEntries(['eax', 'ecx', 'esi', 'edi'].map(register => [register, cpu.get(register)]));

  cpu.set('edi', 0x64604);
  cpu.set('ecx', 0);
  cpu.setCarry(false); // XOR ECX,ECX
  memory.write32(0x64604, 0);
  memory.write32(0x64608, 0);
  memory.write32(0x6460c, 0);
  memory.write32(0x64610, 0);

  cpu.set('edi', 0x645dc);
  cpu.set('ecx', 9);
  for (let index = 0; index < 9; index += 1) {
    writeEs32(runtime, u32(cpu.get('edi') + index * 4), memory.read32(u32(saved.esi + index * 4)));
  }
  cpu.set('esi', u32(saved.esi + 0x24));
  cpu.set('edi', 0x64600);
  cpu.set('ecx', 0);

  const callSlot = (slot, callSite) => callIndirect(memory.read32(slot), runtime, { callSite });
  callSlot(0x645dc, 0x6565e);
  callSlot(0x645e4, 0x65664);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | ((cpu.get('eax') >>> 8) & 0xff));
  callSlot(0x645ec, 0x6566c);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | (cpu.get('ebx') & 0xffff));
  callSlot(0x645e8, 0x65675);

  for (const [register, value] of Object.entries(saved)) cpu.set(register, value);
}

// Shared state updater entered from 0x6bd1a. Its post-call function pointer
// and the record callbacks copied by fn_6563c stay host-controlled.
function __coverage_impl_fn_65897(runtime, adapters = {}) {
  const writeEs32 = requireAdapter(adapters, 'writeEs32', 'fn_6563c ES transfer');
  const callIndirect = requireAdapter(adapters, 'callIndirect', 'indirect callbacks at 0x65922/0x6565e/0x658f4');
  const { cpu, memory } = runtime;

  fn_65909(runtime, {
    callIndirect: (target, host) => callIndirect(target, host, { callSite: 0x65922 }),
  });

  memory.write8(0x645d0, 1);
  const savedEax = cpu.get('eax');
  const savedEbx = cpu.get('ebx');
  memory.write32(0x644c4, cpu.get('esi'));

  let ebx = memory.read32(0);
  memory.write32(0x6472c, ebx);
  const al = memory.read8(u32(cpu.get('esi') + 0x24)) & 1;
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | al);
  cpu.setCarry(false); // AND AL,1
  memory.write8(0x645cf, al);
  memory.write8(0x645ce, 0);
  memory.write32(0x64600, 0x297);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x38);
  cpu.set('ebx', (ebx & 0xffff0000) | (savedEbx & 0xffff)); // MOV BX,[ESP]
  fn_6563c(runtime, { writeEs32, callIndirect });

  const delta = memory.read32(0x64724);
  cpu.set('eax', delta);
  const oldAllocator = memory.read32(0);
  const nextAllocator = u32(oldAllocator + delta);
  memory.write32(0, nextAllocator);
  cpu.setCarry(nextAllocator < oldAllocator); // ADD DWORD PTR DS:[0],EAX

  ebx = 0x76;
  cpu.set('ebx', ebx);
  for (;;) {
    const eax = memory.read16(u32(ebx + 0x644dc)); // MOVZX EAX,word [EBX+644dc]
    cpu.set('eax', eax);
    callIndirect(memory.read32(0x645f0), runtime, { callSite: 0x658f4 });

    ebx = cpu.get('ebx');
    memory.write16(u32(ebx + 0x64554), cpu.get('eax') & 0xffff);
    const difference = (ebx - 2) >>> 0;
    cpu.setCarry(ebx < 2); // SUB EBX,2; JAE repeats while CF=0.
    ebx = difference;
    cpu.set('ebx', ebx);
    if (cpu.carry) break;
  }

  cpu.set('ebx', savedEbx); // POP EBX
  cpu.set('eax', savedEax); // POP EAX
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_6563c = instrumentLift('0x6563c', 'fn_6563c', __coverage_impl_fn_6563c);
export const fn_65897 = instrumentLift('0x65897', 'fn_65897', __coverage_impl_fn_65897);
