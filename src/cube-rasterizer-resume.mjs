const MASK32 = 0xffffffff;

function addFlags32(cpu, left, right, carry = 0) {
  const a = left >>> 0;
  const b = right >>> 0;
  const sum = a + b + carry;
  const result = sum >>> 0;
  const mask = 1 | 4 | 0x10 | 0x40 | 0x80 | 0x800;
  let flags = cpu.eflags & ~mask;
  if (sum > MASK32) flags |= 1;
  if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
  if (((a ^ b ^ result) & 0x10) !== 0) flags |= 0x10;
  if (result === 0) flags |= 0x40;
  if (result & 0x80000000) flags |= 0x80;
  if (((~(a ^ b) & (a ^ result)) & 0x80000000) !== 0) flags |= 0x800;
  cpu.setEflags(flags >>> 0);
  return { result, carry: sum > MASK32 };
}

function decWordFlags(cpu, before) {
  const value = before & 0xffff;
  const result = (value - 1) & 0xffff;
  const mask = 4 | 0x10 | 0x40 | 0x80 | 0x800;
  let flags = cpu.eflags & ~mask;
  if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
  if ((value & 0xf) === 0) flags |= 0x10;
  if (result === 0) flags |= 0x40;
  if (result & 0x8000) flags |= 0x80;
  if (value === 0x8000) flags |= 0x800;
  cpu.setEflags(flags >>> 0);
  return result;
}

function rotateWordHalves(value) {
  const x = value >>> 0;
  return ((x << 16) | (x >>> 16)) >>> 0;
}

function signed16(value) { return (value << 16) >> 16; }

// Exact source-level prefix for the next captured caller record. It follows
// fn_332b6 from its actual entry through the sorted/clipped vertex setup and
// stops at its original jump target 0x335d7, before the unlifted edge solver.
export function resumeFn332b6EntryTo335d7(runtime) {
  const { cpu, memory } = runtime;
  if (runtime.translatedPc !== 0x323b6) {
    throw new Error(`fn_332b6 entry prefix requires runtime PC 0x323b6, got 0x${runtime.translatedPc?.toString(16) ?? 'unknown'}`);
  }
  const returnAddress = memory.read32(cpu.get('esp'));
  if (returnAddress !== 0x370e1) throw new Error('fn_332b6 entry prefix has an unexpected caller return address');

  let esi = 0;
  let edi = 4;
  let ebp = 8;
  let eax = memory.read32((esi + 0x3239c) >>> 0);
  let ebx = memory.read32((edi + 0x3239c) >>> 0);
  let ecx = memory.read32((ebp + 0x3239c) >>> 0);
  let edx = 0x01400000;

  let borrow = edx < eax;
  let dx = ((edx & 0xffff) - (edx & 0xffff) - (borrow ? 1 : 0)) & 0xffff;
  edx = ((edx & 0xffff0000) | dx) >>> 0;
  borrow = edx < ebx;
  dx = (dx - (borrow ? 1 : 0)) & 0xffff;
  edx = ((edx & 0xffff0000) | dx) >>> 0;
  borrow = edx < ecx;
  dx = (dx - (borrow ? 1 : 0)) & 0xffff;
  edx = ((edx & 0xffff0000) | dx) >>> 0;
  if (dx === 0xfffd) {
    cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
    cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp);
    cpu.set('esp', (cpu.get('esp') + 4) >>> 0);
    runtime.translatedPc = returnAddress;
    return { stop: 'early-all-vertices-clipped', returnAddress };
  }
  memory.write16(0x324cc, dx);

  if (signed16(eax) >= signed16(ebx)) [eax, ebx, esi, edi] = [ebx, eax, edi, esi];
  if (signed16(ebx) >= signed16(ecx)) [ebx, ecx, edi, ebp] = [ecx, ebx, ebp, edi];
  if (signed16(eax) >= signed16(ebx)) [eax, ebx, esi, edi] = [ebx, eax, edi, esi];
  if (signed16(eax) > 0xc9 || signed16(ecx) < 1) {
    cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
    cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp);
    cpu.set('esp', (cpu.get('esp') + 4) >>> 0);
    runtime.translatedPc = returnAddress;
    return { stop: 'vertical-bounds-reject', returnAddress };
  }
  if ((eax & 0xffff) === (ebx & 0xffff) && (eax | 0) >= (ebx | 0)) [eax, ebx, esi, edi] = [ebx, eax, edi, esi];

  memory.write32(0x3248c, eax);
  memory.write32(0x32490, ebx);
  memory.write32(0x32494, ecx);
  eax = memory.read32((esi + 0x323a8) >>> 0);
  eax = Math.imul(eax, 0x100) >>> 0;
  ebx = memory.read32((edi + 0x323a8) >>> 0);
  ebx = Math.imul(ebx, 0x100) >>> 0;
  ecx = memory.read32((ebp + 0x323a8) >>> 0);
  ecx = Math.imul(ecx, 0x100) >>> 0;
  memory.write32(0x324b2, eax);
  memory.write32(0x324b6, ebx);
  memory.write32(0x324ba, ecx);
  memory.write32(0x3247c, eax);

  cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
  cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp);
  runtime.translatedPc = 0x326d7; // static 0x335d7, next unresolved edge solver.
  return {
    stop: 'unlifted-edge-solver',
    staticPc: '0x335d7',
    sortedY: ['0x3248c', '0x32490', '0x32494'].map(address => `0x${memory.read32(Number(address)).toString(16)}`),
    vertexOffsets: [esi, edi, ebp],
    scaledX: [eax, ebx, ecx],
  };
}

function signed32(value) { return value | 0; }
function signed16Value(value) { return (value << 16) >> 16; }
function idiv32Result(dividend, divisor) {
  const a = BigInt(dividend | 0);
  const b = BigInt(divisor | 0);
  if (b === 0n) throw new Error('fn_332b6 edge solver reached IDIV by zero');
  const q = a / b;
  if (q < -0x80000000n || q > 0x7fffffffn) throw new Error('fn_332b6 edge solver reached IDIV overflow');
  const r = a % b;
  return {
    quotient: Number(BigInt.asUintN(32, q)),
    remainder: Number(BigInt.asUintN(32, r)),
  };
}
function idiv32(dividend, divisor) { return idiv32Result(dividend, divisor).quotient; }
function idiv16(numerator, divisor) {
  const a = BigInt(numerator | 0);
  const b = BigInt(signed16Value(divisor));
  if (b === 0n) throw new Error('fn_332b6 edge solver reached IDIV by zero');
  const q = a / b;
  if (q < -32768n || q > 32767n) throw new Error('fn_332b6 edge solver reached IDIV overflow');
  return Number(BigInt.asUintN(16, q));
}

