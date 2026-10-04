import { fn_1189 } from './allocator.mjs';
import { fn_2852b, fn_28559, fn_28574 } from './vga-helpers.mjs';
import { fn_5fd80 } from './glyph-helper.mjs';
import { fn_5f517 } from './palette-helper.mjs';

const u32 = value => value >>> 0;

function requireAdapter(adapters, name, boundary) {
  if (typeof adapters?.[name] !== 'function') {
    throw new TypeError(`fn_5ff2f requires ${name} adapter for ${boundary}`);
  }
  return adapters[name];
}

// Mechanical lift of the raw dispatcher target 0x5ff2f..0x5ffd6. INT 33h,
// ES transfers, and VGA input/output stay explicit host boundaries. Its only
// repeated wait is a fixed 0xd2 retrace count; this body has no async event loop.
function __coverage_impl_fn_5ff2f(runtime, adapters = {}) {
  const writeEs8 = requireAdapter(adapters, 'writeEs8', 'ES STOSB at 0x5ff9c/0x5ff9f');
  const writeEs16 = requireAdapter(adapters, 'writeEs16', 'ES STOSW at 0x5ff9a');
  const writeEs32 = requireAdapter(adapters, 'writeEs32', 'ES REP MOVSD at 0x5ff81');
  const readPort8 = requireAdapter(adapters, 'readPort8', 'VGA retrace port 0x3da');
  const writePort8 = requireAdapter(adapters, 'writePort8', 'VGA DAC port writes');
  const interrupt33 = requireAdapter(adapters, 'interrupt33', 'INT 33h at 0x5ff48');
  const { cpu, memory } = runtime;

  // Route the existing, already-lifted VGA helpers through this routine's host
  // port adapters without changing their default runtime behavior elsewhere.
  const hadOwnIn8 = Object.hasOwn(runtime, 'in8');
  const hadOwnOut8 = Object.hasOwn(runtime, 'out8');
  const oldIn8 = runtime.in8;
  const oldOut8 = runtime.out8;
  let portCallSite = 0x5f517;
  runtime.in8 = port => readPort8(runtime, port & 0xffff, { callSite: portCallSite });
  runtime.out8 = (port, value) => writePort8(runtime, port & 0xffff, value & 0xff);

  try {
    cpu.set('eax', 0xfa00);
    fn_1189(runtime);
    const firstBuffer = cpu.get('eax') >>> 0;
    memory.write32(0x5f02b, firstBuffer);

    memory.write16(0xe0, 0x13);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | 0x10);
    interrupt33(runtime, { vector: 0x33, callSite: 0x5ff48 });

    // The two pushed words are the four bytes consumed by fn_28559 at [ESP+4].
    fn_28559(runtime, { index: 0x20, red: 0, green: 0, blue: 0 });

    let edi = u32(0xa0000 - memory.read32(0x18));
    cpu.set('edi', edi);
    cpu.set('esi', 0x5f001);
    fn_5fd80(runtime);

    let esi = u32(0xa2580 - memory.read32(0x18));
    edi = firstBuffer;
    let ecx = 0x3e80;
    cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ecx', ecx);
    for (let i = 0; i < 0x3e80; i += 1) {
      writeEs32(runtime, u32(edi + i * 4), memory.read32(u32(esi + i * 4)));
    }
    esi = u32(esi + 0xfa00);
    edi = u32(edi + 0xfa00);
    ecx = 0;
    cpu.set('esi', esi); cpu.set('edi', edi); cpu.set('ecx', ecx);

    cpu.set('eax', 0x60);
    fn_1189(runtime);
    const paletteBuffer = cpu.get('eax') >>> 0;
    edi = paletteBuffer;
    cpu.set('edi', edi); cpu.set('ebp', paletteBuffer);

    // PUSH EAX twice; after clearing, the first POP restores EDI and the
    // remaining saved word supplies the fourth byte read by fn_28559.
    let esp = cpu.get('esp');
    esp = u32(esp - 4); memory.write32(esp, paletteBuffer);
    esp = u32(esp - 4); memory.write32(esp, paletteBuffer);
    cpu.set('esp', esp);

    ecx = 0x60;
    cpu.set('ecx', ecx); cpu.set('eax', 0);
    writeEs16(runtime, edi, 0);
    edi = u32(edi + 2);
    writeEs8(runtime, edi, 0);
    edi = u32(edi + 1);
    cpu.set('eax', 0x3f);
    for (let i = 0; i < 0x60; i += 1) {
      writeEs8(runtime, edi, 0x3f);
      edi = u32(edi + 1);
    }
    cpu.set('ecx', 0);

    // POP EDI consumes the second saved EAX; one saved dword remains until
    // the matching POP EDI near the routine's end.
    esp = u32(esp + 4);
    cpu.set('esp', esp);
    edi = paletteBuffer;
    cpu.set('edi', edi);

    cpu.set('ecx', (cpu.get('ecx') & 0xffff00ff) | 0x0800);
    cpu.set('ebx', cpu.get('ebx') & 0xffffff00);
    fn_5f517(runtime);

    // PUSHW 0x3f3f / PUSHW 0x3f20 yields [index, R, G, B] = [0x20,3f,3f,3f].
    fn_28559(runtime, { index: 0x20, red: 0x3f, green: 0x3f, blue: 0x3f });

    ecx = 0xd2;
    cpu.set('ecx', ecx);
    for (;;) {
      portCallSite = 0x5ffc0;
      fn_2852b(runtime);
      ecx = u32(ecx - 1);
      cpu.set('ecx', ecx);
      if (ecx === 0) break;
    }

    // POP EDI restores the allocation pointer retained across both VGA passes.
    esp = u32(esp + 4);
    cpu.set('esp', esp);
    edi = paletteBuffer;
    cpu.set('edi', edi);
    cpu.set('ecx', (cpu.get('ecx') & 0xffff00ff) | 0xfc00);
    cpu.set('ebx', (cpu.get('ebx') & 0xffffff00) | 0xfc);
    portCallSite = 0x5f517;
    fn_5f517(runtime);
    fn_28574(runtime);
    cpu.setCarry(false); // XOR EAX,EAX in fn_28574 is the last carry-affecting op.
  } finally {
    if (hadOwnIn8) runtime.in8 = oldIn8;
    else delete runtime.in8;
    if (hadOwnOut8) runtime.out8 = oldOut8;
    else delete runtime.out8;
  }
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_5ff2f = instrumentLift('0x5ff2f', 'fn_5ff2f', __coverage_impl_fn_5ff2f);
