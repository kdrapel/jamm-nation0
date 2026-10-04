// Host memory input for the isolated audio harnesses. The complete DOS/DPMI
// startup allocator and stack handoff are not yet translated, so keep both the
// low pool and stack outside the relocated executable image.
const RUNTIME_IMAGE_BIAS = 0x0f00;
const LOW_POOL_LIMIT = 0x80000;
// Early capture_000025 stops partway through fn_2150f with saved high-pool
// cursor 0x1e6344. The same call and source pointer in the translated startup
// run use 0x11b108. Adding this observed 0xcb23c pre-call allocation offset to
// the post-loader pool start (0x80000) reconstructs the cursor that reaches
// the original checkpoint; c650 is not used to seed the continuous run.
const STARTUP_HIGH_POOL_CURSOR = 0x14b23c;
const POOL_ALIGNMENT = 0x10000;
const STACK_RESERVATION = 0x10000;

export function initializeAudioStackBootstrap(runtime) {
  const stackBase = runtime.memory.bytes.length - STACK_RESERVATION;
  if (stackBase <= LOW_POOL_LIMIT) throw new RangeError('Audio stack reservation overlaps the low pool');
  runtime.segments.ssBase = stackBase;
  runtime.cpu.set('esp', STACK_RESERVATION - 0x10);
  return { base: stackBase, top: stackBase + STACK_RESERVATION - 0x10, bytes: STACK_RESERVATION };
}

export function initializeAudioMemoryBootstrap(runtime, executableBytes) {
  const imageEnd = executableBytes.length - RUNTIME_IMAGE_BIAS;
  if (!Number.isInteger(imageEnd) || imageEnd <= 0) {
    throw new RangeError('Audio memory bootstrap requires a relocated executable image');
  }
  const cursor = Math.ceil(imageEnd / POOL_ALIGNMENT) * POOL_ALIGNMENT;
  if (cursor >= LOW_POOL_LIMIT || LOW_POOL_LIMIT > runtime.memory.bytes.length) {
    throw new RangeError(`Relocated image leaves no low audio pool below 0x${LOW_POOL_LIMIT.toString(16)}`);
  }
  runtime.memory.write32(0, cursor);
  runtime.memory.write32(4, LOW_POOL_LIMIT);
  const stack = initializeAudioStackBootstrap(runtime);
  return { cursor, limit: LOW_POOL_LIMIT, imageEnd, stack };
}

// A post-loader host profile for running the translated startup dispatcher.
// The original bootstrap computes these allocator ranges from DOS/DPMI memory
// handoff values, which are not available in the checked-in evidence. Keep the
// existing isolated audio profile unchanged and expose the additional high
// range only for startup execution, bounded below the reserved host stack.
export function initializeStartupMemoryBootstrap(runtime, executableBytes) {
  const low = initializeAudioMemoryBootstrap(runtime, executableBytes);
  // The post-loader host profile must not allocate over the DPMI vector/IDT
  // block used by the original vector helpers. The executable ends below
  // 0x70000; the observed table begins at 0x74168, inside the former 0x70000
  // to 0x80000 low pool. Route startup allocations through the existing high
  // pool instead of letting translated initializers overwrite host gates.
  const startupLowLimit = low.cursor;
  runtime.memory.write32(4, startupLowLimit);
  low.limit = startupLowLimit;
  const highCursor = STARTUP_HIGH_POOL_CURSOR;
  const highLimit = low.stack.base;
  if (highCursor >= highLimit) throw new RangeError('Startup high allocator range overlaps the reserved stack');
  // The translated executable uses flat SS addressing for both its ordinary
  // data references and stack offsets. Reserve the top 64 KiB physically, but
  // address it through SS.base=0 and ESP=the reserved linear offset.
  runtime.segments.ssBase = 0;
  runtime.cpu.set('esp', low.stack.top);
  runtime.memory.write32(8, highCursor);
  runtime.memory.write32(0x0c, highLimit);
  return {
    ...low,
    stack: { ...low.stack, segmentBase: 0, offsetTop: low.stack.top },
    highPool: { cursor: highCursor, limit: highLimit },
    profile: 'explicit post-loader host allocation ranges; not a recovered DOS/DPMI handoff',
  };
}
