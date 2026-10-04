// 0x64471..0x644e7. Rotate the signed 16-bit coordinate in EDX using the
// indexed fixed-point basis vectors. EDX returns packed (y,x); the other
// general registers are restored by the original PUSH/POP sequence.
function __coverage_impl_fn_64471(runtime) {
  const { cpu, memory } = runtime;
  const saved = Object.fromEntries(['eax', 'ebx', 'ecx', 'edi', 'esi', 'ebp']
    .map(register => [register, cpu.get(register)]));
  const input = cpu.get('edx');
  const x = (input << 16) >> 16;
  const y = input >> 16;
  const index = memory.read16(0x63340) * 4;
  const cosine = memory.read32(0x2198c + index) >> 7;
  const sine = memory.read32(0x2298c + index) >> 7;
  memory.write32(0x63569, x);
  memory.write32(0x6356d, y);
  const rotatedY = (Math.imul(x, sine) + Math.imul(y, cosine)) >> 9;
  const rotatedXBeforeShift = (Math.imul(x, cosine) - Math.imul(y, sine)) >>> 0;
  const rotatedX = rotatedXBeforeShift >> 9;
  const packed = ((((rotatedX & 0xffff) << 16) | (rotatedY & 0xffff)) >>> 0);
  // The original's final SAR EBX,9 leaves CF/PF/ZF/SF visible on return.
  cpu.setSarFlags32(rotatedXBeforeShift, rotatedX, 9);
  for (const [register, value] of Object.entries(saved)) cpu.set(register, value);
  cpu.set('edx', packed);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_64471 = instrumentLift('0x64471', 'fn_64471', __coverage_impl_fn_64471);
