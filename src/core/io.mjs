export class PortIo {
  constructor() {
    this.ports = new Map();
    this.inputQueues = new Map();
  }

  in8(port) {
    const key = port & 0xffff;
    const queued = this.inputQueues.get(key);
    if (queued?.length) {
      const value = queued.shift() & 0xff;
      this.ports.set(key, value);
      return value;
    }
    return this.ports.get(key) ?? 0;
  }
  queueIn8(port, values) {
    const key = port & 0xffff;
    const queue = this.inputQueues.get(key) ?? [];
    queue.push(...values.map(value => value & 0xff));
    this.inputQueues.set(key, queue);
  }
  out8(port, value) { this.ports.set(port & 0xffff, value & 0xff); }
  out16(port, value) {
    this.out8(port, value);
    this.out8((port + 1) & 0xffff, value >>> 8);
  }
}