// Capture-750's exact path through the fixed-point solver and band dispatch.
// Both original arms are represented: the upper-band call and the lower-only
// path at 0x337a5. This remains scoped to the translated c750 record stream.
export function resumeFn332b6Capture750EdgeSolverToUpperCall(runtime, {
  trace = false,
  legacyReversedUvGradient = false,
} = {}) {
  const { cpu, memory } = runtime;
  if (runtime.translatedPc !== 0x326d7) throw new Error('capture-750 edge solver must start at runtime 0x326d7');
  const w = (offset) => memory.read16(0x2da1c + offset);
  const d = (offset) => memory.read32(0x2da1c + offset);
  const sw = (offset, value) => memory.write16(0x2da1c + offset, value);
  const sd = (offset, value) => memory.write32(0x2da1c + offset, value);
  let eax = cpu.get('eax');
  let ebx = cpu.get('ebx');
  let ecx = d(0x4a96);
  let edx = cpu.get('edx');
  let esi;
  let edi;
  let ebp;

  sw(0x4aae, 1);
  eax = (d(0x4a74) - d(0x4a70)) >>> 0;
  sw(0x4a90, eax);
  ebx = eax & 0xffff;
  if (ebx !== 0) {
    edx = (eax & 0x80000000) ? 0xffffffff : 0;
    eax = idiv32((BigInt(edx >>> 0) << 32n | BigInt(eax)) >= (1n << 63n)
      ? Number(BigInt.asIntN(64, BigInt(edx >>> 0) << 32n | BigInt(eax)))
      : Number(BigInt(edx >>> 0) << 32n | BigInt(eax)), ebx);
    sd(0x4a7c, eax);
    sw(0x4aae, 0);
  }

  eax = (d(0x4a78) - d(0x4a70)) >>> 0;
  sw(0x4a92, eax);
  ebx = eax & 0xffff;
  if (ebx === 0) {
    const returnAddress = memory.read32((runtime.segments?.ssBase ?? 0) + cpu.get('esp'));
    if (returnAddress !== 0x370e1) throw new Error(`capture-750 zero-height edge returned to unexpected caller 0x${returnAddress.toString(16)}`);
    cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
    cpu.set('esp', (cpu.get('esp') + 4) >>> 0);
    runtime.translatedPc = returnAddress; // Original branch at 0x33626 reaches RET 0x334d4.
    return { stop: 'zero-middle-edge-return', staticPc: '0x334d4', returnAddress, a90: w(0x4a90), a92: w(0x4a92) };
  }
  edx = (eax & 0x80000000) ? 0xffffffff : 0;
  eax = idiv32((BigInt(edx >>> 0) << 32n | BigInt(eax)) >= (1n << 63n)
    ? Number(BigInt.asIntN(64, BigInt(edx >>> 0) << 32n | BigInt(eax)))
    : Number(BigInt(edx >>> 0) << 32n | BigInt(eax)), ebx);
  sd(0x4a80, eax);

  eax = (d(0x4a78) - d(0x4a74)) >>> 0;
  sw(0x4a94, eax);
  if ((eax & 0xffff) !== 0) {
    ebx = (ebx & 0xffff0000) | (eax & 0xffff);
    edx = (eax & 0x80000000) ? 0xffffffff : 0;
    eax = idiv32((BigInt(edx >>> 0) << 32n | BigInt(eax)) >= (1n << 63n)
      ? Number(BigInt.asIntN(64, BigInt(edx >>> 0) << 32n | BigInt(eax)))
      : Number(BigInt(edx >>> 0) << 32n | BigInt(eax)), ebx);
    sd(0x4a84, eax);
  }

  esi = d(0x4a70);
  sd(0x4a88, esi);
  sd(0x4a8c, (esi + 0x7fff) >>> 0);
  esi = d(0x4a7c);
  edi = d(0x4a80);
  ebx = w(0x4a90);
  ebp = (esi - edi) >>> 0;
  let degenerateEdgeFallback = null;
  if (ebp !== 0 && ebx !== 0) {
    ebp = Math.imul(ebp, ebx) >>> 0;
    if (signed32(esi) >= signed32(edi)) {
      let ax = (w(0x4a9e) - w(0x4a96)) & 0xffff;
      let dx = (ax & 0x8000) ? 0xffff : 0;
      ax = idiv16((signed16Value(dx) << 16) | ax, w(0x4a92));
      sw(0x4a6c, ax);
      ax = (w(0x4aa0) - w(0x4a98)) & 0xffff;
      dx = (ax & 0x8000) ? 0xffff : 0;
      ax = idiv16((signed16Value(dx) << 16) | ax, w(0x4a92));
      sw(0x4a6e, ax);
    } else {
      // Original 0x336e7 uses the top-to-middle Y span [0x4a90] for both UV
      // gradients; the forward 0x33697 arm intentionally uses [0x4a92]. The
      // legacy override is only for reproducing the pre-fix capture image.
      const uvDivisor = legacyReversedUvGradient ? 0x4a92 : 0x4a90;
      let ax = (w(0x4a9a) - w(0x4a96)) & 0xffff;
      let dx = (ax & 0x8000) ? 0xffff : 0;
      ax = idiv16((signed16Value(dx) << 16) | ax, w(uvDivisor));
      sw(0x4a6c, ax);
      ax = (w(0x4a9c) - w(0x4a98)) & 0xffff;
      dx = (ax & 0x8000) ? 0xffff : 0;
      ax = idiv16((signed16Value(dx) << 16) | ax, w(uvDivisor));
      sw(0x4a6e, ax);
    }
  } else {
    // Original 0x33689 branches to 0x336d0 when either the computed edge
    // step or the top-to-middle Y span is zero. That arm replaces EBP with
    // the top-to-middle Y delta, returns if it is also zero, otherwise clears
    // AX and joins the shared interpolation path at 0x33723. The four X
    // slopes at 0x4a6c/0x4a6e are deliberately left as-is on this path.
    ebp = (d(0x4a74) - d(0x4a70)) >>> 0;
    if (ebp === 0) {
      const returnAddress = memory.read32((runtime.segments?.ssBase ?? 0) + cpu.get('esp'));
      if (returnAddress !== 0x370e1) throw new Error(`capture-750 degenerate edge fallback returned to unexpected caller 0x${returnAddress.toString(16)}`);
      cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
      cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp);
      cpu.set('esp', (cpu.get('esp') + 4) >>> 0);
      runtime.translatedPc = returnAddress;
      return { stop: 'zero-height-degenerate-edge-return', staticPc: '0x334d4', returnAddress, a90: w(0x4a90), a92: w(0x4a92) };
    }
    eax &= 0xffff0000; // Original XOR AX,AX at 0x336e2.
    degenerateEdgeFallback = { branch: '0x33689 -> 0x336d0', fallbackEdgeStep: `0x${ebp.toString(16)}`, join: '0x33723' };
  }

  // IMUL r/m16 forms DX:AX; IDIV then consumes that signed 32-bit product.
  const mulDivWord = (left, right, divisor) => idiv16(signed16Value(left) * signed16Value(right), divisor);
  let ax = mulDivWord((w(0x4a96) - w(0x4a9e)) & 0xffff, w(0x4a90), w(0x4a92));
  ax = (ax - w(0x4a96) + w(0x4a9a)) & 0xffff;
  eax = (ax << 16) >>> 0;
  let signedDivision = idiv32Result(eax, ebp);
  eax = signedDivision.quotient;
  edx = signedDivision.remainder;
  ax = ((eax & 0xffff) - 1) & 0xffff;
  eax = ((eax & 0xffff0000) | ax) >>> 0;
  sw(0x4a68, ax);
  ax = mulDivWord((w(0x4a98) - w(0x4aa0)) & 0xffff, w(0x4a90), w(0x4a92));
  ax = (ax - w(0x4a98) + w(0x4a9c)) & 0xffff;
  eax = (ax << 16) >>> 0;
  signedDivision = idiv32Result(eax, ebp);
  eax = signedDivision.quotient;
  edx = signedDivision.remainder;
  ax = ((eax & 0xffff) - 1) & 0xffff;
  eax = ((eax & 0xffff0000) | ax) >>> 0;
  sw(0x4a6a, ax);

  if (signed16Value(w(0x4a74)) <= 1 || w(0x4aae) === 1) {
    // Original 0x337a5..0x33800 advances directly to the lower band. It
    // advances the edge accumulators by A90, orders/clips the current row,
    // then enters the shared 0x338aa lower-band setup without a CALL.
    eax = w(0x4a90);
    edi = Math.imul(edi, eax) >>> 0;
    eax = Math.imul(eax, signed32(d(0x4a6c))) >>> 0;
    edi = (edi + d(0x4a88)) >>> 0;
    ecx = (ecx + eax) >>> 0;
    esi = d(0x4a74);
    if (signed32(edi) >= signed32(esi)) [edi, esi] = [esi, edi];
    sd(0x4a88, edi);
    esi = (esi + 0x7fff) >>> 0;
    sd(0x4a8c, esi);
    ebx = (ebx & 0xffff0000) | w(0x4a70);
    if (signed16Value(ebx) < 1) ebx = (ebx & 0xffff0000) | 1;
    ebx = Math.imul(ebx, 5) >>> 0;
    ebx = (ebx << 22) >>> 0;
    memory.write32(0x2da1c + 0x4a88, (d(0x4a88) + ebx) >>> 0);
    const finalAdd = addFlags32(cpu, d(0x4a8c), ebx);
    sd(0x4a8c, finalAdd.result);

    cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
    cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp);
    runtime.translatedPc = 0x329aa; // Static 0x338aa, lower-band-only arm.
    return {
      stop: 'lower-band-only',
      staticPc: '0x338aa',
      topY: w(0x4a70),
      middleY: w(0x4a74),
      edgeSpan: w(0x4a90),
      dispatch: 'fall through to lower-band setup (no upper-band CALL)',
    };
  }
  if (signed32(esi) >= signed32(edi)) [esi, edi] = [edi, esi]; // CMP ESI,EDI / JL / XCHG at 0x33805.
  if (signed16Value(w(0x4a74)) > 0xc9) sw(0x4a74, 0xc9); // CMP/JLE/MOV at 0x3380b..0x3381f.
  if (signed16Value(w(0x4a70)) < 1) {
    // Original 0x3381f..0x33868 advances both edge accumulators and the
    // packed X interpolation by the rows clipped above the visible top.
    const clippedRows = (1 - w(0x4a70)) & 0xffff;
    const firstXProduct = Math.imul(signed16Value(clippedRows), signed16Value(w(0x4a6c))) & 0xffff;
    const secondXProduct = Math.imul(signed16Value(clippedRows), signed16Value(w(0x4a6e))) & 0xffff;
    eax = ((secondXProduct << 16) | firstXProduct) >>> 0;
    ebx = clippedRows;
    edx = clippedRows;
    let addition = addFlags32(cpu, ecx, eax);
    ecx = addition.result;
    ebx = Math.imul(ebx, esi) >>> 0;
    edx = Math.imul(edx, edi) >>> 0;
    addition = addFlags32(cpu, d(0x4a88), ebx);
    sd(0x4a88, addition.result);
    addition = addFlags32(cpu, d(0x4a8c), edx);
    sd(0x4a8c, addition.result);
    sw(0x4a70, 1);
  }

  const top = w(0x4a70);
  const bottom = w(0x4a74);
  const bandRows = (bottom - top) & 0xffff;
  edx = ((edx & 0xffff0000) | bandRows) >>> 0; // MOV DX,bottom / SUB DX,BX preserve upper EDX.
  if (bandRows === 0) {
    const returnAddress = memory.read32((runtime.segments?.ssBase ?? 0) + cpu.get('esp'));
    if (returnAddress !== 0x370e1) throw new Error(`zero-height upper band returned to unexpected caller 0x${returnAddress.toString(16)}`);
    cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
    cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp); cpu.set('esp', (cpu.get('esp') + 4) >>> 0);
    runtime.translatedPc = returnAddress; // Original JZ at 0x33882 reaches RET 0x334d4.
    return { stop: 'zero-middle-edge-return', staticPc: '0x334d4', returnAddress, topY: top, middleY: bottom };
  }
  ebx = Math.imul(top, 5) >>> 0;
  ebx = (ebx << 6) >>> 0;
  sw(0x4ab2, ebx);
  ebx = (ebx << 16) >>> 0;
  sd(0x4a88, (d(0x4a88) + ebx) >>> 0);
  const finalAdd = addFlags32(cpu, d(0x4a8c), ebx);
  sd(0x4a8c, finalAdd.result);

  const target = memory.read32(0x32398);
  if (target !== 0x324f0 || signed16Value(w(0x4a70)) < 1) {
    throw new Error(`capture-750 edge solver values differ: target=0x${target.toString(16)}, Y=[${[w(0x4a70), w(0x4a74), w(0x4a78)].map(v => v.toString(16))}], ySlopes=[${[d(0x4a7c), d(0x4a80), d(0x4a84)].map(v => v.toString(16))}], xSlopes=[${[w(0x4a68), w(0x4a6a), w(0x4a6c), w(0x4a6e)].map(v => v.toString(16))}], edgeStep=0x${ebp.toString(16)}, span=0x${w(0x4a90).toString(16)}, Xwords=[${[w(0x4a96), w(0x4a98), w(0x4a9a), w(0x4a9c), w(0x4a9e), w(0x4aa0)].map(v => v.toString(16))}]`);
  }
  const esp = (cpu.get('esp') - 4) >>> 0;
  memory.write32(esp, 0x329aa); // Original CALL at 0x338a4 returns at 0x338aa.
  cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
  cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp); cpu.set('esp', esp);
  runtime.translatedPc = target;
  const traceState = trace ? {
    registers: Object.fromEntries(['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp'].map(name => [name, `0x${cpu.get(name).toString(16).padStart(8, '0')}`])),
    solverBytes: Array.from(memory.bytes.subarray(0x2da1c + 0x4a60, 0x2da1c + 0x4ab6)),
  } : undefined;
  return {
    stop: 'upper-band-inline-handler-entry',
    runtimePc: `0x${target.toString(16)}`,
    staticPc: '0x333f0',
    callReturn: '0x338aa',
    bandRows,
    edxAtCall: `0x${edx.toString(16)}`,
    topY: top,
    middleY: w(0x4a74),
    bottomY: bottom,
    fixedPointEdgeStep: `0x${ebp.toString(16)}`,
    degenerateEdgeFallback,
    ySlopes: [d(0x4a7c), d(0x4a80), d(0x4a84)].map(value => `0x${value.toString(16)}`),
    xSlopes: [w(0x4a68), w(0x4a6a), w(0x4a6c), w(0x4a6e)].map(value => `0x${value.toString(16)}`),
    slopeBranch: signed32(esi) >= signed32(edi) ? '33697-forward' : '336e7-reversed',
    scanlineHandler: 'DS:[0x32398] => inline 0x333f0',
    traceState,
  };
}

