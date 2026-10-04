import { runContinuousStartup } from '../src/continuous-startup-runner.mjs?v=2026-10-04-seek-r29';

let control = null;
let realStart = 0;
let sourceStartUs = 0;
let seeking = false;
let checkpointUs = null;
let checkpointHeld = false;
// Keep a small source-derived lead so GF1 PCM is queued before its matching
// raster boundary becomes visible.  This is transport buffering only: scene
// selection and timing remain in runContinuousStartup.
const PRESENTATION_LEAD_MS = 450;

function awaitOriginalBoundary({ elapsedUs }) {
  if (!control) return;
  Atomics.store(control, 4, elapsedUs);
  if (Atomics.exchange(control, 3, 0) === 1) {
    sourceStartUs = Atomics.load(control, 2);
    seeking = true;
  }
  // A JavaScript source lift has live call frames in addition to the guest
  // RAM/register image.  Hold a worker at an original hardware boundary so
  // the checkpoint retains that continuation as well as the guest state.
  // The page may later promote this worker to the audible player and release
  // the same shared control word; no scene state is recreated on resume.
  if (!checkpointHeld && checkpointUs !== null && elapsedUs >= checkpointUs) {
    checkpointHeld = true;
    Atomics.store(control, 0, 1);
    Atomics.notify(control, 0);
    self.postMessage({ type: 'checkpoint-ready', elapsedUs, checkpointUs });
  }
  while (Atomics.load(control, 0) === 1) {
    const pausedAt = performance.now();
    Atomics.wait(control, 0, 1);
    realStart += performance.now() - pausedAt;
  }
  // A retained checkpoint receives its requested replay target through slot
  // two before the page releases it.  This runs in the same live translated
  // continuation that created the checkpoint.
  if (checkpointHeld && checkpointUs !== null) {
    sourceStartUs = Atomics.load(control, 2);
    checkpointUs = null;
    if (elapsedUs >= sourceStartUs) {
      seeking = false;
      sourceStartUs = elapsedUs;
      realStart = performance.now();
      self.postMessage({ type: 'position', elapsedUs, seeking: false });
    }
  }
  if (Atomics.load(control, 0) === 2) {
    const error = new Error('Continuous player stopped');
    error.code = 'CONTINUOUS_STOPPED';
    throw error;
  }
  if (seeking) return;
  const due = realStart + (elapsedUs - sourceStartUs) / 1000 - PRESENTATION_LEAD_MS;
  const delay = due - performance.now();
  if (delay > 0) Atomics.wait(control, 1, 0, Math.min(delay, 100));
}

self.onmessage = event => {
  const { type } = event.data;
  if (type !== 'start') return;
  control = new Int32Array(event.data.control);
  sourceStartUs = event.data.seekUs ?? 0;
  checkpointUs = Number.isFinite(event.data.checkpointUs) ? event.data.checkpointUs : null;
  checkpointHeld = false;
  seeking = sourceStartUs > 0;
  realStart = performance.now();
  try {
    const executable = new Uint8Array(event.data.executable);
    const result = runContinuousStartup(executable, {
      stopAtUs: Infinity,
      // The original VGA and IRQ0 paths both advance at roughly 70 Hz here.
      // Send each translated scanout boundary to the presentation queue;
      // the browser display refresh will select the newest due frame.
      presentEvery: 1,
      shouldPresent: () => !seeking,
      beforeHardwareFrame: boundary => {
        if (seeking && boundary.elapsedUs >= sourceStartUs) {
          seeking = false;
          sourceStartUs = boundary.elapsedUs;
          realStart = performance.now();
          self.postMessage({ type: 'position', elapsedUs: boundary.elapsedUs, seeking: false });
        }
        awaitOriginalBoundary(boundary);
      },
      onFrame: frame => {
        if (seeking) return;
        self.postMessage({ type: 'frame', elapsedUs: frame.elapsedUs, kind: frame.kind, staticPc: frame.staticPc, width: frame.width, height: frame.height, base: frame.base, indices: frame.indices.buffer, palette: frame.palette.buffer, pelMask: frame.pelMask }, [frame.indices.buffer, frame.palette.buffer]);
      },
      onPcm: (pcm, sampleRate) => {
        if (!seeking) self.postMessage({ type: 'pcm', sampleRate, pcm: pcm.buffer }, [pcm.buffer]);
      },
      onState: state => {
        if (state.kind === 'frame' && !seeking && state.vgaFrames % 35 === 0) self.postMessage({ type: 'position', ...state, seeking: false });
      },
    });
    self.postMessage({ type: 'stop', result: {
      stop: result.stop,
      elapsedUs: result.elapsedUs,
      vgaFrames: result.vgaFrames,
      cubeCalls: result.cubeCalls,
      meshFrames: result.meshFrames,
      music: result.music,
    } });
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.message ?? error) });
  }
};
