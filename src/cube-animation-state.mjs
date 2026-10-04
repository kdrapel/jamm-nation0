const STATE = 0x361f4;
const DURATION = 0x361f6;
const REMAINING = 0x361f8;
const TARGET = 0x361fa;
const CURRENT = 0x36200;
const VELOCITY = 0x36206;
const EVENT_CURSOR = 0x361f0;
const OUTPUT = 0x36380;
const SINE_TABLE = 0x2198c;
const MASK32 = 0xffffffff;
import { push32, pop32 } from './core/stack-effects.mjs';

function signed16(value) {
  return (value << 16) >> 16;
}

function writeWordAt(memory, address, value) {
  memory.write16(address, value & 0xffff);
}

function setEax(cpu, value) {
  cpu.set('eax', value >>> 0);
}

function setEbx(cpu, value) {
  cpu.set('ebx', value >>> 0);
}

function setEdx(cpu, value) {
  cpu.set('edx', value >>> 0);
}

function addEsi(cpu, amount) {
  const before = cpu.get('esi');
  const result = (before + amount) >>> 0;
  const mask = 1 | 4 | 0x10 | 0x40 | 0x80 | 0x800;
  let flags = cpu.eflags & ~mask;
  if (result < before) flags |= 1;
  if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
  if (((before ^ amount ^ result) & 0x10) !== 0) flags |= 0x10;
  if (result === 0) flags |= 0x40;
  if (result & 0x80000000) flags |= 0x80;
  if ((~(before ^ amount) & (before ^ result) & 0x80000000) !== 0) flags |= 0x800;
  cpu.set('esi', result);
  cpu.setEflags(flags);
}

function imulEaxBy(runtime, operand) {
  const { cpu } = runtime;
  const left = BigInt(cpu.get('eax') | 0);
  const right = BigInt(operand | 0);
  const product = left * right;
  setEax(cpu, Number(BigInt.asUintN(32, product)));
  setEdx(cpu, Number(BigInt.asUintN(32, product >> 32n)));
}

function idivEddxEaxBy(runtime, divisor) {
  const { cpu } = runtime;
  if (divisor === 0) throw new RangeError('fn_3734f reached an x86 IDIV by zero');
  const dividend = (BigInt(cpu.get('edx') >>> 0) << 32n) | BigInt(cpu.get('eax') >>> 0);
  const signedDividend = BigInt.asIntN(64, dividend);
  const quotient = signedDividend / BigInt(divisor | 0);
  const remainder = signedDividend % BigInt(divisor | 0);
  if (quotient < -0x80000000n || quotient > 0x7fffffffn) {
    throw new RangeError('fn_3734f reached an x86 IDIV quotient overflow');
  }
  setEax(cpu, Number(BigInt.asUintN(32, quotient)));
  setEdx(cpu, Number(BigInt.asUintN(32, remainder)));
}

function divEddxEaxBy(runtime, divisor) {
  const { cpu } = runtime;
  if (divisor === 0) throw new RangeError('fn_3734f reached an x86 DIV by zero');
  const dividend = (BigInt(cpu.get('edx') >>> 0) << 32n) | BigInt(cpu.get('eax') >>> 0);
  const quotient = dividend / BigInt(divisor >>> 0);
  const remainder = dividend % BigInt(divisor >>> 0);
  if (quotient > 0xffffffffn) throw new RangeError('fn_3734f reached an x86 DIV quotient overflow');
  setEax(cpu, Number(quotient));
  setEdx(cpu, Number(remainder));
}

function mulEaxBy(runtime, operand) {
  const { cpu } = runtime;
  const product = BigInt(cpu.get('eax') >>> 0) * BigInt(operand >>> 0);
  setEax(cpu, Number(BigInt.asUintN(32, product)));
  setEdx(cpu, Number(BigInt.asUintN(32, product >> 32n)));
}

function copyTargetToCurrentAndOutput(memory) {
  const xAndY = memory.read32(TARGET);
  const z = memory.read16(TARGET + 4);
  memory.write16(STATE, 0);
  memory.write32(CURRENT, xAndY);
  memory.write32(OUTPUT, xAndY);
  memory.write16(CURRENT + 4, z);
  memory.write16(OUTPUT + 4, z);
}

