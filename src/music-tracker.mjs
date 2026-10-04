// Bounded lift of the row/tick state portions of the native MOD interrupt
// handler at original 0x20160..0x208e7.  The handler is driven by the music
// device's IRQ; this module deliberately has no wall-clock or Web Audio code.
//
// The surrounding GF1 voice register writes at 0x1fc5e..0x2015f are still a
// separate hardware boundary.  This lift preserves the original DS state used
// by the tracker so that device emulation can call it causally on each IRQ.

import { instrumentLift } from './core/function-coverage.mjs';

const CHANNEL_BASE = 0x1eb76;
const CHANNEL_SIZE = 0x34;

function u16(memory, address) { return memory.read16(address) & 0xffff; }
function w16(memory, address, value) { memory.write16(address, value & 0xffff); }

function currentEvent(memory, pointer) {
  const a = memory.read8(pointer);
  const b = memory.read8(pointer + 1);
  const c = memory.read8(pointer + 2);
  return {
    sample: (a & 0xf0) | (c >>> 4),
    period: (((a & 0x0f) << 8) | b) & 0x0fff,
    effect: c & 0x0f,
    parameter: memory.read8(pointer + 3),
  };
}

function setDeviceTempo(runtime, bpm) {
  // Original 0x20832..0x2084e converts Fxx BPM to GF1 ticks per second with
  // floor(BPM*2/5), then sub_20f5f computes Timer 2's 320-us reload count.
  // Preserve both integer divisions: Timer 2 is the source of tracker IRQs.
  const tickRate = Math.floor((bpm * 2) / 5);
  const divisor = Math.floor(0x0c35 / tickRate) & 0xffff;
  const value = (-divisor) & 0xff;
  const port = runtime.memory.read16(0x1fbd4);
  runtime.musicTempoBpm = bpm;
  runtime.musicTickRateHz = tickRate;
  runtime.out8(port, 0x47);
  runtime.out8((port + 2) & 0xffff, value);
}

function writeGf1Word(runtime, register, value) {
  const port = runtime.memory.read16(0x1fbd4);
  runtime.out8(port, register);
  runtime.out16((port + 1) & 0xffff, value & 0xffff);
}

function writeGf1HighByte(runtime, register, value) {
  const port = runtime.memory.read16(0x1fbd4);
  runtime.out8(port, register);
  runtime.out8((port + 2) & 0xffff, value & 0xff);
}

function readGf1Word(runtime, register) {
  const port = runtime.memory.read16(0x1fbd4);
  runtime.out8(port, register);
  return runtime.in16((port + 1) & 0xffff);
}

function writeGf1CurrentPosition(runtime, current) {
  writeGf1Word(runtime, 0x0a, current >>> 7);
  writeGf1Word(runtime, 0x0b, (current << 9) & 0xffff);
}

