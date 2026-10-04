import { fn_1189 } from './allocator.mjs';
import { fn_28510, fn_2852b, fn_28542, fn_28559, fn_28574, resumeFn2852bAt0x28539 } from './vga-helpers.mjs';
import { fn_5f269 } from './random-helper.mjs';
import { fn_5f21b, fn_5f23d } from './glyph-string-helper.mjs';
import { fn_216be } from './timing-helper.mjs';

const u32 = value => value >>> 0;

function esFillDwords(runtime, start, value, count) {
  for (let index = 0; index < count; index += 1) runtime.writeEs32(u32(start + index * 4), value);
}

function esCopyDwords(runtime, source, target, count) {
  for (let index = 0; index < count; index += 1) {
    runtime.writeEs32(u32(target + index * 4), runtime.memory.read32(u32(source + index * 4)));
  }
}

// Mechanical lift of the callable animation routine at 0x5efd7..0x5f217.
// DOS mouse calls, allocator-failure control transfer, and asynchronous frame
// events stay explicit host boundaries. `hardwareCheckpoint` must advance the
// emulated external state when the original would receive an interrupt/tick.
function __coverage_impl_fn_5efd7(runtime, { interrupt33, allocationFailure, hardwareCheckpoint }) {
  if (typeof interrupt33 !== 'function') throw new Error('fn_5efd7 requires the unresolved INT 33h callback');
  if (typeof hardwareCheckpoint !== 'function') throw new Error('fn_5efd7 requires a hardwareCheckpoint for asynchronous animation events');
  const { cpu, memory } = runtime;

  let ebp = 0xffffffec;
  for (;;) {
    cpu.set('eax', 0xfa00);
    fn_1189(runtime);
    const slot = u32(0x5e0cb + ebp);
    memory.write32(slot, cpu.get('eax'));
    let edi = cpu.get('eax');
    let ecx = 0xfa00;
    while (ecx !== 0) {
      fn_5f269(runtime);
      const al = (cpu.get('eax') & 0xffff) < 3 ? 1 : 0;
      memory.write8(edi, al);
      edi = u32(edi + 1);
      ecx = u32(ecx - 1);
    }
    ebp = u32(ebp + 4);
    if (ebp === 0) break;
  }

  cpu.set('eax', 0x28a04);
  fn_1189(runtime);
  let eax = u32(cpu.get('eax') + 4) & 0xfffffffc;
  memory.write32(0x5e0cf, eax);
  let edi = eax;
  let esi = 0x6b55;
  let ecx = 0xffff0600;
  let bl = 7;
  do {
    bl = (bl + 1) & 0xff;
    if (bl >= 8) {
      bl = 0;
      eax = 0xff;
      if (esi < 0x851d) {
        eax = memory.read8(esi);
        esi = u32(esi + 1);
      }
    }
    const carry = (eax & 0x80) !== 0;
    eax = (eax << 1) & 0xff;
    memory.write8(u32(edi + 0xfa00 + ecx), carry ? 2 : 0);
    ecx = u32(ecx + 1);
  } while (ecx !== 0);

  esi = memory.read32(0x5e0cf);
  edi = u32(esi + 0xfa00);
  esFillDwords(runtime, edi, 0x02020202, 0x2580);
  edi = u32(esi + 0x19000);
  esCopyDwords(runtime, esi, edi, 0x3e80);

  memory.write16(0xe0, 0x13);
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x10);
  interrupt33(runtime);
  fn_2852b(runtime);
  fn_28559(runtime, { index: 0xff, red: 0, green: 0, blue: 0 });
  cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0xff);
  fn_28542(runtime);

  edi = u32(0xa0000 - memory.read32(0x18));
  esFillDwords(runtime, edi, 0xffffffff, 0x3e80);
  fn_2852b(runtime);
  edi = 0x5dd10;
  const redGreen = memory.read16(0x5dd43);
  memory.write16(edi, redGreen);
  memory.write8(edi + 2, memory.read8(0x5dd45));
  esi = 0x5dd10;
  cpu.set('eax', 0);
  cpu.set('ecx', 0x20);
  cpu.set('esi', esi);
  fn_28510(runtime);
  cpu.set('edx', 0x3c8);
  runtime.out8(0x3c8, 0);
  cpu.set('edx', 0x3c9);

  cpu.set('eax', 0xfa00);
  fn_1189(runtime);
  if (runtime.cpu.carry) {
    if (typeof allocationFailure !== 'function') throw new Error('fn_5efd7 allocation failure requires transfer to 0x21c36');
    allocationFailure(runtime, 0x21c36);
    return;
  }
  memory.write32(0x5e361, cpu.get('eax'));
  edi = cpu.get('eax');
  esFillDwords(runtime, edi, 0, 0x3e80);
  cpu.set('esi', 0x5e41b);
  cpu.set('edi', memory.read32(0x5e361));
  fn_5f23d(runtime);
  cpu.set('esi', 0x5e38f);
  cpu.set('edi', memory.read32(0x5e361));
  fn_5f21b(runtime);
  fn_216be(runtime);

  memory.write32(0x21954, 0);
  memory.write32(0x21958, 0);
  memory.write8(0x5e318, 0xff);

  let edx = 0;
  let ebp2 = 0;
  for (;;) {
    fn_2852b(runtime);
    hardwareCheckpoint(runtime, 0x5f14f);
    let bl = memory.read8(0x5e318);
    if (bl !== 0xff) {
      esi = 0x5dd10;
      ecx = 0x300;
      cpu.set('edx', 0x3c8);
      runtime.out8(0x3c8, 0);
      cpu.set('edx', 0x3c9);
      while (ecx !== 0) {
        let al = memory.read8(esi);
        esi = u32(esi + 1);
        const product = al * bl;
        al = (product >>> 8) & 0xff;
        runtime.out8(0x3c9, al);
        ecx = u32(ecx - 1);
      }
    }

    ecx = 0xffff2e00;
    esi = u32(memory.read32(0x5e361) + 0xc80);
    edi = u32(0xa1400 - memory.read32(0x18));
    const index = memory.read32(0x5e0cb);
    edx = memory.read32(u32(0x5e0b7 + index * 4));
    ebp2 = u32(memory.read32(0x5e0cf) + memory.read32(0x5e0d3));
    for (;;) {
      const offset = u32(0xd200 + ecx);
      const first = memory.read32(u32(esi + offset));
      const second = memory.read32(u32(edx + offset));
      const third = memory.read32(u32(ebp2 + offset));
      eax = first | second | third;
      memory.write32(u32(edi + offset), eax); // Original 0x5f1c3 uses DS, not an ES override.
      ecx = u32(ecx + 4);
      if (ecx === 0) break;
    }

    ecx = memory.read32(0x21954);
    memory.write32(0x21954, 0);
    if (ecx === 0) continue;
    for (;;) {
      memory.write32(0x5e0cb, u32(memory.read32(0x5e0cb) + 1));
      if (memory.read32(0x5e0cb) >= 5) memory.write32(0x5e0cb, 0);
      if (memory.read32(0x21958) >= 0x276) {
        bl = (memory.read8(0x5e318) - 1) & 0xff;
        memory.write8(0x5e318, bl);
        if (bl === 0) break;
      }
      hardwareCheckpoint(runtime, 0x5f1d9);
      ecx = u32(ecx - 1);
      if (ecx === 0) break;
    }
    if (memory.read8(0x5e318) === 0) break;
  }

  cpu.set('eax', eax);
  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | 1);
  cpu.set('ecx', ecx);
  cpu.set('edx', edx);
  cpu.set('ebp', ebp2);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.setCarry(false);
  fn_2852b(runtime);
  fn_28574(runtime);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_5efd7 = instrumentLift('0x5efd7', 'fn_5efd7', __coverage_impl_fn_5efd7);

