const GPRS = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
const MASK32 = 0xffffffff;
import { pushad, popad, push32, pop32 } from './core/stack-effects.mjs';

function saveRegisters(cpu) {
  return Object.fromEntries(GPRS.map(register => [register, cpu.get(register)]));
}

function restoreRegisters(cpu, saved) {
  for (const [register, value] of Object.entries(saved)) cpu.set(register, value);
}

function signed16(value) {
  return (value << 16) >> 16;
}

function signed32(value) {
  return value | 0;
}

function idivSigned64By32(eax, edx, divisor) {
  if (divisor === 0) throw new RangeError('fn_37dac reached an x86 IDIV by zero');
  const rawDividend = (BigInt(edx >>> 0) << 32n) | BigInt(eax >>> 0);
  const dividend = BigInt.asIntN(64, rawDividend);
  const quotient = dividend / BigInt(divisor | 0);
  if (quotient < -0x80000000n || quotient > 0x7fffffffn) {
    throw new RangeError('fn_37dac reached an x86 IDIV quotient overflow');
  }
  const remainder = dividend % BigInt(divisor | 0);
  return {
    eax: Number(BigInt.asUintN(32, quotient)),
    edx: Number(BigInt.asUintN(32, remainder)),
  };
}

function projectX(x, z) {
  const product = BigInt(signed16(x)) * 200n;
  const result = idivSigned64By32(
    Number(BigInt.asUintN(32, product)),
    Number(BigInt.asUintN(32, product >> 32n)),
    z,
  );
  return (result.eax + 0xa0) >>> 0;
}

function projectY(y, z) {
  const product = BigInt(signed16(y)) * 200n;
  const divided = idivSigned64By32(
    Number(BigInt.asUintN(32, product)),
    Number(BigInt.asUintN(32, product >> 32n)),
    z,
  ).eax;
  const scaled = Math.imul(divided, 0x1d6) >>> 0;
  return ((signed32(scaled) >> 9) + 0x64) >>> 0;
}