function parseEvent(runtime, callEventHandler) {
  const { cpu, memory } = runtime;
  let esi = memory.read32(EVENT_CURSOR);
  cpu.set('esi', esi);

  // Event 0 is a coordinate snap and can be followed by one more event in
  // this same invocation. Every other recognized event advances once and
  // exits through the shared epilogue.
  if (memory.read16(esi) === 0) {
    setEax(cpu, memory.read32(esi + 2));
    memory.write32(OUTPUT, cpu.get('eax'));
    memory.write32(CURRENT, cpu.get('eax'));
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | memory.read16(esi + 6));
    memory.write16(OUTPUT + 4, cpu.get('eax') & 0xffff);
    memory.write32(CURRENT + 4, cpu.get('eax'));
    memory.write16(STATE, 0);
    esi = (esi + 8) >>> 0;
    addEsi(cpu, 8);
    memory.write32(EVENT_CURSOR, esi);
  }

  let opcode = memory.read16(esi);
  if (opcode === 1 || opcode === 5) {
    memory.write16(STATE, opcode);
    const duration = memory.read16(esi + 2);
    memory.write16(DURATION, duration);
    memory.write16(REMAINING, duration);
    setEax(cpu, memory.read32(esi + 4));
    memory.write32(TARGET, cpu.get('eax'));
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | memory.read16(esi + 8));
    memory.write16(TARGET + 4, cpu.get('eax') & 0xffff);
    esi = (esi + 0x0a) >>> 0;
    addEsi(cpu, 0x0a);
    memory.write32(EVENT_CURSOR, esi);
    return;
  }

  if (opcode === 3) {
    const duration = memory.read16(esi + 2);
    memory.write16(REMAINING, duration);
    memory.write16(STATE, 3);
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | duration);
    esi = (esi + 4) >>> 0;
    addEsi(cpu, 4);
    memory.write32(EVENT_CURSOR, esi);
    return;
  }

  if (opcode === 2) {
    setEax(cpu, memory.read32(esi + 2));
    memory.write32(VELOCITY, cpu.get('eax'));
    setEax(cpu, memory.read32(esi + 6));
    memory.write16(VELOCITY + 4, cpu.get('eax') & 0xffff);
    esi = (esi + 8) >>> 0;
    addEsi(cpu, 8);
    memory.write32(EVENT_CURSOR, esi);
    return;
  }

  if (opcode === 4) {
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | memory.read16(esi + 2));
    memory.write16(0x36295, cpu.get('eax') & 0xffff);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | memory.read8(esi + 4));
    memory.write8(0x36297, cpu.get('eax') & 0xff);
    esi = (esi + 5) >>> 0;
    addEsi(cpu, 5);
    memory.write32(EVENT_CURSOR, esi);
    return;
  }

  if (opcode === 6) {
    const target = memory.read32(esi + 2);
    if (typeof callEventHandler !== 'function') {
      throw new Error(`fn_3734f opcode 6 at 0x${esi.toString(16)} requires callEventHandler for 0x${target.toString(16)}`);
    }
    callEventHandler(runtime, { target, eventAddress: esi });
    esi = (cpu.get('esi') + 6) >>> 0;
    addEsi(cpu, 6);
    memory.write32(EVENT_CURSOR, esi);
    return;
  }

  if (opcode === 0xff) memory.write16(STATE, 0xff);
  // Unsupported command words intentionally leave the event cursor untouched.
}

