import { push32, pop32 } from './core/stack-effects.mjs';
import { instrumentLift } from './core/function-coverage.mjs';

const u = n => n >>> 0;
const word = (cpu, r, n) => cpu.set(r, (cpu.get(r) & 0xffff0000) | (n & 65535));
function swapWords(cpu, a, b) { const t = cpu.get(a); word(cpu, a, cpu.get(b)); word(cpu, b, t); }
function rotate(cpu, r) { const x = cpu.get(r); cpu.set(r, (x << 16) | (x >>> 16)); cpu.setCarry(cpu.get(r) & 1); }
function add(cpu, r, n, carry = 0) {
  const a = cpu.get(r), sum = a + u(n) + carry, result = u(sum);
  cpu.set(r, result); cpu.setCarry(sum > 0xffffffff);
  return result;
}
function decrementRows(runtime) {
  const { cpu, memory } = runtime, n = memory.read16(0x63ffc), result = (n - 1) & 65535;
  let flags = cpu.eflags & ~(4 | 16 | 64 | 128 | 2048);
  if ((result & 255).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
  if (!(n & 15)) flags |= 16;
  if (!result) flags |= 64;
  if (result & 32768) flags |= 128;
  if (n === 32768) flags |= 2048;
  cpu.setEflags(flags); memory.write16(0x63ffc, result);
  return result;
}
function fillRestOfContiguousRow(runtime) {
  const { cpu, memory } = runtime;
  let count = cpu.get('edx'), address = cpu.get('edi');
  cpu.set('ecx', count);
  cpu.setCarry(count & 1); count >>>= 1;
  if (cpu.carry) { memory.write8(address, cpu.get('eax')); address = u(address + 1); }
  cpu.setCarry(count & 1); count >>>= 1;
  if (cpu.carry) { memory.write16(address, cpu.get('eax')); address = u(address + 2); }
  if (count > 16384) throw new Error('fn_64f70 span exceeds its 320x200 surface');
  for (let i = 0; i < count; i++, address = u(address + 4)) runtime.writeEs32(address, cpu.get('eax'));
  cpu.set('edi', address); cpu.set('ecx', 0);
}
function advanceContiguous(runtime) {
  const { cpu } = runtime;
  cpu.set('edx', pop32(runtime));
  add(cpu, 'ebp', cpu.get('esi'));
  add(cpu, 'edx', runtime.memory.read32(0x64102), Number(cpu.carry));
  add(cpu, 'ebp', 0, Number(cpu.carry));
  return decrementRows(runtime);
}
function contiguousRows(runtime, { resumeAt = null } = {}) {
  const { cpu, memory } = runtime;
  // c225 stopped at MOV ECX,EDX, before either SHR or any row stores.
  if (resumeAt === 0x64fe8) { fillRestOfContiguousRow(runtime); if (!advanceContiguous(runtime)) return finish(runtime, 'edx'); }
  for (let guard = 0; ; guard++) {
    if (guard > 65535) throw new Error('fn_64f70 row loop exceeded 16-bit count');
    push32(runtime, cpu.get('edx'));
    cpu.set('ebx', cpu.get('ebp') & 65535);
    cpu.set('edx', (cpu.get('edx') & 65535) - cpu.get('ebx'));
    cpu.set('edi', cpu.get('ebx'));
    if (!(cpu.get('edx') & 0x80000000)) {
      add(cpu, 'edi', memory.read32(0x32394));
      fillRestOfContiguousRow(runtime);
    }
    if (!advanceContiguous(runtime)) return finish(runtime, 'edx');
  }
}
function finish(runtime, right) {
  const { cpu, memory } = runtime;
  rotate(cpu, 'ebp'); rotate(cpu, right); swapWords(cpu, 'ebp', right);
  memory.write32(0x64020, cpu.get('ebp')); memory.write32(0x64024, cpu.get(right));
  runtime.translatedPc = (right === 'edx' ? 0x65027 : 0x650e3) - 0xf00;
}
function clippedRows(runtime) {
  const { cpu, memory } = runtime;
  for (let guard = 0; ; guard++) {
    if (guard > 65535) throw new Error('fn_64f70 clipped row loop exceeded 16-bit count');
    cpu.set('esi', cpu.get('ebp') & 65535); word(cpu, 'eax', cpu.get('edi'));
    const borrowed = cpu.get('esi') < cpu.get('edx');
    cpu.set('esi', cpu.get('esi') - cpu.get('edx'));
    let skip = false;
    if (borrowed) word(cpu, 'esi', cpu.get('edx'));
    else {
      word(cpu, 'esi', cpu.get('esi') + cpu.get('edx'));
      word(cpu, 'edx', cpu.get('edx') + 320);
      skip = (cpu.get('esi') & 65535) >= (cpu.get('edx') & 65535);
      if (!skip) word(cpu, 'edx', cpu.get('edx') - 320);
    }
    if (!skip) {
      if ((cpu.get('eax') & 65535) < (cpu.get('edx') & 65535)) word(cpu, 'eax', cpu.get('edx'));
      word(cpu, 'edx', cpu.get('edx') + 320);
      if ((cpu.get('eax') & 65535) >= (cpu.get('edx') & 65535)) word(cpu, 'eax', cpu.get('edx'));
      word(cpu, 'eax', cpu.get('eax') - cpu.get('esi'));
      const count = cpu.get('eax') & 65535;
      if (count && !(count & 32768)) {
        push32(runtime, cpu.get('edi'));
        cpu.set('esi', u((cpu.get('esi') & 65535) + memory.read32(0x32394)));
        cpu.set('ecx', count); cpu.set('edi', cpu.get('esi'));
        cpu.set('eax', (cpu.get('eax') & 0xffffff00) | memory.read8(0x323b4));
        for (let i = 0; i < count; i++) runtime.writeEs8(cpu.get('edi') + i, cpu.get('eax'));
        cpu.set('edi', cpu.get('edi') + count); cpu.set('ecx', 0); cpu.set('edi', pop32(runtime));
      }
    }
    add(cpu, 'ebp', memory.read32(0x641b8));
    add(cpu, 'edi', memory.read32(0x641be), Number(cpu.carry));
    add(cpu, 'ebp', 0, Number(cpu.carry));
    if (!decrementRows(runtime)) return finish(runtime, 'edi');
  }
}

// Complete original 0x64f70..0x650e3. Operand writes below are original
// self-modification, not guessed addresses or external state injection.
function execute(runtime) {
  const { cpu, memory } = runtime;
  if (cpu.eflags & 0x400) throw new Error('fn_64f70 requires the original CLD contract');
  memory.write16(0x63ffc, cpu.get('edx'));
  add(cpu, 'esi', 0x1400000); add(cpu, 'edi', 0x1400000);
  swapWords(cpu, 'esi', 'edi'); rotate(cpu, 'esi'); rotate(cpu, 'edi');
  if (memory.read16(0x64048) === 0) {
    memory.write32(0x64102, cpu.get('edi'));
    cpu.set('ebp', memory.read32(0x64020)); cpu.set('edx', memory.read32(0x64024));
    swapWords(cpu, 'ebp', 'edx'); rotate(cpu, 'ebp'); rotate(cpu, 'edx');
    const color = memory.read8(0x323b4);
    cpu.set('eax', (cpu.get('eax') & 0xffff0000) | color | (color << 8)); cpu.set('ebx', cpu.get('eax'));
    rotate(cpu, 'eax'); word(cpu, 'eax', cpu.get('ebx'));
    return contiguousRows(runtime);
  }
  cpu.set('edx', memory.read16(0x6404a));
  memory.write32(0x641b8, cpu.get('esi')); memory.write32(0x641be, cpu.get('edi'));
  cpu.set('ebp', memory.read32(0x64020)); cpu.set('edi', memory.read32(0x64024));
  swapWords(cpu, 'ebp', 'edi'); rotate(cpu, 'ebp'); rotate(cpu, 'edi');
  return clippedRows(runtime);
}
export const fn_64f70 = instrumentLift('0x64f70', 'fn_64f70', execute);
export function resumeFn64f70At0x64fe8(runtime) { contiguousRows(runtime, { resumeAt: 0x64fe8 }); return { originalFunctionCompleted: false }; }
