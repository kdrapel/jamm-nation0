// Small VGA-port and wait helpers shared by the recovered startup effects.

function __coverage_impl_fn_28510(runtime) {
  const { cpu, memory } = runtime;
  const saved = {
    eax: cpu.get('eax'),
    edx: cpu.get('edx'),
    ecx: cpu.get('ecx'),
    esi: cpu.get('esi'),
  };
  let ecx = Math.imul(saved.ecx, 3) >>> 0;
  let esi = saved.esi;
  runtime.out8(0x3c8, saved.eax & 0xff);
  while (true) {
    runtime.out8(0x3c9, memory.read8(esi));
    esi = (esi + 1) >>> 0;
    ecx = (ecx - 1) >>> 0;
    if (ecx === 0) break;
  }
  cpu.set('eax', saved.eax);
  cpu.set('edx', saved.edx);
  cpu.set('ecx', saved.ecx);
  cpu.set('esi', saved.esi);
}

function __coverage_impl_fn_2852b(runtime) {
  const { cpu, memory, segments } = runtime;
  if (!Number.isInteger(segments.ssBase)) throw new Error('fn_2852b requires SS backing for PUSH DX / PUSH AX');
  const eax = cpu.get('eax');
  const edx = cpu.get('edx');
  const esp = cpu.get('esp');
  memory.write16(segments.ssBase + ((esp - 2) >>> 0), edx & 0xffff);
  memory.write16(segments.ssBase + ((esp - 4) >>> 0), eax & 0xffff);
  cpu.set('esp', (esp - 4) >>> 0);
  cpu.set('edx', (edx & 0xffff0000) | 0x3da);
  let al;
  do {
    al = runtime.in8(0x3da);
    cpu.setTestFlags8(al & 8);
  } while ((al & 8) !== 0);
  do {
    al = runtime.in8(0x3da);
    cpu.setTestFlags8(al & 8);
  } while ((al & 8) === 0);
  cpu.set('eax', (eax & 0xffff0000) | memory.read16(segments.ssBase + ((esp - 4) >>> 0)));
  cpu.set('edx', (edx & 0xffff0000) | memory.read16(segments.ssBase + ((esp - 2) >>> 0)));
  cpu.set('esp', esp);
}

// Suffix continuation for a captured original EIP at 0x28539: the IN at
// 0x28538 has already executed, TEST AL,8 is next, and the original helper's
// saved AX/DX and return address remain on the captured SS stack.
export function resumeFn2852bAt0x28539(runtime, { expectedReturn = 0x5e254, maxPortReads = 4096 } = {}) {
  const capturedReturn = {
    capture_000075: 0x5e254,
    capture_000100: 0x5e254,
    capture_000825: 0x5f4a4,
    capture_000875: 0x5f4a4,
    capture_000350: 0x5ed85,
  }[runtime.captureEvidence?.id];
  if (capturedReturn === undefined) throw new Error('0x28539 suffix is grounded only in capture_000075, capture_000100, capture_000350, capture_000825, and capture_000875');
  if (expectedReturn !== capturedReturn) throw new Error(`capture ${runtime.captureEvidence.id} requires return 0x${capturedReturn.toString(16)}`);
  if (runtime.capturedEip !== 0x27639) throw new Error(`capture EIP must be 0x27639, got 0x${runtime.capturedEip?.toString(16)}`);
  const { cpu, memory, segments } = runtime;
  const ssBase = segments.ssBase;
  if (ssBase === null || ssBase === undefined) throw new Error('captured SS base is unavailable');
  const esp = cpu.get('esp');
  const stackAddress = ssBase + esp;
  const savedAx = memory.read16(stackAddress);
  const savedDx = memory.read16(stackAddress + 2);
  const returnAddress = memory.read32(stackAddress + 4);
  if (returnAddress !== expectedReturn) throw new Error(`captured return address must be 0x${expectedReturn.toString(16)}, got 0x${returnAddress.toString(16)}`);

  let status = cpu.get('eax') & 0xff;
  cpu.setTestFlags8(status & 8);
  let portReads = 0;
  while ((status & 8) === 0) {
    if (portReads >= maxPortReads) throw new Error(`VGA retrace-high was not observed within ${maxPortReads} synthetic port reads`);
    status = runtime.in8(0x3da);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | status);
    cpu.setTestFlags8(status & 8);
    portReads += 1;
  }
  cpu.set('eax', ((cpu.get('eax') & 0xffff0000) | savedAx) >>> 0);
  cpu.set('edx', ((cpu.get('edx') & 0xffff0000) | savedDx) >>> 0);
  cpu.set('esp', (esp + 8) >>> 0); // POP AX, POP DX, then 32-bit RET.
  runtime.translatedPc = expectedReturn;
  return { returnAddress, portReads, savedAx, savedDx, finalStatus: status, nextStaticAddress: `0x${(returnAddress + 0xf00).toString(16)}` };
}

