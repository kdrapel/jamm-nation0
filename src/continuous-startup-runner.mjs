// Continuous post-loader Nation0 execution.  This is deliberately a host for
// translated foreground code, IRQ0 and GUS IRQ7; it does not select or chain
// checkpoint scenes.
import { createNation0Runtime, runNation0 } from './main.mjs';
import { loadNation0ExecutableImage } from './executable-image.mjs';
import { initializeStartupMemoryBootstrap } from './audio-memory-bootstrap.mjs';
import { initializeStartupUltrasoundEnvironment } from './startup-dos-environment.mjs';
import { NativeMusicSession } from './native-music-session.mjs';
import { Irq0Timer } from './irq0-timer.mjs';
import { fn_1816 } from './dos-vector-targets.mjs';
import { fn_38346 } from './cube-entry.mjs';
import { runFn332b6TranslatedEntry } from './cube-rasterizer-resume.mjs';
import { fn_3bfb0 } from './fn-3bfb0.mjs';
import { fn_3718d } from './fn-3718d.mjs';
import { push32, pop32 } from './core/stack-effects.mjs';
import { callDosVector as invokeDosVector } from './runtime-adapters.mjs';

const FRAME_INTERVAL_US = 1_000_000 / 70;

function staticPc(runtime) {
  return Number.isInteger(runtime.translatedPc) ? (runtime.translatedPc + 0x0f00) >>> 0 : null;
}

function surfaceBytes(runtime, base, width, height) {
  if (!Number.isInteger(base) || base < 0 || base + width * height > runtime.memory.bytes.length) return null;
  return runtime.memory.bytes.slice(base, base + width * height);
}

