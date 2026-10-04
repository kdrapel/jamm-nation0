// GF1 hardware boundary used by Nation0's translated embedded-MOD handler.
// The player writes GF1 ports; this device retains those registers and renders
// their resulting voices. It does not inspect MOD events or channel records.

function wrap16(value) {
  const word = Math.trunc(value) & 0xffff;
  return word < 0x8000 ? word : word - 0x10000;
}

function gf1VolumeLevel(volume32) {
  // GUSEMU32's semi-logarithmic GF1 volume conversion, retaining five extra
  // bits while a volume ramp advances.
  return Math.floor(((((volume32 >>> 9) & 0xff) + 256) << (volume32 >>> 17)) / 512);
}

function gf1VolumeIncrement32(rate, sampleRate, programmedVoiceCount) {
  let increment = (32 * 16 * (rate & 0x3f00)) >>> 8;
  increment >>>= ((((rate & 0xc000) >>> 8) >>> 6) * 3);
  increment = Math.floor((increment * 44100 / 2) / sampleRate);
  increment = Math.floor((increment * 14) / programmedVoiceCount);
  return increment;
}

export class NativeMusicDevice {
  constructor({ basePort = 0x220, irq = 7 } = {}) {
    this.basePort = basePort & 0xffff;
    this.irq = irq;
    this.selectedVoice = 0;
    this.selectedRegister = 0;
    this.globalRegisters = new Uint16Array(256);
    this.voices = Array.from({ length: 32 }, () => new Uint16Array(256));
    this.sampleRam = new Uint8Array(1024 * 1024);
    this.dramAddress = 0;
    // GF1 Timer 2 is programmed through the board ports at base+8/base+9
    // and its reload lives in global register 47h. The translated startup
    // writes all three before the first tracker IRQ.
    this.timerControl = 0;
    this.timerData = 0;
    this.timer2Running = false;
    this.timer2Pending = false;
    this.timerAccumulator = 0;
    this.irqCount = 0;
    this.sampleWrites = 0;
    this.tickRateHz = 0;
    this.renderedFrames = 0;
    // GF1 current-position registers are 23.9 fixed point. Keep those exact
    // units so fractional increments follow the device's integer arithmetic.
    this.voicePositionFixed = new Uint32Array(32);
    // Used only by spectrum diagnostics; normal playback uses the GF1
    // frequency-control / voice-count formula in voiceIncrementFixed().
    this.voiceUpdateRateOverrideHz = null;
    // Comparison-only alternative for checking the embedded sample format
    // against converted MOD audio. Production playback leaves this unset.
    this.sampleRepresentationOverride = null;
    // GUSEMU32 carries five fractional volume bits while a GF1 ramp runs.
    // Register writes reset this internal accumulator from the visible word.
    this.voiceVolume32 = new Uint32Array(32);
  }

  registerBank() { return this.voices[this.selectedVoice]; }

  writeRegisterByte(offset, byte, runtime) {
    const registers = this.registerBank();
    const previous = registers[this.selectedRegister];
    const value = offset === 0x104 ? ((previous & 0xff00) | byte) : ((previous & 0x00ff) | (byte << 8));
    registers[this.selectedRegister] = value;
    this.globalRegisters[this.selectedRegister] = value;
    if (this.selectedRegister === 0x09) this.voiceVolume32[this.selectedVoice] = value * 32;
    if (this.selectedRegister === 0x43) this.dramAddress = (this.dramAddress & 0xff0000) | value;
    if (this.selectedRegister === 0x44) this.dramAddress = (this.dramAddress & 0x00ffff) | ((value & 0xff00) << 8);
    if (this.selectedRegister === 0x47) this.updateTimer2Rate();
    if (this.selectedRegister === 0x0a || this.selectedRegister === 0x0b) this.voicePositionFixed[this.selectedVoice] = (this.decodeAddress(registers, 0x0a, 0x0b) * 512) >>> 0;
  }

