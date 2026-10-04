import { CpuState } from './core/cpu.mjs';
import { PortIo } from './core/io.mjs';
import { SoundBlasterDevice } from './sound-blaster-device.mjs';
import { NativeMusicDevice } from './native-music-device.mjs';
import { Memory } from './core/memory.mjs';
import { Timing } from './core/timing.mjs';
import { VgaState } from './core/vga.mjs?v=2026-10-03-r16';
import { RuntimeEventQueue } from './core/events.mjs';
import { fn_21cd9 } from './startup-dispatcher.mjs';
import { fn_6bd04 } from './record-not-found.mjs';
import { applyFixedSoundBlasterConfiguration } from './fixed-sound-blaster-config.mjs';
import { initializeDpmiHostIrqVectors } from './dpmi-host-irq-vectors.mjs';
import { fn_65897 } from './fn-65897.mjs';
import { fn_65929 } from './fn-65929.mjs';
import { fn_6bd2f } from './dispatch-wrapper.mjs';
import { fn_210ef } from './environment.mjs';
import { InterruptRouter, loadSegmentSelector } from './runtime-adapters.mjs';
import { fn_1189 } from './allocator.mjs';
import { fn_1295 } from './dos-slots.mjs';
import { fn_209f8, fn_20b08, fn_20ce7 } from './startup.mjs';
import { fn_2137f, fn_21b86, fn_21b70, fn_21701, fn_212f6, fn_211f4 } from './phase-helper.mjs';
import { fn_2150f, fn_2157e } from './table-expansion.mjs';
import { fn_6bd3f, fn_6bd20 } from './dispatch-wrapper.mjs';
import { fn_21b9a } from './dos-vector-setup.mjs';
import { fn_21be2, fn_21cc8 } from './mouse-vector.mjs';
import { fn_17cc, fn_6caf0, fn_6cc70 } from './runtime-audio-callbacks.mjs';
import { fn_17a6, fn_1816 } from './dos-vector-targets.mjs';
import { fn_6ce24, fn_6cf26, fn_6cf53 } from './timing-callback.mjs';
import { fn_6d03b } from './runtime-scale-callback.mjs';
import { handleDpmiVirtualInterrupt } from './dpmi-virtual-interrupts.mjs';
import { handleDpmiRealModeInterrupt } from './dpmi-real-mode-interrupts.mjs';
import { fn_21aea } from './descriptor-setup.mjs';
import { fn_2124f } from './dispatch-buffer-setup.mjs';
import { fn_21c6f } from './buffer-expansion.mjs';
import { fn_5efd7 } from './render-loop.mjs';
import { fn_5f540 } from './vga-initialization.mjs';
import { fn_5fbf5 } from './palette-animation.mjs';
import { fn_38346, fn_38351 } from './cube-entry.mjs';
import { fn_380e8 } from './cube-controller.mjs';
import { fn_64e60 } from './triangle-fill.mjs';
import { push32, pop32 } from './core/stack-effects.mjs';
import { fn_6098c } from './fn-6098c.mjs';
import { fn_61a47 } from './cube-scene-controller.mjs?v=2026-10-03-r16';
import { fn_61a06 } from './cube-scene-helpers.mjs';
import { fn_3d5d9 } from './dispatcher-3d5d9.mjs';
import { fn_5f48d } from './palette-vga-buffer.mjs';
import { fn_3e1f0 } from './dispatcher-3e1f0.mjs';
import { fn_6424a } from './fn-6424a.mjs';
import { runFn332b6TranslatedEntry } from './cube-rasterizer-resume.mjs';
import { fn_3bfb0 } from './fn-3bfb0.mjs';
import { fn_3718d } from './fn-3718d.mjs';
import { fn_3c124 } from './dispatcher-3c124.mjs';
import { fn_602e4 } from './dispatcher-602e4.mjs';
import { fn_5ff2f } from './dispatcher-5ff2f.mjs';
import { fn_20a53 } from './hardware-setup.mjs';
import { fn_1fc16 } from './music-tracker.mjs';

