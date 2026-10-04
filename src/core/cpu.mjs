export class CpuState {
  constructor() {
    this.registers = Object.create(null);
    this.eflags = 0x202;
  }

  get(name) { return this.registers[name] ?? 0; }
  set(name, value) { this.registers[name] = value >>> 0; }
  get carry() { return (this.eflags & 1) !== 0; }
  set carry(value) { this.eflags = value ? (this.eflags | 1) : (this.eflags & ~1); }
  get interruptsEnabled() { return (this.eflags & 0x200) !== 0; }
  set interruptsEnabled(value) { this.eflags = value ? (this.eflags | 0x200) : (this.eflags & ~0x200); }
  setCarry(value) { this.carry = Boolean(value); }
  setEflags(value) { this.eflags = value >>> 0; }

  setAddFlags8(left, right) {
    const a = left & 255, b = right & 255, result = (a + b) & 255;
    let flags = this.eflags & ~(1 | 4 | 0x10 | 0x40 | 0x80 | 0x800);
    if (a + b > 255) flags |= 1;
    if (result.toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if ((a ^ b ^ result) & 0x10) flags |= 0x10;
    if (result === 0) flags |= 0x40;
    if (result & 0x80) flags |= 0x80;
    if ((~(a ^ b) & (a ^ result)) & 0x80) flags |= 0x800;
    this.eflags = flags >>> 0;
  }

  setNegFlags16(value) {
    const before = value & 0xffff, result = (-before) & 0xffff;
    let flags = this.eflags & ~(1 | 4 | 0x10 | 0x40 | 0x80 | 0x800);
    if (before !== 0) flags |= 1;
    if ((result & 255).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if (before & 15) flags |= 0x10;
    if (result === 0) flags |= 0x40;
    if (result & 0x8000) flags |= 0x80;
    if (before === 0x8000) flags |= 0x800;
    this.eflags = flags >>> 0;
  }

  // INC defines arithmetic flags except CF, which remains unchanged.
  setIncFlags32(value) {
    const before = value >>> 0;
    const result = (before + 1) >>> 0;
    let flags = this.eflags & ~(4 | 0x10 | 0x40 | 0x80 | 0x800);
    if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if ((before & 0xf) === 0xf) flags |= 0x10;
    if (result === 0) flags |= 0x40;
    if (result & 0x80000000) flags |= 0x80;
    if (before === 0x7fffffff) flags |= 0x800;
    this.eflags = flags >>> 0;
  }

  // x86 logical operations define CF, PF, ZF, SF and OF; AF is undefined.
  setOrFlags32(value) {
    const result = value >>> 0;
    const mask = 1 | 4 | 0x40 | 0x80 | 0x800;
    let flags = this.eflags & ~mask;
    if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if (result === 0) flags |= 0x40;
    if (result & 0x80000000) flags |= 0x80;
    this.eflags = flags >>> 0;
  }

  setCmpFlags32(left, right) {
    const a = left >>> 0;
    const b = right >>> 0;
    const result = (a - b) >>> 0;
    const mask = 1 | 4 | 0x10 | 0x40 | 0x80 | 0x800;
    let flags = this.eflags & ~mask;
    if (a < b) flags |= 1;
    if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if (((a ^ b ^ result) & 0x10) !== 0) flags |= 0x10;
    if (result === 0) flags |= 0x40;
    if (result & 0x80000000) flags |= 0x80;
    if (((a ^ b) & (a ^ result) & 0x80000000) !== 0) flags |= 0x800;
    this.eflags = flags >>> 0;
  }

  // DEC updates arithmetic status flags but leaves CF unchanged.
  setDecFlags32(value) {
    const before = value >>> 0;
    const result = (before - 1) >>> 0;
    const mask = 4 | 0x10 | 0x40 | 0x80 | 0x800;
    let flags = this.eflags & ~mask;
    if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if ((before & 0xf) === 0) flags |= 0x10;
    if (result === 0) flags |= 0x40;
    if (result & 0x80000000) flags |= 0x80;
    if (before === 0x80000000) flags |= 0x800;
    this.eflags = flags >>> 0;
  }

  setAndFlags16(value) {
    const result = value & 0xffff;
    const mask = 1 | 4 | 0x40 | 0x80 | 0x800;
    let flags = this.eflags & ~mask;
    if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if (result === 0) flags |= 0x40;
    if (result & 0x8000) flags |= 0x80;
    this.eflags = flags >>> 0;
  }

  setTestFlags8(value) {
    const result = value & 0xff;
    const mask = 1 | 4 | 0x40 | 0x80 | 0x800;
    let flags = this.eflags & ~mask;
    if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if (result === 0) flags |= 0x40;
    if (result & 0x80) flags |= 0x80;
    this.eflags = flags >>> 0;
  }

  setSarFlags32(source, result, count) {
    const shift = count & 31;
    const mask = 1 | 4 | 0x40 | 0x80;
    let flags = this.eflags & ~mask;
    if (shift !== 0 && ((source >>> (shift - 1)) & 1)) flags |= 1;
    const low = result & 0xff;
    if (low.toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if ((result >>> 0) === 0) flags |= 0x40;
    if (result & 0x80000000) flags |= 0x80;
    this.eflags = flags >>> 0;
  }

  setCmpFlags8(left, right) {
    const a = left & 0xff;
    const b = right & 0xff;
    const result = (a - b) & 0xff;
    const mask = 1 | 4 | 0x10 | 0x40 | 0x80 | 0x800;
    let flags = this.eflags & ~mask;
    if (a < b) flags |= 1;
    if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if (((a ^ b ^ result) & 0x10) !== 0) flags |= 0x10;
    if (result === 0) flags |= 0x40;
    if (result & 0x80) flags |= 0x80;
    if (((a ^ b) & (a ^ result) & 0x80) !== 0) flags |= 0x800;
    this.eflags = flags >>> 0;
  }

  setAddFlags16(left, right) {
    const a = left & 0xffff;
    const b = right & 0xffff;
    const sum = a + b;
    const result = sum & 0xffff;
    const mask = 1 | 4 | 0x10 | 0x40 | 0x80 | 0x800;
    let flags = this.eflags & ~mask;
    if (sum > 0xffff) flags |= 1;
    if ((result & 0xff).toString(2).replaceAll('0', '').length % 2 === 0) flags |= 4;
    if (((a ^ b ^ result) & 0x10) !== 0) flags |= 0x10;
    if (result === 0) flags |= 0x40;
    if (result & 0x8000) flags |= 0x80;
    if ((~(a ^ b) & (a ^ result) & 0x8000) !== 0) flags |= 0x800;
    this.eflags = flags >>> 0;
  }
}
