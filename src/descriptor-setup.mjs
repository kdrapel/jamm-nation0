import { fn_1189 } from './allocator.mjs';
import { fn_1295 } from './dos-slots.mjs';
import { fn_215ed } from './dos-copy-setup.mjs';
import { fn_2188d } from './recursive-grid-helper.mjs';
import { branch_21c36 } from './startup.mjs';
import { callDosVector as dispatchDosVector, loadSegmentSelector } from './runtime-adapters.mjs';

const MASK32 = 0xffffffff;

function requireLinearBase(base, label) {
  if (!Number.isInteger(base) || base < 0) throw new Error(`${label} is unresolved`);
  return base >>> 0;
}

function ssAddress(ssBase, offset) {
  return (ssBase + (offset >>> 0)) >>> 0;
}

function setLow16(cpu, register, value) {
  cpu.set(register, (cpu.get(register) & 0xffff0000) | (value & 0xffff));
}

// Translation of the raw entry 0x21aea..0x21b65. DOS vector [0x30] and
// selector-to-ES-base resolution stay explicit host boundaries.
function __coverage_impl_fn_21aea(runtime, {
  callDosVector,
  resolveEsSelector,
  fsSelector = runtime.segments.fsSelector,
  fsBase = runtime.segments.fsBase,
  resolveFsSelector,
} = {}) {
  const { cpu, memory } = runtime;
  const ssBase = requireLinearBase(runtime.segments.ssBase, 'SS base');
  const originalEsp = cpu.get('esp');
  const originalEsSelector = runtime.segments.esSelector;
  const originalEsBase = runtime.segments.esBase;
  if (!Number.isInteger(originalEsSelector) || originalEsSelector < 0 || originalEsSelector > 0xffff) {
    throw new Error('Original ES selector is unresolved');
  }
  requireLinearBase(originalEsBase, 'Original ES base');

  // PUSH ES. The allocation-failure branch is non-returning and retains it.
  const afterPushEs = (originalEsp - 4) >>> 0;
  memory.write32(ssAddress(ssBase, afterPushEs), originalEsSelector);
  cpu.set('esp', afterPushEs);
  cpu.set('eax', 0x10000);
  fn_1189(runtime);
  if (cpu.carry) branch_21c36();

  memory.write32(0x21978, cpu.get('eax'));
  const adjusted = (cpu.get('eax') + memory.read32(0x18)) >>> 0;
  cpu.set('eax', adjusted);
  cpu.setCarry(adjusted < memory.read32(0x21978));
  cpu.set('edx', adjusted);
  fn_1295(runtime);

  dispatchDosVector(runtime, 0x30, callDosVector);

  const newEsSelector = cpu.get('eax') & 0xffff;
  memory.write16(0x20c66, newEsSelector);
  if (typeof resolveEsSelector !== 'function') {
    throw new Error(`Unresolved ES base for selector 0x${newEsSelector.toString(16)}`);
  }
  const newEsBase = loadSegmentSelector(runtime, 'es', newEsSelector, resolveEsSelector);

  cpu.set('edi', 0);
  cpu.set('ecx', 0xffff);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0xff);
  for (let offset = 0; offset < 0xffff; offset += 1) runtime.writeEs8(offset, 0xff);
  cpu.set('edi', 0xffff);
  cpu.set('ecx', 0);
  runtime.writeEs8(0, 0);
  runtime.writeEs8(0x80, 0xfe);
  runtime.writeEs8(0x8000, 0xfe);
  runtime.writeEs8(0x8080, 0);
  setLow16(cpu, 'esi', 2);

  // PUSH word 0, PUSH word 0x100, CALL fn_2188d. The recursive helper reads
  // its true SS:ESP+4/+6 frame and consumes the CALL return on completion.
  const argsBase = (afterPushEs - 4) >>> 0;
  memory.write16(ssAddress(ssBase, (afterPushEs - 2) >>> 0), 0);
  memory.write16(ssAddress(ssBase, argsBase), 0x100);
  const childEsp = (argsBase - 4) >>> 0;
  memory.write32(ssAddress(ssBase, childEsp), 0x21b50);
  cpu.set('esp', childEsp);
  fn_2188d(runtime, { esBase: newEsBase, ssBase });

  const afterCall = cpu.get('esp'); // Child RET has consumed its return address.
  cpu.set('esp', (afterCall + 4) >>> 0); // ADD ESP,4 removes the two word args.
  cpu.setCarry(afterCall > MASK32 - 4);
  cpu.set('esp', (cpu.get('esp') + 4) >>> 0); // POP ES.
  runtime.segments.esSelector = originalEsSelector;
  runtime.segments.esBase = originalEsBase;

  const buffer = memory.read32(0x21978);
  cpu.set('edi', buffer);
  cpu.set('esi', buffer);
  fn_215ed(runtime, { fsSelector, fsBase, resolveFsSelector, callDosVector });

  // The enclosing CALL/RET is abstracted like the other address-level lifts;
  // the internal PUSH/POP and fn_2188d argument frame are modeled explicitly.
  cpu.set('esp', originalEsp);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_21aea = instrumentLift('0x21aea', 'fn_21aea', __coverage_impl_fn_21aea);