export class Nation0Runtime {
  constructor({ memorySize, gsMemorySize, soundBlasterDevice, nativeMusicDevice } = {}) {
    this.memory = new Memory(memorySize);
    this.segments = {
      esSelector: null, esBase: null,
      fsSelector: null, fsBase: null,
      gsSelector: null, gsBase: null,
      ssSelector: null, ssBase: null,
    };
    // Runtime-only descriptor cache for selectors created through the
    // translated fn_1816 descriptor writer. Values are recorded from that
    // original call's EDX base argument, not seeded as game output state.
    this.hostSelectorBases = new Map();
    // The original routines use GS for DOS-owned state.  Keep that address
    // space separate from translated program memory until its exact layout is
    // recovered, rather than silently mapping it to a browser abstraction.
    this.gsMemory = new Memory(gsMemorySize ?? 1024 * 1024);
    this.cpu = new CpuState();
    this.io = new PortIo();
    // The fixed integration configuration always includes a Sound Blaster at
    // 0x220/IRQ7.  This device is only the hardware boundary; translated code
    // remains responsible for initialization, DMA blocks, and callbacks.
    this.soundBlaster = soundBlasterDevice ?? new SoundBlasterDevice();
    this.nativeMusic = nativeMusicDevice ?? new NativeMusicDevice();
    this.vga = new VgaState();
    // Keep RAM observable to source lifts, and separately apply original VGA
    // aperture writes to the Mode X device planes.  The base is the same
    // DS:[0x18] relocation adjustment used by the translated instructions.
    this.memory.onWrite = (address, value, width = 1) => {
      // All known program mappings keep the 64 KiB VGA aperture above
      // 0x90000. Avoid an extra DS:[0x18] load for the overwhelmingly common
      // ordinary program-memory write in raster and tracker loops.
      if (address + width <= 0x90000 || address >= 0xb0000) return;
      const videoBase = (0xa0000 - this.memory.read32(0x18)) >>> 0;
      const first = Math.max(address, videoBase);
      const end = Math.min(address + width, videoBase + 0x10000);
      for (let current = first; current < end; current += 1) {
        const byteIndex = current - address;
        this.vga.writeAperture(current - videoBase, (value >>> (byteIndex * 8)) & 0xff);
      }
    };
    this.timing = new Timing();
    this.events = new RuntimeEventQueue();
    this.interrupts = new InterruptRouter();
  }

