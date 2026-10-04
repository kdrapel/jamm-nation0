export class Timing {
  constructor() {
    this.ticks = 0;
    this.retraceHook = null;
  }

  waitForRetrace() {
    this.ticks += 1;
    this.retraceHook?.(this.ticks);
  }
}
