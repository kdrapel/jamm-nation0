function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function keyOf(checkpoint) {
  return checkpoint && typeof checkpoint === 'object' ? JSON.stringify(stable(checkpoint)) : String(checkpoint);
}

// Deterministic host-side schedule for state changes that the original process
// receives between translated frame/input checkpoints. Events are supplied by
// the caller from observed input or oracle evidence; this queue invents none.
export class RuntimeEventQueue {
  constructor() {
    this.pending = [];
    this.sequence = 0;
    this.checkpoints = 0;
  }

  enqueue(checkpoint, action) {
    if (typeof action !== 'function') throw new TypeError('Checkpoint event needs an action function');
    const event = { checkpoint: keyOf(checkpoint), action, sequence: this.sequence++ };
    this.pending.push(event);
    return event.sequence;
  }

  advance(runtime, checkpoint) {
    this.checkpoints += 1;
    runtime.timing?.waitForRetrace();
    const key = keyOf(checkpoint);
    const due = [];
    this.pending = this.pending.filter((event) => {
      if (event.checkpoint !== key && event.checkpoint !== '*') return true;
      due.push(event);
      return false;
    });
    due.sort((left, right) => left.sequence - right.sequence);
    for (const event of due) event.action(runtime, checkpoint);
    return due.length;
  }

  clear() { this.pending.length = 0; }
}
