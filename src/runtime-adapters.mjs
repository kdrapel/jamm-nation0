const MASK32 = 0xffffffff;

// One observable, vector-keyed boundary for software interrupts. Service
// effects stay with explicitly registered handlers; no DOS/mouse behavior is
// fabricated when a handler is absent.
export class InterruptRouter {
  constructor() {
    this.handlers = new Map();
    this.calls = [];
  }

  register(vector, handler) {
    if (!Number.isInteger(vector) || vector < 0 || vector > 0xff) throw new RangeError('Interrupt vector must be an 8-bit integer');
    if (typeof handler !== 'function') throw new TypeError('Interrupt handler must be a function');
    this.handlers.set(vector, handler);
    return () => this.handlers.delete(vector);
  }

  invoke(vector, runtime, context = {}) {
    const handler = this.handlers.get(vector);
    if (!handler) throw new Error(`Unresolved INT 0x${vector.toString(16)} service`);
    const call = {
      sequence: this.calls.length,
      vector,
      eax: runtime.cpu.get('eax'),
      edx: runtime.cpu.get('edx'),
      service: runtime.memory.read8(0xe1),
      context,
    };
    this.calls.push(call);
    return handler(runtime, call);
  }
}

function segmentField(segment, suffix) {
  if (!['es', 'fs', 'gs', 'ss'].includes(segment)) {
    throw new RangeError(`Unsupported segment register ${segment}`);
  }
  return `${segment}${suffix}`;
}

// Common MOV Sreg behavior for the translated runtime: the selector remains
// observable and its linear base comes only from an explicit host resolver.
export function loadSegmentSelector(runtime, segment, selector, resolveSelector) {
  if (!Number.isInteger(selector) || selector < 0 || selector > 0xffff) {
    throw new RangeError(`${segment.toUpperCase()} selector must be a 16-bit integer`);
  }
  if (typeof resolveSelector !== 'function') {
    throw new Error(`Unresolved ${segment.toUpperCase()} selector-to-base resolver`);
  }
  const base = resolveSelector(selector, runtime);
  if (!Number.isInteger(base) || base < 0 || base > MASK32) {
    throw new Error(`${segment.toUpperCase()} base for selector 0x${selector.toString(16)} is unresolved`);
  }
  runtime.segments[segmentField(segment, 'Selector')] = selector;
  runtime.segments[segmentField(segment, 'Base')] = base >>> 0;
  return base >>> 0;
}

// Central boundary for indirect DOS-vector calls. Target lookup and callback
// argument order follow the original vectors' host-adapter convention.
export function callDosVector(runtime, vector, adapter) {
  if (!Number.isInteger(vector) || vector < 0 || vector > 0xffff) {
    throw new RangeError('DOS vector slot must be a 16-bit address');
  }
  const target = runtime.memory.read32(vector);
  if (typeof adapter !== 'function') {
    throw new Error(`Unresolved DOS vector call through [0x${vector.toString(16)}] to 0x${target.toString(16)}`);
  }
  adapter(vector, target, runtime);
  return target;
}