// Captured suffix: original EIP 0x28539 is the TEST after the retrace IN.
// This continues through the caller's compositor iteration and stops at its
// next 0x5f14f retrace call boundary; it does not claim the whole function ran.
export function resumeFn5efd7At0x5f154(runtime, { maxPortReads = 4096, maxFrames = 2, continueCapturedRetrace = true } = {}) {
  if (!Number.isInteger(maxFrames) || maxFrames < 1) throw new RangeError('maxFrames must be a positive integer');
  const continueWait = () => resumeFn2852bAt0x28539(runtime, { maxPortReads });
  if (!continueCapturedRetrace && runtime.translatedPc !== 0x5e254) throw new Error('compositor suffix requires the original post-retrace return state at runtime 0x5e254');
  const continuation = !continueCapturedRetrace ? null : runtime.functionCoverage
    ? runtime.functionCoverage.invoke('0x2852b', 'fn_2852b:resume@0x28539', runtime, continueWait, [])
    : continueWait();
  const { cpu, memory } = runtime;
  let eax = cpu.get('eax');
  let edx = 0;
  let ebp = 0;
  let completedFrames = 0;
  let consumedFrameEventIterations = 0;
  for (;;) {
  if (completedFrames >= maxFrames) {
    runtime.translatedPc = 0x5e24f;
    return {
      function: 'fn_5efd7',
      originalFunctionCompleted: false,
      resumedFromStaticAddress: '0x5f154',
      resumedThroughFunction: 'fn_5efd7',
      completedFrames,
      consumedFrameEventIterations,
      stop: { kind: 'bounded-resume', nextStaticAddress: '0x5f14f', reason: 'next frame iteration begins with VGA retrace wait' },
      retraceContinuation: continuation,
      indexedSurface: { address: `0x${(0xa1400 - memory.read32(0x18)).toString(16)}`, bytes: 0xd200 },
    };
  }
  if (completedFrames > 0) fn_2852b(runtime);
  let bl = memory.read8(0x5e318);
  if (bl !== 0xff) {
    let esi = 0x5dd10;
    let ecx = 0x300;
    cpu.set('edx', 0x3c8);
    runtime.out8(0x3c8, 0);
    cpu.set('edx', 0x3c9);
    while (ecx !== 0) {
      let al = memory.read8(esi);
      esi = u32(esi + 1);
      al = (al * bl >>> 8) & 0xff;
      runtime.out8(0x3c9, al);
      ecx = u32(ecx - 1);
    }
  }

  let ecx = 0xffff2e00;
  let esi = u32(memory.read32(0x5e361) + 0xc80); // MOV ESI,[0x5e361] at original 0x5f17f.
  let edi = u32(0xa1400 - memory.read32(0x18));
  const index = memory.read32(0x5e0cb);
  edx = memory.read32(u32(0x5e0b7 + index * 4));
  ebp = u32(memory.read32(0x5e0cf) + memory.read32(0x5e0d3));
  for (;;) {
    const offset = u32(0xd200 + ecx);
    const first = memory.read32(u32(esi + offset));
    const second = memory.read32(u32(edx + offset));
    const third = memory.read32(u32(ebp + offset));
    eax = first | second | third;
    memory.write32(u32(edi + offset), eax); // 0x5f1c3 is a DS store, without ES override.
    ecx = u32(ecx + 4);
    if (ecx === 0) break;
  }

  ecx = memory.read32(0x21954);
  memory.write32(0x21954, 0);
  cpu.setOrFlags32(0); // XOR ECX,ECX at 0x5f1cf; XCHG and JECXZ preserve these flags.
  cpu.set('eax', eax);
  cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | bl);
  cpu.set('ecx', ecx);
  cpu.set('edx', edx);
  cpu.set('ebp', ebp);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  if (ecx !== 0) {
    const eventIterations = ecx;
    if (eventIterations > 4096) throw new Error(`capture suffix reached ${eventIterations} animation-update iterations; captured timing cannot safely be replayed as a single checkpoint suffix`);
    for (let iteration = 0; iteration < eventIterations; iteration += 1) {
      memory.write32(0x5e0cb, u32(memory.read32(0x5e0cb) + 1));
      if (memory.read32(0x5e0cb) >= 5) memory.write32(0x5e0cb, 0);
      cpu.setCmpFlags32(memory.read32(0x21958), 0x276);
      if (memory.read32(0x21958) >= 0x276) {
        const before = memory.read8(0x5e318);
        const counter = (before - 1) & 0xff;
        memory.write8(0x5e318, counter);
        const carry = cpu.carry;
        cpu.setCmpFlags8(before, 1); // DEC byte [0x5e318]; same subtract flags except unchanged CF.
        cpu.setCarry(carry);
        if (counter === 0) {
          cpu.set('ecx', ecx);
          runtime.translatedPc = 0x5e30d;
          return { function: 'fn_5efd7', originalFunctionCompleted: false, stop: { kind: 'scene-completion', nextStaticAddress: '0x5f20d' } };
        }
      }
      ecx = u32(ecx - 1);
    }
    cpu.set('ecx', ecx);
    consumedFrameEventIterations += eventIterations;
  }
  completedFrames += 1;
  }
}

