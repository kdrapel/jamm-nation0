// Lifted from the contiguous original byte range 0x20f81..0x210de.
// The former map address 0x21001 is an interior instruction, not an entry.
function __coverage_impl_fn_20f81(runtime) {
  const base = runtime.memory.read16(0x1e41c);
  let bx = base;
  let cx = bx;
  bx = (bx + 0x103) & 0xffff;
  cx = (cx + 0x105) & 0xffff;

  runtime.out8(bx, 0x4c); runtime.out8(cx, 0);
  for (let count = 0; count < 6; count += 1) runtime.in8(base);
  runtime.out8(bx, 0x4c); runtime.out8(cx, 1);
  for (let count = 0; count < 6; count += 1) runtime.in8(base);
  runtime.out8(bx, 0x41); runtime.in8(cx);
  runtime.out8(bx, 0x45); runtime.out8(cx, 0);
  runtime.out8(bx, 0x49); runtime.out8(cx, 0);
  runtime.out8(bx, 0x0e); runtime.out8(cx, 0xcd);
  runtime.in8((base + 6) & 0xffff);

  for (let count = 0x20; count > 0; count -= 1) {
    const dx = (base + 0x102) & 0xffff;
    runtime.out8(dx, count - 1);
    runtime.out8((dx + 1) & 0xffff, 0);
    runtime.out8((dx + 3) & 0xffff, 3);
    runtime.out8((dx + 1) & 0xffff, 0x0d);
    runtime.out8((dx + 3) & 0xffff, 3);
  }

  runtime.out8(bx, 0x41); runtime.in8(cx);
  runtime.out8(bx, 0x49); runtime.in8(cx);
  runtime.out8(bx, 0x8f); runtime.in8(cx);
  runtime.out8(bx, 0x4c); runtime.out8(cx, 7);

  for (let count = 0x0e; count > 0; count -= 1) {
    runtime.out8((base + 0x102) & 0xffff, 0x0e - count);
    runtime.out8((base + 0x103) & 0xffff, 6);
    runtime.out8((base + 0x105) & 0xffff, 0x3f);
    runtime.out8((base + 0x103) & 0xffff, 9);
    runtime.out16((base + 0x104) & 0xffff, runtime.memory.read16(0x1e1e8));
  }

  runtime.cpu.set('bx', bx);
  runtime.cpu.set('cx', 0);
  runtime.cpu.set('dx', (base + 0x104) & 0xffff);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_20f81 = instrumentLift('0x20f81', 'fn_20f81', __coverage_impl_fn_20f81);