// Follow the captured dispatch into inline handler 0x333f0. Translate its
// unclipped setup and the clipped 0x334d5..0x335d6 raster loop; the c750/c775
// animation adapter verifies these executable windows before using them.
export function resumeFn332b6Capture750UpperBandToSpan(runtime, { expectedCallReturn = 0x329aa } = {}) {
  const { cpu, memory } = runtime;
  if (runtime.translatedPc !== 0x324f0) throw new Error('capture-750 upper band must start at inline runtime handler 0x324f0');
  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('capture-750 scanline handler requires captured SS base');
  const w = (offset) => memory.read16(0x2da1c + offset);
  const d = (offset) => memory.read32(0x2da1c + offset);
  const sw = (offset, value) => memory.write16(0x2da1c + offset, value);
  let eax = cpu.get('eax');
  let ebx = cpu.get('ebx');
  let ecx = cpu.get('ecx');
  let edx = cpu.get('edx');
  let esi = cpu.get('esi');
  let edi = cpu.get('edi');
  let ebp = cpu.get('ebp');
  let esp = cpu.get('esp');

  if (expectedCallReturn !== null && memory.read32(ssBase + esp) !== expectedCallReturn) {
    throw new Error(`capture-750 inline handler return does not match 0x${expectedCallReturn.toString(16)}`);
  }
  memory.write16(0x32480, edx & 0xffff); // MOV [A64],DX
  esi = addFlags32(cpu, esi, 0x01400000).result;
  edi = addFlags32(cpu, edi, 0x01400000).result;
  cpu.setCmpFlags32(w(0x4ab0), 0);
  if (w(0x4ab0) !== 0) {
    // Original 0x334d5..0x335d6 is the clipped horizontal-span path. Its
    // three 0x12345678 immediates are patched by the preceding stores to
    // [0x4c7f], [0x4c85], and [0x4c8b] (the live instruction operands at
    // runtime 0x3269b, 0x326a1, and 0x326a7).
    let edx = w(0x4ab2);
    memory.write32(0x324d4, ecx);
    eax = d(0x4a6c);
    memory.write32(0x3269b, eax);

    let si = esi & 0xffff;
    let di = edi & 0xffff;
    esi = ((esi & 0xffff0000) | di) >>> 0;
    edi = ((edi & 0xffff0000) | si) >>> 0;
    esi = rotateWordHalves(esi);
    edi = rotateWordHalves(edi);
    memory.write32(0x2da1c + 0x4c85, esi);
    memory.write32(0x2da1c + 0x4c8b, edi);

    ebp = d(0x4a88);
    edi = d(0x4a8c);
    const bp = ebp & 0xffff;
    const lowDi = edi & 0xffff;
    ebp = ((ebp & 0xffff0000) | lowDi) >>> 0;
    edi = ((edi & 0xffff0000) | bp) >>> 0;
    ebp = rotateWordHalves(ebp);
    edi = rotateWordHalves(edi);
    ecx = memory.read32(0x324d4);

    const destinationBase = memory.read32(0x32394);
    const fsBase = runtime.segments?.fsBase;
    if (!Number.isInteger(fsBase)) throw new Error('capture-750 clipped scanline requires the captured FS base');
    let rows = w(0x4a64);
    let pixelWrites = 0;
    let skippedSpans = 0;
    let scanlineGuard = 0;
    while (rows !== 0) {
      if (++scanlineGuard > 512) throw new Error('capture-750 clipped scanline exceeded the 512-row safety bound');
      let spanStart = (ebp & 0xffff) >>> 0;
      let right = (edi & 0xffff) >>> 0;
      esi = spanStart;
      eax = right;
      let spanOffset = (spanStart - edx) >>> 0;
      esi = spanOffset;
      cpu.setCmpFlags32(spanStart, edx);
      if (!cpu.carry) {
        esi = (esi + edx) >>> 0;
        spanOffset = esi;
        edx = (edx + 0x140) >>> 0;
        const leftWord = spanOffset & 0xffff;
        const rowWord = edx & 0xffff;
        if (leftWord >= rowWord) {
          cpu.setCmpFlags32(leftWord, rowWord);
          skippedSpans += 1;
          // This corresponds to the branch to 0x33595. Do not undo the
          // 0x140 increment on this path.
          right = null;
        } else {
          edx = (edx - 0x140) >>> 0;
          cpu.setCmpFlags32(leftWord, rowWord);
        }
      } else {
        esi = Math.imul(esi | 0, d(0x4a68)) >>> 0;
        const interpolation = esi;
        ecx = (ecx - interpolation) >>> 0;
        esi = edx;
        spanOffset = esi;
      }

      if (right !== null) {
        if (eax < edx) eax = edx;
        edx = (edx + 0x140) >>> 0;
        if (eax >= edx) eax = edx;
        const width = (eax - esi) >>> 0;
        eax = width;
        cpu.setCmpFlags32(eax + esi, esi);
        if (width & 0x80000000 || width === 0) {
          skippedSpans += 1;
        } else {
          esi = ((esi & 0xffff) + destinationBase) >>> 0;
          let textureIncrement = d(0x4a68);
          let pixelGuard = 0;
          while (true) {
            if (++pixelGuard > 320) throw new Error('capture-750 clipped pixel span exceeded the 320-pixel safety bound');
            ebx = ((ebx & 0xffffff00) | ((ecx >>> 8) & 0xff)) >>> 0;
            ebx = ((ebx << 8) | (ecx >>> 24)) >>> 0;
            ecx = addFlags32(cpu, ecx, textureIncrement).result;
            const bx = ebx & 0xffff;
            const texel = memory.read8((fsBase + bx) >>> 0);
            ebx = ((ebx & 0xffffff00) | texel) >>> 0;
            esi = (esi + 1) >>> 0;
            memory.write8((esi - 1) >>> 0, texel);
            pixelWrites += 1;
            eax = ((eax & 0xffffff00) | (((eax & 0xff) - 1) & 0xff)) >>> 0;
            if ((eax & 0xff) === 0) break;
          }
        }
      }

      const textureIncrement = memory.read32(0x3269b);
      const textureAdd = addFlags32(cpu, memory.read32(0x324d4), textureIncrement);
      memory.write32(0x324d4, textureAdd.result);
      const edgeIncrement = memory.read32(0x2da1c + 0x4c85);
      const edgeAdd = addFlags32(cpu, ebp, edgeIncrement);
      ebp = edgeAdd.result;
      const rowIncrement = memory.read32(0x2da1c + 0x4c8b);
      const rowAdd = addFlags32(cpu, edi, rowIncrement, edgeAdd.carry ? 1 : 0);
      edi = rowAdd.result;
      const finalEdgeAdd = addFlags32(cpu, ebp, 0, rowAdd.carry ? 1 : 0);
      ebp = finalEdgeAdd.result;
      rows = decWordFlags(cpu, rows);
      sw(0x4a64, rows);
      ecx = memory.read32(0x324d4);
    }

    ebp = rotateWordHalves(ebp);
    edi = rotateWordHalves(edi);
    const oldBp = ebp & 0xffff;
    const oldDi = edi & 0xffff;
    ebp = ((ebp & 0xffff0000) | oldDi) >>> 0;
    edi = ((edi & 0xffff0000) | oldBp) >>> 0;
    memory.write32(0x324a4, ebp);
    memory.write32(0x324a8, edi);

    const returnAddress = memory.read32(ssBase + esp);
    if (expectedCallReturn !== null && returnAddress !== expectedCallReturn) {
      throw new Error(`capture-750 clipped handler returned to 0x${returnAddress.toString(16)}, expected 0x${expectedCallReturn.toString(16)}`);
    }
    cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
    cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp); cpu.set('esp', (esp + 4) >>> 0);
    runtime.translatedPc = returnAddress;
    return {
      stop: 'clipped-upper-band-completed',
      staticPc: '0x335d6',
      returnAddress,
      rows: w(0x4a64),
      pixelWrites,
      skippedSpans,
      patchedIncrements: {
        texture: `0x${memory.read32(0x3269b).toString(16)}`,
        edge: `0x${memory.read32(0x2da1c + 0x4c85).toString(16)}`,
        row: `0x${memory.read32(0x2da1c + 0x4c8b).toString(16)}`,
      },
    };
  }

  memory.write32(0x324d4, ecx); // MOV [AAB8],ECX
  const si = esi & 0xffff;
  const di = edi & 0xffff;
  esi = ((esi & 0xffff0000) | di) >>> 0;
  edi = ((edi & 0xffff0000) | si) >>> 0;
  esi = rotateWordHalves(esi);
  edi = rotateWordHalves(edi);
  memory.write32(0x325a3, esi); // MOV [AB87],ESI patches ADD EBP immediate.
  memory.write32(0x325a9, edi); // MOV [AB8D],EDI patches ADC EDX immediate.
  eax = d(0x4a6c);
  memory.write32(0x3259d, eax); // MOV [AB81],EAX patches ADD [AAB8] immediate.

  ebp = d(0x4a88);
  edx = d(0x4a8c);
  const bp = ebp & 0xffff;
  const dx = edx & 0xffff;
  ebp = ((ebp & 0xffff0000) | dx) >>> 0;
  edx = ((edx & 0xffff0000) | bp) >>> 0;
  ebp = rotateWordHalves(ebp);
  edx = rotateWordHalves(edx);
  esi = d(0x4a68);

  // First instruction at 0x33451: PUSH EBP / PUSH EDX.
  esp = (esp - 4) >>> 0;
  memory.write32(ssBase + esp, ebp);
  esp = (esp - 4) >>> 0;
  memory.write32(ssBase + esp, edx);
  ebp &= 0xffff;
  cpu.setAndFlags16(ebp);
  edx &= 0xffff;
  cpu.setAndFlags16(edx);
  edi = ebp;
  const spanStart = ebp;
  ebp = (ebp - edx) >>> 0;
  cpu.setCmpFlags32(spanStart, edx);
  if ((ebp & 0x80000000) === 0) {
    cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
    cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp); cpu.set('esp', esp);
    runtime.translatedPc = 0x32595; // Static 0x33495, empty/reversed span branch.
    return { stop: 'empty-upper-scanline-span', staticPc: '0x33495', ebp, edi, rowCount: memory.read16(0x32480) };
  }

  const spanOffset = (edi - ebp) >>> 0;
  cpu.setCmpFlags32(edi, ebp);
  const destinationAdd = addFlags32(cpu, spanOffset, memory.read32(0x32394));
  edi = destinationAdd.result;
  eax = ((eax & 0xffffff00) | memory.read8(0x323b4)) >>> 0;
  cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
  cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp); cpu.set('esp', esp);
  runtime.translatedPc = 0x32580; // Static 0x33480, first texture span operation.
  return {
    stop: 'upper-scanline-span-entry',
    staticPc: '0x33480',
    returnAddress: '0x338aa',
    firstRow: w(0x4a70),
    rowCount: memory.read16(0x32480),
    rowLength: (0 - ebp) >>> 0,
    destinationStart: `0x${edi.toString(16)}`,
    textureStart: `0x${ebx.toString(16)}`,
    liveIncrements: {
      texture: `0x${memory.read32(0x3259d).toString(16)}`,
      edge: `0x${memory.read32(0x325a3).toString(16)}`,
      row: `0x${memory.read32(0x325a9).toString(16)}`,
    },
  };
}

