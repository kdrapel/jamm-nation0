import { fn_64f70 } from './fn-64f70.mjs';
import { push32, pop32 } from './core/stack-effects.mjs';
import { instrumentLift } from './core/function-coverage.mjs';
const s16 = x => (x << 16) >> 16;
const u = x => x >>> 0;
function word(cpu, r, value) { cpu.set(r, (cpu.get(r) & 0xffff0000) | (value & 65535)); }
function cmp16(cpu, a, b) {
  a &= 65535; b &= 65535; const result = (a - b) & 65535;
  let f = cpu.eflags & ~(1 | 4 | 16 | 64 | 128 | 2048);
  if (a < b) f |= 1;
  if ((result & 255).toString(2).replaceAll('0', '').length % 2 === 0) f |= 4;
  if ((a ^ b ^ result) & 16) f |= 16;
  if (!result) f |= 64;
  if (result & 32768) f |= 128;
  if ((a ^ b) & (a ^ result) & 32768) f |= 2048;
  cpu.setEflags(f);
}
function swap(cpu, a, b) { const t = cpu.get(a); cpu.set(a, cpu.get(b)); cpu.set(b, t); }
function addMemory(memory, address, value) { memory.write32(address, memory.read32(address) + value); }
function divide(cpu) {
  const dividend = cpu.get('eax') | 0, divisor = cpu.get('ebx') | 0;
  if (!divisor) throw new Error('fn_64e60 original IDIV zero');
  const q = Math.trunc(dividend / divisor);
  if (q < -2147483648 || q > 2147483647) throw new Error('fn_64e60 original IDIV overflow');
  cpu.set('eax', q); cpu.set('edx', dividend % divisor);
}
function testWord(cpu, n) { cpu.setAndFlags16(n); }

// Original lower triangle band (0x652ba..0x65348), including its tail jump.
export function resumeFn64e60At0x652ba(runtime) {
  const { cpu, memory } = runtime;
  word(cpu, 'ebx', memory.read16(0x6402c)); testWord(cpu, cpu.get('ebx'));
  if (!(cpu.get('ebx') & 65535)) return;
  cpu.set('esi', memory.read32(0x64018)); cpu.set('edi', memory.read32(0x6401c));
  cpu.setCmpFlags32(cpu.get('esi'), cpu.get('edi'));
  if ((cpu.get('esi') | 0) <= (cpu.get('edi') | 0)) swap(cpu, 'esi', 'edi');
  cmp16(cpu, memory.read16(0x64010), 201);
  if (memory.read16(0x64010) > 201) memory.write16(0x64010, 201);
  cmp16(cpu, memory.read16(0x6400c), 1);
  if (s16(memory.read16(0x6400c)) < 1) {
    cpu.set('ebx', (1 - memory.read16(0x6400c)) & 65535);
    cpu.set('edx', cpu.get('ebx'));
    cpu.set('ebx', Math.imul(cpu.get('ebx'), cpu.get('esi')));
    cpu.set('edx', Math.imul(cpu.get('edx'), cpu.get('edi')));
    addMemory(memory, 0x64020, cpu.get('ebx')); addMemory(memory, 0x64024, cpu.get('edx'));
    memory.write16(0x6400c, 1);
  }
  word(cpu, 'ebx', memory.read16(0x6400c)); word(cpu, 'edx', memory.read16(0x64010));
  const before = cpu.get('edx'); cmp16(cpu, before, cpu.get('ebx')); word(cpu, 'edx', before - cpu.get('ebx'));
  if (!(cpu.get('edx') & 65535)) return;
  cpu.set('ebx', Math.imul(cpu.get('ebx'), 5) << 6); memory.write16(0x6404a, cpu.get('ebx'));
  fn_64f70(runtime); // JMP, not CALL: retains the original caller's stack slot.
}

