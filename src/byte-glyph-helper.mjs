const GPR = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
const MASK32 = 0xffffffff;
import { popad, pushad } from './core/stack-effects.mjs';

function saveRegisters(cpu) {
  return Object.fromEntries(GPR.map(register => [register, cpu.get(register)]));
}

function restoreRegisters(cpu, saved) {
  for (const [register, value] of Object.entries(saved)) cpu.set(register, value);
}

// Translation of the common byte-mask glyph body entered at 0x5fe9d. The
// neighboring 0x5fe98 entry selects DL=0x10; this called entry selects 0x20.
function __coverage_impl_fn_5fe9d(runtime) {
  const { cpu, memory } = runtime;
  const saved = saveRegisters(cpu);
  pushad(runtime);
  const character = saved.eax & 0xff;

  let index = 0;
  let remaining = 0xf83;
  while (remaining !== 0 && memory.read8(0x5ef80 + index) !== character) {
    index = (index + 1) >>> 0;
    remaining -= 1;
  }

  if (remaining === 0) {
    // The original miss branch jumps to 0x5ef7d, the shared POPA/RET
    // epilogue. Restore the PUSHA state and return without plotting a glyph.
    popad(runtime);
    cpu.setCarry(false); // OR ECX,ECX with ECX=0 before the shared epilogue.
    return false;
  }

  let esi = (0x1acf9 + index * 2) >>> 0;
  let edi = saved.edi;
  for (let row = 0; row < 0x40; row += 1) {
    for (let lane = 0; lane < 2; lane += 1) {
      let al = memory.read8(esi);
      esi = (esi + 1) >>> 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const carry = (al & 0x80) !== 0;
        al = (al << 1) & 0xff;
        if (carry) {
          const address = (edi + bit) >>> 0;
          memory.write8(address, memory.read8(address) | 0x20);
        }
      }
      edi = (edi + 8) >>> 0;
    }

    // The machine performs ADD ESI,0x9e between glyph rows, which together
    // with two LODSBs yields the 0xa0-byte glyph record stride.
    const nextEsi = (esi + 0x9e) >>> 0;
    const carry = esi + 0x9e > MASK32;
    esi = nextEsi;
    edi = (edi + memory.read32(0x5eff9) - 0x10) >>> 0;
    cpu.setCarry(carry);
  }

  popad(runtime); // POPA; RET preserves the final ADD carry.
  return true;
}

// Translation of the DS zero-terminated byte-mask string writer at
// 0x5fe03..0x5fe24. Negative bytes move to the next output line; zero ends it.
function __coverage_impl_fn_5fe03(runtime) {
  const { cpu, memory } = runtime;
  let ebp = cpu.get('edi');

  for (;;) {
    const esi = cpu.get('esi');
    const al = memory.read8(esi);
    cpu.set('esi', (esi + 1) >>> 0);
    cpu.set('eax', (cpu.get('eax') & 0xffffff00) | al);

    if ((al & 0x80) !== 0) {
      ebp = (ebp + 0xdc0) >>> 0;
      cpu.set('ebp', ebp);
      cpu.set('edi', ebp);
      continue;
    }
    if (al === 0) {
      cpu.setCarry(false); // TEST AL,AL at the string terminator.
      return;
    }

    if (!fn_5fe9d(runtime)) return; // The miss path shares POPA/RET at 0x5ef7d.
    cpu.set('edi', (cpu.get('edi') + 0x12) >>> 0);
  }
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_5fe03 = instrumentLift('0x5fe03', 'fn_5fe03', __coverage_impl_fn_5fe03);
export const fn_5fe9d = instrumentLift('0x5fe9d', 'fn_5fe9d', __coverage_impl_fn_5fe9d);
