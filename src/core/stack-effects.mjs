// Observable 32-bit stack effects used by source-level lifts.  These helpers
// deliberately retain bytes below ESP after POP/RET, because the differential
// oracle compares that caller-visible scratch memory.
function ssAddress(runtime, offset) {
  const base = runtime.segments?.ssBase;
  if (!Number.isInteger(base)) throw new Error('x86 stack effect requires an explicit SS base');
  return (base + (offset >>> 0)) >>> 0;
}

export function push32(runtime, value) {
  const esp = (runtime.cpu.get('esp') - 4) >>> 0;
  runtime.cpu.set('esp', esp);
  runtime.memory.write32(ssAddress(runtime, esp), value >>> 0);
  return esp;
}

export function pop32(runtime) {
  const esp = runtime.cpu.get('esp') >>> 0;
  const value = runtime.memory.read32(ssAddress(runtime, esp));
  runtime.cpu.set('esp', (esp + 4) >>> 0);
  return value;
}

export function push16(runtime, value) {
  const esp = (runtime.cpu.get('esp') - 2) >>> 0;
  runtime.cpu.set('esp', esp);
  runtime.memory.write16(ssAddress(runtime, esp), value & 0xffff);
  return esp;
}

export function pop16(runtime) {
  const esp = runtime.cpu.get('esp') >>> 0;
  const value = runtime.memory.read16(ssAddress(runtime, esp));
  runtime.cpu.set('esp', (esp + 2) >>> 0);
  return value;
}

// Intel PUSHA pushes EAX, ECX, EDX, EBX, the pre-instruction ESP, EBP, ESI,
// then EDI. POPA consumes EDI, ESI, EBP, skips saved ESP, EBX, EDX, ECX, EAX.
export function pushad(runtime) {
  const { cpu } = runtime;
  const entryEsp = cpu.get('esp') >>> 0;
  for (const name of ['eax', 'ecx', 'edx', 'ebx']) push32(runtime, cpu.get(name));
  push32(runtime, entryEsp);
  for (const name of ['ebp', 'esi', 'edi']) push32(runtime, cpu.get(name));
}

export function popad(runtime) {
  const { cpu } = runtime;
  for (const name of ['edi', 'esi', 'ebp']) cpu.set(name, pop32(runtime));
  pop32(runtime); // Saved ESP is discarded by POPA.
  for (const name of ['ebx', 'edx', 'ecx', 'eax']) cpu.set(name, pop32(runtime));
}
