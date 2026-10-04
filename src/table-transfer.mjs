// Address-preserving lifts of the four leaf helpers used by fn_6098c.
import { pop32, push32 } from './core/stack-effects.mjs';

function imulParts(left, right) {
  const product = BigInt.asUintN(
    64,
    BigInt.asIntN(32, BigInt(left >>> 0)) * BigInt.asIntN(32, BigInt(right >>> 0)),
  );
  return {
    eax: Number(product & 0xffffffffn),
    edx: Number((product >> 32n) & 0xffffffffn),
  };
}

function shrd16(eax, edx) {
  return ((eax >>> 16) | (edx << 16)) >>> 0;
}

function copyDwordsToEs(runtime, source, destination, count) {
  for (let index = 0; index < count; index += 1) {
    runtime.writeEs32(destination, runtime.memory.read32(source));
    source = (source + 4) >>> 0;
    destination = (destination + 4) >>> 0;
  }
  return { source, destination };
}

function __coverage_impl_fn_60d8b(runtime) {
  const { memory, cpu } = runtime;
  let ebx = 0x80;
  let edi = memory.read32(0x5fa70);
  let ebp = memory.read32(0x5ffd6);
  let eax = 0;
  let edx = 0;
  let esi = 0;
  let ecx = 0;

  while (ebx !== 0) {
    // AND EBP is itself an instruction, not just an effective-address mask;
    // the following SUB and the final register value use this masked value.
    ebp &= 0xfff;
    ({ eax, edx } = imulParts(0x28, memory.read32(0x2198c + ebp * 4)));
    eax = (shrd16(eax, edx) + 0x28) >>> 0;
    eax = (eax << 1) >>> 0;
    eax = (eax + ebx * 2 - 1) >>> 0;
    eax = (eax & 0xff) << 8;
    eax = (eax + memory.read32(0x5fe7f)) & 0x7fff;
    esi = (eax + memory.read32(0x21960)) >>> 0;
    ecx = 0x40;
    ({ source: esi, destination: edi } = copyDwordsToEs(runtime, esi, edi, ecx));
    ecx = 0;
    ebp = (ebp - 0x2d) >>> 0;
    ebx = (ebx - 1) >>> 0;
  }

  esi = memory.read32(0x5fa70);
  edi = (esi + 0x8000) >>> 0;
  ({ source: esi, destination: edi } = copyDwordsToEs(runtime, esi, edi, 0x2000));
  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ecx', 0);
  cpu.set('edx', edx);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ebp', ebp);
}

function __coverage_impl_fn_60df8(runtime) {
  const { memory, cpu } = runtime;
  let edx = 0x80;
  let edi = memory.read32(0x5fa70);
  let ebp = memory.read32(0x5fe83);
  let ebx = memory.read32(0x5fe87);
  let eax = 0;
  let esi = 0;
  let ecx = 0;

  while (edx !== 0) {
    const row = edx;
    // 0x60e0f PUSH EDX.  The inner temporaries reuse ESP-8 and the final
    // POP EDX leaves the last row value observable at ESP-4.
    push32(runtime, edx);
    // Both index ANDs alter the registers before the per-row SUBs.
    ebx &= 0xfff;
    let product = imulParts(0x32, memory.read32(0x2298c + ebx * 4));
    const secondTableValue = shrd16(product.eax, product.edx);
    push32(runtime, secondTableValue);
    ebp &= 0xfff;
    product = imulParts(0x28, memory.read32(0x2198c + ebp * 4));
    eax = (shrd16(product.eax, product.edx) + 0x28) >>> 0;
    eax = (eax << 1) >>> 0;
    eax = (eax + memory.read32((runtime.segments.ssBase + cpu.get('esp')) >>> 0)) >>> 0;
    cpu.set('esp', (cpu.get('esp') + 4) >>> 0); // ADD ESP,4 at 0x60e46.
    eax = (eax >>> 1) & 0xff;
    const column = eax;
    push32(runtime, column);
    const savedRow = memory.read32((runtime.segments.ssBase + ((cpu.get('esp') + 4) >>> 0)) >>> 0);
    eax = (((savedRow << 8) >>> 0) + column + memory.read32(0x5fe7f)) & 0x7fff;
    cpu.set('esp', (cpu.get('esp') + 4) >>> 0); // ADD ESP,4 at 0x60e61.
    esi = (eax + memory.read32(0x21960)) >>> 0;
    ecx = 0x40;
    ({ source: esi, destination: edi } = copyDwordsToEs(runtime, esi, edi, ecx));
    ecx = 0;
    ebp = (ebp - 0x23) >>> 0;
    ebx = (ebx - 0x28) >>> 0;
    edx = pop32(runtime); // POP EDX at 0x60e7e.
    edx = (edx - 1) >>> 0;
  }

  esi = memory.read32(0x5fa70);
  edi = (esi + 0x8000) >>> 0;
  ({ source: esi, destination: edi } = copyDwordsToEs(runtime, esi, edi, 0x2000));
  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ecx', 0);
  cpu.set('edx', edx);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ebp', ebp);
}

