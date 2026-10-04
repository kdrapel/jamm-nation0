import { fn_37732 } from './table-index.mjs';
import { pop32, popad, push32, pushad } from './core/stack-effects.mjs';

// Small math helpers on the fn_380e8 path, translated from the raw ranges.

// Raw range 0x37a0f..0x37a29.
// EAX selects the corresponding signed vector components from two DS tables.
function __coverage_impl_fn_37a0f(runtime) {
  const { memory, cpu } = runtime;
  const index = ((cpu.get('eax') & 0xfff) << 2) >>> 0;
  const first = memory.read32(0x2198c + index);
  const second = memory.read32(0x2298c + index);
  cpu.set('eax', index);
  cpu.set('ecx', first >> 7);
  cpu.set('ebx', second >> 7);
  const result = second >> 7;
  let flags = cpu.eflags & ~0xc5; // CF, PF, ZF, SF from SAR; OF/AF are undefined here.
  if ((second >>> 6) & 1) flags |= 1;
  if (result === 0) flags |= 0x40;
  if (result < 0) flags |= 0x80;
  let lowByte = result & 0xff;
  lowByte ^= lowByte >>> 4;
  lowByte &= 0x0f;
  if (((0x6996 >>> lowByte) & 1) === 0) flags |= 0x04;
  cpu.setEflags(flags >>> 0);
}

function imulShrd9(left, right) {
  const product = BigInt.asUintN(64, BigInt(left | 0) * BigInt(right | 0));
  return Number((product >> 9n) & 0xffffffffn) >>> 0;
}

// Raw range 0x37b68..0x37bb9. ESI addresses the matrix whose columns are
// traversed at a 12-byte stride; EBP addresses the vector at a 4-byte stride;
// EDI receives the three 32-bit results. PUSHA/POPA preserve all GPRs.
function __coverage_impl_fn_37b68(runtime) {
  const { memory, cpu } = runtime;
  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('fn_37b68 requires an explicit SS base for PUSHA scratch');
  const originalEsp = cpu.get('esp');
  let pushaEsp = originalEsp;
  for (const name of ['eax', 'ecx', 'edx', 'ebx']) {
    pushaEsp = (pushaEsp - 4) >>> 0;
    memory.write32((ssBase + pushaEsp) >>> 0, cpu.get(name));
  }
  pushaEsp = (pushaEsp - 4) >>> 0;
  memory.write32((ssBase + pushaEsp) >>> 0, originalEsp);
  for (const name of ['ebp', 'esi', 'edi']) {
    pushaEsp = (pushaEsp - 4) >>> 0;
    memory.write32((ssBase + pushaEsp) >>> 0, cpu.get(name));
  }
  let esi = cpu.get('esi');
  let ebp = cpu.get('ebp');
  let edi = cpu.get('edi');
  const initialEbp = ebp;

  memory.write32(0x368b4, 3);
  for (let column = 0; column < 3; column += 1) {
    memory.write32(0x3681e, 3);
    for (let row = 0; row < 3; row += 1) {
      let ebx = 0;
      let ecx = 3;
      while (ecx !== 0) {
        const vectorValue = memory.read32(ebp);
        const matrixValue = memory.read32(esi);
        ebx = (ebx + imulShrd9(vectorValue, matrixValue)) >>> 0;
        esi = (esi + 12) >>> 0;
        ebp = (ebp + 4) >>> 0;
        ecx -= 1; // LOOP; it does not affect the carry flag.
      }

      memory.write32(edi, ebx);
      ebp = (ebp - 12) >>> 0;
      esi = (esi - 32) >>> 0;
      edi = (edi + 4) >>> 0;
      memory.write32(0x3681e, (memory.read32(0x3681e) - 1) >>> 0);
    }

    esi = (esi - 12) >>> 0;
    ebp = (ebp + 12) >>> 0;
    memory.write32(0x368b4, (memory.read32(0x368b4) - 1) >>> 0);
  }

  // The final ADD EBP,12 sets CF; DEC preserves it. POPA restores the input
  // registers, but does not restore EFLAGS.
  cpu.setCarry(initialEbp > 0xfffffff3);
  cpu.setDecFlags32(1); // Final DEC of the outer counter: 1 -> 0.
}

