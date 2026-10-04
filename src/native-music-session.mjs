// Host audio sink for Nation0's translated embedded-MOD path. Standalone
// diagnostic runs can create a fresh runtime; integrated playback attaches to
// the existing runNation0 runtime and never creates another program state.

import { createNation0Runtime } from './main.mjs';
import { fn_20ce7, fn_20b08, fn_209f8 } from './startup.mjs';
import { readNation0TrackerState } from './music-tracker.mjs';
import { fn_17cc } from './runtime-audio-callbacks.mjs';
import { fn_17a6 } from './dos-vector-targets.mjs';
import { fn_210ef } from './environment.mjs';
import { initializeDpmiHostIrqVectors } from './dpmi-host-irq-vectors.mjs';
import { initializeAudioMemoryBootstrap } from './audio-memory-bootstrap.mjs';
import { initializeStartupUltrasoundEnvironment } from './startup-dos-environment.mjs';
import { nation0MusicEmbedding, parseMusicMod } from './music-module.mjs';
import { FixedSbPic8259 } from './fixed-sb-pic8259.mjs';
import { NativeMusicIrqRouter } from './native-music-irq.mjs';

function embeddedNation0Mod(executableBytes) {
  const { executableOffset } = nation0MusicEmbedding;
  if (executableBytes.length < executableOffset + 1084) throw new RangeError('NATION0.EXE is too short for its embedded MOD header');
  const header = executableBytes.subarray(executableOffset, executableOffset + 1084);
  const songLength = header[950];
  const patternCount = Math.max(...header.subarray(952, 952 + songLength)) + 1;
  let sampleBytes = 0;
  for (let sample = 0; sample < 31; sample += 1) sampleBytes += ((header[20 + sample * 30 + 22] << 8) | header[20 + sample * 30 + 23]) * 2;
  const byteLength = 1084 + patternCount * 64 * 4 * 4 + sampleBytes;
  return parseMusicMod(executableBytes.slice(executableOffset, executableOffset + byteLength));
}

export class NativeMusicSession {
  constructor({ executableBytes, sampleRate = 44100, runtime: sharedRuntime = null } = {}) {
    if (!(executableBytes instanceof Uint8Array)) throw new TypeError('NativeMusicSession requires original/NATION0.EXE bytes');
    this.embeddedMod = embeddedNation0Mod(executableBytes);
    this.sampleRate = sampleRate;
    this.ownsRuntime = sharedRuntime === null;
    this.runtime = sharedRuntime ?? createNation0Runtime({ memorySize: 0x400000 });
    const { memory } = this.runtime;
    if (this.ownsRuntime) {
      // Standalone spectrum diagnostics get a fresh translated runtime from
      // the executable image. The browser player instead supplies the live
      // startup runtime below, so graphics and audio share its program state.
      const runtimeImageOffset = 0x0f00;
      for (let offset = runtimeImageOffset; offset < executableBytes.length; offset += 1) {
        memory.write8(offset - runtimeImageOffset, executableBytes[offset]);
      }
      const { runtimeOffset } = nation0MusicEmbedding;
      for (let index = 0; index < this.embeddedMod.byteLength; index += 1) {
        if (memory.read8(runtimeOffset + index) !== executableBytes[nation0MusicEmbedding.executableOffset + index]) throw new Error(`Embedded MOD runtime mapping differs at byte ${index}`);
      }
      this.runtime.segments.csSelector = 0x08;
      this.runtime.segments.dsSelector = 0x10;
      this.runtime.segments.esSelector = 0x10;
      this.runtime.segments.fsSelector = 0x10;
      this.runtime.segments.ssSelector = 0x10;
      this.runtime.segments.dsBase = 0;
      this.runtime.segments.esBase = 0;
      this.runtime.segments.fsBase = 0;
      this.audioMemoryBootstrap = initializeAudioMemoryBootstrap(this.runtime, executableBytes);
      initializeDpmiHostIrqVectors(this.runtime);
      this.ultrasoundEnvironment = initializeStartupUltrasoundEnvironment(this.runtime);
      fn_210ef(this.runtime);
      if (this.runtime.cpu.carry) throw new Error('Translated fn_210ef did not find the configured ULTRASND environment');
      fn_20ce7(this.runtime);
      fn_20b08(this.runtime, {
        callDosVector: (vector, target, host) => {
          if (vector === 0x28 && target === 0x08cc) return fn_17cc(host);
          if (vector === 0x24 && target === 0x08a6) return fn_17a6(host);
          throw new Error(`Unresolved original DOS vector ${vector.toString(16)}h target 0x${target.toString(16)}`);
        },
      });
      fn_209f8(this.runtime);
    } else {
      this.ultrasoundEnvironment = this.runtime.startupDosEnvironment;
      if (memory.read8(0x1eb70) !== 1 || memory.read16(0x1fc04) !== 0x220 || memory.read16(0x1fc06) !== 7) {
        throw new Error('Shared runtime has not completed the original ULTRASND/GUS setup path');
      }
      if (this.runtime.nativeMusic.sampleWrites !== this.embeddedMod.sampleBytes
        || !this.runtime.nativeMusic.timer2CanInterrupt()) {
        throw new Error('Shared runtime has not completed embedded sample upload and GF1 Timer 2 initialization');
      }
    }
    if (!this.ownsRuntime && (memory.read8(0x1d500) !== 1 || memory.read16(0x1e424) !== this.embeddedMod.channels)) {
      throw new Error('Shared runtime lacks the translated embedded-module/channel initialization state');
    }
    this.runtime.pic8259 ??= new FixedSbPic8259(this.runtime);
    this.runtime.nativeMusicIrqRouter ??= new NativeMusicIrqRouter(this.runtime);
    this.runtime.onNativeMusicIrq = (host, device) => host.nativeMusicIrqRouter.deliver(device);
  }