// Translation of the state updater at 0x3734f..0x37656. It updates the
// actor record addressed by ESI and consumes the original packed event stream.
// The event opcode 6 is an indirect call through DS:[ESI+2] and therefore
// requires an explicit callEventHandler(runtime,{target,eventAddress}) adapter.
function __coverage_impl_fn_3734f(runtime, { callEventHandler } = {}) {
  const { cpu, memory } = runtime;
  const actor = cpu.get('esi');
  push32(runtime, actor); // original 0x3734f PUSH ESI

  setEax(cpu, memory.read32(VELOCITY));
  memory.write32(actor + 0x2e, (memory.read32(actor + 0x2e) + cpu.get('eax')) >>> 0);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | memory.read16(VELOCITY + 4));
  memory.write16(actor + 0x32, (memory.read16(actor + 0x32) + (cpu.get('eax') & 0xffff)) & 0xffff);

  if (memory.read16(STATE) === 1) {
    if (memory.read16(REMAINING) === 0) copyTargetToCurrentAndOutput(memory);

    cpu.set('ecx', 3);
    cpu.set('esi', 0);
    while (cpu.get('ecx') !== 0) {
      const offset = cpu.get('esi');
      const current = signed16(memory.read16(CURRENT + offset));
      setEax(cpu, current);
      setEbx(cpu, memory.read16(REMAINING));
      imulEaxBy(runtime, cpu.get('ebx'));
      setEbx(cpu, memory.read16(DURATION));
      idivEddxEaxBy(runtime, cpu.get('ebx'));
      let value = cpu.get('eax') & 0xffff;
      writeWordAt(memory, OUTPUT + offset, value);

      const target = signed16(memory.read16(TARGET + offset));
      setEax(cpu, target);
      setEbx(cpu, memory.read16(DURATION));
      setEbx(cpu, (cpu.get('ebx') - memory.read16(REMAINING)) & 0xffff);
      imulEaxBy(runtime, cpu.get('ebx'));
      setEbx(cpu, memory.read16(DURATION));
      idivEddxEaxBy(runtime, cpu.get('ebx'));
      value = (value + (cpu.get('eax') & 0xffff)) & 0xffff;
      writeWordAt(memory, OUTPUT + offset, value);

      cpu.set('esi', (offset + 2) >>> 0);
      cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
    }
    memory.write16(REMAINING, (memory.read16(REMAINING) - 1) & 0xffff);
  }

  if (memory.read16(STATE) === 5) {
    if (memory.read16(REMAINING) === 0) copyTargetToCurrentAndOutput(memory);

    setEax(cpu, 0x8000);
    setEdx(cpu, 0);
    setEbx(cpu, memory.read16(DURATION));
    divEddxEaxBy(runtime, cpu.get('ebx'));
    setEbx(cpu, memory.read16(REMAINING));
    mulEaxBy(runtime, cpu.get('ebx'));
    let factor = (((cpu.get('edx') & 0x0f) << 28) | (cpu.get('eax') >>> 4)) >>> 0;
    cpu.set('edi', factor);

    // The raw branch returns to 0x37416 when this factor is out of range.
    // The state and timer do not change on that path, so it repeats forever;
    // expose the exact terminal condition instead of hanging the host process.
    if (factor >= 0x800) {
      copyTargetToCurrentAndOutput(memory);
      throw new RangeError('fn_3734f phase-5 factor >= 0x800 follows a non-terminating raw loop');
    }

    factor = (factor - 0x400) & 0xfff;
    let edi = (memory.read32(SINE_TABLE + factor * 4) >> 7) + 0x200;
    edi >>>= 0;
    cpu.set('edi', edi);
    let ebp = (0x400 - edi) >>> 0;
    cpu.set('ebp', ebp);
    cpu.set('ecx', 3);
    cpu.set('esi', 0);
    while (cpu.get('ecx') !== 0) {
      const offset = cpu.get('esi');
      setEax(cpu, signed16(memory.read16(CURRENT + offset)));
      imulEaxBy(runtime, edi);
      let interpolated = (((cpu.get('edx') << 22) | (cpu.get('eax') >>> 10)) >>> 0) & 0xffff;
      writeWordAt(memory, OUTPUT + offset, interpolated);

      setEax(cpu, signed16(memory.read16(TARGET + offset)));
      imulEaxBy(runtime, ebp);
      const targetPart = (((cpu.get('edx') << 22) | (cpu.get('eax') >>> 10)) >>> 0) & 0xffff;
      interpolated = (interpolated + targetPart) & 0xffff;
      writeWordAt(memory, OUTPUT + offset, interpolated);

      cpu.set('esi', (offset + 2) >>> 0);
      cpu.set('ecx', (cpu.get('ecx') - 1) >>> 0);
    }
    memory.write16(REMAINING, (memory.read16(REMAINING) - 1) & 0xffff);
  }

  if (memory.read16(STATE) === 3) {
    memory.write16(REMAINING, (memory.read16(REMAINING) - 1) & 0xffff);
    if (memory.read16(REMAINING) === 0) memory.write16(STATE, 0);
    // Both branches target 0x37643: the state-3 timer never parses another
    // event during this invocation, even when it reaches zero.
    finish(runtime, actor);
    return;
  }

  if (memory.read16(STATE) === 0) parseEvent(runtime, callEventHandler);

  finish(runtime, actor);
}

function finish(runtime, actor) {
  const { cpu, memory } = runtime;
  cpu.set('esi', pop32(runtime)); // original 0x37643 POP ESI
  setEax(cpu, memory.read32(OUTPUT));
  memory.write32(actor + 0x28, cpu.get('eax'));
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | memory.read16(OUTPUT + 4));
  memory.write16(actor + 0x2c, cpu.get('eax') & 0xffff);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_3734f = instrumentLift('0x3734f', 'fn_3734f', __coverage_impl_fn_3734f);