// Raw range 0x37a2a..0x37b67. It derives per-object transform coefficients,
// selects three 3x3 tables, and composes them through fn_37b68. PUSHA/POPA
// preserve the caller's GPRs; the final transform helper's carry survives.
function __coverage_impl_fn_37a2a(runtime) {
  const { memory, cpu } = runtime;
  const registers = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
  const saved = Object.fromEntries(registers.map(name => [name, cpu.get(name)]));
  const u32 = value => value >>> 0;
  const sx16 = value => (value << 16) >> 16;
  // 0x37a2a PUSHA.  Each near CALL below records its return slot; its lift
  // returns to JavaScript, so POP removes that slot explicitly.
  pushad(runtime);
  const call = (returnAddress, fn) => {
    push32(runtime, returnAddress);
    fn();
    pop32(runtime);
  };

  const object = saved.esi;
  let eax = sx16(memory.read16(object + 0x28));
  let ebx = sx16(memory.read16(object + 0x2a));
  let ecx = sx16(memory.read16(object + 0x2c));
  memory.write32(0x36368, eax);
  memory.write32(0x3636c, ebx);
  memory.write32(0x36370, ecx);

  eax = u32(eax - memory.read32(0x3634c));
  ebx = u32(ebx - memory.read32(0x36350));
  ecx = u32(ecx - memory.read32(0x36354));
  memory.write32(0x36358, eax);
  memory.write32(0x3635c, ebx);
  memory.write32(0x36360, ecx);

  eax = Math.imul(eax, eax) >>> 0;
  ebx = Math.imul(ebx, ebx) >>> 0;
  ecx = Math.imul(ecx, ecx) >>> 0;
  eax = u32(eax + ebx + ecx);
  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ecx', ecx);
  // Oracle memory is normalized CS:0, so x86 return slots use the observed
  // runtime address (static address minus the 0x0f00 image bias).
  call(0x36b8e, () => fn_37732(runtime));
  memory.write32(0x36364, cpu.get('eax'));

  cpu.set('eax', memory.read16(object + 0x2e));
  call(0x36b9c, () => fn_37a0f(runtime));
  ebx = cpu.get('ebx');
  ecx = cpu.get('ecx');
  memory.write32(0x362bc, 0x200);
  memory.write32(0x362cc, ebx);
  memory.write32(0x362d0, ecx);
  memory.write32(0x362d8, u32(-ecx));
  memory.write32(0x362dc, ebx);

  cpu.set('eax', memory.read16(object + 0x30));
  call(0x36bc9, () => fn_37a0f(runtime));
  ebx = cpu.get('ebx');
  ecx = cpu.get('ecx');
  memory.write32(0x362e0, ebx);
  memory.write32(0x36300, ebx);
  memory.write32(0x362f8, ecx);
  memory.write32(0x362e8, u32(-ecx));
  memory.write32(0x362f0, 0x200);

  cpu.set('eax', memory.read16(object + 0x32));
  call(0x36bf6, () => fn_37a0f(runtime));
  ebx = cpu.get('ebx');
  ecx = cpu.get('ecx');
  memory.write32(0x36304, ebx);
  memory.write32(0x36308, ecx);
  memory.write32(0x36314, ebx);
  memory.write32(0x36310, u32(-ecx));
  memory.write32(0x36324, 0x200);

  const angleA = memory.read8(0x36295) * 0x24;
  const angleB = memory.read8(0x36296) * 0x24;
  // 0x37b24 MOVZX EBX,byte / 0x37b2b IMUL EBX,0x24.  fn_37b68 POPA
  // restores this value, so it is still the EBX saved by the second call.
  cpu.set('ebx', angleB);
  cpu.set('edi', 0x36328);
  cpu.set('esi', u32(0x362bc + angleA));
  cpu.set('ebp', u32(0x362bc + angleB));
  call(0x36c46, () => fn_37b68(runtime));

  const angleC = memory.read8(0x36297) * 0x24;
  cpu.set('edi', 0x36298);
  cpu.set('ebp', 0x36328);
  cpu.set('esi', u32(0x362bc + angleC));
  call(0x36c66, () => fn_37b68(runtime));

  popad(runtime);
}