// Original IRQ helper at 0x1fc5e. It applies each channel's per-tick volume
// target to the GF1 ramp registers before the handler emits the regular voice
// register block at 0x1fd34..0x2015f.
function fn_1fc5e_gf1VolumeRamps(runtime) {
  const { memory } = runtime;
  const channels = u16(memory, 0x1e424);
  const voiceSelectPort = (u16(memory, 0x1e41c) + 0x102) & 0xffff;
  const registerSelectPort = (voiceSelectPort + 1) & 0xffff;
  const registerDataPort = (registerSelectPort + 1) & 0xffff;
  const registerDataHighPort = (registerSelectPort + 2) & 0xffff;

  for (let channel = 0; channel < channels; channel += 1) {
    // 0x1fc76..0x1fc80 selects voice [total voices - remaining channels].
    runtime.out8(voiceSelectPort, (channels - channel - 1) & 0xff);
    const state = CHANNEL_BASE + channel * CHANNEL_SIZE;
    const voiceState = u16(memory, state + 0x2c);
    const shouldRamp = voiceState === 2
      || (voiceState === 1
        ? u16(memory, state + 0x20) !== u16(memory, state + 0x22)
        : u16(memory, state + 0x30) !== 0);
    if (!shouldRamp) continue;

    let scaledVolume = u16(memory, state + 0x08);
    w16(memory, state + 0x08, 0);
    scaledVolume = (scaledVolume * u16(memory, 0x1e436)) & 0xffff;
    // MUL BX; SHR AX,6; ADC AX,0. SHR's final carry is input bit 5.
    const tableIndex = (((scaledVolume >>> 6) + ((scaledVolume >>> 5) & 1)) & 0xffff) * 2;
    let target = u16(memory, 0x1e1e8 + tableIndex);
    let current = u16(memory, 0x1e1e8);
    let direction = 0;
    if (target >= current) {
      direction = 0x40;
      [target, current] = [current, target];
    }

    runtime.out8(registerSelectPort, 0x0d);
    runtime.out8(registerDataHighPort, 0x03);
    runtime.out8(registerSelectPort, 0x07);
    runtime.out16(registerDataPort, target);
    runtime.out8(registerSelectPort, 0x08);
    runtime.out16(registerDataPort, current);
    runtime.out8(registerSelectPort, 0x0d);
    runtime.out8(registerDataHighPort, direction);
  }
}

function writeGf1SampleBounds(runtime, memory, state) {
  const end = (memory.read32(state) + u16(memory, state + 0x10)) >>> 0;
  const loop = (memory.read32(state) + u16(memory, state + 0x0c)) >>> 0;
  writeGf1Word(runtime, 0x04, end >>> 7);
  writeGf1Word(runtime, 0x05, (end << 9) & 0xffff);
  writeGf1Word(runtime, 0x02, loop >>> 7);
  writeGf1Word(runtime, 0x03, (loop << 9) & 0xffff);
}

