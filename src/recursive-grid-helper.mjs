function low16(value) { return value & 0xffff; }
function low8(value) { return value & 0xff; }
function signed16(value) { return (value << 16) >> 16; }

function setLow16(cpu, register, value) {
  cpu.set(register, ((cpu.get(register) & 0xffff0000) | (value & 0xffff)) >>> 0);
}

function setByte(cpu, register, high, value) {
  const shift = high ? 8 : 0;
  const mask = 0xff << shift;
  cpu.set(register, ((cpu.get(register) & ~mask) | ((value & 0xff) << shift)) >>> 0);
}

function addByte(cpu, destinationRegister, destinationHigh, source) {
  const destination = (cpu.get(destinationRegister) >>> (destinationHigh ? 8 : 0)) & 0xff;
  const sum = destination + (source & 0xff);
  setByte(cpu, destinationRegister, destinationHigh, sum);
  cpu.setCarry(sum > 0xff);
}

function addWord(cpu, destinationRegister, source) {
  const destination = low16(cpu.get(destinationRegister));
  const sum = destination + (source & 0xffff);
  setLow16(cpu, destinationRegister, sum);
  cpu.setCarry(sum > 0xffff);
}

function addMemoryByte(runtime, address, source, subtract = false) {
  const previous = runtime.memory.read8(address);
  runtime.memory.write8(address, subtract ? previous - source : previous + source);
  runtime.cpu.setCarry(subtract ? previous < (source & 0xff) : previous + (source & 0xff) > 0xff);
}

function readEs8(runtime, offset, esBase) {
  return runtime.memory.read8((esBase + (offset & 0xffff)) >>> 0);
}

function writeEs8(runtime, offset, value, esBase) {
  runtime.memory.write8((esBase + (offset & 0xffff)) >>> 0, value);
}

function stackAddress(ssBase, offset) {
  return (ssBase + (offset >>> 0)) >>> 0;
}

function addEsByteToDl(runtime, offset, esBase) {
  const { cpu } = runtime;
  const sum = (cpu.get('edx') & 0xff) + readEs8(runtime, offset, esBase);
  setByte(cpu, 'edx', false, sum);
  cpu.setCarry(sum > 0xff);
  const dh = ((cpu.get('edx') >>> 8) & 0xff) + (cpu.carry ? 1 : 0);
  setByte(cpu, 'edx', true, dh);
  cpu.setCarry(dh > 0xff);
}

function perturbAndWrite(runtime, { offset, esBase }) {
  const { cpu, memory } = runtime;

  // MOV AX,0xab; MUL SI; ADD AX,0x2bcd; ADC DX,0; DIV word [0x20be8].
  const product = 0xab * low16(cpu.get('esi'));
  setLow16(cpu, 'eax', product);
  setLow16(cpu, 'edx', product >>> 16);
  addWord(cpu, 'eax', 0x2bcd);
  if (cpu.carry) addWord(cpu, 'edx', 1);
  else setLow16(cpu, 'edx', low16(cpu.get('edx')));

  const divisor = memory.read16(0x20be8);
  if (divisor === 0) throw new Error('Divide error at 0x218c9: zero divisor');
  const dividend = (BigInt(low16(cpu.get('edx'))) << 16n) | BigInt(low16(cpu.get('eax')));
  const quotient = dividend / BigInt(divisor);
  const remainder = dividend % BigInt(divisor);
  if (quotient > 0xffffn) throw new Error('Divide error at 0x218c9: quotient overflow');
  setLow16(cpu, 'eax', Number(quotient));
  setLow16(cpu, 'edx', Number(remainder));
  setLow16(cpu, 'esi', low16(cpu.get('edx')));

  // SUB DX,0x67c2; AL=CL; AH=0; signed IMUL DX; form the signed
  // fixed-point byte and add the observed neighbor average in CH.
  const dx = (low16(cpu.get('edx')) - 0x67c2) & 0xffff;
  setLow16(cpu, 'edx', dx);
  const cl = low8(cpu.get('ecx'));
  setLow16(cpu, 'eax', cl);
  const signedProduct = BigInt(signed16(low16(cpu.get('eax')))) * BigInt(signed16(dx));
  setLow16(cpu, 'eax', Number(BigInt.asUintN(16, signedProduct)));
  setLow16(cpu, 'edx', Number(BigInt.asUintN(32, signedProduct) >> 16n));

  let ax = low16(cpu.get('eax'));
  const ah = (ax >>> 8) & 0xff;
  const dl = low8(cpu.get('edx'));
  ax = ((dl << 8) | ah) & 0xffff;
  ax = (signed16(ax) >> 5) & 0xffff;
  const al = ax & 0xff;
  ax = al & 0x80 ? (0xff00 | al) : al; // CBW
  const ch = (cpu.get('ecx') >>> 8) & 0xff;
  const lowSum = (ax & 0xff) + ch;
  const resultAl = lowSum & 0xff;
  const resultAh = (((ax >>> 8) & 0xff) + (lowSum > 0xff ? 1 : 0)) & 0xff;
  ax = (resultAh << 8) | resultAl;
  setLow16(cpu, 'eax', ax);

  if (ax & 0x8000) {
    setByte(cpu, 'eax', false, 0);
  } else if (ax > 0xfe) {
    setByte(cpu, 'eax', false, 0xfe);
  }
  writeEs8(runtime, offset, cpu.get('eax'), esBase);
}