// Raw range 0x37cf7..0x37d86. The memory displacements are patched from the
// incoming ESI/EDI pointers. fn_37bba also patches each IMUL immediate from
// the six-word table at 0x36298; read the live instruction operands here.
function __coverage_impl_fn_37cf7(runtime) {
  const { memory, cpu } = runtime;
  const registers = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
  const saved = Object.fromEntries(registers.map(name => [name, cpu.get(name)]));
  const u32 = value => value >>> 0;
  const sx16 = value => (value << 16) >> 16;
  const multipliers = [0x36e47, 0x36e4d, 0x36e55, 0x36e63, 0x36e69, 0x36e71]
    .map(address => memory.read32(address));

  const count = saved.ecx;
  memory.write32(0x36e33, saved.esi);
  memory.write32(0x36e3a, u32(saved.esi + 2));
  memory.write32(0x36e41, u32(saved.esi + 4));
  memory.write32(0x36e5d, saved.edi);
  memory.write32(0x36e7c, u32(saved.edi + 1));

  const initialEax = count;
  let esi = u32(Math.imul(count, 6) - 6);
  let edi = u32(Math.imul(initialEax, 2) - 2);
  let carry = cpu.carry;
  do {
    const edx = sx16(memory.read16(u32(saved.esi + esi)));
    const ecx = sx16(memory.read16(u32(saved.esi + 2 + esi)));
    const ebp = sx16(memory.read16(u32(saved.esi + 4 + esi)));

    let ebx = Math.imul(edx, multipliers[0]) >>> 0;
    let eax = Math.imul(ecx, multipliers[1]) >>> 0;
    ebx = u32(ebx + eax);
    eax = Math.imul(ebp, multipliers[2]) >>> 0;
    eax = u32(eax + ebx);
    memory.write8(u32(saved.edi + edi), (eax >>> 8) & 0xff);

    ebx = Math.imul(edx, multipliers[3]) >>> 0;
    eax = Math.imul(ecx, multipliers[4]) >>> 0;
    ebx = u32(ebx + eax);
    eax = Math.imul(ebp, multipliers[5]) >>> 0;
    eax = u32(eax + ebx);
    esi = u32(esi - 6);
    memory.write8(u32(saved.edi + 1 + edi), (eax >>> 8) & 0xff);

    const previousEdi = edi;
    edi = u32(edi - 2);
    carry = previousEdi < 2;
  } while ((edi & 0x80000000) === 0);

  for (const name of registers) cpu.set(name, saved[name]);
  cpu.setCarry(carry);
}