// Capture-specific suffix from the middle of fn_5efd7's compositor loop.
// The capture supplies all three source streams, the destination segment, and
// the single pending frame event. Stop at the next retrace call without
// inventing a new VGA phase or later asynchronous event.
export function resumeFn5efd7At0x5f1b5(runtime) {
  const { cpu, memory } = runtime;
  if (runtime.capturedEip !== 0x5e2b5) {
    throw new Error(`fn_5efd7 capture suffix requires runtime EIP 0x5e2b5, got 0x${runtime.capturedEip?.toString(16) ?? 'unknown'}`);
  }
  if (runtime.capturedSegments?.ds?.normalizedBase !== 0 || runtime.segments?.esBase !== 0) {
    throw new Error('fn_5efd7 capture suffix requires capture-normalized DS and ES bases of zero');
  }

  let eax = cpu.get('eax');
  let ecx = cpu.get('ecx');
  let edx = cpu.get('edx');
  let ebp = cpu.get('ebp');
  let esi = cpu.get('esi');
  let edi = cpu.get('edi');
  const expectedDestination = u32(0xa1400 - memory.read32(0x18));
  const expectedSource = u32(memory.read32(0x5e361) + 0xc80);
  const expectedThirdSource = u32(memory.read32(0x5e0cf) + memory.read32(0x5e0d3));
  if (edi !== expectedDestination || esi !== expectedSource || ebp !== expectedThirdSource) {
    throw new Error('fn_5efd7 capture suffix register pointers do not match the captured compositor globals');
  }
  if (ecx !== 0xffff921c || eax !== 0) {
    throw new Error(`fn_5efd7 capture suffix expected EAX=0 and ECX=0xffff921c, got EAX=0x${eax.toString(16)} ECX=0x${ecx.toString(16)}`);
  }

  let compositeDwords = 0;
  do {
    const offset = u32(0xd200 + ecx);
    eax |= memory.read32(u32(edx + offset));
    eax |= memory.read32(u32(ebp + offset));
    memory.write32(u32(edi + offset), eax); // Original 0x5f1c3 uses DS.
    ecx = u32(ecx + 4);
    compositeDwords += 1;
  } while (ecx !== 0);

  // XCHG ECX,[0x21954] consumes only the event captured at this checkpoint.
  const eventIterations = memory.read32(0x21954);
  memory.write32(0x21954, 0);
  if (eventIterations !== 1) {
    throw new Error(`capture_000050 suffix expected one backed pending event, got ${eventIterations}`);
  }
  for (let iteration = 0; iteration < eventIterations; iteration += 1) {
    memory.write32(0x5e0cb, u32(memory.read32(0x5e0cb) + 1));
    if (memory.read32(0x5e0cb) >= 5) memory.write32(0x5e0cb, 0);
    if (memory.read32(0x21958) >= 0x276) {
      const fade = (memory.read8(0x5e318) - 1) & 0xff;
      memory.write8(0x5e318, fade);
      if (fade === 0) throw new Error('capture_000050 suffix reached the fade-completion branch');
    }
  }
  if (memory.read8(0x5e318) === 0) throw new Error('capture_000050 suffix reached the terminal fade branch');
  cpu.setCmpFlags32(memory.read32(0x21958), 0x276); // Final original CMP before JB/LOOP/JMP.

  cpu.set('eax', eax);
  cpu.set('ecx', 0);
  cpu.set('edx', edx);
  cpu.set('ebp', ebp);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  runtime.translatedPc = 0x5e24f; // static 0x5f14f: next IN AL,DX retrace call.
  return {
    function: 'fn_5efd7',
    originalFunctionCompleted: false,
    resumedFromStaticAddress: '0x5f1b5',
    completedCompositorDwords: compositeDwords,
    consumedCapturedFrameEvents: eventIterations,
    outputIndex: memory.read32(0x5e0cb),
    fade: memory.read8(0x5e318),
    pendingFrameEvents: memory.read32(0x21954),
    stop: { kind: 'bounded-resume', nextStaticAddress: '0x5f14f', reason: 'next frame iteration begins with VGA retrace wait' },
  };
}