// Original 0x1fd55..0x2015f, expressed as the GF1-visible portion of the
// handler.  The tracker writes the 0x34-byte records; this routine consumes
// those records through the same GF1 voice-select/register/data ports.  It
// deliberately does not pass channel metadata to the device renderer.
export function fn_1fd55_gf1Voices(runtime) {
  const { memory } = runtime;
  const channels = u16(memory, 0x1e424);
  const voiceSelectPort = memory.read16(0x1fbd2);
  const master = u16(memory, 0x1e358 + 0xde);
  for (let channel = 0; channel < channels; channel += 1) {
    const state = CHANNEL_BASE + channel * CHANNEL_SIZE;
    runtime.out8(voiceSelectPort, channel);
    const voiceState = u16(memory, state + 0x2c);
    if (voiceState === 2) {
      // 0x1fdcb first stops the voice, then programs current/end/loop
      // positions. The address packing is performed by the original stores.
      writeGf1HighByte(runtime, 0x00, 3);
      const current = (memory.read32(state) + u16(memory, state + 0x30)) >>> 0;
      writeGf1CurrentPosition(runtime, current);
      if (u16(memory, state + 0x22) !== u16(memory, state + 0x20)) {
        writeGf1SampleBounds(runtime, memory, state);
      }
      writeGf1HighByte(runtime, 0x00, u16(memory, state + 0x2e));
    } else if (voiceState === 1 && u16(memory, state + 0x22) !== u16(memory, state + 0x20)) {
      // Original 0x1feb9..0x1ffea retains the active voice's relative
      // position when replacing a sample without a note retrigger.
      const high = readGf1Word(runtime, 0x8a);
      const low = readGf1Word(runtime, 0x8b);
      const oldSample = memory.read8(state + 0x22);
      const oldBase = oldSample === 0 ? 0 : memory.read32(0x1e26a + (oldSample - 1) * 4);
      let current = ((((high << 7) | (low >>> 9)) >>> 0) - oldBase) >>> 0;
      current = Math.min(current, Math.max(0, u16(memory, state + 0x10) - 1));
      if (u16(memory, state + 0x30) === 0) w16(memory, state + 0x30, current);
      writeGf1CurrentPosition(runtime, (memory.read32(state) + u16(memory, state + 0x30)) >>> 0);
      writeGf1SampleBounds(runtime, memory, state);
      writeGf1HighByte(runtime, 0x00, u16(memory, state + 0x2e));
    }

    // 0x1ffec..0x200f0 maps the prior and current tracker volumes through
    // the executable table, either writing the current GF1 volume directly
    // or programming the GF1's own volume ramp registers.  Register 0x0d
    // is the ramp control; the direct current-volume register is 0x09.
    const volume = u16(memory, state + 0x06);
    if (volume !== u16(memory, state + 0x08)) w16(memory, state + 0x32, volume);
    w16(memory, 0x1e358 + 0xe0, volume);
    const priorProduct = u16(memory, state + 0x08) * master;
    const currentProduct = u16(memory, 0x1e358 + 0xe0) * master;
    // 0x20029/0x2002c and 0x20051/0x20054 use SHR AX,6 / ADC AX,0;
    // carry from the shift rounds the 6-bit fixed-point product upward.
    const priorScaled = ((priorProduct >>> 6) + ((priorProduct >>> 5) & 1)) & 0xffff;
    const currentScaled = ((currentProduct >>> 6) + ((currentProduct >>> 5) & 1)) & 0xffff;
    let priorGf1 = u16(memory, 0x1e1e8 + priorScaled * 2);
    let currentGf1 = u16(memory, 0x1e1e8 + currentScaled * 2);
    if ((priorGf1 >>> 8) === (currentGf1 >>> 8)) {
      writeGf1HighByte(runtime, 0x0d, 3);
      writeGf1Word(runtime, 0x09, currentGf1);
    } else {
      let rampControl = 0;
      if (priorGf1 < currentGf1) {
        rampControl = 0x40;
        [priorGf1, currentGf1] = [currentGf1, priorGf1];
      }
      writeGf1HighByte(runtime, 0x0d, 3);
      writeGf1Word(runtime, 0x07, priorGf1);
      writeGf1Word(runtime, 0x08, currentGf1);
      writeGf1HighByte(runtime, 0x0d, rampControl);
    }
    writeGf1Word(runtime, 0x01, u16(memory, state + 0x04));

    // The original second pass clears both transient fields after writing the
    // final control value. This makes each subsequent change originate in the
    // translated tracker/effect state again.
    w16(memory, state + 0x2c, 0);
    w16(memory, state + 0x30, 0);
  }
}

function enterNextPattern(runtime) {
  const { memory } = runtime;
  let nextOrder = u16(memory, 0x1e432);
  const songLength = memory.read8(0x1d93d);
  if ((nextOrder & 0xff) >= songLength) {
    const restart = memory.read8(0x1d93e);
    nextOrder = restart < 0x78 ? restart : 0;
    w16(memory, 0x1e432, nextOrder);
  }

  // 0x1e434 is the order just selected; 0x1e432 is advanced for the next
  // 64-row pattern boundary, exactly as 0x204de..0x20535.
  w16(memory, 0x1e434, nextOrder);
  const pattern = memory.read8(0x1d93f + nextOrder);
  const channels = u16(memory, 0x1e424);
  let pointer = (memory.read32(0x1eb58) + pattern * channels * 0x100) >>> 0;
  const row = u16(memory, 0x1eb5c);
  w16(memory, 0x1e42e, row);
  pointer = (pointer + row * 16) >>> 0;
  memory.write32(0x1eb54, pointer);
  w16(memory, 0x1eb5c, 0);
  w16(memory, 0x1e432, nextOrder + 1);
}

