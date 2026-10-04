function rol32(value, count) {
  const shift = count & 31;
  return shift === 0 ? value >>> 0 : ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

import { popad, pushad } from './core/stack-effects.mjs';

// Translation of 0x37732. PUSHA/POPA restore every caller register except the
// saved EAX stack slot deliberately replaced at 0x3779d.
function __coverage_impl_fn_37732(runtime) {
  const { cpu, memory } = runtime;
  // 0x37732 PUSHA; 0x3779d replaces the saved EAX slot before POPA.
  pushad(runtime);
  const input = cpu.get('eax');
  let bitGroup = input === 0 ? 0 : Math.floor(Math.log2(input)) >>> 3;
  let working = rol32(input, 0x20 - (bitGroup << 3));
  let value = working & 0xff;
  let scan = 0;
  let remaining = 0x10;
  let belowTableValue = false;
  for (; remaining > 0;) {
    const tableValue = runtime.readEs8(0x36822 + scan);
    scan += 1;
    if (value === tableValue) break;
    if (value < tableValue) {
      scan -= 1;
      belowTableValue = true;
      break;
    }
    // SCAS advances EDI but leaves ECX alone; the fall-through LOOP handles
    // only greater-than entries and decrements ECX once.
    remaining -= 1;
  }
  if (remaining === 0) scan = 0x10;
  let previous = runtime.readEs8(0x36822 + scan - 1);
  let index = remaining === 0
    ? 0x0f
    : (((remaining - (belowTableValue ? 0 : 1)) & 0xff) ^ 0x0f);
  // The first SUB is at 0x37775; LOOP targets 0x37777 (SHLD), so this
  // subtraction by the table byte happens once before the recurrence.
  value = (value - previous) >>> 0;
  let iterations = bitGroup;
  let finalSub = null;
  while (iterations > 0) {
    value = ((value << 8) | (working >>> 24)) >>> 0;
    working = rol32(working, 8);
    let divisor = Math.imul(index, 0x20) >>> 0;
    let quotient = Math.floor(value / divisor) >>> 0;
    index = rol32(index, 4);
    index = (index + quotient) >>> 0;
    divisor = (divisor + quotient) >>> 0;
    const numerator = value;
    let product = Math.imul(quotient, divisor) >>> 0;
    let remainder = numerator - product;
    finalSub = { left: numerator, right: product, result: remainder >>> 0 };
    // JB after SUB enters a correction loop that reuses the same numerator.
    while (remainder < 0) {
      divisor = (divisor - 1) >>> 0;
      index = (index - 1) >>> 0;
      product = Math.imul(divisor & 0x1f, divisor) >>> 0;
      remainder = numerator - product;
      finalSub = { left: numerator, right: product, result: remainder >>> 0 };
    }
    value = remainder >>> 0;
    iterations -= 1;
  }
  if (finalSub) {
    const { left, right, result } = finalSub;
    const flagMask = 0x8d5; // CF, PF, AF, ZF, SF, OF
    let flags = cpu.eflags & ~flagMask;
    if (left < right) flags |= 0x001;
    if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 0x004;
    if (((left ^ right ^ result) & 0x10) !== 0) flags |= 0x010;
    if (result === 0) flags |= 0x040;
    if (result & 0x80000000) flags |= 0x080;
    if (((left ^ right) & (left ^ result) & 0x80000000) !== 0) flags |= 0x800;
    cpu.setEflags(flags >>> 0);
  }
  memory.write32((runtime.segments.ssBase + ((cpu.get('esp') + 0x1c) >>> 0)) >>> 0, index);
  popad(runtime);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_37732 = instrumentLift('0x37732', 'fn_37732', __coverage_impl_fn_37732);
