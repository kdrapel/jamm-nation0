import { fn_20a53 } from './hardware-setup.mjs';
import { fn_6bd20, fn_6bd3f } from './dispatch-wrapper.mjs';
import { fn_28510, fn_2852b } from './vga-helpers.mjs';
import { fn_216be } from './timing-helper.mjs';

const u32 = value => value >>> 0;
const signed32 = value => value | 0;
function imulShift16(a, b) {
  const product = BigInt(signed32(a)) * BigInt(signed32(b));
  return Number(BigInt.asUintN(32, product >> 16n));
}
function requireAdapter(adapters, name, boundary) {
  if (typeof adapters?.[name] !== 'function') throw new TypeError(`fn_602e4 requires ${name} adapter for ${boundary}`);
  return adapters[name];
}

// Mechanical lift of 0x602e4..0x60562. The mouse interrupt and asynchronous
// event/timer updates remain host boundaries. The 0x12345678 lookup
// displacements are patched from DS:[0x21960] and advanced per output row.
function __coverage_impl_fn_602e4(runtime, adapters = {}) {
  const { cpu, memory } = runtime;
  const interrupt33 = requireAdapter(adapters, 'interrupt33', 'INT 33h at 0x602ee');
  const readLookupByte = requireAdapter(adapters, 'readLookupByte', 'DS-relative lookup table');
  const frameCheckpoint = requireAdapter(adapters, 'frameCheckpoint', 'asynchronous state at 0x6039f');

  memory.write16(0xe0, 0x13);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x10);
  interrupt33(0x33, runtime);
  fn_216be(runtime);
  memory.write32(0x5f0e0, memory.read32(0x203f2));

  for (let ebp = 0; ebp < 0x100; ebp += 1) {
    const low = (ebp & 0x0f) * 3;
    const high = (ebp >>> 4) * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      let cl = (memory.read8(0x5f678 + low + channel) + memory.read8(0x5f8e8 + high + channel)) & 0xff;
      if (cl >= 0x40) cl = 0x3f;
      memory.write8(0x5f0e4 + ebp * 3 + channel, cl);
    }
  }
  cpu.set('esi', 0x5f0e4); cpu.set('ecx', 0x100); cpu.set('eax', 0);
  fn_2852b(runtime);
  // OUT DX,AX at 0x60378: four physical scanlines per source row.
  runtime.out16(0x3d4, 0x4309);
  fn_28510(runtime);
  memory.write32(0x21954, 0);
  memory.write32(0x21958, 0);

  let frameEax = cpu.get('eax');
  let frameEbx = cpu.get('ebx');
  let frameEsi = 0;
  let frameEdi = 0;
  let frameEbp = 0;
  let returnEcx = 0;
  for (;;) {
    fn_2852b(runtime);
    frameCheckpoint(runtime, 0x6039f);
    if (memory.read8(0x5f663) !== 0xff) {
      const bl = memory.read8(0x5f663);
      runtime.out8(0x3c8, 0);
      let esi = 0x5f0e4;
      for (let ecx = 0x300; ecx !== 0; ecx -= 1) {
        const al = memory.read8(esi++);
        runtime.out8(0x3c9, (Math.imul(al, bl) >>> 8) & 0xff);
      }
    }

    memory.write32(0x5f5ac, memory.read32(0x21960));
    memory.write32(0x5f5be, memory.read32(0x21960));
    let edi = u32(0xa0000 - memory.read32(0x18));
    let esi = memory.read32(0x5f0e0);
    let ebx = memory.read32(0x5f664) & 0xfff;
    let ecx = u32(imulShift16(0x50, memory.read32(u32(0x2298c + ebx * 4))) + 0x50);
    ebx = memory.read32(0x5f668) & 0xfff;
    let eax = u32(imulShift16(0x32, memory.read32(u32(0x2198c + ebx * 4))) + 0x32);
    eax = Math.imul(eax, 0x140) >>> 0;
    esi = u32(esi + Math.imul(eax + ecx, 2));
    let ebp = memory.read32(0x5f0e0); // MOV EBP,ESI precedes LEA ESI at 0x60435.
    ebx = memory.read32(0x5f66c) & 0xfff;
    ecx = u32(imulShift16(0x50, memory.read32(u32(0x2298c + ebx * 4))) + 0x50);
    ebx = memory.read32(0x5f670) & 0xfff;
    eax = u32(imulShift16(0x32, memory.read32(u32(0x2198c + ebx * 4))) + 0x32);
    eax = Math.imul(eax, 0x140) >>> 0;
    ebp = u32(ebp + Math.imul(eax + ecx, 2));
    frameEax = u32(eax + ecx);
    edi = u32(edi + 0xc80);
    memory.write32(0x5f674, 0x50);

    while (memory.read32(0x5f674) !== 0) {
      let edx = 0;
      for (let offset = 0xfffffec0; offset !== 0; offset = u32(offset + 2)) {
        let bx = memory.read16(u32(offset + esi + 0x140));
        let al = (readLookupByte(u32(memory.read32(0x5f5ac) + edx + bx), runtime) & 0xff) << 4;
        bx = memory.read16(u32(offset + ebp + 0x140));
        al = (al | (readLookupByte(u32(memory.read32(0x5f5be) + edx + bx), runtime) & 0xff)) & 0xff;
        frameEax = (frameEax & 0xffff0000) | al | (al << 8);
        frameEbx = bx;
        memory.write16(u32(edi + offset), al | (al << 8));
        edx = u32(edx + 1);
      }
      memory.write32(0x5f5ac, u32(memory.read32(0x5f5ac) + 0x100));
      memory.write32(0x5f5be, u32(memory.read32(0x5f5be) + 0x100));
      esi = u32(esi + 0x280); edi = u32(edi + 0x140); ebp = u32(ebp + 0x280);
      memory.write32(0x5f674, u32(memory.read32(0x5f674) - 1));
    }
    frameEsi = esi; frameEdi = edi; frameEbp = ebp;
    cpu.set('eax', frameEax); cpu.set('ebx', frameEbx); cpu.set('ecx', 0);
    cpu.set('edx', 0xa0); cpu.set('esi', frameEsi); cpu.set('edi', frameEdi); cpu.set('ebp', frameEbp);
    memory.write32(0x5f664, u32(memory.read32(0x5f664) + 0x0f));
    memory.write32(0x5f668, u32(memory.read32(0x5f668) + 0x10));
    memory.write32(0x5f66c, u32(memory.read32(0x5f66c) + 0x0b));
    memory.write32(0x5f670, u32(memory.read32(0x5f670) + 0x0b));

    let pending = memory.read32(0x21954);
    memory.write32(0x21954, 0);
    if (pending === 0) continue;
    let exitRequested = false;
    while (pending !== 0) {
      if (memory.read32(0x21958) >= 0x4a6) {
        const oldValue = memory.read8(0x5f663);
        memory.write8(0x5f663, oldValue - 2);
        if (oldValue < 2) { exitRequested = true; break; }
      }
      pending = u32(pending - 1);
    }
    returnEcx = pending;
    if (exitRequested) break;
  }

  cpu.set('ecx', returnEcx);
  cpu.set('eax', (cpu.get('eax') & 0xffff0000) | 0x4109);
  cpu.set('edx', (cpu.get('edx') & 0xffff0000) | 0x3d4);
  runtime.out16(0x3d4, 0x4109);
  if (memory.read8(0x1eb70) !== 0) fn_20a53(runtime);
  else { fn_6bd3f(runtime); fn_6bd20(runtime, { callIndirect: adapters.callIndirect }); }
}