function presentableSurface(runtime) {
  const { memory } = runtime;
  const presentation = runtime.continuousPresentation ?? 'compositor';
  const videoBase = memory.read32(0x18);
  const make = (kind, base, width, height, indices = surfaceBytes(runtime, base, width, height)) => indices === null ? null : {
    kind, width, height, base: base >>> 0, indices, palette: runtime.vga.palette.slice(), pelMask: runtime.vga.pelMask ?? 0xff,
  };
  const scanout = (kind, base) => make(kind, base, 320, 200,
    runtime.vga.scanoutIndexed((base - (0xa0000 - videoBase)) >>> 0));
  // Each address below is the actual original destination of the scene's
  // final sequencer-plane transfer.  Reading the CPU mirror directly would
  // interleave its four planes and produce the repeated mosaic.
  if (presentation === 'title') return scanout('title', (0xa0780 - videoBase) >>> 0);
  // fn_5fbf5 composites 320x168 at A1400 using ordinary DS stores. Those
  // bypass the VGA aperture/plane mirror. A1400 is row 20 of the visible
  // A0000 page; preserve the original 20-row top and 12-row bottom border.
  if (presentation === 'credits') {
    const source = (0xa1400 - videoBase) >>> 0;
    const packed = surfaceBytes(runtime, source, 320, 168);
    if (packed === null) return null;
    const indices = new Uint8Array(320 * 200);
    indices.set(packed, 20 * 320);
    return make('credits', (0xa0000 - videoBase) >>> 0, 320, 200, indices);
  }
  // fn_5efd7 writes a 320x168 compositor into the page at A1400, but BIOS
  // Mode 13 scans the visible page from A0000.  Scan the page origin so the
  // positioned image keeps its original top and bottom border rows.
  if (presentation === 'compositor') return scanout('compositor', (0xa0000 - videoBase) >>> 0);
  // fn_6098c writes 80 packed rows at A0C80. Chain-4 is enabled here, so
  // that aperture offset is packed row 10 (0x0c80 / 320), then programs CRTC
  // maximum-scan-line to 3 (register 9 = 0x43). The VGA therefore repeats
  // each source row four physical scanlines. The capture is 640x400, where
  // pixels are doubled horizontally; its corresponding 320x200 logical
  // image has each source row repeated twice and 20-row black borders.
  // A generic aperture scan ignores CRTC max-scan-line and exposes only a
  // thin 80-row strip.
  // fn_3e1f0 uses the same packed destination and CRTC 09h=43h layout.
  // 0x604c4 stores 80 packed rows starting at A0B40 (EDI+C80-140).
  // CRTC 09h=43h doubles those rows in the 320x200 logical display.
  if (presentation === 'layers') {
    const indices = new Uint8Array(320 * 200);
    const packed = surfaceBytes(runtime, (0xa0b40 - videoBase) >>> 0, 320, 80);
    if (packed === null) return null;
    for (let y = 0; y < 80; y++) {
      indices.set(packed.subarray(y * 320, (y + 1) * 320), (18 + y * 2) * 320);
      indices.set(packed.subarray(y * 320, (y + 1) * 320), (19 + y * 2) * 320);
    }
    return make('layers', (0xa0000 - videoBase) >>> 0, 320, 200, indices);
  }
  if (presentation === 'end-credits') return make('end-credits', (0xa0000 - videoBase) >>> 0, 320, 200);
  if (presentation === 'whirlpool' || presentation === 'texture') {
    const physical = runtime.vga.scanoutIndexed((0xa0000 - videoBase) >>> 0);
    const indices = new Uint8Array(320 * 200);
    for (let sourceY = 0; sourceY < 80; sourceY += 1) {
      const source = (10 + sourceY) * 320;
      const destination = (20 + sourceY * 2) * 320;
      indices.set(physical.subarray(source, source + 320), destination);
      indices.set(physical.subarray(source, source + 320), destination + 320);
    }
    return make(presentation, (0xa0000 - videoBase) >>> 0, 320, 200, indices);
  }
  // fn_6424a copies its 160-line mesh to A1900, twenty 320-byte scanlines
  // into the Mode-13 page. Scan from the page origin so the source's black
  // top and bottom rows are retained around that mesh.
  if (presentation === 'wire') return scanout('wire', (0xa0000 - videoBase) >>> 0);
  if (presentation === 'ring') return scanout('ring', (0xa0000 - videoBase) >>> 0);
  // fn_3d5d9 writes its 150-line terrain into A0FA0 (row 50 in the
  // unchained page). Scan the page origin so the original upper margin and
  // the terrain's lower placement are retained.
  if (presentation === 'terrain') return scanout('terrain', (0xa0000 - videoBase) >>> 0);
  // fn_5f48d clears and fills its ES destination as packed Mode-13 bytes.
  // Translated ES stores update the guest memory mirror; they do not pass
  // through VGA's sequencer aperture writer, so plane scanout is empty here.
  // Read the packed destination directly and retain its row-20 placement.
  if (presentation === 'ward') return make('ward', (0xa0000 - videoBase) >>> 0, 320, 200);
  if (presentation === 'voxel') {
    // fn_61600 programs the displayed page into CRTC start registers 0Ch/0Dh.
    // fn_6167a writes the 180-line image at pageStart + 0x320 (ten scanlines
    // into that page), so adding 0xa0320 here incorrectly crops ten rows and
    // shifts the image down, leaving a broad black band at the bottom.
    const pageStart = ((runtime.vga.indexedValue('crtc', 0x0c) << 8)
      | runtime.vga.indexedValue('crtc', 0x0d)) & 0xffff;
    return scanout('voxel', (0xa0000 - videoBase + pageStart) >>> 0);
  }
  /*
  if (presentation === 'compositor') return make('compositor', (0xa1400 - videoBase) >>> 0, 320, 168);
  if (presentation === 'whirlpool') return make('whirlpool', (0xa0c80 - videoBase) >>> 0, 320, 80);
  if (presentation === 'texture') return make('texture', (0xa0c80 - videoBase) >>> 0, 320, 80);
  if (presentation === 'wire') return make('wire', (0xa1900 - videoBase) >>> 0, 320, 160);
  if (presentation === 'ring') return make('ring', memory.read32(0x32394), 320, 200);
  if (presentation === 'terrain') {
    const workBuffer = memory.read32(0x3d2c8);
    const source = (workBuffer + 0x3e80) >>> 0;
    if (source + 320 * 150 > memory.bytes.length) return null;
    // fn_3d5d9 produces 160 source pixels on each 320-byte row.  The VGA
    // transfer doubles each source pixel horizontally and places the 150
    // rows from y=50; do that presentation mapping once, rather than
    // interpreting the 80-wide source repeatedly as a 320-pixel page.
    const indices = new Uint8Array(320 * 200);
    for (let y = 0; y < 150; y += 1) {
      for (let x = 0; x < 160; x += 1) {
        const value = memory.read8(source + y * 320 + x);
        const output = (y + 50) * 320 + x * 2;
        indices[output] = value; indices[output + 1] = value;
      }
    }
    return make('terrain', source, 320, 200, indices);
  }
  if (presentation === 'voxel') {
    const source = (0xa0320 - videoBase + memory.read32(0x60ecd)) >>> 0;
    if (source + 80 * 180 > memory.bytes.length) return null;
    // The 80×180 surface is presented as 320×180: four source pixels form
    // one CRT scanline span.  Its 10-line top/bottom borders belong to the
    // fixed 320×200 display; doubling source rows here was the cause of the
    // vertically repeated/mosaic presentation.
    const indices = new Uint8Array(320 * 180);
    for (let y = 0; y < 180; y += 1) for (let x = 0; x < 80; x += 1) {
      const value = memory.read8(source + y * 80 + x);
      const row = y * 320 + x * 4;
      indices.fill(value, row, row + 4);
    }
    return make('voxel', source, 320, 180, indices);
  }
  */
  return null;
}

