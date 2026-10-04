// Original 0x11de PIC-mask query. Port reads and the SS stack write are
// explicit runtime requirements; no PIC state or SS base is inferred.
function __coverage_impl_fn_11de(runtime, { portIn8 } = {}) {
  const { cpu, memory, segments } = runtime;
  const savedEax = cpu.get('eax');
  const savedBl = cpu.get('ebx') & 0xff;
  const savedCl = cpu.get('ecx') & 0xff;
  const savedEsp = cpu.get('esp');
  if (!Number.isInteger(segments?.ssBase)) throw new Error('Unresolved SS base for original PUSH AX');

  const pushedEsp = (savedEsp - 2) >>> 0;
  cpu.set('esp', pushedEsp);
  memory.write16((segments.ssBase + pushedEsp) >>> 0, savedEax & 0xffff);
  if (typeof portIn8 !== 'function') throw new Error('Unresolved PIC input adapter for ports 0xa1 and 0x21');

  const slaveMask = portIn8(0xa1) & 0xff;
  cpu.set('eax', (savedEax & 0xffff0000) | (slaveMask << 8) | slaveMask); // IN AL; MOV AH,AL
  const masterMask = portIn8(0x21) & 0xff;
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | masterMask);
  const shift = savedBl & 0x1f;
  const combined = (cpu.get('eax') & 0xffff) >>> shift;
  const result = combined & 1;
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | ((combined & 0xff) & 1));
  memory.write8((segments.ssBase + pushedEsp) >>> 0, result);
  const restoredAx = memory.read16((segments.ssBase + pushedEsp) >>> 0);
  cpu.set('eax', (savedEax & 0xffff0000) | restoredAx);
  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | savedBl);
  cpu.set('ecx', (cpu.get('ecx') & 0xffffff00) | savedCl);
  cpu.set('esp', savedEsp);
  cpu.setCarry(false); // AND AL,1 clears CF; other arithmetic flags are not modeled by CpuState.
}

// Translation of the bounded PIC mask update routine at 0x11f5.
function __coverage_impl_fn_11f5(runtime) {
  const { cpu, memory, segments } = runtime;
  if (!Number.isInteger(segments?.ssBase)) throw new Error('fn_11f5 requires a resolved SS base for PUSH scratch');

  const push16 = value => {
    const esp = (cpu.get('esp') - 2) >>> 0;
    cpu.set('esp', esp);
    const address = (segments.ssBase + esp) >>> 0;
    memory.write16(address, value & 0xffff);
  };
  const pop16 = register => {
    const esp = cpu.get('esp') >>> 0;
    const address = (segments.ssBase + esp) >>> 0;
    cpu.set(register, (cpu.get(register) & 0xffff0000) | memory.read16(address));
    cpu.set('esp', (esp + 2) >>> 0);
  };

  // PUSH AX/BX/CX/DX, in source order. The original leaves these four words
  // in SS memory after the matching POPs restore the registers.
  push16(cpu.get('eax'));
  push16(cpu.get('ebx'));
  push16(cpu.get('ecx'));
  push16(cpu.get('edx'));

  const shift = cpu.get('ebx') & 0xff;
  let mask = 0xfffe;
  const rotate = shift & 15;
  mask = rotate === 0 ? mask : ((mask << rotate) | (mask >>> (16 - rotate))) & 0xffff;
  const selected = ((cpu.get('eax') & 0xff) << shift) & 0xffff;
  let ax = ((runtime.in8(0xa1) << 8) | runtime.in8(0x21));
  ax = ((ax & mask) | selected) & 0xffff;
  runtime.out8(0x21, ax & 0xff);
  runtime.out8(0xa1, ax >>> 8);

  // POP DX/CX/BX/AX reads the saved stack words and restores the original
  // ESP. Stack bytes intentionally remain observable, as in the machine code.
  pop16('edx');
  pop16('ecx');
  pop16('ebx');
  pop16('eax');
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_11de = instrumentLift('0x11de', 'fn_11de', __coverage_impl_fn_11de);
export const fn_11f5 = instrumentLift('0x11f5', 'fn_11f5', __coverage_impl_fn_11f5);