// Translation of the DS-side record rasterizer at 0x37dac..0x37f73.
// ESI points to the input record; the routine preserves all GPRs with PUSHA/
// POPA. All absolute and pointer-based accesses are DS-relative. It has no
// ES/FS access and no direct callees.
function __coverage_impl_fn_37dac(runtime, { resumeAt = null } = {}) {
  const { cpu, memory } = runtime;
  const resumed = resumeAt === 0x37e05;
  const resumedAfterXLoad = resumeAt === 0x37e2b;
  const resumedProjection = resumed || resumedAfterXLoad;
  const resumeFrameOffset = resumedAfterXLoad ? 4 : 0;
  const saved = resumedProjection ? Object.fromEntries([['edi',4],['esi',8],['ebp',12],['esp',16],['ebx',20],['edx',24],['ecx',28],['eax',32]].map(([r,o])=>[r,memory.read32(runtime.segments.ssBase+cpu.get('esp')+resumeFrameOffset+o)])) : saveRegisters(cpu);
  if (!resumedProjection) pushad(runtime);
  const record = saved.esi;
  const descriptorCount = memory.read32((record + 0x0c) >>> 0);
  if (descriptorCount === 0) {
    // The raw DEC/JNZ loop decrements zero to FFFFFFFF and does not terminate.
    throw new RangeError('fn_37dac requires a nonzero descriptor count; raw DEC/JNZ would wrap');
  }

  if (!resumed) {
  memory.write32(0x36e88, descriptorCount);
  memory.write32(0x3681e, memory.read32(record + 0x1c));
  memory.write32(0x36e94, memory.read32(record + 0x20));
  memory.write32(0x36e8c, memory.read32(0x2cb10));
  memory.write16(0x36eaa, memory.read8(record + 0x37));
  }

  let esi = resumedProjection ? cpu.get('esi') : memory.read32(record + 4);
  let outputList = resumedProjection ? memory.read32(runtime.segments.ssBase+cpu.get('esp')+resumeFrameOffset) : memory.read32(0x2cb14);
  if (!resumedProjection) memory.write16(0x36ea8, 1);

  let remaining = memory.read32(0x36e88);
  let finalAnimationCarry = false;
  let firstResume = resumedProjection;
  do {
    const savedOutputList = outputList;
    if (!firstResume) push32(runtime, outputList);
    const vertexTable = memory.read32(0x3681e);
      let squaredDistance = firstResume ? cpu.get('ebp') : 0;
      let ecx = firstResume ? cpu.get('ecx') : 0xfffffff4;
    let clipped = false;

    for (let vertex = firstResume ? ((ecx + 12) >>> 0) / 4 : 0; vertex < 3; vertex += 1) {
      const index = memory.read16(esi);
      const vertexAddress = (vertexTable + index * 6) >>> 0;
      const z = signed16(memory.read16(vertexAddress + 4));
      if (z <= signed32(memory.read32(0x2cb18))) {
        const rewind = ((ecx + 0x0c) >>> 0) >>> 1;
        esi = ((esi - rewind) + 6) >>> 0;
        outputList = savedOutputList;
        clipped = true;
        break;
      }

      const x = signed16(memory.read16(vertexAddress));
      if (firstResume && resumedAfterXLoad) {
        if (signed16(cpu.get('eax')) !== x || signed16(cpu.get('ebx')) !== z) {
          throw new Error('c175 captured x/z registers do not match the active vertex');
        }
        // At 0x37e2b the original PUSH EAX at 0x37e27 is still on the
        // captured stack. Consume it here, then let the ordinary translated
        // projection's balanced temporary push/pop preserve the same stack
        // bytes and post-POP ESP before the y projection.
        if (pop32(runtime) !== vertexAddress) throw new Error('c175 captured vertex pointer does not match DS:[ESI]');
      }
      push32(runtime, vertexAddress);
      const xSquare = Math.imul(x, x) >>> 0;
      squaredDistance = (squaredDistance + xSquare) >>> 0;

      const xProjection = projectX(x, z);
      const xAddress = (0x36ea6 + ecx) >>> 0; // MOV [ECX+0x36ea6],AX; no Z displacement
      memory.write16(xAddress, xProjection & 0xffff);
      pop32(runtime);

      const y = signed16(memory.read16(vertexAddress + 2));
      const ySquare = Math.imul(y, y) >>> 0;
      squaredDistance = (squaredDistance + ySquare) >>> 0;

      const yProjection = projectY(y, z);
      const yAddress = (0x36ea4 + ecx) >>> 0; // MOV [ECX+0x36ea4],AX
      memory.write16(yAddress, yProjection & 0xffff);

      const zSquare = Math.imul(z, z) >>> 0;
      squaredDistance = (squaredDistance + zSquare) >>> 0;
      esi = (esi + 2) >>> 0;
      ecx = (ecx + 4) >>> 0;
    }
    pop32(runtime); // original POP EDI, both clipping and normal paths
    firstResume = false;

    if (!clipped) {
      const sortIndex = memory.read32(0x368c8);
      const sortAddress = (memory.read32(0x36e8c) + sortIndex * 4) >>> 0;
      const sortKey = ((-squaredDistance + 0xffff) >>> 0) >>> 8;
      memory.write32(sortAddress, sortKey);
      push32(runtime, esi);

      const cameraA = signed16(memory.read16(0x36e9a));
      const cameraB = signed16(memory.read16(0x36e98));
      const cameraC = signed16(memory.read16(0x36e9c));
      const cameraD = signed16(memory.read16(0x36ea2));
      const firstLeft = (cameraD - cameraA) >>> 0;
      const firstRight = (cameraC - cameraB) >>> 0;
      const firstProduct = Math.imul(firstLeft, firstRight) >>> 0;

      const cameraE = signed16(memory.read16(0x36e9e));
      const cameraF = signed16(memory.read16(0x36ea0));
      const secondLeft = (cameraE - cameraA) >>> 0;
      const secondRight = (cameraF - cameraB) >>> 0;
      const secondProduct = Math.imul(secondLeft, secondRight) >>> 0;
      const faceTest = (firstProduct - secondProduct) >>> 0;
      pop32(runtime);

      if ((faceTest & 0x80000000) === 0) {
        const outputAddress = memory.read32(outputList);
        memory.write32(outputAddress, memory.read32(0x36e98));
        memory.write32(outputAddress + 4, memory.read32(0x36e9c));
        memory.write32(outputAddress + 8, memory.read32(0x36ea0));

        esi = (esi - 6) >>> 0;
        const lookup = memory.read32(0x36e94);
        ecx = 0xfffffffa;
        for (let index = 0; index < 3; index += 1) {
          const sourceIndex = memory.read16(esi);
          const lookupValue = memory.read16((lookup + sourceIndex * 2) >>> 0);
          memory.write16((outputAddress + ecx + 0x12) >>> 0, (lookupValue + 0x8080) & 0xffff);
          esi = (esi + 2) >>> 0;
          ecx = (ecx + 2) >>> 0;
        }
        memory.write16((outputAddress + ecx + 0x12) >>> 0, memory.read16(0x36ea8)); // original MOV AX,[0x36ea8] precedes the phase increment
        memory.write32(0x368c8, (sortIndex + 1) >>> 0);
        outputList = (outputList + 4) >>> 0;
      }
    }

    const nextAnimation = (memory.read16(0x36ea8) + memory.read16(0x36eaa)) & 0xffff;
    memory.write16(0x36ea8, nextAnimation > 0x0c ? 1 : nextAnimation);
    finalAnimationCarry = nextAnimation < 0x0c;

    remaining = (memory.read32(0x36e88) - 1) >>> 0;
    memory.write32(0x36e88, remaining);
    // CMP word phase,0Ch then DEC dword count; DEC retains CMP's CF.
    const phase = nextAnimation;
    const result = (phase - 12) & 65535;
    let f = cpu.eflags & ~(1|4|16|64|128|2048);
    if (phase < 12) f |= 1;
    if ((result&255).toString(2).replaceAll('0','').length%2===0) f|=4;
    if ((phase^12^result)&16) f|=16;
    if (!result) f|=64;
    if (result&32768) f|=128;
    if ((phase^12)&(phase^result)&32768) f|=2048;
    cpu.setEflags(f); cpu.setDecFlags32((remaining+1)>>>0);
  } while (remaining !== 0);

  memory.write32(0x2cb14, outputList);
  popad(runtime);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_37dac = instrumentLift('0x37dac', 'fn_37dac', __coverage_impl_fn_37dac);
export function resumeFn37dacAt0x37e05(runtime) { __coverage_impl_fn_37dac(runtime,{resumeAt:0x37e05}); return {originalFunctionCompleted:false}; }
export function resumeFn37dacAt0x37e2b(runtime) { __coverage_impl_fn_37dac(runtime,{resumeAt:0x37e2b}); return {originalFunctionCompleted:false}; }