export function runContinuousStartup(executable, {
  onFrame = null,
  onPcm = null,
  onState = null,
  onSceneEvent = null,
  onVoxelRender = null,
  beforeHardwareFrame = null,
  onRuntime = null,
  stopAtUs = Infinity,
  presentEvery = 1,
  shouldPresent = null,
} = {}) {
  if (!(executable instanceof Uint8Array)) throw new TypeError('Continuous startup requires NATION0.EXE bytes');
  const runtime = createNation0Runtime({ memorySize: 0x400000 });
  loadNation0ExecutableImage(runtime, executable);
  Object.assign(runtime.segments, {
    csSelector: 0x08, dsSelector: 0x10, esSelector: 0x10, esBase: 0,
    fsSelector: 0x10, fsBase: 0, ssSelector: 0x10,
  });
  runtime.startupMemoryBootstrap = initializeStartupMemoryBootstrap(runtime, executable);
  runtime.startupDosEnvironment = initializeStartupUltrasoundEnvironment(runtime);
  onRuntime?.(runtime);
  runtime.startupHostProfile = 'flat post-loader CS/DS/ES/FS/SS with original ULTRASND=220,1,1,7 input';
  runtime.configureSyntheticRetrace({ initialStatus: 0, phaseReads: 1 });

  let irq0Clock = null;
  let musicSession = null;
  let vgaFrames = 0;
  let cubeCalls = 0;
  let meshFrames = 0;
  let previousRetraceHigh = null;
  let pcmFramesPending = 0;
  let pcmTransportChunks = [];
  let pcmTransportFrames = 0;
  let stop = null;

  const state = (kind, extra = {}) => onState?.({ kind, elapsedUs: runtime.startupElapsedUs ?? 0, staticPc: staticPc(runtime), vgaFrames, cubeCalls, meshFrames, ...extra });
  const advanceHardwareFrame = () => {
    beforeHardwareFrame?.({ runtime, elapsedUs: runtime.startupElapsedUs ?? 0, vgaFrames });
    vgaFrames += 1;
    const elapsedUs = Math.round(vgaFrames * FRAME_INTERVAL_US);
    runtime.startupElapsedUs = elapsedUs;
    irq0Clock?.advanceToUs(elapsedUs);
    if (musicSession) {
      // Rendering PCM is also the GF1 clock: NativeMusicSession advances the
      // programmed Timer 2 and reaches the installed GUS IRQ7 gate itself.
      // It must happen at each original hardware boundary.  Deferring it
      // until a Web Audio-sized block is available delayed the tracker state
      // read by fn_3d5d9, so its music-gated terrain modulation appeared as
      // noisy intermediate stripes.
      if (onPcm) {
        pcmFramesPending += musicSession.sampleRate / 70;
        const frames = Math.floor(pcmFramesPending);
        if (frames > 0) {
          pcmFramesPending -= frames;
          const pcm = musicSession.renderFrames(frames);
          pcmTransportChunks.push(pcm);
          pcmTransportFrames += frames;
        }
        // Only output transport is batched.  The translated GF1, Timer 2,
        // PIC and IRQ7 path above has already run for this frame.
        while (pcmTransportFrames >= 2048) {
          const block = new Int16Array(2048 * 2);
          let destination = 0;
          let remaining = 2048;
          while (remaining > 0) {
            const chunk = pcmTransportChunks[0];
            const chunkFrames = chunk.length / 2;
            const take = Math.min(remaining, chunkFrames);
            block.set(chunk.subarray(0, take * 2), destination * 2);
            destination += take;
            remaining -= take;
            if (take === chunkFrames) pcmTransportChunks.shift();
            else pcmTransportChunks[0] = chunk.slice(take * 2);
          }
          pcmTransportFrames -= 2048;
          onPcm(block, musicSession.sampleRate, {
            startUs: elapsedUs - Math.round((pcmTransportFrames + 2048 + pcmFramesPending) * 1e6 / musicSession.sampleRate),
          });
        }
      } else runtime.nativeMusic.advanceSeconds(runtime, 1 / 70);
    }
    if (vgaFrames % presentEvery === 0 && (!shouldPresent || shouldPresent())) {
      const surface = presentableSurface(runtime);
      if (surface) onFrame?.({ ...surface, elapsedUs, staticPc: staticPc(runtime) });
    }
    if (runtime.continuousPresentation === 'texture') onSceneEvent?.({
      scene: 'texture', elapsedUs, tick: runtime.memory.read32(0x21958), pending: runtime.memory.read32(0x21954),
      phase: runtime.memory.read8(0x3d6cb), angle: runtime.memory.read16(0x3d700),
    });
    state('frame');
    if (elapsedUs >= stopAtUs) {
      const error = new Error(`Continuous replay reached requested source time ${(elapsedUs / 1e6).toFixed(3)} s`);
      error.code = 'CONTINUOUS_SEEK_BOUNDARY';
      throw error;
    }
  };
  runtime.vga.retraceProgression.onRead = sample => {
    if (!irq0Clock && runtime.hostInterruptContext) {
      irq0Clock = new Irq0Timer(runtime, { reload: 65536, masterMask: runtime.io.ports.get(0x21) ?? 0xff, deferGateValidation: true });
    }
    // The original IRQ0 handler (fn_61a06) polls VGA retrace while servicing
    // the one-shot PIT. Those status reads advance the synthetic low/high
    // bits, but they are not another full display-frame boundary: advancing
    // the host clock here recursively queues/coalesces IRQ0 during its own
    // handler and halves the scene tick rate. Foreground retrace waits still
    // advance the original PIT/IRQ/music path at the observed boundary.
    if (irq0Clock && (irq0Clock.pitMode === 0 || runtime.continuousRetraceDrivenPhase) && !irq0Clock.executing
      && previousRetraceHigh === false && sample.retraceHigh) advanceHardwareFrame();
    previousRetraceHigh = sample.retraceHigh;
  };
  const hardwareCheckpoint = (_host, checkpoint) => {
    runtime.startupHardwareCheckpoint = checkpoint;
    runtime.translatedPc = (checkpoint - 0x0f00) >>> 0;
    if (!musicSession && runtime.memory.read8(0x1eb70) === 1) musicSession = new NativeMusicSession({ executableBytes: executable, runtime });
    advanceHardwareFrame();
  };
  const introHardwareCheckpoint = (_host, checkpoint) => {
    runtime.startupHardwareCheckpoint = checkpoint;
    runtime.translatedPc = (checkpoint - 0x0f00) >>> 0;
    if (!musicSession && runtime.memory.read8(0x1eb70) === 1) musicSession = new NativeMusicSession({ executableBytes: executable, runtime });
    // 0x5F14F follows the original retrace wait and begins a rendered frame.
    // 0x5F1D9 is only the tight loop consuming IRQs already counted at
    // 0x21954. Advancing PIT time there feeds new IRQs back into that same
    // loop, lets its pending count grow, and starves the compositor redraws.
    if (checkpoint === 0x5f14f) advanceHardwareFrame();
  };

  try {
    runNation0(runtime, {
      tailJump: (target, host) => {
        host.translatedPc = target;
        const error = new Error(`Translated foreground reached original DPMI tail target 0x${target.toString(16)}`);
        error.code = 'CONTINUOUS_TAIL_HANDOFF';
        throw error;
      },
      functionAdapters: {
        0x5efd7: { interrupt33: host => host.interrupt(0x33), hardwareCheckpoint: introHardwareCheckpoint },
        // fn_5fbf5 builds the animated text/effect image with ordinary DS
        // stores, so presentableSurface must read its packed page directly.
        0x5fbf5: { hardwareCheckpoint: (host, checkpoint) => {
          host.continuousPresentation = 'credits';
          hardwareCheckpoint(host, checkpoint);
        } },
        0x5f540: {
          callInterrupt: (vector, host) => host.interrupt(vector),
          hardwareCheckpoint: (host, checkpoint) => { host.continuousPresentation = 'title'; hardwareCheckpoint(host, checkpoint); },
          presentationReady: host => { host.continuousPresentation = 'title'; },
          withRetraceDrivenPhase: (host, body) => {
            const previous = host.continuousRetraceDrivenPhase;
            host.continuousRetraceDrivenPhase = true;
            try { return body(); }
            finally { host.continuousRetraceDrivenPhase = previous ?? false; }
          },
        },
        0x21b70: { loadEsFromCs: (offset, host) => {
          const selector = host.memory.read16(offset);
          if (selector !== host.segments.dsSelector || host.segments.dsBase !== undefined && host.segments.dsBase !== 0) throw new Error('Continuous host requires the flat startup ES selector');
          host.segments.esSelector = selector; host.segments.esBase = 0;
        } },
        0x38351: { afterController: () => { runtime.continuousPresentation = 'compositor'; cubeCalls += 1; advanceHardwareFrame(); } },
        0x6098c: { frameCheckpoint: (_host, checkpoint) => { runtime.continuousPresentation = 'whirlpool'; runtime.translatedPc = (checkpoint - 0x0f00) >>> 0; advanceHardwareFrame(); } },
        0x61a47: {
          timerInterruptCheckpoint: () => advanceHardwareFrame(),
          beforeRender: host => onVoxelRender?.(host, 'before'),
          afterRender: host => onVoxelRender?.(host, 'after'),
          afterFrame: () => { runtime.continuousPresentation = 'voxel'; },
        },
        0x3d5d9: { hardwareCheckpoint: (host, checkpoint) => { host.continuousPresentation = 'terrain'; hardwareCheckpoint(host, checkpoint); } },
        0x5f48d: {
          callInterrupt: (vector, host) => { host.continuousRetraceDrivenPhase = true; host.interrupt(vector); },
          writeEs32: (host, offset, value) => {
            host.writeEs32(offset, value);
          },
          // fn_5f48d completes the clear, artwork copy, and row-edge writes
          // before beginning its palette fade. Switch scanout at that stable
          // surface boundary, not on the first ES store into the new page.
          afterSurfaceWrite: host => { host.continuousPresentation = 'ward'; },
        },
        0x3e1f0: { frameCheckpoint: () => { runtime.continuousRetraceDrivenPhase = false; runtime.continuousPresentation = 'texture'; advanceHardwareFrame(); } },
        0x6424a: { afterFrame: (_host, frame, sceneCompleted) => {
          meshFrames = frame;
          if (!sceneCompleted) { runtime.continuousPresentation = 'wire'; runtime.translatedPc = 0x63563; for (let tick = 0; tick < 5; tick += 1) advanceHardwareFrame(); }
        } },
        0x3c124: {
          resolveFsSelector: (selector, host) => host.hostSelectorBases.get(selector) ?? (selector === host.segments.fsSelector ? host.segments.fsBase : undefined),
          processFsRecord: (_cursor, _remaining, host) => { host.translatedPc = 0x323b6; const result = runFn332b6TranslatedEntry(host); if (!result.returned) throw new Error('fn_332b6 did not return during continuous playback'); },
          callDosVector: (host, { vector, callSite }) => invokeDosVector(host, vector, (slot, target, rt) => {
            if (slot !== 0x30 || target !== 0x916) throw new Error(`Unresolved continuous DOS vector at 0x${callSite.toString(16)}`);
            const selector = rt.cpu.get('eax') & 0xffff; const base = rt.cpu.get('edx') >>> 0; fn_1816(rt); rt.hostSelectorBases.set(selector, base);
          }),
          interrupt33: (host, { callSite }) => host.interrupt(0x33, { callSite }),
          readLookup16: (address, host) => host.memory.read16(address >>> 0),
          callEventHandler: (host, { target, eventAddress }) => {
            if (target === 0x3b0b0 && host.memory.read32(eventAddress + 2) === target) return fn_3bfb0(host);
            if (target === 0x3628d && host.memory.read32(eventAddress + 2) === target) return fn_3718d(host);
            if (target !== 0x37446 || host.memory.read32(eventAddress + 2) !== target) throw new Error(`Unresolved continuous event 0x${target.toString(16)}`);
            push32(host, 0x36726); fn_38346(host); if (pop32(host) !== 0x36726) throw new Error('Continuous event callback changed its return');
          },
          frameCheckpoint: (host, checkpoint) => { const callSite = checkpoint && typeof checkpoint === 'object' ? checkpoint.callSite : checkpoint; if (callSite === 0x3c3b2) host.translatedPc = 0x3b4b2; const result = host.frameCheckpoint(checkpoint); if (callSite === 0x3c3b2) { host.continuousPresentation = 'ring'; host.translatedPc = 0x3b4b2; advanceHardwareFrame(); } return result; },
        },
        0x602e4: { interrupt33: (vector, host) => host.interrupt(vector, { callSite: 0x602ee }), readLookupByte: (address, host) => host.memory.read8(address >>> 0), frameCheckpoint: (host, checkpoint) => { if (checkpoint === 0x6039f) host.translatedPc = 0x5f4a4; const result = host.frameCheckpoint(checkpoint); if (checkpoint === 0x6039f) { host.continuousPresentation = 'layers'; host.translatedPc = 0x5f4a4; advanceHardwareFrame(); } return result; } },
        0x5ff2f: { writeEs8: (host, offset, value) => host.writeEs8(offset, value), writeEs16: (host, offset, value) => host.writeEs16(offset, value), writeEs32: (host, offset, value) => host.writeEs32(offset, value), readPort8: (host, port) => Object.getPrototypeOf(host).in8.call(host, port), writePort8: (host, port, value) => Object.getPrototypeOf(host).out8.call(host, port, value), interrupt33: (host, { vector, callSite }) => { host.continuousPresentation = 'end-credits'; host.continuousRetraceDrivenPhase = true; return host.interrupt(vector, { callSite }); } },
      },
      functions: runtime.functionOverrides,
    });
    stop = { kind: 'returned' };
  } catch (error) {
    stop = { kind: error?.code ?? 'exception', message: String(error?.message ?? error) };
  }
  state('stop', { stop, music: musicSession?.snapshot() ?? null });
  return { runtime, stop, elapsedUs: runtime.startupElapsedUs ?? 0, vgaFrames, cubeCalls, meshFrames, music: musicSession?.snapshot() ?? null };
}