// Translate the lower-band setup at 0x338aa..0x3398c for the same captured
// record. The original tail JMPs to the inline handler, so its RET returns
// directly to fn_332b6's caller rather than to 0x338aa.
export function resumeFn332b6Capture750LowerBandToJump(runtime) {
  const { cpu, memory } = runtime;
  if (runtime.translatedPc !== 0x329aa) throw new Error('capture-750 lower band must start at 0x338aa');
  const w = offset => memory.read16(0x2da1c + offset);
  const d = offset => memory.read32(0x2da1c + offset);
  const sw = (offset, value) => memory.write16(0x2da1c + offset, value);
  let eax = cpu.get('eax');
  let ebx = cpu.get('ebx');
  let ecx = cpu.get('ecx');
  let edx = cpu.get('edx');
  let esi = cpu.get('esi');
  let edi = cpu.get('edi');

  ebx = ((ebx & 0xffff0000) | w(0x4a94)) >>> 0;
  cpu.setAndFlags16(ebx);
  if ((ebx & 0xffff) === 0) {
    // Original TEST/JZ at 0x338b1 returns directly when the middle-to-bottom
    // Y span is empty. At this point the upper band has already returned and
    // the stack again holds fn_37f74's continuation.
    const returnAddress = memory.read32((runtime.segments?.ssBase ?? 0) + cpu.get('esp'));
    if (returnAddress !== 0x370e1) throw new Error(`capture-750 empty lower band returned to unexpected caller 0x${returnAddress.toString(16)}`);
    cpu.set('ebx', ebx);
    cpu.set('esp', (cpu.get('esp') + 4) >>> 0);
    runtime.translatedPc = returnAddress;
    return { stop: 'zero-lower-band-return', staticPc: '0x334d4', returnAddress, rows: 0, middleY: w(0x4a74), bottomY: w(0x4a78) };
  }

  memory.write32(0x324b2, ecx); // MOV [A96],ECX
  let ax = (w(0x4a9e) - w(0x4a96)) & 0xffff;
  let dx = (ax & 0x8000) ? 0xffff : 0; // CWD
  ax = idiv16((signed16Value(dx) << 16) | ax, ebx);
  sw(0x4a6c, ax);
  ax = (w(0x4aa0) - w(0x4a98)) & 0xffff;
  dx = (ax & 0x8000) ? 0xffff : 0;
  ax = idiv16((signed16Value(dx) << 16) | ax, ebx);
  sw(0x4a6e, ax);

  esi = d(0x4a80);
  edi = d(0x4a84);
  if (signed32(esi) <= signed32(edi)) [esi, edi] = [edi, esi];
  if (w(0x4a78) > 0xc9) sw(0x4a78, 0xc9);
  if (signed16Value(w(0x4a74)) < 1) {
    // Exact translation of 0x33920..0x3395f: move the lower edge start to
    // scanline 1 while advancing both fixed-point edge accumulators and the
    // texture coordinate by the skipped rows.
    ebx = (1 - w(0x4a74)) & 0xffff;
    let ax = Math.imul(signed16Value(ebx), signed16Value(w(0x4a6c))) & 0xffff;
    eax = ((eax & 0xffff0000) | ax) >>> 0;
    eax = rotateWordHalves(eax);
    ax = Math.imul(signed16Value(ebx), signed16Value(w(0x4a6e))) & 0xffff;
    eax = ((eax & 0xffff0000) | ax) >>> 0;
    eax = rotateWordHalves(eax);
    edx = ebx;
    ebx = Math.imul(ebx, esi) >>> 0;
    edx = Math.imul(edx, edi) >>> 0;
    ecx = (ecx + eax) >>> 0;
    memory.write32(0x2da1c + 0x4a88, (d(0x4a88) + ebx) >>> 0);
    const finalAdd = addFlags32(cpu, d(0x4a8c), edx);
    memory.write32(0x2da1c + 0x4a8c, finalAdd.result);
    sw(0x4a74, 1);
  }

  ebx = ((ebx & 0xffff0000) | w(0x4a74)) >>> 0;
  edx = ((edx & 0xffff0000) | w(0x4a78)) >>> 0;
  const lowerRows = ((edx & 0xffff) - (ebx & 0xffff)) & 0xffff;
  edx = ((edx & 0xffff0000) | lowerRows) >>> 0;
  if (lowerRows === 0) {
    const returnAddress = memory.read32((runtime.segments?.ssBase ?? 0) + cpu.get('esp'));
    if (returnAddress !== 0x370e1) throw new Error(`zero-height lower band returned to unexpected caller 0x${returnAddress.toString(16)}`);
    cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
    cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('esp', (cpu.get('esp') + 4) >>> 0);
    runtime.translatedPc = returnAddress; // Original JZ at 0x33979 reaches RET 0x334d4.
    return { stop: 'zero-lower-band-return', staticPc: '0x334d4', returnAddress, rows: 0, middleY: w(0x4a74), bottomY: w(0x4a78) };
  }
  ebx = Math.imul(ebx, 5) >>> 0;
  ebx = (ebx << 6) >>> 0;
  sw(0x4ab2, ebx);

  const target = memory.read32(0x32398);
  if (target !== 0x324f0) throw new Error(`capture-750 lower-band JMP target changed: 0x${target.toString(16)}`);
  cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
  cpu.set('esi', esi); cpu.set('edi', edi);
  runtime.translatedPc = target;
  return {
    stop: 'lower-band-inline-handler-entry',
    staticPc: '0x333f0',
    rows: lowerRows,
    topY: w(0x4a74),
    bottomY: w(0x4a78),
    xSlopes: [w(0x4a6c), w(0x4a6e)].map(value => `0x${value.toString(16)}`),
    dispatch: 'indirect JMP DS:[0x32398]',
  };
}