  renderFrames(frameCount) {
    if (!Number.isInteger(frameCount) || frameCount < 0) throw new RangeError('frame count must be a non-negative integer');
    const output = new Int16Array(frameCount * 2);
    const device = this.runtime.nativeMusic;
    let frameOffset = 0;
    while (frameOffset < frameCount) {
      const secondsToIrq = device.secondsUntilIrq();
      if (!Number.isFinite(secondsToIrq)) throw new Error('Translated GUS Timer 2 is not configured to deliver tracker IRQs');
      const framesToMusicIrq = Math.max(1, Math.ceil(secondsToIrq * this.sampleRate));
      const frames = Math.min(frameCount - frameOffset, framesToMusicIrq);
      output.set(device.renderPcmFrames(this.runtime, frames, this.sampleRate), frameOffset * 2);
      device.advanceSeconds(this.runtime, frames / this.sampleRate);
      frameOffset += frames;
    }
    return output;
  }

  snapshot() {
    return {
      sampleRate: this.sampleRate,
      embeddedModule: { title: this.embeddedMod.title, byteLength: this.embeddedMod.byteLength },
      integration: {
        path: this.ownsRuntime
          ? 'ULTRASND parser -> embedded MOD loader -> translated GUS/GF1 setup -> translated tracker handler'
          : 'same runNation0 runtime: translated GUS setup -> GF1 Timer 2 -> installed IRQ7 IDT gate -> shared PIC -> translated handler',
        runtimeOwnership: this.ownsRuntime ? 'standalone-diagnostic' : 'shared-startup-runtime',
        environment: this.ultrasoundEnvironment.record,
        selectedDeviceFlag: this.runtime.memory.read8(0x1eb70),
        basePort: this.runtime.memory.read16(0x1fc04),
        irq: this.runtime.memory.read16(0x1fc06),
        originalGusSetupExecuted: true,
        soundBlasterSetupExecuted: false,
      },
      interruptsEnabled: this.runtime.cpu.interruptsEnabled,
      nativeIrqRouter: this.runtime.nativeMusicIrqRouter.snapshot(),
      masterPic: this.runtime.pic8259.snapshot(),
      nativeDevice: this.runtime.nativeMusic.snapshot(),
      tracker: readNation0TrackerState(this.runtime),
    };
  }
}