function __coverage_impl_fn_60e96(runtime, { readLookupByte = address => runtime.memory.read8(address) } = {}) {
  const { memory, cpu } = runtime;
  let ebx = 0;
  let ebp = 0xffffc180;
  let eax = cpu.get('eax');
  const esi = cpu.get('esi');
  const edi = cpu.get('edi');
  const lookupBase = 0x12345678;

  while (ebp !== 0) {
    const sourceAddress = (esi + (ebp | 0) + 0x3e80) >>> 0;
    const destinationAddress = (edi + (ebp | 0) + 0x3e80) >>> 0;
    ebx = ((memory.read8(sourceAddress) << 8) | memory.read8(destinationAddress)) >>> 0;
    eax = ((eax & 0xffffff00) | readLookupByte((lookupBase + ebx) >>> 0, runtime)) >>> 0;

    ebx = ((memory.read8(sourceAddress + 1) << 8) | memory.read8(destinationAddress + 1)) >>> 0;
    eax = ((eax & 0xffff00ff) | (readLookupByte((lookupBase + ebx) >>> 0, runtime) << 8)) >>> 0;
    memory.write16(sourceAddress, eax & 0xffff);
    ebp = (ebp + 2) >>> 0;
  }

  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ebp', ebp);
}

export function resumeFn60e96At0x60ed0(runtime, { readLookupByte = address => runtime.memory.read8(address) } = {}) {
  const execute = () => {
    const { memory, cpu } = runtime;
    let ebp = (cpu.get('ebp') + 2) >>> 0;
    let ebx = cpu.get('ebx');
    let eax = cpu.get('eax');
    const esi = cpu.get('esi');
    const edi = cpu.get('edi');
    const lookupBase = 0x12345678;
    let iterations = 0;

    // The captured EIP is at ADD EBP,2, after the current output word was
    // written. Continue with the following pair and stop when that ADD
    // wraps the loop offset to zero, matching the original JNZ/RET.
    while (ebp !== 0) {
      if (++iterations > 0x8000) throw new RangeError('fn_60e96 captured suffix exceeded its bounded 16 KiB loop');
      const sourceAddress = (esi + (ebp | 0) + 0x3e80) >>> 0;
      const destinationAddress = (edi + (ebp | 0) + 0x3e80) >>> 0;
      ebx = ((memory.read8(sourceAddress) << 8) | memory.read8(destinationAddress)) >>> 0;
      eax = ((eax & 0xffffff00) | readLookupByte((lookupBase + ebx) >>> 0, runtime)) >>> 0;
      ebx = ((memory.read8(sourceAddress + 1) << 8) | memory.read8(destinationAddress + 1)) >>> 0;
      eax = ((eax & 0xffff00ff) | (readLookupByte((lookupBase + ebx) >>> 0, runtime) << 8)) >>> 0;
      memory.write16(sourceAddress, eax & 0xffff);
      ebp = (ebp + 2) >>> 0;
    }

    cpu.set('eax', eax);
    cpu.set('ebx', ebx);
    cpu.set('ebp', ebp);
    return { originalFunctionCompleted: true, resumedAt: 0x60ed0, iterations };
  };
  return runtime.functionCoverage
    ? runtime.functionCoverage.invoke('0x60e96', 'fn_60e96:capture suffix at 0x60ed0', runtime, execute, [])
    : execute();
}

function __coverage_impl_fn_60eda(runtime, { readSs16 = address => runtime.memory.read16(address) } = {}) {
  const { memory, cpu } = runtime;
  let ecx = 0xfa0;
  let esi = memory.read32(0x5fa70);
  let ebp = memory.read32(0x21974);
  let edi = cpu.get('edi');
  let ebx = 0;
  let eax = cpu.get('eax');

  while (ecx !== 0) {
    ebx = readSs16(ebp + 4, runtime);
    eax = (eax & 0xffffff00) | memory.read8(esi + ebx);
    ebx = readSs16(ebp + 6, runtime);
    eax = (eax & 0xffff00ff) | (memory.read8(esi + ebx) << 8);
    ebx = readSs16(ebp, runtime);
    eax = ((eax << 16) | (eax >>> 16)) >>> 0;
    eax = (eax & 0xffffff00) | memory.read8(esi + ebx);
    ebx = readSs16(ebp + 2, runtime);
    eax = (eax & 0xffff00ff) | (memory.read8(esi + ebx) << 8);
    memory.write32(edi, eax);
    edi = (edi + 4) >>> 0;
    ebp = (ebp + 8) >>> 0;
    ecx -= 1;
  }

  cpu.set('eax', eax);
  cpu.set('ebx', ebx);
  cpu.set('ecx', ecx);
  cpu.set('esi', esi);
  cpu.set('edi', edi);
  cpu.set('ebp', ebp);
}

import { instrumentLift } from './core/function-coverage.mjs';

/* FUNCTION_COVERAGE_WRAPPERS */
export const fn_60d8b = instrumentLift('0x60d8b', 'fn_60d8b', __coverage_impl_fn_60d8b);
export const fn_60df8 = instrumentLift('0x60df8', 'fn_60df8', __coverage_impl_fn_60df8);
export const fn_60e96 = instrumentLift('0x60e96', 'fn_60e96', __coverage_impl_fn_60e96);
export const fn_60eda = instrumentLift('0x60eda', 'fn_60eda', __coverage_impl_fn_60eda);
