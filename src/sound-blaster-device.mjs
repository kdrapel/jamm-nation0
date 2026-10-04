// Minimal Sound Blaster DSP + ISA DMA-1 device boundary used by Nation0's
// translated callbacks. It reads PCM only from the translated runtime's DMA
// memory; it neither decodes MOD data nor schedules scenes.

const DSP_RESET = 0x06;
const DSP_READ = 0x0a;
const DSP_WRITE = 0x0c;
const DSP_STATUS = 0x0e;

export class SoundBlasterDevice {
  constructor({ basePort = 0x220, irq = 7 } = {}) {
    this.basePort = basePort & 0xffff;
    this.irq = irq;
    this.resetHigh = false;
    this.readQueue = [];
    this.command = null;
    this.commandBytes = [];
    this.timeConstant = null;
    this.effectiveRate = null;
    this.dma = {
      address: 0, currentAddress: 0, page: 0,
      count: 0, currentCount: 0,
      mode: 0, masked: true, flipFlopHigh: false,
    };
    this.blockLength = 0;
    this.blockFramesRemaining = 0;
    this.dmaSampleAccumulator = 0;
    this.dmaSamplesConsumed = 0;
    this.dmaSamplesTransferred = 0;
    this.irqCount = 0;
    this.unhandledIrqCount = 0;
    this.irqHostFramePositions = [];
    this.commandCount = 0;
    this.hostFramesAdvanced = 0;
    this.callbackCount = 0;
    this.pcmQueue = [];
  }

  reset() {
    this.readQueue.length = 0;
    this.command = null;
    this.commandBytes.length = 0;
    this.blockFramesRemaining = 0;
  }

  read8(port) {
    const offset = ((port & 0xffff) - this.basePort) & 0xffff;
    if (offset === DSP_READ) return this.readQueue.shift() ?? 0;
    if (offset === DSP_STATUS) return this.readQueue.length ? 0x80 : 0;
    if (offset === DSP_WRITE) return 0; // bit 7 clear: DSP accepts a byte.
    return undefined;
  }

  write8(port, value) {
    const key = port & 0xffff;
    const byte = value & 0xff;
    const offset = (key - this.basePort) & 0xffff;
    if (offset === DSP_RESET) {
      if (byte & 1) this.resetHigh = true;
      else if (this.resetHigh) { this.reset(); this.resetHigh = false; this.readQueue.push(0xaa); }
      return true;
    }
    if (offset === DSP_WRITE) { this.writeDsp(byte); return true; }
    if (offset === DSP_STATUS) { this.readQueue.length = 0; return true; } // IRQ acknowledge/read-status.
    return this.writeDma(key, byte);
  }

  writeDsp(byte) {
    if (this.command === null) {
      this.command = byte;
      this.commandBytes.length = 0;
      this.commandCount += 1;
      if (byte !== 0x40 && byte !== 0x14) this.command = null;
      return;
    }
    this.commandBytes.push(byte);
    if (this.command === 0x40 && this.commandBytes.length === 1) {
      this.timeConstant = this.commandBytes[0];
      this.effectiveRate = Math.round(1_000_000 / (256 - this.timeConstant));
      this.command = null;
      return;
    }
    if (this.command === 0x14 && this.commandBytes.length === 2) {
      this.blockLength = ((this.commandBytes[0] | (this.commandBytes[1] << 8)) + 1) & 0xffff;
      this.blockFramesRemaining = this.blockLength;
      this.command = null;
    }
  }

  writeDma(port, byte) {
    // Nation0 programs ISA DMA channel 1 through mask 0x0a, mode 0x0b,
    // address 0x02, page 0x83, count 0x03, and flip-flop reset 0x0c.
    if (port === 0x0c) { this.dma.flipFlopHigh = false; return true; }
    if (port === 0x0a) { this.dma.masked = (byte & 4) !== 0; return true; }
    if (port === 0x0b) { this.dma.mode = byte; return true; }
    if (port === 0x83) { this.dma.page = byte; return true; }
    if (port === 0x02 || port === 0x03) {
      const target = port === 0x02 ? 'address' : 'count';
      const prior = this.dma[target];
      this.dma[target] = this.dma.flipFlopHigh ? ((prior & 0x00ff) | (byte << 8)) : ((prior & 0xff00) | byte);
      if (this.dma.flipFlopHigh) {
        if (target === 'address') this.dma.currentAddress = this.dma.address;
        else this.dma.currentCount = this.dma.count;
      }
      this.dma.flipFlopHigh = !this.dma.flipFlopHigh;
      return true;
    }
    return false;
  }

