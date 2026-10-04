// Translation of the bounded routines at 0x210ef and 0x21170.  The GS address
// space is deliberately explicit: its DOS ownership and record meaning remain
// unresolved, but the original byte-level scan and decimal/hex parsing do not.

function __coverage_impl_fn_21170(runtime, { esi, edi }) {
  let eax = 0;
  let ecx = 0;

  for (;;) {
    eax = runtime.readGs8(esi);
    esi += 1;
    const digit = (eax - 0x30) & 0xff;
    if (digit > 9) continue;

    ecx = digit;
    for (;;) {
      eax = runtime.readGs8(esi);
      esi += 1;
      const nextDigit = (eax - 0x30) & 0xff;
      if (nextDigit > 9) break;
      ecx = (Math.imul(ecx, edi) + nextDigit) >>> 0;
    }
    runtime.cpu.set('eax', eax);
    runtime.cpu.set('ecx', ecx);
    runtime.cpu.set('esi', esi);
    return { esi, ecx };
  }
}

function __coverage_impl_fn_210ef(runtime) {
  const { memory, cpu } = runtime;
  let esi = runtime.readGs32(0x10);
  esi = runtime.readGs16(esi + 0x2c) << 4;

  for (;;) {
    let edi = 0x201df;
    let ecx = 9;
    while (ecx > 0) {
      const source = runtime.readGs8(esi);
      const pattern = memory.read8(edi);
      esi += 1;
      edi += 1;
      ecx -= 1;
      if (source !== pattern) break;
    }

    if (ecx === 0) {
      ({ esi, ecx } = fn_21170(runtime, { esi, edi: 0x10 }));
      memory.write16(0x1fc04, ecx);
      ({ esi } = fn_21170(runtime, { esi, edi: 0x10 }));
      ({ esi } = fn_21170(runtime, { esi, edi: 0x10 }));
      ({ esi, ecx } = fn_21170(runtime, { esi, edi: 10 }));
      memory.write16(0x1fc06, ecx & 0xff);
      memory.write16(0x1e41c, memory.read16(0x1fc04));
      memory.write8(0x1eb70, 1);
      cpu.set('esi', esi);
      cpu.set('edi', 0x10);
      cpu.set('ecx', ecx);
      cpu.setCarry(false);
      return;
    }

    esi = esi + ecx - 7;
    while (runtime.readGs8(esi - 1) !== 0) esi += 1;
    if (runtime.readGs8(esi) === 0) {
      memory.write16(0x1e41c, memory.read16(0x1fc04));
      cpu.set('esi', esi);
      cpu.setCarry(true);
      return;
    }
  }
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_210ef = instrumentLift('0x210ef', 'fn_210ef', __coverage_impl_fn_210ef);
export const fn_21170 = instrumentLift('0x21170', 'fn_21170', __coverage_impl_fn_21170);