  in8(port) {
    const key = port & 0xffff;
    const soundValue = this.soundBlaster?.read8(key);
    if (soundValue !== undefined) return soundValue;
    const musicValue = this.nativeMusic?.read8(key);
    if (musicValue !== undefined) return musicValue;
    const picValue = this.pic8259?.readPort(key);
    if (picValue !== null && picValue !== undefined) return picValue;
    const irqPort = this.irq0Clock?.readPort(key);
    if (irqPort !== null && irqPort !== undefined) return irqPort;
    if (key === 0x3da && this.vga.retraceProgression) {
      this.functionCoverage?.noteExternal('synthetic-hardware', { device: 'VGA', port: '0x3da', model: 'retrace-bit-3-low-high-low-cycle' }, this.vga.retraceProgression.provenance);
    }
    return this.vga.readPort(key, this.io.in8(key));
  }
  in16(port) {
    const key = port & 0xffff;
    const musicValue = this.nativeMusic?.read16?.(key);
    if (musicValue !== undefined) return musicValue & 0xffff;
    return this.in8(key) | (this.in8((key + 1) & 0xffff) << 8);
  }
  configureSyntheticRetrace(options = {}) { this.vga.configureRetraceProgression(options); }
  out8(port, value) {
    const key = port & 0xffff;
    const byte = value & 0xff;
    this.soundBlaster?.write8(key, byte);
    this.nativeMusic?.write8(key, byte, this);
    this.pic8259?.writePort(key, byte);
    this.irq0Clock?.writePort(key, byte);
    this.io.out8(key, byte);
    this.vga.writePort(key, byte);
  }
  out16(port, value) {
    this.soundBlaster?.write8(port & 0xffff, value & 0xff);
    this.soundBlaster?.write8((port + 1) & 0xffff, value >>> 8);
    const nativeHandled = this.nativeMusic?.write16?.(port & 0xffff, value & 0xffff, this);
    if (!nativeHandled) {
      this.nativeMusic?.write8(port & 0xffff, value & 0xff, this);
      this.nativeMusic?.write8((port + 1) & 0xffff, value >>> 8, this);
    }
    this.io.out16(port, value);
    this.vga.writePort(port & 0xffff, value);
    this.vga.writePort((port + 1) & 0xffff, value >>> 8);
  }
  frameCheckpoint(checkpoint) { return this.events.advance(this, checkpoint); }
  hardwareCheckpoint(checkpoint) { return this.events.advance(this, checkpoint); }
  interrupt(vector, context) { return this.interrupts.invoke(vector, this, context); }
  deliverSoundBlasterIrq7(device = this.soundBlaster) {
    if (typeof this.onSoundBlasterIrq7 !== 'function') return false;
    if (this.pic8259) {
      return this.pic8259.requestMasterIrq(device.irq, irq => {
        if (irq !== device.irq) throw new Error(`Sound Blaster IRQ${device.irq} dispatched as IRQ${irq}`);
        return this.onSoundBlasterIrq7(this, device) !== false;
      });
    }
    return this.onSoundBlasterIrq7(this, device) !== false;
  }
  servicePendingPicInterrupts() {
    if (!this.pic8259 || typeof this.onSoundBlasterIrq7 !== 'function') return { delivered: false, pending: false };
    return this.pic8259.servicePending(irq => {
      if (irq !== this.soundBlaster.irq) throw new Error(`No translated handler installed for master PIC IRQ${irq}`);
      return this.onSoundBlasterIrq7(this, this.soundBlaster) !== false;
    });
  }
  deliverNativeMusicIrq(device = this.nativeMusic) {
    if (typeof this.onNativeMusicIrq === 'function') return this.onNativeMusicIrq(this, device) === true;
    return this.nativeMusicIrqRouter?.deliver(device) === true;
  }
  readGs8(address) { return this.gsMemory.read8(address); }
  readGs16(address) { return this.gsMemory.read16(address); }
  readGs32(address) { return this.gsMemory.read32(address); }
  writeGs32(address, value) { this.gsMemory.write32(address, value); }
  readEs8(offset) {
    if (this.segments.esBase === null) throw new Error('ES base is unresolved');
    return this.memory.read8(this.segments.esBase + offset);
  }
  readSs8(offset) {
    if (this.segments.ssBase === null) throw new Error('SS base is unresolved');
    return this.memory.read8(this.segments.ssBase + offset);
  }
  exchangeGs32(address, value) {
    const previous = this.gsMemory.read32(address);
    this.gsMemory.write32(address, value);
    return previous;
  }
  writeEs8(offset, value) {
    if (this.segments.esBase === null) throw new Error('ES base is unresolved');
    this.memory.write8(this.segments.esBase + offset, value);
  }
  writeEs16(offset, value) {
    if (this.segments.esBase === null) throw new Error('ES base is unresolved');
    this.memory.write16(this.segments.esBase + offset, value);
  }
  writeEs32(offset, value) {
    if (this.segments.esBase === null) throw new Error('ES base is unresolved');
    this.memory.write32(this.segments.esBase + offset, value);
  }
}

export function createNation0Runtime(options) {
  return new Nation0Runtime(options);
}