// Capture-specific source lift for the active 0x33486 suffix in fn_332b6.
// The checkpoint is already inside the 0x33480 pixel loop, after MOV BL,CH
// and SHLD EBX,ECX,8. The live code immediates are read from the captured
// patched instruction fields instead of the executable placeholders.
export function resumeFn332b6TextureSpan(runtime, {
  expectedRows,
  expectedSavedStack,
  expectedReturn = 0x370e1,
  allowTranslatedSpanEntry = false,
  skipInitialSpan = false,
} = {}) {
  const { cpu, memory } = runtime;
  const translatedSpanEntry = allowTranslatedSpanEntry && runtime.translatedPc === 0x32580;
  const translatedEpilogueEntry = allowTranslatedSpanEntry && runtime.translatedPc === 0x32595;
  const expectedReturnAddress = (cpu.get('esp') + 8) >>> 0;
  if (!translatedSpanEntry && !translatedEpilogueEntry && runtime.capturedEip !== 0x32586 && runtime.capturedEip !== 0x3257c) {
    throw new Error(`fn_332b6 texture-span suffix requires captured runtime EIP 0x3257c or 0x32586, got 0x${runtime.capturedEip?.toString(16) ?? 'unknown'}`);
  }
  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('fn_332b6 texture span requires captured SS base');
  if (memory.read32(ssBase + expectedReturnAddress) !== expectedReturn) {
    throw new Error(`fn_332b6 suffix stack return mismatch: expected 0x${expectedReturn.toString(16)}`);
  }
  if (!Number.isInteger(runtime.segments?.fsBase) || runtime.segments.fsBase < 0) {
    throw new Error('fn_332b6 suffix requires the checkpoint-normalized FS base');
  }

  let eax = cpu.get('eax');
  let ebx = cpu.get('ebx');
  let ecx = cpu.get('ecx');
  let edx = cpu.get('edx');
  let esi = cpu.get('esi');
  let edi = cpu.get('edi');
  let ebp = cpu.get('ebp');
  let esp = cpu.get('esp');
  const fsBase = runtime.segments.fsBase >>> 0;
  const destinationBase = memory.read32(0x32394);
  const firstSavedEbp = memory.read32(ssBase + esp + 4);
  const firstSavedEdx = memory.read32(ssBase + esp);
  if (expectedSavedStack && (firstSavedEbp !== expectedSavedStack.ebp || firstSavedEdx !== expectedSavedStack.edx)) {
    throw new Error('fn_332b6 captured inner-span stack values differ from the selected checkpoint');
  }

  let rows = memory.read16(0x32480);
  const initialRows = rows;
  if (rows === 0 || (expectedRows !== undefined && rows !== expectedRows)) {
    throw new Error(`fn_332b6 captured row count is unexpected: got ${rows}`);
  }
  let pixelWrites = 0;
  let fsReads = 0;
  let skippedSpans = 0;
  let firstTextureByte = null;
  let firstTextureOffset = null;
  let firstOutputByte = null;
  let firstOutputAddress = null;

  // Capture 750 starts at ADD ECX,ESI after MOV BL,CH / SHLD. Capture 775
  // starts in the preceding NOP run, so it still needs those two instructions.
  if (runtime.capturedEip === 0x3257c || translatedSpanEntry) {
    const ch = (ecx >>> 8) & 0xff;
    ebx = ((ebx & 0xffffff00) | ch) >>> 0;
    ebx = ((ebx << 8) | (ecx >>> 24)) >>> 0;
  }

  // Complete the already-entered span. EBP is the negative remaining byte
  // count at both recorded checkpoints.
  if (!skipInitialSpan && !translatedEpilogueEntry) while (true) {
    ecx = addFlags32(cpu, ecx, esi).result;
    const bx = ebx & 0xffff;
    firstTextureOffset ??= bx;
    let bl = memory.read8((fsBase + bx) >>> 0);
    firstTextureByte ??= bl;
    fsReads += 1;
    bl = (bl + (eax & 0xff)) & 0xff;
    ebx = ((ebx & 0xffffff00) | bl) >>> 0;
    ebp = (ebp + 1) >>> 0;
    const destination = (ebp + edi - 1) >>> 0;
    firstOutputAddress ??= destination;
    firstOutputByte ??= bl;
    memory.write8(destination, bl);
    pixelWrites += 1;
    if (ebp === 0) break;
    const ch = (ecx >>> 8) & 0xff;
    ebx = ((ebx & 0xffffff00) | ch) >>> 0;
    ebx = ((ebx << 8) | (ecx >>> 24)) >>> 0;
  }

  while (true) {
    // POP EDX / POP EBP restores the accumulators saved at each scanline.
    edx = memory.read32(ssBase + esp);
    ebp = memory.read32(ssBase + esp + 4);
    esp = (esp + 8) >>> 0;

    // ADD [0x324d4],patched; ADD EBP,patched; ADC EDX,patched; ADC EBP,0.
    const textureIncrement = memory.read32(0x3259d);
    const textureBefore = memory.read32(0x324d4);
    const textureAdd = addFlags32(cpu, textureBefore, textureIncrement);
    memory.write32(0x324d4, textureAdd.result);

    const edgeIncrement = memory.read32(0x325a3);
    const edgeAdd = addFlags32(cpu, ebp, edgeIncrement);
    ebp = edgeAdd.result;

    const rowIncrement = memory.read32(0x325a9);
    const rowAdd = addFlags32(cpu, edx, rowIncrement, edgeAdd.carry ? 1 : 0);
    edx = rowAdd.result;
    const finalEdgeAdd = addFlags32(cpu, ebp, 0, rowAdd.carry ? 1 : 0);
    ebp = finalEdgeAdd.result;

    rows = decWordFlags(cpu, memory.read16(0x32480));
    memory.write16(0x32480, rows);
    ecx = memory.read32(0x324d4);
    if (rows === 0) break;

    // Next scanline at 0x33451: PUSH EBP / PUSH EDX and span setup.
    esp = (esp - 4) >>> 0;
    memory.write32(esp, ebp);
    esp = (esp - 4) >>> 0;
    memory.write32(esp, edx);
    const lowEbp = ebp & 0xffff;
    const lowEdx = edx & 0xffff;
    edi = lowEbp;
    ebp = (lowEbp - lowEdx) >>> 0;
    const negativeSpan = (ebp & 0x80000000) !== 0;
    if (!negativeSpan) {
      skippedSpans += 1;
      continue;
    }

    edi = (edi - ebp + destinationBase) >>> 0;
    eax = (eax & 0xffffff00) | memory.read8(0x323b4);
    while (true) {
      const ch = (ecx >>> 8) & 0xff;
      ebx = ((ebx & 0xffffff00) | ch) >>> 0;
      ebx = ((ebx << 8) | (ecx >>> 24)) >>> 0;
      ecx = addFlags32(cpu, ecx, esi).result;
      let bl = memory.read8((fsBase + (ebx & 0xffff)) >>> 0);
      firstTextureByte ??= bl;
      fsReads += 1;
      ebx = ((ebx & 0xffffff00) | bl) >>> 0;
      bl = (bl + (eax & 0xff)) & 0xff;
      ebx = ((ebx & 0xffffff00) | bl) >>> 0;
      ebp = (ebp + 1) >>> 0;
      const destination = (ebp + edi - 1) >>> 0;
      firstOutputAddress ??= destination;
      firstOutputByte ??= bl;
      memory.write8(destination, bl);
      pixelWrites += 1;
      if (ebp === 0) break;
    }
  }

  // The last POP pair has exposed the CALL return address for RET.
  ebp = rotateWordHalves(ebp);
  edx = rotateWordHalves(edx);
  const bp = ebp & 0xffff;
  const dx = edx & 0xffff;
  ebp = ((ebp & 0xffff0000) | dx) >>> 0;
  edx = ((edx & 0xffff0000) | bp) >>> 0;
  memory.write32(0x324a4, ebp);
  memory.write32(0x324a8, edx);

  const returnAddress = memory.read32(ssBase + esp);
  if (returnAddress !== expectedReturn) throw new Error(`fn_332b6 RET target changed: 0x${returnAddress.toString(16)}`);
  esp = (esp + 4) >>> 0;
  cpu.set('eax', eax); cpu.set('ebx', ebx); cpu.set('ecx', ecx); cpu.set('edx', edx);
  cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp); cpu.set('esp', esp);
  runtime.translatedPc = returnAddress;
  return {
    returnAddress,
    rowsProcessed: initialRows,
    pixelWrites,
    fsReads,
    skippedSpans,
    firstTextureOffset: firstTextureOffset === null ? null : `0x${firstTextureOffset.toString(16)}`,
    firstTextureByte,
    firstOutputByte,
    firstOutputAddress: firstOutputAddress === null ? null : `0x${firstOutputAddress.toString(16)}`,
  };
}

