// Bounded master-8259 state used by Nation0's fixed IRQ7 Sound Blaster path.
// Mask writes still come from translated setup code; this models only the
// request, acknowledge, in-service, priority, and EOI behavior reached here.
export class FixedSbPic8259 {
  constructor(runtime) {
    this.runtime = runtime;
    this.masterMask = runtime.io.in8(0x21);
    this.slaveMask = runtime.io.in8(0xa1);
    this.masterIrr = 0;
    this.masterIsr = 0;
    this.eois = 0;
    this.accepted = 0;
    this.delivered = 0;
    this.requests = 0;
  }

  readPort(port) {
    if (port === 0x21) return this.masterMask;
    if (port === 0xa1) return this.slaveMask;
    return null;
  }

  writePort(port, value) {
    const byte = value & 0xff;
    if (port === 0x21) { this.masterMask = byte; return; }
    if (port === 0xa1) { this.slaveMask = byte; return; }
    if (port === 0x20) {
      if (byte !== 0x20) throw new Error(`Fixed SB PIC does not support master command 0x${byte.toString(16)}`);
      let active = this.masterIsr;
      while (active && (active & 1) === 0) active >>>= 1;
      if (active === 0) throw new Error('Master PIC EOI without an IRQ in service');
      let line = 0;
      while (((this.masterIsr >>> line) & 1) === 0) line += 1;
      this.masterIsr &= ~(1 << line);
      this.eois += 1;
    }
  }

  #eligibleLine() {
    let priorityCeiling = 8;
    for (let line = 0; line < 8; line += 1) {
      if ((this.masterIsr & (1 << line)) !== 0) { priorityCeiling = line; break; }
    }
    for (let line = 0; line < priorityCeiling; line += 1) {
      const bit = 1 << line;
      if ((this.masterIrr & bit) !== 0 && (this.masterMask & bit) === 0) return line;
    }
    return -1;
  }

  requestMasterIrq(line, dispatch) {
    if (!Number.isInteger(line) || line < 0 || line > 7) throw new RangeError(`Invalid master PIC IRQ ${line}`);
    this.masterIrr |= 1 << line;
    this.requests += 1;
    return this.servicePending(dispatch);
  }

  servicePending(dispatch) {
    const line = this.#eligibleLine();
    if (line < 0 || !this.runtime.cpu.interruptsEnabled || typeof dispatch !== 'function') {
      return { delivered: false, pending: this.masterIrr !== 0 };
    }
    const bit = 1 << line;
    this.masterIrr &= ~bit;
    this.masterIsr |= bit;
    this.accepted += 1;
    const handled = dispatch(line);
    if (handled === false) {
      this.masterIsr &= ~bit;
      this.masterIrr |= bit;
      return { delivered: false, pending: true };
    }
    if ((this.masterIsr & bit) !== 0) throw new Error(`IRQ${line} handler returned without acknowledging the master PIC`);
    this.delivered += 1;
    return { delivered: true, pending: this.masterIrr !== 0 };
  }

  snapshot() {
    return {
      masterMask: this.masterMask,
      slaveMask: this.slaveMask,
      masterIrr: this.masterIrr,
      masterIsr: this.masterIsr,
      requests: this.requests,
      acknowledgedRequests: this.accepted,
      deliveredHandlers: this.delivered,
      eois: this.eois,
    };
  }
}