// Captured suffix from the fn_2852b return at static 0x603a4. It renders one
// complete frame from the checkpoint RAM/VGA state and executes the original
// pending-event loop before stopping at the next retrace call.
export function resumeFn602e4FrameAt0x603a4(runtime, { readLookupByte, frameCheckpoint = () => {} } = {}) {
  const captureId = runtime.captureEvidence?.id;
  const retraceCapture = ['capture_000825', 'capture_000875'].includes(captureId) && runtime.capturedEip === 0x27639;
  const c850SuffixCompleted = captureId === 'capture_000850'
    && runtime.captureResumeEvidence?.kind === 'fn_602e4-captured-mid-frame-suffix'
    && runtime.captureResumeEvidence?.stopStaticAddress === '0x6039f';
  if (!retraceCapture && !c850SuffixCompleted) {
    throw new Error('fn_602e4 frame suffix requires c825/c875 at the captured retrace point or c850 after its captured mid-frame suffix');
  }
  if (runtime.translatedPc !== 0x5f4a4) throw new Error(`fn_602e4 suffix must start at runtime 0x5f4a4, got 0x${runtime.translatedPc?.toString(16)}`);
  if (typeof readLookupByte !== 'function') throw new TypeError('fn_602e4 suffix requires a DS lookup-byte reader');

  const { cpu, memory } = runtime;
  const frameStart = runtime.translatedPc;
  const u32local = value => value >>> 0;
  frameCheckpoint(runtime, 0x6039f);
  if (memory.read8(0x5f663) !== 0xff) {
    const bl = memory.read8(0x5f663);
    runtime.out8(0x3c8, 0);
    let esi = 0x5f0e4;
    for (let ecx = 0x300; ecx !== 0; ecx -= 1) runtime.out8(0x3c9, (Math.imul(memory.read8(esi++), bl) >>> 8) & 0xff);
  }

  memory.write32(0x5f5ac, memory.read32(0x21960));
  memory.write32(0x5f5be, memory.read32(0x21960));
  let edi = u32local(0xa0000 - memory.read32(0x18));
  let esi = memory.read32(0x5f0e0);
  let ebx = memory.read32(0x5f664) & 0xfff;
  let renderEcX = u32local(imulShift16(0x50, memory.read32(u32local(0x2298c + ebx * 4))) + 0x50);
  ebx = memory.read32(0x5f668) & 0xfff;
  let eax = u32local(imulShift16(0x32, memory.read32(u32local(0x2198c + ebx * 4))) + 0x32);
  eax = Math.imul(eax, 0x140) >>> 0;
  esi = u32local(esi + Math.imul(eax + renderEcX, 2));
  let ebp = memory.read32(0x5f0e0); // Original undisplaced source at 0x60435.
  ebx = memory.read32(0x5f66c) & 0xfff;
  renderEcX = u32local(imulShift16(0x50, memory.read32(u32local(0x2298c + ebx * 4))) + 0x50);
  ebx = memory.read32(0x5f670) & 0xfff;
  eax = u32local(imulShift16(0x32, memory.read32(u32local(0x2198c + ebx * 4))) + 0x32);
  eax = Math.imul(eax, 0x140) >>> 0;
  ebp = u32local(ebp + Math.imul(eax + renderEcX, 2));
  let frameEax = u32local(eax + renderEcX);
  let frameEbx = cpu.get('ebx');
  edi = u32local(edi + 0xc80);
  memory.write32(0x5f674, 0x50);

  let renderedRows = 0;
  let renderedWords = 0;
  while (memory.read32(0x5f674) !== 0) {
    let edx = 0;
    for (let offset = 0xfffffec0; offset !== 0; offset = u32local(offset + 2)) {
      let bx = memory.read16(u32local(offset + esi + 0x140));
      let al = (readLookupByte(u32local(memory.read32(0x5f5ac) + edx + bx), runtime) & 0xff) << 4;
      bx = memory.read16(u32local(offset + ebp + 0x140));
      al = (al | (readLookupByte(u32local(memory.read32(0x5f5be) + edx + bx), runtime) & 0xff)) & 0xff;
      frameEax = (frameEax & 0xffff0000) | al | (al << 8);
      frameEbx = bx;
      memory.write16(u32local(edi + offset), al | (al << 8));
      edx = u32local(edx + 1);
      renderedWords += 1;
    }
    memory.write32(0x5f5ac, u32local(memory.read32(0x5f5ac) + 0x100));
    memory.write32(0x5f5be, u32local(memory.read32(0x5f5be) + 0x100));
    esi = u32local(esi + 0x280); edi = u32local(edi + 0x140); ebp = u32local(ebp + 0x280);
    memory.write32(0x5f674, u32local(memory.read32(0x5f674) - 1));
    renderedRows += 1;
  }

  cpu.set('eax', frameEax); cpu.set('ebx', frameEbx); cpu.set('ecx', 0);
  cpu.set('edx', 0xa0); cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ebp', ebp);
  memory.write32(0x5f664, u32local(memory.read32(0x5f664) + 0x0f));
  memory.write32(0x5f668, u32local(memory.read32(0x5f668) + 0x10));
  memory.write32(0x5f66c, u32local(memory.read32(0x5f66c) + 0x0b));
  memory.write32(0x5f670, u32local(memory.read32(0x5f670) + 0x0b));
  let pending = memory.read32(0x21954);
  const pendingAtFrameEnd = pending;
  const phase = memory.read32(0x21958);
  memory.write32(0x21954, 0); // XCHG ECX,[0x21954]
  let pendingLoopCount = pending;
  let exitRequested = false;
  let fadeAtExit = null;
  let fadeEventsApplied = 0;
  while (pendingLoopCount !== 0) {
    cpu.setCmpFlags32(phase, 0x4a6); // CMP [0x21958],0x4a6
    if (phase >= 0x4a6) {
      const previous = memory.read8(0x5f663);
      const next = (previous - 2) & 0xff;
      memory.write8(0x5f663, next); // SUB byte ptr [0x5f663],2
      cpu.setCmpFlags8(previous, 2); // SUB flags feed the following JB at 0x60535.
      fadeEventsApplied += 1;
      if (previous < 2) { exitRequested = true; fadeAtExit = previous; break; } // Branches to 0x6053e.
    }
    pendingLoopCount = u32local(pendingLoopCount - 1); // LOOP preserves flags.
  }
  pending = pendingLoopCount;
  cpu.set('ecx', pendingLoopCount);
  runtime.translatedPc = exitRequested ? 0x5f63e : 0x5f49f;
  return { function: 'fn_602e4', resumedFromStaticAddress: '0x603a4', originalFunctionCompleted: false, renderedRows, renderedWords, renderedPixelBytes: renderedWords * 2, phaseAtCheckpoint: `0x${phase.toString(16)}`, pendingEventsAtFrameEnd: pendingAtFrameEnd, pendingEventsRemaining: pending, fadeEventsApplied, fadeAtExit, exitRequested, stopRuntimePc: runtime.translatedPc, stopStaticPc: exitRequested ? '0x6053e' : '0x6039f', syntheticHardware: 'spec-backed synthetic VGA retrace after captured low phase' };
}