function applyRowEvent(runtime, channel, event) {
  const { memory } = runtime;
  const state = CHANNEL_BASE + channel * CHANNEL_SIZE;
  w16(memory, state + 0x08, u16(memory, state + 0x06));

  if (event.sample !== 0) {
    const sampleIndex = event.sample - 1;
    const field = sampleIndex * 2;
    memory.write8(state + 0x22, memory.read8(state + 0x20));
    memory.write8(state + 0x20, event.sample);
    w16(memory, state + 0x06, Math.min(u16(memory, 0x1e324 + field), 0x3f));
    w16(memory, state + 0x2c, 1);
    memory.write32(state, memory.read32(0x1e26a + sampleIndex * 4));
    w16(memory, state + 0x0a, u16(memory, 0x1e362 + field) * 0x48);
    w16(memory, state + 0x2e, 0);
    w16(memory, state + 0x10, u16(memory, 0x1e2e6 + field));
    w16(memory, state + 0x0c, u16(memory, 0x1e3a0 + field));
    w16(memory, state + 0x0e, u16(memory, 0x1e3de + field));
    if (u16(memory, state + 0x0e) > 2) {
      w16(memory, state + 0x2e, 8);
      const loopEnd = u16(memory, state + 0x0c) + u16(memory, state + 0x0e);
      if (loopEnd <= u16(memory, state + 0x10)) w16(memory, state + 0x10, loopEnd);
    }
  }

  if (event.period !== 0) {
    const periodIndex = memory.read8(0x1d9df + event.period);
    // 0x2062c adds byte offsets from the period-index table and the sample
    // finetune table before reading a word at DS:[1dd68h + BX]. BX is already
    // a byte displacement; multiplying by two here shifts every tuned note.
    const note = u16(memory, 0x1dd68 + periodIndex + u16(memory, state + 0x0a));
    w16(memory, state + 0x1a, note);
    // Effects 3 and 5 are tone-portamento cases in the original branch and
    // retain the target without retriggering the voice.
    if (event.effect !== 3 && event.effect !== 5) {
      w16(memory, state + 0x2c, 2);
      w16(memory, state + 0x16, 0);
      w16(memory, state + 0x12, note);
      w16(memory, state + 0x04, u16(memory, 0x1e43c + note * 2));
    }
  }

  w16(memory, state + 0x2a, 0);
  // At 0x206ac AX contains bytes 2..3: AL is the effect and AH is parameter.
  w16(memory, state + 0x14, event.effect | (event.parameter << 8));

  // Original row-time dispatch at 0x20708..0x208a1 seeds the records that
  // the tick-time dispatch below consumes. These are data writes, not a host
  // interpretation of MOD effects.
  if (event.effect === 0) {
    const noteIndex = memory.read8(0x1d9df + u16(memory, state + 0x12));
    const base = noteIndex;
    const noteAt = offset => u16(memory, 0x1dd68 + Math.min(0x46, base + offset * 2) + u16(memory, state + 0x0a));
    w16(memory, state + 0x24, noteAt(0));
    w16(memory, state + 0x26, noteAt(event.parameter >>> 4));
    w16(memory, state + 0x28, noteAt(event.parameter & 0x0f));
  }
  if ((event.effect === 3 || event.effect === 5) && event.parameter !== 0) {
    memory.write8(state + 0x1c, event.parameter);
    memory.write8(state + 0x15, event.parameter);
  }
  if (event.effect === 4 || event.effect === 6) {
    if ((event.parameter & 0x0f) !== 0) memory.write8(state + 0x18, event.parameter & 0x0f);
    if ((event.parameter & 0xf0) !== 0) memory.write8(state + 0x19, event.parameter & 0xf0);
    memory.write8(state + 0x15, memory.read8(state + 0x18) | memory.read8(state + 0x19));
  }

  // Source-backed immediate effect cases that change global progression or a
  // channel's directly observable volume.  Per-tick effect processing stays
  // in the later portion of the same original handler and is not synthesized.
  if (event.effect === 0x0c) memory.write8(state + 0x06, Math.min(event.parameter, 0x3f));
  if (event.effect === 0x0b) {
    w16(memory, 0x1e42e, 0x3f);
    memory.write8(0x1e432, event.parameter);
  }
  if (event.effect === 0x0d) {
    w16(memory, 0x1e42e, 0x3f);
    const tens = event.parameter >>> 4;
    const ones = event.parameter & 0x0f;
    w16(memory, 0x1eb5c, tens * 10 + ones);
  }
  if (event.effect === 0x0f && event.parameter !== 0) {
    if (event.parameter <= 0x1f) {
      memory.write8(0x1e42a, event.parameter);
      memory.write8(0x1e42c, event.parameter);
    } else setDeviceTempo(runtime, event.parameter);
  }
}

