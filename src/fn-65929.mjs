const u32 = value => value >>> 0;

function setLow8(cpu, name, value) {
  cpu.set(name, (cpu.get(name) & 0xffffff00) | (value & 0xff));
}
function setHigh8(cpu, name, value) {
  cpu.set(name, (cpu.get(name) & 0xffff00ff) | ((value & 0xff) << 8));
}
function setLow16(cpu, name, value) {
  cpu.set(name, (cpu.get(name) & 0xffff0000) | (value & 0xffff));
}
function add32(left, right) { return u32(left + right); }

function copyBytesForward(runtime, destination, source, count) {
  const { memory } = runtime;
  if (count > memory.bytes.length) {
    throw new RangeError(`fn_65929 REP byte count ${count} exceeds runtime memory`);
  }
  for (let index = 0; index < count; index += 1) {
    runtime.writeEs8(add32(destination, index), memory.read8(add32(source, index)));
  }
}

function copyWordsForward(runtime, destination, source, count) {
  const { memory } = runtime;
  if (count * 2 > memory.bytes.length) {
    throw new RangeError(`fn_65929 REP word count ${count} exceeds runtime memory`);
  }
  for (let index = 0; index < count; index += 1) {
    runtime.writeEs16(add32(destination, index * 2), memory.read16(add32(source, index * 2)));
  }
}