// Raw range 0x37bba..0x37cf6. The three loads/stores use the literal
// 0x12345678 displacement is a self-modifying placeholder: the prologue
// patches the three read bases from incoming ESI and the three write bases
// from incoming EDI. The loop then adds its descending record offset.
function __coverage_impl_fn_37bba(runtime) {
  const { memory, cpu } = runtime;
  const registers = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
  const saved = Object.fromEntries(registers.map(name => [name, cpu.get(name)]));
  const u32 = value => value >>> 0;
  const sx16 = value => (value << 16) >> 16;
  // Preserve the original PUSHA and temporary PUSH ESI scratch writes while
  // leaving the host-language call/return contract unchanged.
  pushad(runtime);
  push32(runtime, u32(saved.esi + 4));

  memory.write32(0x36d5f, saved.esi);
  memory.write32(0x36d66, u32(saved.esi + 2));
  memory.write32(0x36d6d, u32(saved.esi + 4));
  memory.write32(0x36d9a, saved.edi);
  memory.write32(0x36dc1, u32(saved.edi + 2));
  memory.write32(0x36de8, u32(saved.edi + 4));

  let source = 0x36298;
  const shiftedOutputs = [0x36e47, 0x36e4d, 0x36e55, 0x36e63, 0x36e69, 0x36e71];
  const rawOutputs = [0x36d79, 0x36d7f, 0x36d87, 0x36da0, 0x36da6, 0x36dae];
  for (let index = 0; index < 6; index += 1) {
    const eax = memory.read32(source);
    memory.write32(rawOutputs[index], eax);
    memory.write32(shiftedOutputs[index], (eax | 0) >> 1);
    source += 4;
  }
  for (const target of [0x36dc7, 0x36dcd, 0x36dd3]) {
    memory.write32(target, memory.read32(source));
    source += 4;
  }
  pop32(runtime); // POP ESI after the nine coefficient operands are patched.

  // These nine immediate fields belong to this function's three projected
  // coordinates. The prologue above self-patches them from DS:[0x36298..];
  // read the live instruction operands so zero or scene-specific coefficients
  // affect the transform exactly as the original x86 does.
  const coefficientOperands = [
    0x36d79, 0x36d7f, 0x36d87,
    0x36da0, 0x36da6, 0x36dae,
    0x36dc7, 0x36dcd, 0x36dd3,
  ].map(address => memory.read32(address));

  const count = saved.ecx;
  let esi = u32(Math.imul(count, 6) - 6);
  let lastSubtractBefore;
  do {
    const edx = sx16(memory.read16(u32(saved.esi + esi)));
    const edi = sx16(memory.read16(u32(saved.esi + 2 + esi)));
    const ebp = sx16(memory.read16(u32(saved.esi + 4 + esi)));
    const adjustedEbp = u32(ebp + memory.read32(0x2cb1c));

    let ebx = Math.imul(edx, coefficientOperands[0]);
    let eax = Math.imul(edi, coefficientOperands[1]);
    ebx = u32(ebx + eax);
    eax = Math.imul(adjustedEbp, coefficientOperands[2]);
    ebx = u32(ebx + eax);
    const bx = ((((ebx | 0) >> 9) & 0xffff) + memory.read16(0x36380)) & 0xffff;
    memory.write16(u32(saved.edi + esi), bx);

    let ecx = Math.imul(edx, coefficientOperands[3]);
    eax = Math.imul(edi, coefficientOperands[4]);
    ecx = u32(ecx + eax);
    eax = Math.imul(adjustedEbp, coefficientOperands[5]);
    ecx = u32(ecx + eax);
    ecx = (ecx | 0) >> 9;
    const cx = ((ecx & 0xffff) + memory.read16(0x36382)) & 0xffff;
    memory.write16(u32(saved.edi + 2 + esi), cx);

    let edxResult = Math.imul(edx, coefficientOperands[6]);
    const ediResult = Math.imul(edi, coefficientOperands[7]);
    const ebpResult = Math.imul(adjustedEbp, coefficientOperands[8]);
    edxResult = u32(edxResult + ediResult);
    edxResult = u32(edxResult + ebpResult);
    edxResult = (edxResult | 0) >> 9;
    const dx = ((edxResult & 0xffff) + memory.read16(0x36384)) & 0xffff;
    memory.write16(u32(saved.edi + 4 + esi), dx);

    lastSubtractBefore = esi;
    esi = u32(esi - 6);
  } while ((esi & 0x80000000) === 0);

  // The final original SUB ESI,6 supplies the arithmetic flags consumed by
  // JNS and preserved by POPA/RET; POPA restores registers, not EFLAGS.
  cpu.setCmpFlags32(lastSubtractBefore, 6);
  popad(runtime);
}