  write8(port, value, runtime) {
    const offset = ((port & 0xffff) - this.basePort) & 0xffff;
    const byte = value & 0xff;
    if (offset === 0x08) { this.timerControl = byte; return true; }
    if (offset === 0x09) {
      this.timerData = byte;
      if (byte & 0x80) this.timer2Pending = false;
      this.timer2Running = (byte & 0x02) !== 0;
      return true;
    }
    if (offset === 0x102) { this.selectedVoice = byte & 0x1f; return true; }
    if (offset === 0x103) { this.selectedRegister = byte; return true; }
    if (offset === 0x104 || offset === 0x105) { this.writeRegisterByte(offset, byte, runtime); return true; }
    if (offset === 0x107) {
      this.sampleRam[this.dramAddress % this.sampleRam.length] = byte;
      this.dramAddress = (this.dramAddress + 1) % this.sampleRam.length;
      this.sampleWrites += 1;
      return true;
    }
    return false;
  }

  // x86 OUT DX,AX is one 16-bit transaction at DX. Treating it as two
  // adjacent 8-bit ports corrupts the GF1 low/high register pair.
  write16(port, value, runtime) {
    const offset = ((port & 0xffff) - this.basePort) & 0xffff;
    if (offset !== 0x104) return false;
    const word = value & 0xffff;
    const registers = this.registerBank();
    registers[this.selectedRegister] = word;
    this.globalRegisters[this.selectedRegister] = word;
    if (this.selectedRegister === 0x47) this.updateTimer2Rate();
    if (this.selectedRegister === 0x09) this.voiceVolume32[this.selectedVoice] = word * 32;
    if (this.selectedRegister === 0x43) this.dramAddress = (this.dramAddress & 0xff0000) | word;
    if (this.selectedRegister === 0x44) this.dramAddress = (this.dramAddress & 0x00ffff) | ((word & 0xff00) << 8);
    if (this.selectedRegister === 0x0a || this.selectedRegister === 0x0b) this.voicePositionFixed[this.selectedVoice] = (this.decodeAddress(registers, 0x0a, 0x0b) * 512) >>> 0;
    return true;
  }

  read8(port) {
    const offset = ((port & 0xffff) - this.basePort) & 0xffff;
    if (offset === 0x06) return this.timer2Pending ? 0x08 : 0;
    if (offset === 0x08) return this.timer2Pending ? 0x20 : 0;
    if (offset === 0 || offset === 0x103 || offset === 0x105) return 0;
    return undefined;
  }

  updateTimer2Rate() {
    const reload = this.globalRegisters[0x47] >>> 8;
    const timerCounts = 256 - reload;
    this.tickRateHz = timerCounts > 0 ? 1 / (timerCounts * 0.00032) : 0;
  }

  timer2CanInterrupt() {
    return this.timer2Running
      && this.timerControl === 0x04
      && (this.timerData & 0x20) === 0
      && (this.globalRegisters[0x45] & 0x0800) !== 0
      && this.tickRateHz > 0;
  }

  secondsUntilIrq() {
    if (!this.timer2CanInterrupt()) return Infinity;
    if (this.timer2Pending) return 0;
    const period = 1 / this.tickRateHz;
    return Math.max(0, period - this.timerAccumulator);
  }

  read16(port) {
    const offset = ((port & 0xffff) - this.basePort) & 0xffff;
    if (offset !== 0x104) return undefined;
    const registers = this.registerBank();
    if (this.selectedRegister === 0x8a || this.selectedRegister === 0x8b) {
      const fixedPosition = this.voicePositionFixed[this.selectedVoice];
      return this.selectedRegister === 0x8a ? fixedPosition >>> 16 : fixedPosition & 0xffff;
    }
    return registers[this.selectedRegister];
  }

  advanceSeconds(runtime, seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('device time must be non-negative');
    if (!this.timer2Running || this.timerControl !== 0x04 || this.tickRateHz <= 0) return 0;
    let remaining = seconds;
    let delivered = 0;
    const dispatchPending = () => {
      if (!this.timer2Pending || !this.timer2CanInterrupt() || !runtime?.cpu?.interruptsEnabled) return false;
      if (runtime?.deliverNativeMusicIrq?.(this) !== true) return false;
      this.irqCount += 1;
      this.timer2Pending = false;
      delivered += 1;
      return true;
    };
    if (this.timer2Pending && !dispatchPending()) {
      const period = 1 / this.tickRateHz;
      this.timerAccumulator = (this.timerAccumulator + remaining) % period;
      return delivered;
    }
    while (remaining > 0) {
      const period = 1 / this.tickRateHz;
      const untilExpiry = Math.max(0, period - this.timerAccumulator);
      if (remaining + Number.EPSILON < untilExpiry) {
        this.timerAccumulator += remaining;
        break;
      }
      remaining = Math.max(0, remaining - untilExpiry);
      this.timerAccumulator = 0;
      this.timer2Pending = true;
      if (!this.timer2CanInterrupt() || !runtime?.cpu?.interruptsEnabled) {
        // Timer expirations continue while IRQs are masked. The pending bit
        // remains set and repeated expirations coalesce into the same status.
        if (remaining > 0) this.timerAccumulator = remaining % (1 / this.tickRateHz);
        break;
      }
      if (!dispatchPending()) {
        if (remaining > 0) this.timerAccumulator = remaining % (1 / this.tickRateHz);
        break;
      }
    }
    return delivered;
  }