// Mechanical lift of 0x65929..0x65add. Captured callback and jump-table
// targets are routed only when their runtime bytes match the observed code.
function __coverage_impl_fn_65929(runtime, adapters = {}) {
  const { memory, cpu } = runtime;
  const ssBase = runtime.segments?.ssBase;
  if (!Number.isInteger(ssBase)) throw new Error('fn_65929 requires a resolved SS base for PUSHA/PUSH/CALL scratch');
  const saved = Object.fromEntries(
    ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'].map(name => [name, cpu.get(name)]),
  );
  const entryEsp = saved.esp >>> 0;
  const pushaEsp = (entryEsp - 32) >>> 0;
  cpu.set('esp', pushaEsp);
  const ssAddress = offset => (ssBase + (offset >>> 0)) >>> 0;
  // PUSHA stores EDI, ESI, EBP, original ESP, EBX, EDX, ECX, EAX.
  for (const [index, name] of ['edi', 'esi', 'ebp', null, 'ebx', 'edx', 'ecx', 'eax'].entries()) {
    memory.write32(ssAddress(pushaEsp + index * 4), name === null ? entryEsp : saved[name]);
  }
  const push32 = value => {
    const esp = (cpu.get('esp') - 4) >>> 0;
    cpu.set('esp', esp);
    memory.write32(ssAddress(esp), value >>> 0);
  };
  const pop32 = () => {
    const esp = cpu.get('esp') >>> 0;
    const value = memory.read32(ssAddress(esp));
    cpu.set('esp', (esp + 4) >>> 0);
    return value;
  };

  let edx = saved.edx;
  memory.write32(0x64450, edx);
  setLow8(cpu, 'eax', memory.read8(add32(edx, 0x1b)));
  memory.write8(0x645d4, cpu.get('eax') & 0xff);

  let edi = add32(edx, 0x42);
  memory.write32(0x64454, edi);
  let esi = add32(edi, memory.read8(add32(edx, 0x1e)) * 0x25);
  memory.write32(0x64458, esi);
  esi = add32(esi, 0x80);
  memory.write32(0x6445c, esi);
  let eax = memory.read16(add32(edx, 0x18));
  eax = u32(eax * 3);
  eax = u32(eax << 6);
  esi = add32(esi, eax);
  memory.write32(0x64460, esi);
  eax = memory.read8(add32(edx, 0x1a)) << 6;
  cpu.set('eax', eax); // MOVZX EAX,byte then SHL EAX,6.
  esi = add32(esi, eax + 0x40);
  let ebx = add32(memory.read16(add32(edx, 0x1c)), esi);
  push32(ebx); // PUSH EBX at 0x6597f.
  setLow8(cpu, 'eax', memory.read8(add32(edx, 0x1e)));
  edx = ebx;

  const selectorActive = memory.read8(0x645cf) !== 0;
  const selectedTarget = selectorActive ? memory.read32(0x645e8 + 0x0c) : 0x297;
  if (selectorActive) ebx = 0;
  cpu.set('ebx', ebx);
  cpu.set('edx', edx);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ebp', selectedTarget);

  // AL is an 8-bit LOOP counter: an initial zero wraps through 256 iterations.
  do {
    edi = cpu.get('edi');
    let ecx = memory.read32(add32(edi, 0x16));
    cpu.set('ecx', ecx);
    if (ecx !== 0) {
      esi = ecx - 1;
      while (esi >= 0) {
        const address = add32(edx, esi);
        memory.write8(address, memory.read8(address) ^ 0x80);
        esi -= 1;
      }

      esi = memory.read32(add32(edi, 0x1e));
      cpu.set('esi', esi);
      setHigh8(cpu, 'eax', 0);
      if (esi > 2) {
        setHigh8(cpu, 'eax', 8);
        ecx = esi;
        cpu.set('ecx', ecx);
      }
      memory.write8(add32(edi, 0x0c), (cpu.get('eax') >>> 8) & 0xff);
      const callTarget = cpu.get('ebp');
      const callTargetAdapter = adapters.callSelectedTarget ?? ((target, activeRuntime) => {
        // All 34 checked captures contain C3 at normalized CS:0 address 0x297,
        // which maps to original file byte 0x1197 (the RET at fn_1189's end).
        if (target === 0x297 && activeRuntime.memory.read8(0x297) === 0xc3) return;
        throw new Error(`fn_65929 requires callSelectedTarget for register call 0x${target.toString(16)} at 0x659bd (unresolved target)`);
      });
      if (typeof callTargetAdapter !== 'function') {
        throw new Error(`fn_65929 requires callSelectedTarget for register call 0x${callTarget.toString(16)} at 0x659bd`);
      }
      // CALL EBp leaves the return EIP at SS:ESP-4 even after the callee RETs.
      const callEsp = (cpu.get('esp') - 4) >>> 0;
      cpu.set('esp', callEsp);
      memory.write32(ssAddress(callEsp), 0x64abf); // normalized EIP after CALL at 0x659bd.
      callTargetAdapter(callTarget, runtime);
      if ((cpu.get('esp') >>> 0) !== callEsp) {
        throw new Error(`selected target 0x${callTarget.toString(16)} did not preserve its CALL frame at 0x659bd`);
      }
      cpu.set('esp', (callEsp + 4) >>> 0); // callee RET.

      edi = cpu.get('edi');
      ebx = cpu.get('ebx');
      ecx = cpu.get('ecx');
      edx = cpu.get('edx');
      memory.write32(edi, ebx);
      ecx = add32(add32(ebx, ecx), -2);
      cpu.set('ecx', ecx);
      memory.write32(add32(edi, 8), ecx);
      ecx = add32(memory.read32(add32(edi, 0x1a)), ebx);
      cpu.set('ecx', ecx);
      memory.write32(add32(edi, 4), ecx);
      let value = memory.read8(add32(edi, 0x23));
      value = value === 0 ? 0 : value - 1;
      memory.write8(add32(edi, 0x23), value >>> 2);
      ecx = memory.read32(add32(edi, 0x16));
      ebx = add32(ebx, ecx);
      edx = add32(edx, ecx);
      cpu.set('ebx', ebx);
      cpu.set('edx', edx);
    }
    edi = add32(cpu.get('edi'), 0x25);
    cpu.set('edi', edi);
    const nextCount = ((cpu.get('eax') & 0xff) - 1) & 0xff;
    setLow8(cpu, 'eax', nextCount);
  } while ((cpu.get('eax') & 0xff) !== 0);

    ebx = pop32(); // POP EBX at 0x659ed.
    cpu.set('ebx', ebx);
  if (memory.read8(0x645cf) !== 0) edx = ebx;
  const eaxResult = u32(edx - memory.read32(0x64450));

  edi = memory.read32(0x6445c);
    let ecx = memory.read16(add32(memory.read32(0x64450), 0x18)) << 6;
  while (ecx !== 0) {
    cpu.set('edi', edi);
    cpu.set('ecx', ecx);
    ebx = 0;
    const type = memory.read8(add32(edi, 1)) & 0x0f;
    eax = type;
    cpu.set('eax', eax); // MOVZX EAX clears its upper 24 bits.
    cpu.set('ebx', memory.read8(add32(edi, 2))); // XOR EBX,EBX then MOV BL.

    if (type === 0x0f) {
      setLow8(cpu, 'ebx', ((cpu.get('ebx') & 0xff) & 0x1f) | 0x40);
    } else if (type < 0x0b) {
      setLow8(cpu, 'ebx', 0);
      setLow8(cpu, 'eax', 0);
    } else {
      const index = type - 0x0b;
      eax = index;
      cpu.set('eax', eax);
      const tableAddress = 0x64470 + 0x58 + index * 4;
      const target = memory.read32(tableAddress);
      const dispatch = adapters.dispatchJumpTable ?? ((targetAddress, tableIndex, activeRuntime) => {
        const mem = activeRuntime.memory;
        const cpuState = activeRuntime.cpu;
        const bytesAt = (address, bytes) => bytes.every((value, offset) => mem.read8(address + offset) === value);
        let bl = cpuState.get('ebx') & 0xff;
        if (targetAddress === 0x64b3e && tableIndex <= 1
          && bytesAt(targetAddress, [0x80, 0xeb, 0x01, 0x80, 0xd3, 0x00])) {
          const subCarry = bl < 1;
          bl = (bl - 1) & 0xff;
          bl = (bl + (subCarry ? 1 : 0)) & 0xff;
          bl = (bl >>> 2) | 0x80;
        } else if (targetAddress === 0x64b4c && tableIndex === 2
          && bytesAt(targetAddress, [0xb3, 0x01, 0xeb, 0x2a])) {
          bl = 1;
        } else if (targetAddress === 0x64b50 && tableIndex === 3
          && bytesAt(targetAddress, [0x8a, 0xfb, 0x80, 0xe3, 0xf0, 0x80, 0xfb, 0x80])) {
          const originalBl = bl;
          bl = bl & 0xf0;
          bl = bl === 0x80 ? (originalBl & 0x0f) | 0x60 : 0;
        } else {
          const address = 0x64470 + 0x58 + tableIndex * 4;
          throw new Error(`fn_65929 requires dispatchJumpTable for DS:[0x${address.toString(16)}] -> 0x${targetAddress.toString(16)} at 0x65a37`);
        }
        cpuState.set('ebx', (cpuState.get('ebx') & 0xffffff00) | bl);
      });
      dispatch(target, index, runtime);
    }

    edi = cpu.get('edi');
    ecx = cpu.get('ecx');
    memory.write8(add32(edi, 2), cpu.get('ebx') & 0xff);
    const word = memory.read16(edi);
    const rotated = ((word >>> 2) | (word << 14)) & 0xffff;
    const shrAh = ((rotated >>> 8) & 0xff) >>> 2;
    const nextAh = shrAh === 0 ? 0 : shrAh - 1;
    const rewritten = ((nextAh & 0xff) << 8) | ((rotated & 0xff) & 0x3f);
    setLow16(cpu, 'eax', rewritten);
    memory.write16(edi, rewritten);
    edi = add32(edi, 3);
    ecx = u32(ecx - 1);
    cpu.set('edi', edi);
    cpu.set('ecx', ecx);
  }

  let ebp = memory.read32(0x64450);
  edi = add32(ebp, 0x22);
  let edxStep = memory.read8(0x645cc);
  esi = add32(edi, edxStep);
  ebx = memory.read8(0x645cd);
  copyBytesForward(runtime, edi, esi, ebx);
  ebp = memory.read8(add32(ebp, 0x1a));
  edi = memory.read32(0x64460);
  edxStep <<= 1;
  eax = 0;
  for (;;) {
    esi = add32(edi, edxStep);
    ecx = ebx;
    if (ecx > 0x100000) throw new RangeError(`fn_65929 REP MOVSW count ${ecx} exceeds bounded fixture limits`);
    copyWordsForward(runtime, edi, esi, ecx);
    edi = add32(edi, ecx * 2); // REP MOVSW advances ES:EDI before REP STOSW.
    ecx = u32(0x20 - ebx);
    if (ecx > 0x100000) throw new RangeError(`fn_65929 REP STOSW count ${ecx} exceeds bounded fixture limits`);
    for (let index = 0; index < ecx; index += 1) {
      runtime.writeEs16(edi, 0);
      edi = add32(edi, 2);
    }
    ebp = u32(ebp - 1);
    if (ebp === 0xffffffff) break;
  }

  // MOV [ESP+0x1c],EDX overwrites PUSHA's saved EAX slot; POPA then restores
  // that computed value and the other saved registers from their actual SS bytes.
  memory.write32(ssAddress(pushaEsp + 0x1c), eaxResult);
  for (const [index, name] of ['edi', 'esi', 'ebp', null, 'ebx', 'edx', 'ecx', 'eax'].entries()) {
    if (name !== null) cpu.set(name, memory.read32(ssAddress(pushaEsp + index * 4)));
  }
  cpu.set('esp', entryEsp);
  // The terminal SUB EBP,1 is 0-1 after the zero-fill loop: CF/PF/AF/SF set.
  const terminalFlags = 1 | 4 | 0x10 | 0x80;
  cpu.setEflags((cpu.eflags & ~(1 | 4 | 0x10 | 0x40 | 0x80 | 0x800)) | terminalFlags);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_65929 = instrumentLift('0x65929', 'fn_65929', __coverage_impl_fn_65929);