// Capture-850 mid-frame continuation. EIP is the self-patched lookup read at
// static 0x604a9, after MOV BX from the first row's source. It finishes the
// captured frame suffix and stops at the next retrace call without inventing
// a port phase or timer event.
export function resumeFn602e4At0x604a9(runtime, { readLookupByte } = {}) {
  if (runtime.captureEvidence?.id !== 'capture_000850' || runtime.capturedEip !== 0x5f5a9) {
    throw new Error('fn_602e4 mid-frame suffix is grounded only in capture_000850 at runtime EIP 0x5f5a9');
  }
  if (runtime.translatedPc !== 0x5f5a9) throw new Error(`fn_602e4 suffix must start at runtime 0x5f5a9, got 0x${runtime.translatedPc?.toString(16)}`);
  if (typeof readLookupByte !== 'function') throw new TypeError('fn_602e4 suffix requires a DS lookup-byte reader');
  if (runtime.captureEvidence?.segments?.ds?.normalizedBase !== 0 || runtime.segments?.esBase !== 0) {
    throw new Error('capture_000850 DS/ES must normalize to base zero for this CS:0 continuation');
  }

  const { cpu, memory } = runtime;
  const u32local = value => value >>> 0;
  let eax = cpu.get('eax');
  let ebx = cpu.get('ebx');
  let ecx = cpu.get('ecx');
  let edx = cpu.get('edx');
  let esi = cpu.get('esi');
  let edi = cpu.get('edi');
  let ebp = cpu.get('ebp');
  const rowsAtEntry = memory.read32(0x5f674);
  const pendingAtEntry = memory.read32(0x21954);
  const phase = memory.read32(0x21958);
  if (rowsAtEntry !== 0x28 || ecx !== 0xffffff18 || edx !== 0x2c || (ebx & 0xffff) !== 0x0b02
      || pendingAtEntry !== 1 || phase !== 0x26f || memory.read8(0x5f663) !== 0xff
      || memory.read32(0x5f5ac) !== 0x79799 || memory.read32(0x5f5be) !== 0x79799) {
    throw new Error('capture_000850 mid-row registers do not match the recorded 0x604a9 continuation');
  }

  let renderedRows = 0;
  let renderedWords = 0;
  let firstRow = true;
  let bx = ebx & 0xffff; // MOV BX,[ECX+ESI+0x140] executed immediately before the captured EIP.
  let lookupBaseA = memory.read32(0x5f5ac);
  let lookupBaseB = memory.read32(0x5f5be);
  for (let rows = rowsAtEntry; rows !== 0; rows = u32local(rows - 1)) {
    if (!firstRow) {
      ecx = 0xfffffec0;
      edx = 0;
      bx = memory.read16(u32local(esi + ecx + 0x140));
    }
    while (ecx !== 0) {
      let al = readLookupByte(u32local(lookupBaseA + edx + bx), runtime) & 0xff;
      al = (al << 4) & 0xff;
      bx = memory.read16(u32local(ecx + ebp + 0x140));
      al = (al | (readLookupByte(u32local(lookupBaseB + edx + bx), runtime) & 0xff)) & 0xff;
      eax = (eax & 0xffff0000) | al | (al << 8);
      ebx = (ebx & 0xffff0000) | bx;
      runtime.writeEs16(u32local(edi + ecx), al | (al << 8));
      edx = u32local(edx + 1);
      ecx = u32local(ecx + 2);
      renderedWords += 1;
      if (renderedWords > 0x5000) throw new Error('capture_000850 suffix exceeded the original 80-row frame bound');
      if (ecx !== 0) bx = memory.read16(u32local(esi + ecx + 0x140));
    }

    lookupBaseA = u32local(lookupBaseA + 0x100);
    lookupBaseB = u32local(lookupBaseB + 0x100);
    memory.write32(0x5f5ac, lookupBaseA);
    memory.write32(0x5f5be, lookupBaseB);
    esi = u32local(esi + 0x280);
    edi = u32local(edi + 0x140);
    ebp = u32local(ebp + 0x280);
    memory.write32(0x5f674, u32local(rows - 1));
    renderedRows += 1;
    firstRow = false;
  }

  memory.write32(0x5f664, u32local(memory.read32(0x5f664) + 0x0f));
  memory.write32(0x5f668, u32local(memory.read32(0x5f668) + 0x10));
  memory.write32(0x5f66c, u32local(memory.read32(0x5f66c) + 0x0b));
  memory.write32(0x5f670, u32local(memory.read32(0x5f670) + 0x0b));

  const pending = pendingAtEntry;
  memory.write32(0x21954, 0);
  ecx = pending;
  while (ecx !== 0) {
    cpu.setCmpFlags32(phase, 0x4a6);
    ecx = u32local(ecx - 1); // LOOP preserves flags.
  }

  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ecx', ecx);
  cpu.set('edx', edx);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ebp', ebp);
  runtime.translatedPc = 0x5f49f; // Static 0x6039f: next call to the VGA retrace helper.
  return {
    function: 'fn_602e4', originalFunctionCompleted: false,
    resumedFromStaticAddress: '0x604a9', stopStaticAddress: '0x6039f',
    renderedRows, renderedWords, renderedPixelBytes: renderedWords * 2,
    rowsAtEntry, pendingEventsConsumed: pendingAtEntry,
    phaseAtCheckpoint: `0x${phase.toString(16)}`, lookupBaseA: `0x${lookupBaseA.toString(16)}`,
    lookupBaseB: `0x${lookupBaseB.toString(16)}`, stopRuntimePc: runtime.translatedPc,
  };
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_602e4 = instrumentLift('0x602e4', 'fn_602e4', __coverage_impl_fn_602e4);