function updateMarkedNeighbor(runtime, { bx, xDirection = 0, yDirection = 0, esBase }) {
  const { cpu } = runtime;
  setLow16(cpu, 'ebx', bx);
  // CX is initialized and shifted once at function entry. A marked neighbor
  // overwrites CH; a later unmarked neighbor must leave that byte untouched.
  const cl = low8(cpu.get('ecx'));
  setByte(cpu, 'edx', false, readEs8(runtime, bx, esBase));
  if (xDirection > 0) addByte(cpu, 'ebx', false, cl);
  else if (xDirection < 0) addByte(cpu, 'ebx', false, -cl);
  else if (yDirection > 0) addByte(cpu, 'ebx', true, cl);
  else if (yDirection < 0) addByte(cpu, 'ebx', true, -cl);

  let di = low16(cpu.get('ebx'));
  setLow16(cpu, 'edi', di);
  if (xDirection > 0) addByte(cpu, 'ebx', false, cl);
  else if (xDirection < 0) addByte(cpu, 'ebx', false, -cl);
  else if (yDirection > 0) addByte(cpu, 'ebx', true, cl);
  else if (yDirection < 0) addByte(cpu, 'ebx', true, -cl);

  if (readEs8(runtime, di, esBase) !== 0xff) return;

  setByte(cpu, 'edx', true, 0);
  addEsByteToDl(runtime, low16(cpu.get('ebx')), esBase);
  const dx = low16(cpu.get('edx')) >>> 1;
  setLow16(cpu, 'edx', dx);
  setByte(cpu, 'ecx', true, low8(dx));
  perturbAndWrite(runtime, { offset: di, esBase });
}

function recursiveCall(runtime, callSp, returnAddress, esBase, ssBase, depth) {
  if (depth > 32) throw new Error('Stack overflow at recursive call 0x2188d');
  const { cpu, memory } = runtime;
  const esp = (callSp - 4) >>> 0;
  memory.write32(stackAddress(ssBase, esp), returnAddress);
  cpu.set('esp', esp);

  executeAtEntry(runtime, esBase, ssBase, depth + 1);
}