// Complete original triangle setup at 0x64e60..0x64ef6 plus its original
// noncontiguous chunk 0x650e4..0x6534d. Packed vertex low words are Y.
function execute(runtime) {
  const { cpu, memory } = runtime;
  cpu.set('esi', 0); cpu.set('edi', 4); cpu.set('ebp', 8);
  cpu.set('eax', memory.read32(0x3239c)); cpu.set('ebx', memory.read32(0x323a0)); cpu.set('ecx', memory.read32(0x323a4));
  cpu.set('edx', 0x1400000);
  cpu.setCmpFlags32(cpu.get('edx'), cpu.get('eax')); word(cpu, 'edx', cpu.carry ? 65535 : 0);
  for (const r of ['ebx', 'ecx']) { cpu.setCmpFlags32(cpu.get('edx'), cpu.get(r)); word(cpu, 'edx', cpu.get('edx') - Number(cpu.carry)); }
  cmp16(cpu, cpu.get('edx'), 65533); if ((cpu.get('edx') & 65535) === 65533) return;
  memory.write16(0x64048, cpu.get('edx'));
  for (const [a,b,ai,bi] of [['eax','ebx','esi','edi'],['ebx','ecx','edi','ebp'],['eax','ebx','esi','edi']]) {
    cmp16(cpu, cpu.get(a), cpu.get(b));
    if (s16(cpu.get(a)) >= s16(cpu.get(b))) { swap(cpu, a, b); swap(cpu, ai, bi); }
  }
  cmp16(cpu, cpu.get('eax'), 201); if (s16(cpu.get('eax')) > 201) return;
  cmp16(cpu, cpu.get('ecx'), 1); if (s16(cpu.get('ecx')) < 1) return;
  cmp16(cpu, cpu.get('eax'), cpu.get('ebx'));
  if ((cpu.get('eax') & 65535) === (cpu.get('ebx') & 65535)) {
    cpu.setCmpFlags32(cpu.get('eax'), cpu.get('ebx'));
    if ((cpu.get('eax') | 0) >= (cpu.get('ebx') | 0)) { swap(cpu, 'eax', 'ebx'); swap(cpu, 'esi', 'edi'); }
  }
  for (const [a,r] of [[0x64008,'eax'],[0x6400c,'ebx'],[0x64010,'ecx'],[0x63ff8,'eax']]) memory.write32(a, cpu.get(r));
  memory.write16(0x64046, 1); cpu.set('ecx', memory.read32(0x6402e));
  cpu.set('eax', memory.read32(0x6400c) - memory.read32(0x64008)); cpu.set('ebx', 0);
  memory.write16(0x64028, cpu.get('eax')); testWord(cpu, cpu.get('eax'));
  if (cpu.get('eax') & 65535) { word(cpu, 'ebx', cpu.get('eax')); divide(cpu); memory.write32(0x64014, cpu.get('eax')); memory.write16(0x64046, 0); }
  cpu.set('eax', memory.read32(0x64010) - memory.read32(0x64008)); memory.write16(0x6402a, cpu.get('eax')); testWord(cpu, cpu.get('eax'));
  if (!(cpu.get('eax') & 65535)) return;
  word(cpu, 'ebx', cpu.get('eax')); divide(cpu); memory.write32(0x64018, cpu.get('eax'));
  cpu.set('eax', memory.read32(0x64010) - memory.read32(0x6400c)); memory.write16(0x6402c, cpu.get('eax')); testWord(cpu, cpu.get('eax'));
  if (cpu.get('eax') & 65535) { word(cpu, 'ebx', cpu.get('eax')); divide(cpu); memory.write32(0x6401c, cpu.get('eax')); }
  cpu.set('esi', memory.read32(0x64008)); memory.write32(0x64020, cpu.get('esi'));
  cpu.set('esi', cpu.get('esi') + 32767); memory.write32(0x64024, cpu.get('esi'));
  cpu.set('esi', memory.read32(0x64014)); cpu.set('edi', memory.read32(0x64018)); cpu.set('ebx', memory.read16(0x64028));
  cpu.set('ebp', cpu.get('esi') - cpu.get('edi'));
  if (cpu.get('ebp') && (cpu.get('ebx') & 65535)) cpu.set('ebp', Math.imul(cpu.get('ebp'), cpu.get('ebx')));
  else { cpu.set('ebp', memory.read32(0x6400c) - memory.read32(0x64008)); cpu.setCmpFlags32(cpu.get('ebp'), 0); if (!cpu.get('ebp')) return; word(cpu, 'eax', 0); }
  if (s16(memory.read16(0x6400c)) <= 1 || memory.read16(0x64046) === 1) {
    cpu.set('eax', memory.read16(0x64028)); cpu.set('edi', Math.imul(cpu.get('edi'), cpu.get('eax')) + memory.read32(0x64020));
    cpu.set('esi', memory.read32(0x6400c)); if ((cpu.get('edi') | 0) >= (cpu.get('esi') | 0)) swap(cpu, 'edi', 'esi');
    memory.write32(0x64020, cpu.get('edi')); cpu.set('esi', cpu.get('esi') + 32767); memory.write32(0x64024, cpu.get('esi'));
    word(cpu, 'ebx', memory.read16(0x64008)); if (s16(cpu.get('ebx')) < 1) word(cpu, 'ebx', 1);
    cpu.set('ebx', Math.imul(cpu.get('ebx'), 5) << 22);
    addMemory(memory, 0x64020, cpu.get('ebx')); addMemory(memory, 0x64024, cpu.get('ebx'));
  } else {
    if ((cpu.get('esi') | 0) >= (cpu.get('edi') | 0)) swap(cpu, 'esi', 'edi');
    if (s16(memory.read16(0x6400c)) > 201) memory.write16(0x6400c, 201);
    if (s16(memory.read16(0x64008)) < 1) {
      cpu.set('ebx', (1 - memory.read16(0x64008)) & 65535); cpu.set('edx', cpu.get('ebx'));
      cpu.set('ebx', Math.imul(cpu.get('ebx'), cpu.get('esi'))); cpu.set('edx', Math.imul(cpu.get('edx'), cpu.get('edi')));
      addMemory(memory, 0x64020, cpu.get('ebx')); addMemory(memory, 0x64024, cpu.get('edx')); memory.write16(0x64008, 1);
    }
    word(cpu, 'ebx', memory.read16(0x64008)); word(cpu, 'edx', memory.read16(0x6400c));
    const before = cpu.get('edx'); cmp16(cpu, before, cpu.get('ebx')); word(cpu, 'edx', before - cpu.get('ebx'));
    if (!(cpu.get('edx') & 65535)) return;
    cpu.set('ebx', Math.imul(cpu.get('ebx'), 5) << 6); memory.write16(0x6404a, cpu.get('ebx'));
    cpu.set('ebx', cpu.get('ebx') << 16); addMemory(memory, 0x64020, cpu.get('ebx')); addMemory(memory, 0x64024, cpu.get('ebx'));
    push32(runtime, 0x643ba); fn_64f70(runtime);
    if (pop32(runtime) !== 0x643ba) throw new Error('Triangle upper-band return changed');
  }
  resumeFn64e60At0x652ba(runtime);
}
export const fn_64e60 = instrumentLift('0x64e60', 'fn_64e60', execute);
