// DPMI 0900h/0901h virtual-interrupt services used by the translated audio
// callbacks. 0900h returns the prior state in AL and disables interrupts;
// 0901h restores the state supplied in AL. Other DPMI functions stay explicit.
export function handleDpmiVirtualInterrupt(runtime, { vector, callSite, ax }) {
  if (vector !== 0x31) throw new Error(`Unsupported interrupt vector 0x${vector.toString(16)}`);
  if ((ax & 0xfffe) === 0x0900 && (ax & 1) === 0) {
    const wasEnabled = runtime.cpu.interruptsEnabled;
    runtime.cpu.interruptsEnabled = false;
    runtime.cpu.set('eax', (runtime.cpu.get('eax') & 0xffff0000) | 0x0900 | Number(wasEnabled));
    runtime.cpu.setCarry(false);
    return;
  }
  if ((ax & 0xfffe) === 0x0900 && (ax & 1) === 1) {
    runtime.cpu.interruptsEnabled = (ax & 1) !== 0;
    runtime.cpu.setCarry(false);
    return;
  }
  throw new Error(`Unsupported DPMI function AX=0x${ax.toString(16).padStart(4, '0')} at 0x${callSite.toString(16)}`);
}