function setPeriodFrequency(memory, state, period) {
  w16(memory, state + 0x12, period);
  w16(memory, state + 0x04, u16(memory, 0x1e43c + period * 2));
}

function periodFloor(memory, state) { return u16(memory, 0x1ddae + u16(memory, state + 0x0a)); }
function periodCeiling(memory, state) { return u16(memory, 0x1dd68 + u16(memory, state + 0x0a)); }

function slideVolume(memory, state, parameter) {
  const delta = (parameter & 0x0f) - (parameter >>> 4);
  w16(memory, state + 0x06, Math.max(0, Math.min(0x3f, u16(memory, state + 0x06) + delta)));
}

function vibrato(memory, state, parameter) {
  const minimum = periodFloor(memory, state);
  const maximum = periodCeiling(memory, state);
  const speed = parameter & 0xf0;
  const depth = parameter & 0x0f;
  const phase = (memory.read8(state + 0x16) + (speed >>> 2)) & 0xff;
  memory.write8(state + 0x16, phase);
  const sine = memory.read8(0x1d9bf + ((phase >>> 2) & 0x1f));
  const product = (sine * depth) & 0xffff;
  // ROL AX,1 / XCHG AH,AL / AND AH,1 from 0x202e7..0x202f1.
  let delta = ((((product << 1) & 0xffff) >>> 8) | (((product << 1) & 0xff) << 8)) & 0x1ff;
  if ((phase & 0x80) === 0) delta = -delta;
  const period = Math.max(minimum, Math.min(maximum, u16(memory, state + 0x12) + delta));
  w16(memory, state + 0x04, u16(memory, 0x1e43c + period * 2));
}

function tonePortamento(memory, state, amount) {
  const target = u16(memory, state + 0x1a);
  let period = u16(memory, state + 0x12);
  if (period < target) period = Math.min(target, period + amount);
  else period = Math.max(target, period - amount);
  setPeriodFrequency(memory, state, period);
}

// Original per-tick dispatch at 0x20183..0x20499. The row parser has already
// stored the original effect word at +0x14; this executes the state changes
// before 0x1fd55 emits the resulting GF1 frequency/volume registers.
function applyTickEffects(runtime) {
  const { memory } = runtime;
  const channels = u16(memory, 0x1e424);
  for (let channel = 0; channel < channels; channel += 1) {
    const state = CHANNEL_BASE + channel * CHANNEL_SIZE;
    w16(memory, state + 0x08, u16(memory, state + 0x06));
    w16(memory, state + 0x1e, u16(memory, state + 0x1e) + 1);
    w16(memory, state + 0x2a, (u16(memory, state + 0x2a) + 2) % 6);
    const word = u16(memory, state + 0x14);
    // The original dispatcher at 0x201a1 skips the effect switch when the
    // complete effect/parameter word is zero. In particular, 000 must not
    // run the arpeggio branch: its row-time scratch periods are not an active
    // note effect and can otherwise retune the voice on the next tick.
    if (word === 0) continue;
    const effect = word & 0x0f;
    const parameter = word >>> 8;
    if (effect === 0) {
      const slot = 0x24 + u16(memory, state + 0x2a);
      w16(memory, state + 0x04, u16(memory, state + slot));
    } else if (effect === 1) {
      setPeriodFrequency(memory, state, Math.max(periodFloor(memory, state), u16(memory, state + 0x12) - parameter));
    } else if (effect === 2) {
      setPeriodFrequency(memory, state, Math.min(periodCeiling(memory, state), u16(memory, state + 0x12) + parameter));
    } else if (effect === 3) {
      tonePortamento(memory, state, memory.read8(state + 0x1c));
    } else if (effect === 4) {
      vibrato(memory, state, memory.read8(state + 0x15));
    } else if (effect === 5) {
      slideVolume(memory, state, parameter);
      tonePortamento(memory, state, memory.read8(state + 0x1c));
    } else if (effect === 6) {
      slideVolume(memory, state, parameter);
      vibrato(memory, state, memory.read8(state + 0x15));
    } else if (effect === 0x0a) {
      slideVolume(memory, state, parameter);
    }
  }
}

