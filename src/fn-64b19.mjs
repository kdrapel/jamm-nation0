// 0x64b19..0x64b3a. Stateful 32-bit multiply/add/rotate generator. EDX is
// saved and restored around the unsigned MUL; EAX returns the shifted result.
function __coverage_impl_fn_64b19(runtime) {
  const { cpu, memory } = runtime;
  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('fn_64b19 requires a resolved SS base for PUSH/POP EDX scratch');
  const originalEsp = cpu.get('esp');
  const pushedEsp = (originalEsp - 4) >>> 0;
  memory.write32((ssBase + pushedEsp) >>> 0, cpu.get('edx'));
  cpu.set('esp', pushedEsp);
  const state = memory.read32(0x63c15);
  const product = BigInt(state) * 0x41fbf0e7n;
  let eax = (Number(product & 0xffffffffn) + 0x00904e19) >>> 0;
  memory.write32(0x63c15, eax);
  const shiftedOut = (eax >>> 14) & 1;
  eax >>>= 15;
  let flags = cpu.eflags & ~0xc5; // SHR updates CF/PF/ZF/SF; OF/AF are undefined at count 15.
  if (shiftedOut) flags |= 1;
  if (eax === 0) flags |= 0x40;
  if (eax & 0x80000000) flags |= 0x80;
  let lowByte = eax & 0xff;
  lowByte ^= lowByte >>> 4;
  lowByte &= 0x0f;
  if (((0x6996 >>> lowByte) & 1) === 0) flags |= 0x04;
  const nextState = memory.read32(0x63c15);
  const rotated = ((nextState << 3) | (nextState >>> 29)) >>> 0;
  memory.write32(0x63c15, rotated);
  flags = (flags & ~1) | (rotated & 1); // ROL's defined final CF.
  cpu.setEflags(flags >>> 0);
  cpu.set('edx', memory.read32((ssBase + pushedEsp) >>> 0));
  cpu.set('esp', originalEsp);
  cpu.set('eax', eax);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_64b19 = instrumentLift('0x64b19', 'fn_64b19', __coverage_impl_fn_64b19);