export function runNation0(runtime, dispatcherAdapters = {}) {
  runtime.translatedInterruptHandlers ??= new Map();
  // The translated DPMI vector writer in the next original scene can replace
  // IRQ0's gate target with this scene-specific timer handler.
  runtime.translatedInterruptHandlers.set(0x60b06, host => fn_61a06(host));
  // Model the DPMI host's IRQ7 vector table before the original startup/audio
  // path calls fn_17a6/fn_17cc. The app still installs its own gate normally.
  initializeDpmiHostIrqVectors(runtime, { seedIrq0Gate: true });
  // INT 33h is this executable's protected-to-real-mode DOS/BIOS gateway,
  // not a mouse service: its handler forwards AL as the real-mode vector.
  if (!runtime.interrupts.handlers.has(0x33)) {
    runtime.interrupts.register(0x33, handleDpmiRealModeInterrupt);
  }
  // The original transfer at 0x1184 is a direct jump into the startup dispatcher.
  const interrupt33 = dispatcherAdapters.interrupt33
    ?? ((vector, host, context) => host.interrupt(vector, context));
  const interrupt31 = dispatcherAdapters.interrupt31
    ?? ((host, context) => host.interrupt(0x31, context));
  const callDosVector = dispatcherAdapters.callDosVector
    ?? ((vector, target, host) => {
      if (vector === 0x24 && target === 0x08a6) return fn_17a6(host);
      if (vector === 0x28 && target === 0x08cc) return fn_17cc(host);
      if (vector === 0x30 && target === 0x0916) {
        const selector = host.cpu.get('eax') & 0xffff;
        const linearBase = host.cpu.get('edx') >>> 0;
        const result = fn_1816(host);
        host.hostSelectorBases.set(selector, linearBase);
        return result;
      }
      throw new Error(`Unresolved DOS vector [0x${vector.toString(16)}] target 0x${target.toString(16)}`);
    });
  const callDosVector28 = dispatcherAdapters.callDosVector28
    ?? ((target, host, context = {}) => {
      if (typeof dispatcherAdapters.callDosVector === 'function') {
        return dispatcherAdapters.callDosVector(0x28, target, host, context);
      }
      if (target === 0x08cc) return fn_17cc(host);
      throw new Error(`Unresolved [DS:0x28] target 0x${target.toString(16)} at 0x${(context.callSite ?? 0).toString(16)}`);
    });
  const audioAdapters = {
    interrupt31: dispatcherAdapters.interrupt31 ?? handleDpmiVirtualInterrupt,
    portIn8: dispatcherAdapters.portIn8 ?? ((host, port) => host.in8(port)),
    portOut8: dispatcherAdapters.portOut8 ?? ((host, port, value) => host.out8(port, value)),
    callDs24: dispatcherAdapters.callDs24 ?? ((target, host) => {
      if (target === 0x08a6) return fn_17a6(host);
      throw new Error(`Unresolved original DS:[0x24] target 0x${target.toString(16)}`);
    }),
    callDs28: dispatcherAdapters.callDs28 ?? ((target, host, context) => callDosVector28(target, host, context)),
    callDosVector28,
    writeEs8: dispatcherAdapters.writeEs8 ?? ((host, offset, value) => host.writeEs8(offset, value)),
    writeEs16: dispatcherAdapters.writeEs16 ?? ((host, offset, value) => host.writeEs16(offset, value)),
    writeES8: dispatcherAdapters.writeES8 ?? dispatcherAdapters.writeEs8
      ?? ((host, offset, value) => host.writeEs8(offset, value)),
    gsExchange32: dispatcherAdapters.gsExchange32
      ?? ((host, offset, value) => host.exchangeGs32(offset, value)),
    in8: dispatcherAdapters.in8 ?? dispatcherAdapters.portIn8
      ?? ((host, port) => host.in8(port)),
    out8: dispatcherAdapters.out8 ?? dispatcherAdapters.portOut8
      ?? ((host, port, value) => host.out8(port, value)),
    callDS28: dispatcherAdapters.callDS28
      ? (host, target, context) => dispatcherAdapters.callDS28(host, target, context)
      : (host, target, context) => callDosVector28(target, host, context),
  };
  const callIndirect = dispatcherAdapters.callIndirect
    ?? ((target, host, context = {}) => {
      if (target === 0x6bd70) {
        return fn_6cc70(host, audioAdapters);
      }
      if (target === 0x6bbf0) {
        return fn_6caf0(host, audioAdapters);
      }
      if (target === 0x6c026) {
        return fn_6cf26(host, audioAdapters);
      }
      if (target === 0x6c053) {
        return fn_6cf53(host, audioAdapters);
      }
      if (target === 0x6bf24) {
        return fn_6ce24(host, audioAdapters);
      }
      if (target === 0x6c13b) return fn_6d03b(host);
      throw new Error(`Unresolved indirect callback target 0x${target.toString(16)} at ${context.callSite === undefined ? 'unknown call site' : `0x${context.callSite.toString(16)}`}`);
    });
  const functions = {
    0x1189: fn_1189,
    0x1fc16: fn_1fc16,
    0x1295: fn_1295,
    0x210ef: fn_210ef,
    0x21b9a: fn_21b9a,
    0x21be2: fn_21be2,
    0x21cc8: fn_21cc8,
    0x21701: fn_21701,
    0x21aea: fn_21aea,
    0x212f6: fn_212f6,
    0x211f4: fn_211f4,
    0x2124f: fn_2124f,
    0x21c6f: fn_21c6f,
    0x209f8: fn_209f8,
    0x20b08: fn_20b08,
    0x20ce7: fn_20ce7,
    0x2137f: fn_2137f,
    0x2150f: fn_2150f,
    0x2157e: fn_2157e,
    0x21b86: fn_21b86,
    0x6bd3f: fn_6bd3f,
    0x6bd20: fn_6bd20,
    // The final integrated path has a fixed original hardware selection.  It
    // replaces only menu input; 0x6bd04 and all selected audio callbacks stay
    // on their original translated route.
    0x6bc28: applyFixedSoundBlasterConfiguration,
    0x6bd04: fn_6bd04,
    0x6bd2f: fn_6bd2f,
    0x5efd7: fn_5efd7,
    0x21b70: fn_21b70,
    0x5f540: fn_5f540,
    0x5fbf5: fn_5fbf5,
    0x38351: fn_38351,
    0x6098c: fn_6098c,
    0x61a47: fn_61a47,
    0x3d5d9: fn_3d5d9,
    0x5f48d: fn_5f48d,
    0x3e1f0: fn_3e1f0,
    0x6424a: fn_6424a,
    0x3c124: fn_3c124,
    0x602e4: fn_602e4,
    0x5ff2f: fn_5ff2f,
    0x20a53: fn_20a53,
    ...dispatcherAdapters.functions,
  };
  const commonRecordAdapters = {
    interrupt33,
    // Record callbacks receive (runtime, offset, value). Keep that ABI when
    // adapting the runtime's two-argument ES helpers; binding the methods
    // directly would shift the runtime object into the address parameter.
    writeEs8: dispatcherAdapters.writeEs8 ?? ((host, offset, value) => host.writeEs8(offset, value)),
    writeEs32: dispatcherAdapters.writeEs32 ?? ((host, offset, value) => host.writeEs32(offset, value)),
    tailJump: dispatcherAdapters.tailJump,
    callIndirect,
  };
  const callCubeEvent = (host, { target, eventAddress }) => {
    if (target === 0x3b0b0 && host.memory.read32(eventAddress + 2) === target) {
      fn_3bfb0(host);
      return;
    }
    if (target === 0x3628d && host.memory.read32(eventAddress + 2) === target) {
      fn_3718d(host);
      return;
    }
    if (target !== 0x37446 || host.memory.read32(eventAddress + 2) !== target) {
      throw new Error(`Unresolved cube event callback 0x${target.toString(16)} at DS:0x${eventAddress.toString(16)}`);
    }
    push32(host, 0x36726);
    fn_38346(host);
    if (pop32(host) !== 0x36726) throw new Error('Cube event callback return changed');
  };
  const runCubeController = host => {
    const result = fn_380e8(host, {
      process64e60: (_cursor, _remaining, rt) => fn_64e60(rt),
      resolveFsSelector: (selector, rt) => rt.hostSelectorBases.get(selector)
        ?? (selector === rt.segments.fsSelector ? rt.segments.fsBase : undefined),
      processFsRecord: (_cursor, _remaining, rt) => {
        rt.translatedPc = 0x323b6;
        const result = runFn332b6TranslatedEntry(rt);
        if (!result.returned) {
          throw new Error(`Translated fn_332b6 did not return to 0x370e1: ${JSON.stringify({ edge: result.edge?.stop, translatedPc: rt.translatedPc })}`);
        }
      },
      callEventHandler: callCubeEvent,
    });
    dispatcherAdapters.functionAdapters?.[0x38351]?.afterController?.(host);
    return result;
  };
  const functionAdapters = {
    0x20b08: { callDosVector },
    0x21aea: {
      callDosVector: dispatcherAdapters.functionAdapters?.[0x21aea]?.callDosVector ?? callDosVector,
      resolveEsSelector: dispatcherAdapters.resolveEsSelector
        ?? ((selector, host) => host.hostSelectorBases.get(selector)),
      fsSelector: dispatcherAdapters.fsSelector,
      fsBase: dispatcherAdapters.fsBase,
      resolveFsSelector: dispatcherAdapters.resolveFsSelector
        ?? ((selector, host) => host.hostSelectorBases.get(selector)),
      ...dispatcherAdapters.functionAdapters?.[0x21aea],
    },
    0x21b70: { loadEsFromCs: dispatcherAdapters.loadEsFromCs, ...dispatcherAdapters.functionAdapters?.[0x21b70] },
    0x5efd7: {
      interrupt33: (host) => interrupt33(0x33, host),
      allocationFailure: dispatcherAdapters.allocationFailure,
      hardwareCheckpoint: (host, checkpoint) => host.hardwareCheckpoint(checkpoint),
      ...dispatcherAdapters.functionAdapters?.[0x5efd7],
    },
    0x5f540: {
      callInterrupt: interrupt33,
      ...dispatcherAdapters.functionAdapters?.[0x5f540],
    },
    0x5fbf5: {
      hardwareCheckpoint: (host, checkpoint) => host.hardwareCheckpoint(checkpoint),
      ...dispatcherAdapters.functionAdapters?.[0x5fbf5],
    },
    0x6bd20: { callIndirect, ...dispatcherAdapters.functionAdapters?.[0x6bd20] },
    0x21b9a: { callDosVector },
    0x21be2: { callInterrupt: interrupt33 },
    0x21cc8: { callInterrupt: interrupt33 },
    0x6bc28: commonRecordAdapters,
    0x6bd04: {
      ...commonRecordAdapters,
      call65897: dispatcherAdapters.call65897 ?? ((rt) => fn_65897(rt, commonRecordAdapters)),
    },
    0x6bd2f: {
      processRecord: dispatcherAdapters.processRecord
        ?? ((pointer, rt) => fn_65929(rt, {
          callSelectedTarget: dispatcherAdapters.callSelectedTarget,
          dispatchJumpTable: dispatcherAdapters.dispatchJumpTable,
        })),
    },
    ...dispatcherAdapters.functionAdapters,
    0x6098c: {
      writeEs8: (host, offset, value) => host.writeEs8(offset, value),
      writeEs32: (host, offset, value) => host.writeEs32(offset, value),
      writeSs32: (host, offset, value) => {
        if (!Number.isInteger(host.segments.ssBase)) throw new Error('fn_6098c requires an explicit SS base');
        const address = host.segments.ssBase + (offset >>> 0);
        host.memory.write32(address, value >>> 0);
      },
      readSs16: (offset, host) => {
        if (!Number.isInteger(host.segments.ssBase)) throw new Error('fn_6098c requires an explicit SS base');
        return host.memory.read16(host.segments.ssBase + (offset >>> 0));
      },
      interrupt33: (vector, host) => interrupt33(vector, host),
      readLookupByte: (address, host) => {
        const lookupBase = 0x12345678;
        const index = (address - lookupBase) >>> 0;
        if (index > 0xffff) throw new RangeError(`fn_6098c lookup read escaped its 64-KiB patched table at 0x${address.toString(16)}`);
        const table = host.memory.read32(0x5fa84);
        if (table === 0 || table !== host.memory.read32(0x5ffb0) || table !== host.memory.read32(0x5ffc4)) {
          throw new Error('fn_6098c live lookup operands do not resolve to the allocated 0x5fa84 texture table');
        }
        return host.memory.read8(table + index);
      },
      frameCheckpoint: (host, checkpoint) => host.frameCheckpoint(checkpoint),
      ...dispatcherAdapters.functionAdapters?.[0x6098c],
    },
    0x61a47: {
      callDosVector30: host => {
        const target = host.memory.read32(0x30);
        return callDosVector(0x30, target, host);
      },
      callDosVector28: host => callDosVector28(host.memory.read32(0x28), host),
      callInterrupt33: (host, vector) => interrupt33(vector, host),
      loadFsSelector: (host, selector) => loadSegmentSelector(
        host,
        'fs',
        selector,
        value => host.hostSelectorBases.get(value),
      ),
      timerInterruptCheckpoint: dispatcherAdapters.timerInterruptCheckpoint
        ?? (host => host.hardwareCheckpoint(0x61a93)),
      inPort: (host, port) => host.in8(port),
      outPort: (host, port, value) => host.out8(port, value),
      outPort16: (host, port, value) => host.out16(port, value),
      writeEs32: (host, offset, value) => host.writeEs32(offset, value),
      readFs8: (host, offset) => {
        if (!Number.isInteger(host.segments.fsBase)) throw new Error('fn_61a47 requires a resolved FS base');
        return host.memory.read8(host.segments.fsBase + (offset >>> 0));
      },
      allocationFailure: () => { throw new Error('fn_61a47 reached the original allocation-failure branch'); },
      ...dispatcherAdapters.functionAdapters?.[0x61a47],
    },
    0x3d5d9: {
      interrupt33: (host, vector) => interrupt33(vector, host),
      hardwareCheckpoint: (host, checkpoint) => host.hardwareCheckpoint(checkpoint),
      resolveSelectorBase: (host, selector) => {
        const key = selector & 0xffff;
        const allocated = host.hostSelectorBases.get(key);
        if (Number.isInteger(allocated)) return allocated >>> 0;
        for (const name of ['es', 'fs', 'gs', 'ss', 'ds', 'cs']) {
          if ((host.segments[`${name}Selector`] & 0xffff) !== key) continue;
          const base = host.segments[`${name}Base`];
          if (Number.isInteger(base)) return base >>> 0;
          // The startup image is normalized to flat CS/DS bases at zero.
          if (name === 'cs' || name === 'ds') return 0;
        }
        return undefined;
      },
      loadFsSelector: (host, selector) => loadSegmentSelector(
        host, 'fs', selector, value => functionAdapters[0x3d5d9].resolveSelectorBase(host, value),
      ),
      loadGsSelector: (host, selector) => loadSegmentSelector(
        host, 'gs', selector, value => value === 0x18
          ? 0 // Startup's original GS selector addresses the DOS-owned GS memory object.
          : functionAdapters[0x3d5d9].resolveSelectorBase(host, value),
      ),
      getGsSelector: host => host.segments.gsSelector,
      readFs8: (host, offset) => {
        if (!Number.isInteger(host.segments.fsBase)) throw new Error('fn_3d5d9 requires a resolved FS base');
        return host.memory.read8(host.segments.fsBase + (offset >>> 0));
      },
      readGs8: (host, offset) => {
        if (host.segments.gsSelector === 0x18) return host.readGs8(offset >>> 0);
        if (!Number.isInteger(host.segments.gsBase)) throw new Error('fn_3d5d9 requires a resolved GS base');
        return host.memory.read8(host.segments.gsBase + (offset >>> 0));
      },
      writeEs32ForSelector: (host, selector, offset, value) => {
        const base = functionAdapters[0x3d5d9].resolveSelectorBase(host, selector);
        if (!Number.isInteger(base)) throw new Error(`fn_3d5d9 cannot write through selector 0x${(selector & 0xffff).toString(16)}`);
        host.memory.write32(base + (offset >>> 0), value >>> 0);
      },
      dosVector30: host => callDosVector(0x30, host.memory.read32(0x30), host),
      ...dispatcherAdapters.functionAdapters?.[0x3d5d9],
    },
    0x5f48d: {
      callInterrupt: (vector, host) => interrupt33(vector, host),
      inPort: (host, port) => host.in8(port),
      outPort: (host, port, value) => host.out8(port, value),
      writeEs8: (host, offset, value) => host.writeEs8(offset, value),
      writeEs32: (host, offset, value) => host.writeEs32(offset, value),
      ...dispatcherAdapters.functionAdapters?.[0x5f48d],
    },
    0x3e1f0: {
      interrupt33: (vector, host) => interrupt33(vector, host),
      frameCheckpoint: (host, checkpoint) => host.frameCheckpoint(checkpoint),
      writeEs32: (offset, value) => runtime.writeEs32(offset, value),
      readLookupByte: (address, host) => host.memory.read8(address >>> 0),
      ...dispatcherAdapters.functionAdapters?.[0x3e1f0],
    },
    0x6424a: {
      interrupt33: (host, vector) => interrupt33(vector, host),
      ...dispatcherAdapters.functionAdapters?.[0x6424a],
    },
    0x38351: {
      callFn380e8: runCubeController,
      callAnimationEvent: callCubeEvent,
      interrupt33: (host, vector) => interrupt33(vector, host),
      inPort: (host, port) => host.in8(port),
      outPort: (host, port, value) => host.out8(port, value),
      writeEs16: (host, offset, value) => host.writeEs16(offset, value),
      writeEs32: (host, offset, value) => host.writeEs32(offset, value),
      ...dispatcherAdapters.functionAdapters?.[0x38351],
    },
    0x5ff2f: {
      writeEs8: (host, offset, value) => host.writeEs8(offset, value),
      writeEs16: (host, offset, value) => host.writeEs16(offset, value),
      writeEs32: (host, offset, value) => host.writeEs32(offset, value),
      readPort8: (host, port) => Object.getPrototypeOf(host).in8.call(host, port),
      writePort8: (host, port, value) => Object.getPrototypeOf(host).out8.call(host, port, value),
      interrupt33: (host, { vector, callSite }) => interrupt33(vector, host, { callSite }),
      ...dispatcherAdapters.functionAdapters?.[0x5ff2f],
    },
  };
  fn_21cd9(runtime, {
    frameCheckpoint: (host, checkpoint) => host.frameCheckpoint(checkpoint),
    hardwareCheckpoint: (host, checkpoint) => host.hardwareCheckpoint(checkpoint),
    interrupt33,
    ...dispatcherAdapters,
    callDosVector,
    readGs8: dispatcherAdapters.readGs8 ?? (offset => runtime.readGs8(offset)),
    writeGs8: dispatcherAdapters.writeGs8 ?? ((offset, value) => runtime.gsMemory.write8(offset, value)),
    functions,
    functionAdapters,
  });
  return runtime;
}