function executeAtEntry(runtime, esBase, ssBase, depth) {
  const { cpu, memory } = runtime;
  const entrySp = cpu.get('esp');
  cpu.set('ebp', entrySp);

  let bx = memory.read16(stackAddress(ssBase, (entrySp + 6) >>> 0));
  let cx = memory.read16(stackAddress(ssBase, (entrySp + 4) >>> 0));
  setLow16(cpu, 'ebx', bx);
  setLow16(cpu, 'ecx', cx);
  cx = (cx >>> 1) & 0xffff;
  setLow16(cpu, 'ecx', cx);

  // Four conditional edge updates. Each marks its destination with a single
  // ES byte and advances the same 16-bit SI recurrence when marked.
  updateMarkedNeighbor(runtime, { bx, xDirection: 1, esBase });
  bx = low16(cpu.get('ebx'));
  updateMarkedNeighbor(runtime, { bx, yDirection: 1, esBase });
  bx = low16(cpu.get('ebx'));
  updateMarkedNeighbor(runtime, { bx, xDirection: -1, esBase });
  bx = low16(cpu.get('ebx'));
  updateMarkedNeighbor(runtime, { bx, yDirection: -1, esBase });
  bx = low16(cpu.get('ebx'));

  // The center is an unconditional average of the four samples arranged
  // around the current coordinate, followed by the same fixed-point step.
  setByte(cpu, 'edx', false, readEs8(runtime, bx, esBase));
  setByte(cpu, 'edx', true, 0);
  const cl = low8(cx);
  addByte(cpu, 'ebx', false, cl);
  addByte(cpu, 'ebx', false, cl);
  addEsByteToDl(runtime, low16(cpu.get('ebx')), esBase);
  addByte(cpu, 'ebx', true, cl);
  addByte(cpu, 'ebx', true, cl);
  addEsByteToDl(runtime, low16(cpu.get('ebx')), esBase);
  addByte(cpu, 'ebx', false, -cl);
  addByte(cpu, 'ebx', false, -cl);
  addEsByteToDl(runtime, low16(cpu.get('ebx')), esBase);
  setLow16(cpu, 'edx', low16(cpu.get('edx')) >>> 2);
  setByte(cpu, 'ecx', true, low8(cpu.get('edx')));

  addByte(cpu, 'ebx', false, cl);
  addByte(cpu, 'ebx', true, -cl);
  perturbAndWrite(runtime, { offset: low16(cpu.get('ebx')), esBase });

  if (cl === 1) {
    cpu.setCarry(false); // CMP CL,1; equality sets CF=0.
    cpu.set('esp', (entrySp + 4) >>> 0); // RET
    return;
  }

  // The original pushes BX then CX as words; each recursive call observes
  // those words via its own SS:ESP+6 and SS:ESP+4 arguments.
  setByte(cpu, 'ecx', true, 0); // XOR CH,CH
  // 0x21ab0..0x21ab2 returns from the center to the subdivision origin
  // before pushing the child coordinates.
  addByte(cpu, 'ebx', false, -cl);
  addByte(cpu, 'ebx', true, -cl);
  const pushedBx = low16(cpu.get('ebx'));
  const pushedCx = low16(cpu.get('ecx'));
  const argsSp = (entrySp - 4) >>> 0;
  memory.write16(stackAddress(ssBase, (entrySp - 2) >>> 0), pushedBx);
  memory.write16(stackAddress(ssBase, argsSp), pushedCx);

  recursiveCall(runtime, argsSp, 0x21abd, esBase, ssBase, depth);
  let esp = cpu.get('esp');
  cpu.set('ebp', esp);
  let childCl = memory.read8(stackAddress(ssBase, esp));
  setByte(cpu, 'ecx', false, childCl);
  addMemoryByte(runtime, stackAddress(ssBase, (esp + 2) >>> 0), childCl);

  recursiveCall(runtime, esp, 0x21aca, esBase, ssBase, depth);
  esp = cpu.get('esp');
  cpu.set('ebp', esp);
  childCl = memory.read8(stackAddress(ssBase, esp));
  setByte(cpu, 'ecx', false, childCl);
  addMemoryByte(runtime, stackAddress(ssBase, (esp + 3) >>> 0), childCl);

  recursiveCall(runtime, esp, 0x21ad7, esBase, ssBase, depth);
  esp = cpu.get('esp');
  cpu.set('ebp', esp);
  childCl = memory.read8(stackAddress(ssBase, esp));
  setByte(cpu, 'ecx', false, childCl);
  addMemoryByte(runtime, stackAddress(ssBase, (esp + 2) >>> 0), childCl, true);

  recursiveCall(runtime, esp, 0x21ae4, esBase, ssBase, depth);
  esp = cpu.get('esp');
  cpu.set('esp', (esp + 4) >>> 0); // ADD ESP,4 removes BX/CX arguments.
  cpu.setCarry(esp > 0xfffffffb);
  cpu.set('esp', (cpu.get('esp') + 4) >>> 0); // RET
}

// Translation of raw 0x2188d..0x21ae7. The caller supplies a real stack
// frame: SS:[ESP] is the return address, [ESP+4] is the width word, and
// [ESP+6] is the ES byte offset. Both ES and SS bases are explicit.
function __coverage_impl_fn_2188d(runtime, {
  esBase = runtime.segments.esBase,
  ssBase = runtime.segments.ssBase,
} = {}) {
  if (esBase === null || esBase === undefined) throw new Error('ES base is unresolved');
  if (ssBase === null || ssBase === undefined) throw new Error('SS base is unresolved');
  executeAtEntry(runtime, esBase >>> 0, ssBase >>> 0, 0);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_2188d = instrumentLift('0x2188d', 'fn_2188d', __coverage_impl_fn_2188d);
