import { fn_2165b } from './neighbor-average.mjs';
import { callDosVector as dispatchDosVector, loadSegmentSelector } from './runtime-adapters.mjs';

const BUFFER_LENGTH = 0x10000;
const MASK32 = 0xffffffff;

function setFsFromSelector(runtime, selector, resolveFsSelector) {
  return loadSegmentSelector(runtime, 'fs', selector, resolveFsSelector);
}

function repMovsb(runtime, source, destination, count) {
  const { cpu, memory } = runtime;
  let esi = source >>> 0;
  let edi = destination >>> 0;
  let ecx = count >>> 0;

  while (ecx !== 0) {
    runtime.writeEs8(edi, memory.read8(esi));
    esi = (esi + 1) >>> 0;
    edi = (edi + 1) >>> 0;
    ecx = (ecx - 1) >>> 0;
  }

  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ecx', ecx);
}

function addDsOffsetToEdx(runtime, base) {
  const addend = runtime.memory.read32(0x18);
  const sum = base + addend;
  runtime.cpu.set('edx', sum);
  runtime.cpu.setCarry(sum > MASK32);
}

function callVector30(runtime, callDosVector) {
  dispatchDosVector(runtime, 0x30, callDosVector);
}

// Translation of the reachable entry path at 0x215ed..0x2165a.
// MOV FS is modeled by a required selector resolver; DOS vector [0x30]
// remains an explicit host call with access to the full mutable runtime.
function __coverage_impl_fn_215ed(runtime, { fsSelector, fsBase, resolveFsSelector, callDosVector } = {}) {
  const { cpu, memory } = runtime;
  if (runtime.segments.esBase === null) throw new Error('ES base is unresolved');
  if (!Number.isInteger(fsBase) || fsBase < 0 || fsBase > MASK32) throw new Error('Initial FS base is unresolved');
  if (!Number.isInteger(fsSelector) || fsSelector < 0 || fsSelector > 0xffff) {
    throw new Error('Initial FS selector is unresolved');
  }
  if (typeof resolveFsSelector !== 'function') {
    throw new Error('Unresolved FS selector-to-base resolver');
  }

  // PUSH FS / PUSH EDI / PUSH EDI.
  const originalFsSelector = fsSelector;
  const originalFsBase = fsBase;
  const originalEdi = cpu.get('edi');

  // First, copy DS:[ESI..ESI+0xffff] into ES:[DS:[0x21950]..].
  const buffer = memory.read32(0x21950);
  cpu.set('edi', buffer);
  cpu.set('ecx', BUFFER_LENGTH);
  repMovsb(runtime, cpu.get('esi'), buffer, BUFFER_LENGTH);

  // The branch at 0x215fe skips the alternate entry at 0x21600 and lands here.
  cpu.set('edi', originalEdi); // POP EDI

  const firstFsSelector = memory.read16(0x2194e);
  const firstFsBase = setFsFromSelector(runtime, firstFsSelector, resolveFsSelector);
  fn_2165b(runtime, { fsBase: firstFsBase });

  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | runtime.segments.fsSelector);
  addDsOffsetToEdx(runtime, cpu.get('edi'));
  callVector30(runtime, callDosVector);

  // MOV EDI,[0x21950] / MOV FS,EAX. The DOS callback's EAX selects FS.
  cpu.set('edi', memory.read32(0x21950));
  const secondFsSelector = cpu.get('eax') & 0xffff;
  const secondFsBase = setFsFromSelector(runtime, secondFsSelector, resolveFsSelector);
  fn_2165b(runtime, { fsBase: secondFsBase });

  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | runtime.segments.fsSelector);
  addDsOffsetToEdx(runtime, memory.read32(0x21950));
  callVector30(runtime, callDosVector);

  // POP EDI / MOV ESI,[0x21950] / REP MOVSB / POP FS / RET.
  cpu.set('edi', originalEdi);
  const finalSource = memory.read32(0x21950);
  cpu.set('esi', finalSource);
  cpu.set('ecx', BUFFER_LENGTH);
  repMovsb(runtime, finalSource, originalEdi, BUFFER_LENGTH);

  runtime.segments.fsSelector = originalFsSelector;
  runtime.segments.fsBase = originalFsBase;
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_215ed = instrumentLift('0x215ed', 'fn_215ed', __coverage_impl_fn_215ed);