// Capture 575 stops at the JZ after TEST AL,8 inside fn_2852b. Its low status
// sample and flags are already present, and the caller return is runtime
// 0x5e606 (original 0x5f506). Continue that exact branch through retrace-high,
// restore the saved 16-bit registers, and consume the helper's 32-bit RET.
export function resumeFn2852bAt0x2853b(runtime, { expectedReturn = 0x5e606, maxPortReads = 4096 } = {}) {
  if (runtime.captureEvidence?.id !== 'capture_000575' || runtime.capturedEip !== 0x2763b) {
    throw new Error('0x2853b suffix is grounded only in capture_000575 at runtime EIP 0x2763b');
  }
  const { cpu, memory, segments } = runtime;
  if (expectedReturn !== 0x5e606) throw new Error('capture_000575 requires caller return 0x5e606');
  const ssBase = segments.ssBase;
  if (ssBase === null || ssBase === undefined) throw new Error('capture_000575 SS base is unavailable');
  const esp = cpu.get('esp');
  const stack = ssBase + esp;
  const savedAx = memory.read16(stack);
  const savedDx = memory.read16(stack + 2);
  const returnAddress = memory.read32(stack + 4);
  if (returnAddress !== expectedReturn) throw new Error(`capture_000575 caller return must be 0x${expectedReturn.toString(16)}, got 0x${returnAddress.toString(16)}`);
  const outerReturn = memory.read32(stack + 8);
  if (outerReturn !== 0x21092) throw new Error(`capture_000575 dispatcher return must be 0x21092, got 0x${outerReturn.toString(16)}`);

  let status = cpu.get('eax') & 0xff;
  if ((status & 8) !== 0 || (cpu.eflags & 0x40) === 0) {
    throw new Error(`capture_000575 must resume at JZ with captured retrace-low/ZF state; AL=0x${status.toString(16)} EFLAGS=0x${cpu.eflags.toString(16)}`);
  }
  cpu.setTestFlags8(status & 8); // The captured JZ takes the loop back to IN.
  let portReads = 0;
  while ((status & 8) === 0) {
    if (portReads >= maxPortReads) throw new Error(`VGA retrace-high was not observed within ${maxPortReads} synthetic port reads`);
    status = runtime.in8(0x3da);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | status);
    cpu.setTestFlags8(status & 8);
    portReads += 1;
  }
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | savedAx);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | savedDx);
  cpu.set('esp', (esp + 8) >>> 0); // POP AX, POP DX, then RET.
  runtime.translatedPc = expectedReturn;
  return { returnAddress, outerReturn, portReads, savedAx, savedDx, finalStatus: status, nextStaticAddress: '0x5f506' };
}

// Translation of the attribute-controller write at 0x28542..0x28558.
function __coverage_impl_fn_28542(runtime) {
  const { cpu } = runtime;
  const eax = cpu.get('eax');
  const edx = cpu.get('edx');
  runtime.in8(0x3da);
  runtime.out8(0x03c0, 0x31);
  runtime.out8(0x03c0, eax & 0xff);
  cpu.set('eax', eax);
  cpu.set('edx', edx);
}

function __coverage_impl_fn_28559(runtime, { index, red, green, blue }) {
  const { cpu } = runtime;
  const eax = cpu.get('eax');
  const edx = cpu.get('edx');
  runtime.out8(0x3c8, index);
  runtime.out8(0x3c9, red);
  runtime.out8(0x3c9, green);
  runtime.out8(0x3c9, blue);
  cpu.set('eax', (eax & 0xffffff00) | (blue & 0xff));
  cpu.set('edx', (edx & 0xffff0000) | 0x3c9);
}

function __coverage_impl_fn_28574(runtime) {
  const { cpu } = runtime;
  const eax = cpu.get('eax');
  const edx = cpu.get('edx');
  const ecx = cpu.get('ecx');
  runtime.out8(0x3c8, 0);
  for (let count = 0; count < 0x300; count += 1) runtime.out8(0x3c9, 0);
  cpu.set('eax', eax);
  cpu.set('edx', edx);
  cpu.set('ecx', ecx);
}

function __coverage_impl_fn_2858b(runtime) {
  const { cpu } = runtime;
  const saved = {
    eax: cpu.get('eax'),
    edx: cpu.get('edx'),
    ecx: cpu.get('ecx'),
    edi: cpu.get('edi'),
  };
  let ecx = Math.imul(saved.ecx, 3) >>> 0;
  let edi = saved.edi;
  let edx = 0x3c7;
  runtime.out8(edx, saved.eax & 0xff);
  edx += 2;
  while (true) {
    runtime.writeEs8(edi, runtime.in8(edx));
    edi = (edi + 1) >>> 0;
    ecx = (ecx - 1) >>> 0;
    if (ecx === 0) break;
  }
  cpu.set('eax', saved.eax);
  cpu.set('edx', saved.edx);
  cpu.set('ecx', saved.ecx);
  cpu.set('edi', saved.edi);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_28510 = instrumentLift('0x28510', 'fn_28510', __coverage_impl_fn_28510);
export const fn_2852b = instrumentLift('0x2852b', 'fn_2852b', __coverage_impl_fn_2852b);
export const fn_28542 = instrumentLift('0x28542', 'fn_28542', __coverage_impl_fn_28542);
export const fn_28559 = instrumentLift('0x28559', 'fn_28559', __coverage_impl_fn_28559);
export const fn_28574 = instrumentLift('0x28574', 'fn_28574', __coverage_impl_fn_28574);
export const fn_2858b = instrumentLift('0x2858b', 'fn_2858b', __coverage_impl_fn_2858b);