  // This inverts the address packing emitted by original 0x1fd84..0x1fd9e.
  decodeAddress(registers, lowRegister, highRegister) {
    return (((registers[lowRegister] << 7) | (registers[highRegister] >>> 9)) >>> 0) % this.sampleRam.length;
  }

  activeVoiceCount() {
    return Math.max(14, ((this.globalRegisters[0x0e] >>> 8) & 0x3f) + 1);
  }

  voiceIncrementFixed(frequency, sampleRate) {
    if (this.voiceUpdateRateOverrideHz !== null) {
      return Math.floor((frequency * this.voiceUpdateRateOverrideHz) / sampleRate);
    }
    // GUSEMU32's GF1 23.9 position increment: FC is scaled from the
    // 44.1-kHz reference, multiplied by (14 >> 1), then divided by the
    // programmed voice count (NumVoices register is count-minus-one).
    const scaledFrequency = Math.floor((frequency * 44100) / sampleRate);
    const programmedVoiceCount = (this.globalRegisters[0x0e] >>> 8 & 0x1f) + 1;
    return Math.floor((scaledFrequency * 7) / programmedVoiceCount);
  }

  renderPcmFrames(_runtime, frames, sampleRate = 44100) {
    if (!Number.isInteger(frames) || frames < 0) throw new RangeError('frame count must be a non-negative integer');
    const out = new Int16Array(frames * 2);
    const programmedVoiceCount = (this.globalRegisters[0x0e] >>> 8 & 0x1f) + 1;
    const lastVoice = Math.min(this.voices.length - 1, programmedVoiceCount - 1);
    for (let frame = 0; frame < frames; frame += 1) {
      let left = 0; let right = 0;
      for (let voiceIndex = 0; voiceIndex <= lastVoice; voiceIndex += 1) {
        const registers = this.voices[voiceIndex];
        let control = registers[0];
        let rampControl = registers[0x0d];
        if (control & 0x0200) control |= 0x0100;
        if (rampControl & 0x0200) rampControl |= 0x0100;
        if ((control & rampControl & 0x0100) !== 0) {
          registers[0] = control;
          registers[0x0d] = rampControl;
          continue;
        }
        const frequency = registers[1];
        const loopEndFixed = this.decodeAddress(registers, 4, 5) * 512;
        const loopStartFixed = this.decodeAddress(registers, 2, 3) * 512;
        let positionFixed = this.voicePositionFixed[voiceIndex];
        let sample0; let sample1;
        if (control & 0x0400) {
          const offset = (((positionFixed >>> 9) & 0xc0000) + (((positionFixed >>> 9) & 0x1ffff) << 1)) % this.sampleRam.length;
          const lo0 = this.sampleRam[offset]; const hi0 = this.sampleRam[(offset + 1) % this.sampleRam.length];
          const lo1 = this.sampleRam[(offset + 2) % this.sampleRam.length]; const hi1 = this.sampleRam[(offset + 3) % this.sampleRam.length];
          sample0 = ((hi0 << 8) | lo0); if (sample0 & 0x8000) sample0 -= 0x10000;
          sample1 = ((hi1 << 8) | lo1); if (sample1 & 0x8000) sample1 -= 0x10000;
        } else {
          const address = (positionFixed >>> 9) % this.sampleRam.length;
          const sampleByte = this.sampleRam[address];
          const nextByte = this.sampleRam[(address + 1) % this.sampleRam.length];
          // fn_20eff cumulatively delta-decodes embedded MOD bytes into GF1
          // DRAM. The GF1 path consumes signed 8-bit PCM; the offset-binary
          // alternative exists only for controlled WAV comparison runs.
          sample0 = this.sampleRepresentationOverride === 'offset-binary'
            ? sampleByte - 128
            : (sampleByte < 0x80 ? sampleByte : sampleByte - 0x100);
          sample1 = this.sampleRepresentationOverride === 'offset-binary'
            ? nextByte - 128
            : (nextByte < 0x80 ? nextByte : nextByte - 0x100);
          sample0 *= 256;
          sample1 *= 256;
        }
        const fraction = positionFixed & 0x1ff;
        const volume32 = this.voiceVolume32[voiceIndex] || registers[0x09] * 32;
        const volume = gf1VolumeLevel(volume32);
        const mixed0 = (((sample0 * volume) >> 16) * (512 - fraction)) / 512;
        const mixed1 = (((sample1 * volume) >> 16) * fraction) / 512;
        const sample = Math.trunc(mixed0) + Math.trunc(mixed1);
        const pan = (registers[0x0c] >>> 8) & 0x0f;
        right = wrap16(right + ((sample * pan) >> 4));
        left = wrap16(left + ((sample * (15 - pan)) >> 4));

        let rampIncrement = gf1VolumeIncrement32(registers[0x06], sampleRate, programmedVoiceCount);
        if (rampControl & 0x4000) rampIncrement = -rampIncrement;
        let currentVolume32 = volume32;
        if (!(rampControl & 0x0100)) {
          currentVolume32 += rampIncrement;
          const startVolume32 = (registers[0x07] & 0xff00) * 32;
          const endVolume32 = (registers[0x08] & 0xff00) * 32;
          const crossedBoundary = (rampControl & 0x4000) ? currentVolume32 <= startVolume32 : currentVolume32 >= endVolume32;
          if (crossedBoundary) {
            if (rampControl & 0x2000) rampControl |= 0x8000;
            if (rampControl & 0x0800) {
              if (rampControl & 0x1000) {
                rampControl ^= 0x4000;
                rampIncrement = -rampIncrement;
              } else currentVolume32 = (rampControl & 0x4000) ? endVolume32 : startVolume32;
            } else {
              rampControl |= 0x0100;
              currentVolume32 = (rampControl & 0x4000) ? startVolume32 : endVolume32;
            }
          }
        }
        if ((rampControl & 0xa000) !== 0xa000) rampControl &= 0x7f00;
        this.voiceVolume32[voiceIndex] = Math.max(0, currentVolume32) >>> 0;
        registers[0x09] = Math.floor(this.voiceVolume32[voiceIndex] / 32) & 0xffff;
        registers[0x0d] = rampControl;

        if (!(control & 0x0100)) {
          let increment = this.voiceIncrementFixed(frequency, sampleRate);
          if (control & 0x4000) increment = -increment;
          positionFixed = (positionFixed + increment) >>> 0;
          if ((control & 0x4000) ? positionFixed <= loopStartFixed : positionFixed >= loopEndFixed) {
            if (control & 0x2000) control |= 0x8000;
            if (control & 0x0800) {
              if (control & 0x1000) {
                control ^= 0x4000;
              } else positionFixed = (control & 0x4000) ? loopEndFixed : loopStartFixed;
            } else if (!(rampControl & 0x0400)) control |= 0x0100;
          }
        }
        this.voicePositionFixed[voiceIndex] = positionFixed;
        registers[0] = control;
      }
      out[frame * 2] = left;
      out[frame * 2 + 1] = right;
    }
    this.renderedFrames += frames;
    return out;
  }

  snapshot() {
    return { basePort: this.basePort, irq: this.irq, tickRateHz: this.tickRateHz,
      timer2: { control: this.timerControl, data: this.timerData, running: this.timer2Running,
        irqEnabled: (this.globalRegisters[0x45] & 0x0800) !== 0,
        reload: this.globalRegisters[0x47] >>> 8, pending: this.timer2Pending,
        elapsedSeconds: this.timerAccumulator },
      irqCount: this.irqCount, sampleWrites: this.sampleWrites, dramAddress: this.dramAddress,
      renderedFrames: this.renderedFrames };
  }
}
