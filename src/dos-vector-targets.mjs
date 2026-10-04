// Captured DOS vector target at runtime 0x0916 (original offset 0x1816).
// The 36-byte entry window matches NATION0.EXE in all 34 usable periodic
// captures; it writes the descriptor fields used by the vector-0x30 setup.
function __coverage_impl_fn_1816(runtime) {
  const { cpu, memory, segments } = runtime;
  const ssBase = segments?.ssBase;
  if (!Number.isInteger(ssBase)) {
    throw new Error('fn_1816 requires an explicit SS base for PUSH EAX/EDX scratch');
  }

  const eax = cpu.get('eax');
  const edx = cpu.get('edx');
  const entryEsp = cpu.get('esp');
  memory.write32((ssBase + entryEsp - 4) >>> 0, eax); // PUSH EAX
  memory.write32((ssBase + entryEsp - 8) >>> 0, edx); // PUSH EDX

  const descriptorOffset = eax & 0xffff; // MOVZX EAX,AX
  const descriptorFlags = ((edx & 0x00ffffff) | 0x92000000) >>> 0;
  cpu.setOrFlags32(descriptorFlags); // OR EDX,92000000h; AF is undefined.
  memory.write32((descriptorOffset + 0x36) >>> 0, descriptorFlags);
  memory.write8((descriptorOffset + 0x3b) >>> 0, edx >>> 24); // saved EDX at SS:ESP+3

  // POP EDX/POP EAX restore both registers; the original RET is left to the
  // caller-level runtime convention, while the balanced push bytes remain.
  cpu.set('eax', eax);
  cpu.set('edx', edx);
}

// Captured DOS vector target at runtime 0x08a6 (original offset 0x17a6).
// The complete 38-byte entry window matches the executable in all 34 usable
// periodic captures; this companion routine reads a descriptor selected by BL.
function __coverage_impl_fn_17a6(runtime) {
  const { cpu, memory, segments } = runtime;
  const ssBase = segments?.ssBase;
  if (!Number.isInteger(ssBase)) {
    throw new Error('fn_17a6 requires an explicit SS base for PUSH EBX/EFLAGS scratch');
  }

  const ebx = cpu.get('ebx');
  const eflags = cpu.eflags;
  const entryEsp = cpu.get('esp');
  memory.write32((ssBase + entryEsp - 4) >>> 0, ebx); // PUSH EBX
  memory.write32((ssBase + entryEsp - 8) >>> 0, eflags); // PUSHFD

  const index = memory.read8(0x100 + (ebx & 0xff));
  const descriptor = (memory.read32(0x65f) + index * 8) >>> 0;
  cpu.set('edx', ((memory.read16(descriptor + 6) << 16) | memory.read16(descriptor)) >>> 0);

  cpu.set('ebx', ebx); // POP EBX
  cpu.setEflags(eflags); // POPFD restores flags changed by CLI/ADD.
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_17a6 = instrumentLift('0x17a6', 'fn_17a6', __coverage_impl_fn_17a6);
export const fn_1816 = instrumentLift('0x1816', 'fn_1816', __coverage_impl_fn_1816);