// Complete a textured record after fn_37f74 has copied its three XY/UV
// corners to 0x3239c. The source slices were first exercised from c750/c775
// state; keeping the entry-to-return composition here lets the original
// fn_380e8 controller call the same translated raster path during startup.
export function runFn332b6TranslatedEntry(runtime) {
  const prefix = resumeFn332b6EntryTo335d7(runtime);
  if (runtime.translatedPc === 0x370e1) return { prefix, returned: true, raster: null };

  const edge = resumeFn332b6Capture750EdgeSolverToUpperCall(runtime);
  if (['zero-middle-edge-return', 'zero-height-degenerate-edge-return'].includes(edge.stop)) {
    return { prefix, edge, returned: runtime.translatedPc === 0x370e1 };
  }

  const runSpan = (expectedRows, expectedReturn, skipInitialSpan = false) => {
    const returnAddress = expectedReturn ?? 0x370e1;
    const span = resumeFn332b6TextureSpan(runtime, {
      expectedRows,
      expectedReturn: returnAddress,
      allowTranslatedSpanEntry: true,
      skipInitialSpan,
    });
    if (runtime.translatedPc !== returnAddress) throw new Error(`fn_332b6 span returned to 0x${runtime.translatedPc?.toString(16)}, expected 0x${returnAddress.toString(16)}`);
    return span;
  };
  const finishBand = (expectedReturn, rows) => {
    const setup = resumeFn332b6Capture750UpperBandToSpan(runtime, { expectedCallReturn: expectedReturn });
    if (setup.stop === 'clipped-upper-band-completed') return { setup, span: null };
    if (!['upper-scanline-span-entry', 'empty-upper-scanline-span'].includes(setup.stop)) {
      throw new Error(`fn_332b6 translated band stopped at ${setup.stop}`);
    }
    const span = runSpan(rows, expectedReturn, setup.stop === 'empty-upper-scanline-span');
    return { setup, span };
  };

  let upper = null;
  if (edge.stop === 'lower-band-only') {
    const lower = resumeFn332b6Capture750LowerBandToJump(runtime);
    if (lower.stop === 'zero-lower-band-return') {
      return { prefix, edge, lower, returned: runtime.translatedPc === 0x370e1 };
    }
    const band = finishBand(null, lower.rows);
    return { prefix, edge, lower, band, returned: runtime.translatedPc === 0x370e1 };
  }
  if (edge.stop !== 'upper-band-inline-handler-entry') {
    throw new Error(`fn_332b6 translated edge path stopped at ${edge.stop}`);
  }

  upper = finishBand(0x329aa, edge.bandRows);
  const lower = resumeFn332b6Capture750LowerBandToJump(runtime);
  if (lower.stop === 'zero-lower-band-return') {
    return { prefix, edge, upper, lower, returned: runtime.translatedPc === 0x370e1 };
  }
  const lowerBand = finishBand(null, lower.rows);
  return { prefix, edge, upper, lower, lowerBand, returned: runtime.translatedPc === 0x370e1 };
}
