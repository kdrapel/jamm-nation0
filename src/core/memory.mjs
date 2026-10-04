function assertAddress(address, width, byteLength) {
  if (!Number.isInteger(address) || address < 0 || address + width > byteLength) {
    throw new RangeError(`Memory access outside mapped range: 0x${Number(address).toString(16)} (${width} bytes)`);
  }
}

export class Memory {
  constructor(byteLength = 4 * 1024 * 1024) {
    this.bytes = new Uint8Array(byteLength);
    this.view = new DataView(this.bytes.buffer);
  }

  read8(address) {
    assertAddress(address, 1, this.bytes.length);
    return this.view.getUint8(address);
  }
  read16(address) {
    assertAddress(address, 2, this.bytes.length);
    return this.view.getUint16(address, true);
  }
  read32(address) {
    assertAddress(address, 4, this.bytes.length);
    return this.view.getUint32(address, true);
  }
  write8(address, value) {
    assertAddress(address, 1, this.bytes.length);
    const byte = value & 0xff;
    this.view.setUint8(address, byte);
    this.onWrite?.(address, byte, 1);
  }
  write16(address, value) {
    assertAddress(address, 2, this.bytes.length);
    const word = value & 0xffff;
    this.view.setUint16(address, word, true);
    this.onWrite?.(address, word, 2);
  }
  write32(address, value) {
    assertAddress(address, 4, this.bytes.length);
    const dword = value >>> 0;
    this.view.setUint32(address, dword, true);
    this.onWrite?.(address, dword, 4);
  }
}