  // Time until the next DMA sample block expires, expressed in host output
  // frames. This lets the session interleave the DMA IRQ with the native music
  // timer instead of delivering the callback after a whole render request.
  framesUntilDmaBoundary(hostSampleRate) {
    if (this.dma.masked || this.blockFramesRemaining <= 0 || this.effectiveRate <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(1, Math.ceil((this.blockFramesRemaining - this.dmaSampleAccumulator) * hostSampleRate / this.effectiveRate));
  }

  consumeDmaSamples(runtime, sampleCount) {
    if (!Number.isInteger(sampleCount) || sampleCount < 0) throw new RangeError('DMA sample count must be a non-negative integer');
    if (!runtime?.memory) throw new Error('Sound Blaster DMA transfer requires translated runtime memory');
    const { memory } = runtime;
    const dma = this.dma;
    const pageBase = (dma.page << 16) >>> 0;
    const decrement = (dma.mode & 0x20) !== 0;
    const autoInitialize = (dma.mode & 0x10) !== 0;
    let transferred = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const physicalAddress = (pageBase | (dma.currentAddress & 0xffff)) >>> 0;
      const unsignedSample = memory.read8(physicalAddress);
      this.pcmQueue.push((unsignedSample - 128) << 8);
      transferred += 1;

      if (decrement) dma.currentAddress = (dma.currentAddress - 1) & 0xffff;
      else dma.currentAddress = (dma.currentAddress + 1) & 0xffff;

      if (dma.currentCount === 0) {
        if (autoInitialize) {
          dma.currentAddress = dma.address;
          dma.currentCount = dma.count;
        } else {
          dma.masked = true;
          break;
        }
      } else {
        dma.currentCount = (dma.currentCount - 1) & 0xffff;
      }
    }
    this.dmaSamplesTransferred += transferred;
    return transferred;
  }

  drainPcmSamples(maxSamples = this.pcmQueue.length) {
    if (!Number.isInteger(maxSamples) || maxSamples < 0) throw new RangeError('PCM drain count must be a non-negative integer');
    const count = Math.min(maxSamples, this.pcmQueue.length);
    return Int16Array.from(this.pcmQueue.splice(0, count));
  }

  // Host output time clocks the programmed DSP/DMA sample rate. The translated
  // callback still owns reprogramming; a single-cycle 0x14 command never
  // causes this model to invent another block.
  advancePcmFrames(runtime, frames, hostSampleRate = 44100) {
    if (!Number.isInteger(frames) || frames < 0) throw new RangeError('PCM frame count must be a non-negative integer');
    if (!Number.isFinite(hostSampleRate) || hostSampleRate <= 0) throw new RangeError('host sample rate must be positive');
    // A previously latched edge is acknowledged at the next translated host
    // boundary after IF/mask permit delivery. Its new DSP block starts now,
    // before these newly requested output frames are consumed.
    runtime?.servicePendingPicInterrupts?.();
    this.hostFramesAdvanced += frames;
    if (this.dma.masked || this.blockFramesRemaining <= 0 || this.effectiveRate <= 0) return 0;
    const elapsedSamples = this.dmaSampleAccumulator + frames * this.effectiveRate / hostSampleRate;
    let remaining = Math.floor(elapsedSamples + 1e-10);
    this.dmaSampleAccumulator = elapsedSamples - remaining;
    let consumedTotal = 0;
    while (remaining > 0 && this.blockFramesRemaining > 0 && !this.dma.masked) {
      const consumed = Math.min(remaining, this.blockFramesRemaining);
      remaining -= consumed;
      this.consumeDmaSamples(runtime, consumed);
      this.blockFramesRemaining -= consumed;
      consumedTotal += consumed;
      this.dmaSamplesConsumed += consumed;
      if (this.blockFramesRemaining === 0) {
        this.irqCount += 1;
        this.irqHostFramePositions.push(this.hostFramesAdvanced);
        const delivery = runtime?.deliverSoundBlasterIrq7?.(this);
        if (delivery && typeof delivery === 'object') {
          if (delivery.delivered) this.callbackCount += 1;
          else if (!delivery.pending) this.unhandledIrqCount += 1;
        } else if (delivery) this.callbackCount += 1;
        else this.unhandledIrqCount += 1;
        // DSP command 0x14 is single-cycle. The original IRQ callback must
        // issue the next command; this model never invents another block.
      }
    }
    return consumedTotal;
  }

  snapshot() {
    return {
      initialized: this.timeConstant !== null,
      timeConstant: this.timeConstant,
      dspCommandCount: this.commandCount,
      basePort: this.basePort, irq: this.irq, effectiveRate: this.effectiveRate,
      dma: { ...this.dma }, blockLength: this.blockLength, blockFramesRemaining: this.blockFramesRemaining,
      irqCount: this.irqCount, callbackCount: this.callbackCount, unhandledIrqCount: this.unhandledIrqCount,
      hostFramesAdvanced: this.hostFramesAdvanced, dmaSamplesConsumed: this.dmaSamplesConsumed,
      dmaSamplesTransferred: this.dmaSamplesTransferred, currentDmaAddress: this.dma.currentAddress,
      currentDmaCount: this.dma.currentCount,
      dmaSampleAccumulator: this.dmaSampleAccumulator, irqHostFramePositions: [...this.irqHostFramePositions],
      queueDepth: this.pcmQueue.length,
    };
  }
}