// Capture-resume suffix for capture_000800 at original 0x37d6d.  The first
// output byte of the current record has already been stored; continue the
// second dot product, then the remaining descending record loop and PUSHA/RET.
export function resumeFn37cf7At0x37d6d(runtime, { expectedReturn = 0x37265 } = {}) {
  if (runtime.captureEvidence?.id !== 'capture_000800' || runtime.capturedEip !== 0x36e6d) {
    throw new Error('fn_37cf7 suffix is grounded only in capture_000800 at runtime EIP 0x36e6d');
  }
  const { memory, cpu } = runtime;
  const stack = (runtime.segments.ssBase + cpu.get('esp')) >>> 0;
  const saved = {
    edi: memory.read32(stack),
    esi: memory.read32(stack + 4),
    ebp: memory.read32(stack + 8),
    esp: memory.read32(stack + 12),
    ebx: memory.read32(stack + 16),
    edx: memory.read32(stack + 20),
    ecx: memory.read32(stack + 24),
    eax: memory.read32(stack + 28),
  };
  if (saved.esp !== ((cpu.get('esp') + 0x20) >>> 0)) throw new Error('capture_000800 PUSHA saved-ESP slot is inconsistent');
  if (memory.read32(saved.esp) !== expectedReturn) throw new Error(`fn_37cf7 caller return must be 0x${expectedReturn.toString(16)}`);
  if (cpu.get('esi') !== 0x7f8 || cpu.get('edi') !== 0x2a8) throw new Error('capture_000800 loop offsets differ from the recorded suffix boundary');

  const patchedOperands = {
    source0: memory.read32(0x36e33),
    source1: memory.read32(0x36e3a),
    source2: memory.read32(0x36e41),
    destination0: memory.read32(0x36e5d),
    destination1: memory.read32(0x36e7c),
  };
  const expectedOperands = {
    source0: saved.esi,
    source1: (saved.esi + 2) >>> 0,
    source2: (saved.esi + 4) >>> 0,
    destination0: saved.edi,
    destination1: (saved.edi + 1) >>> 0,
  };
  for (const [name, expected] of Object.entries(expectedOperands)) {
    if (patchedOperands[name] !== expected) throw new Error(`captured ${name} displacement 0x${patchedOperands[name].toString(16)} does not match PUSHA input 0x${expected.toString(16)}`);
  }

  const signed16 = value => (value << 16) >> 16;
  const multipliers = [0x36e47, 0x36e4d, 0x36e55, 0x36e63, 0x36e69, 0x36e71]
    .map(address => memory.read32(address));
  let esi = cpu.get('esi');
  let edi = cpu.get('edi');
  let ebx = cpu.get('ebx');
  let eax = cpu.get('eax');
  let ebp = cpu.get('ebp');
  let outputBytes = 0;

  // Finish the second projection whose first two IMULs precede captured EIP.
  ebx = (ebx + eax) >>> 0;
  eax = Math.imul(ebp, multipliers[5]) >>> 0;
  eax = (eax + ebx) >>> 0;
  esi = (esi - 6) >>> 0;
  memory.write8((saved.edi + 1 + edi) >>> 0, (eax >>> 8) & 0xff);
  outputBytes += 1;
  let previousEdi = edi;
  edi = (edi - 2) >>> 0;
  cpu.setCmpFlags32(previousEdi, 2); // SUB EDI,2; JNS consumes SF.

  while ((edi & 0x80000000) === 0) {
    const edx = signed16(memory.read16((saved.esi + esi) >>> 0));
    const ecx = signed16(memory.read16((saved.esi + 2 + esi) >>> 0));
    ebp = signed16(memory.read16((saved.esi + 4 + esi) >>> 0));

    let first = Math.imul(edx, multipliers[0]) >>> 0;
    eax = Math.imul(ecx, multipliers[1]) >>> 0;
    first = (first + eax) >>> 0;
    eax = Math.imul(ebp, multipliers[2]) >>> 0;
    eax = (eax + first) >>> 0;
    memory.write8((saved.edi + edi) >>> 0, (eax >>> 8) & 0xff);
    outputBytes += 1;

    let second = Math.imul(edx, multipliers[3]) >>> 0;
    eax = Math.imul(ecx, multipliers[4]) >>> 0;
    second = (second + eax) >>> 0;
    eax = Math.imul(ebp, multipliers[5]) >>> 0;
    second = (second + eax) >>> 0;
    esi = (esi - 6) >>> 0;
    memory.write8((saved.edi + 1 + edi) >>> 0, (second >>> 8) & 0xff);
    outputBytes += 1;

    previousEdi = edi;
    edi = (edi - 2) >>> 0;
    cpu.setCmpFlags32(previousEdi, 2);
  }

  popad(runtime);
  const returnAddress = pop32(runtime);
  if (returnAddress !== expectedReturn) throw new Error(`fn_37cf7 RET reached 0x${returnAddress.toString(16)}, expected 0x${expectedReturn.toString(16)}`);
  runtime.translatedPc = returnAddress;
  return {
    function: 'fn_37cf7',
    originalFunctionCompleted: true,
    resumedFromStaticAddress: '0x37d6d',
    returnAddress,
    resumedIterations: (0x2a8 / 2) + 1,
    outputBytes,
    patchedOperands,
    finalRegisters: Object.fromEntries(['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp'].map(name => [name, cpu.get(name) >>> 0])),
    finalEflags: cpu.eflags >>> 0,
  };
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_37a0f = instrumentLift('0x37a0f', 'fn_37a0f', __coverage_impl_fn_37a0f);
export const fn_37a2a = instrumentLift('0x37a2a', 'fn_37a2a', __coverage_impl_fn_37a2a);
export const fn_37b68 = instrumentLift('0x37b68', 'fn_37b68', __coverage_impl_fn_37b68);
export const fn_37bba = instrumentLift('0x37bba', 'fn_37bba', __coverage_impl_fn_37bba);
export const fn_37cf7 = instrumentLift('0x37cf7', 'fn_37cf7', __coverage_impl_fn_37cf7);