// Translation of the tracker progression portions of the IRQ handler.  It is
// intentionally called only by a device IRQ bridge, never by a browser timer.
function __coverage_impl_fn_1fc16(runtime) {
  const { memory } = runtime;
  // The installed handler entry at 0x1fc16 calls the GF1 voice-output block
  // (0x1fd34..0x2015f) before jumping into tracker progression at 0x20160.
  // Keep that source order: row/tick processing below prepares channel state
  // for the next Timer 2 interrupt, rather than programming it immediately.
  memory.write32(0x1eb71, (memory.read32(0x1eb71) + 1) >>> 0);
  w16(memory, 0x1eb6e, (u16(memory, 0x1eb6e) + 1) & 0xffff);
  fn_1fc5e_gf1VolumeRamps(runtime);
  w16(memory, 0x1eb6e, 1);
  fn_1fd55_gf1Voices(runtime);
  w16(memory, 0x1eb6e, 0);
  const countdown = (u16(memory, 0x1e42c) - 1) & 0xffff;
  w16(memory, 0x1e42c, countdown);
  if (countdown !== 0) {
    applyTickEffects(runtime);
    return { rowAdvanced: false, tick: countdown };
  }

  w16(memory, 0x1e42c, u16(memory, 0x1e42a));
  if (u16(memory, 0x1e42e) >= 0x40) enterNextPattern(runtime);

  const row = u16(memory, 0x1e42e);
  const pointer = memory.read32(0x1eb54);
  const channels = u16(memory, 0x1e424);
  w16(memory, 0x1e430, row);
  const events = [];
  for (let channel = 0; channel < channels; channel += 1) {
    const event = currentEvent(memory, pointer + channel * 4);
    applyRowEvent(runtime, channel, event);
    events.push(event);
  }
  w16(memory, 0x1e42e, row + 1);
  memory.write32(0x1eb54, (pointer + channels * 4) >>> 0);
  // Host-device handoff metadata only. The source of every field remains the
  // translated channel record and copied event bytes above; this does not
  // participate in tracker decisions or replace original program state.
  runtime.musicTrackerRevision = (runtime.musicTrackerRevision ?? 0) + 1;
  runtime.musicTrackerEvents = events;
  return { rowAdvanced: true, order: u16(memory, 0x1e434), pattern: memory.read8(0x1d93f + u16(memory, 0x1e434)), row, events };
}

export const fn_1fc16 = instrumentLift('0x1fc16', 'fn_1fc16', __coverage_impl_fn_1fc16);

export function readNation0TrackerState(runtime) {
  const { memory } = runtime;
  const channels = u16(memory, 0x1e424);
  return {
    order: u16(memory, 0x1e434),
    pattern: memory.read8(0x1d93f + u16(memory, 0x1e434)),
    nextOrder: u16(memory, 0x1e432),
    row: u16(memory, 0x1e42e),
    tickCountdown: u16(memory, 0x1e42c),
    speed: u16(memory, 0x1e42a),
    tempoBpm: runtime.musicTempoBpm ?? null,
    channels: Array.from({ length: channels }, (_, channel) => {
      const state = CHANNEL_BASE + channel * CHANNEL_SIZE;
      return {
        sample: memory.read8(state + 0x20), volume: u16(memory, state + 0x06),
        period: u16(memory, state + 0x12), targetPeriod: u16(memory, state + 0x1a),
        effect: u16(memory, state + 0x14), voiceState: u16(memory, state + 0x2c),
      };
    }),
  };
}
