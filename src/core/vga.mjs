const indexedPortGroups = new Map([
  [0x3c4, ['sequencer', 'index']], [0x3c5, ['sequencer', 'data']],
  [0x3ce, ['graphics', 'index']], [0x3cf, ['graphics', 'data']],
  [0x3d4, ['crtc', 'index']], [0x3d5, ['crtc', 'data']],
]);

// Register and DAC port state used by the lifted Nation0 routines. VGA memory
// planes and retrace timing remain separate runtime inputs.
export class VgaState {
  constructor() {
    this.registers = new Map();
    this.indexes = new Map([['sequencer', 0], ['graphics', 0], ['crtc', 0]]);
    // Mode X stores one byte per four horizontal pixels in each plane.  The
    // translated program still retains its ordinary main-memory mirror; this
    // device copy records only writes which the original directs to A0000.
    this.planes = Array.from({ length: 4 }, () => new Uint8Array(0x10000));
    this.palette = new Uint8Array(256 * 3);
    this.dacIndex = 0;
    this.dacComponent = 0;
    this.dacReadComponent = 0;
    this.attributeIndex = 0;
    this.attributeDataPhase = false;
    this.retraceProgression = null;
    this.captureState = null;
  }

  indexedKey(group, index) { return `${group}:${index & 0xff}`; }
  indexedValue(group, index) {
    return this.registers.get(this.indexedKey(group, index)) ?? 0;
  }
  mapMask() { return this.indexedValue('sequencer', 0x02) & 0x0f; }
  chain4Enabled() { return (this.indexedValue('sequencer', 0x04) & 0x08) !== 0; }

  // Nation0 returns from its opening unchained title path through BIOS INT
  // 10h/AX=0013.  The program then writes ordinary chained Mode-13 pixels;
  // retaining only the mode number leaves the sequencer in the title's last
  // one-plane state and creates vertical stripes.
  setBiosVideoMode(mode) {
    this.biosMode = mode & 0xff;
    if (this.biosMode !== 0x13) return;
    this.indexes.set('sequencer', 0x04);
    this.registers.set('sequencer:index', 0x04);
    this.registers.set(this.indexedKey('sequencer', 0x04), 0x0e);
    this.registers.set(0x04, 0x0e);
    this.indexes.set('sequencer', 0x02);
    this.registers.set('sequencer:index', 0x02);
    this.registers.set(this.indexedKey('sequencer', 0x02), 0x0f);
    this.registers.set(0x02, 0x0f);
    // Mode 13h's 320-byte packed scanline uses a CRTC offset of 40 words;
    // in unchained 256-colour output that is 80 bytes per plane row. The
    // Nation0 captures retain this value after the BIOS mode switch.
    this.registers.set(this.indexedKey('crtc', 0x13), 0x28);
    this.registers.set(0x13, 0x28);
  }

  // Address is the CPU-visible byte offset within the 64 KiB VGA aperture.
  // In the byte-addressed 256-colour Mode X used by Nation0, every enabled
  // sequencer-map bit receives the byte at the same aperture address.
  writeAperture(address, value) {
    const offset = address & 0xffff;
    const mask = this.mapMask();
    if (this.chain4Enabled()) {
      const plane = offset & 3;
      if (mask & (1 << plane)) this.planes[plane][offset >>> 2] = value & 0xff;
      return;
    }
    for (let plane = 0; plane < 4; plane += 1) {
      if (mask & (1 << plane)) this.planes[plane][offset] = value & 0xff;
    }
  }

  // The effect code uses the standard 320-pixel Mode X pitch: CRTC offset
  // 40 words = 80 bytes in each plane.  This reconstructs the indexed screen
  // after the original sequencer plane writes; it does not recolour or alter
  // the program's drawing algorithm.
  scanoutIndexed(startAddress, { width = 320, height = 200, pitch = null } = {}) {
    const indices = new Uint8Array(width * height);
    const start = startAddress & 0xffff;
    if (this.chain4Enabled()) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const address = (start + y * width + x) & 0xffff;
          indices[y * width + x] = this.planes[address & 3][address >>> 2];
        }
      }
      return indices;
    }
    // CRTC Offset is measured in words. Mode 13h's 0x28 therefore advances
    // 80 bytes per unchained scanline. Honor a caller-supplied stride for
    // special layouts, otherwise follow the VGA register state.
    const rowPitch = pitch ?? ((this.indexedValue('crtc', 0x13) * 2) || 80);
    for (let y = 0; y < height; y += 1) {
      const row = (start + y * rowPitch) & 0xffff;
      for (let x = 0; x < width; x += 1) {
        indices[y * width + x] = this.planes[x & 3][(row + (x >>> 2)) & 0xffff];
      }
    }
    return indices;
  }

  loadCaptureState(state) {
    const guest = state?.guest_vga;
    const dac = state?.dac;
    if (!guest || !dac || !Array.isArray(state.palette)) throw new TypeError('captured VGA state must include guest_vga, DAC, and palette');
    if (state.palette.length !== 256 || state.palette.some(rgb => !Array.isArray(rgb) || rgb.length !== 3)) throw new RangeError('captured VGA palette must contain 256 RGB entries');
    this.palette.set(state.palette.flat().map(value => Number(value) & 0x3f));
    this.dacReadIndex = Number(dac.read_index) & 0xff;
    this.dacIndex = Number(dac.write_index) & 0xff;
    this.dacComponent = Number(dac.component_state) % 3;
    this.dacReadComponent = this.dacComponent;
    this.pelIndex = Number(dac.pel_index) & 0xff;
    this.pelMask = Number(dac.pel_mask) & 0xff;

    const regs = state.registers ?? {};
    const loadNamed = (group, values, indexes) => {
      if (!values) return;
      this.indexes.set(group, Number(values.index ?? 0) & 0xff);
      this.registers.set(`${group}:index`, this.indexes.get(group));
      for (const [name, index] of Object.entries(indexes)) {
        if (values[name] !== undefined) {
          const value = Number(values[name]) & 0xff;
          this.registers.set(this.indexedKey(group, index), value);
          this.registers.set(index, value); // retained for existing diagnostics
        }
      }
    };
    loadNamed('sequencer', regs.sequencer, {
      reset: 0x00, clocking_mode: 0x01, map_mask: 0x02,
      character_map_select: 0x03, memory_mode: 0x04,
    });
    loadNamed('crtc', regs.crtc, {
      horizontal_total: 0x00, horizontal_display_end: 0x01,
      vertical_total: 0x06, vertical_display_end: 0x12,
      offset: 0x13, mode_control: 0x17,
    });
    loadNamed('graphics', regs.graphics_controller, {
      set_reset: 0x00, enable_set_reset: 0x01, color_compare: 0x02,
      data_rotate: 0x03, read_map_select: 0x04, mode: 0x05,
      miscellaneous: 0x06, color_dont_care: 0x07, bit_mask: 0x08,
    });
    const attr = regs.attribute_controller;
    if (attr) {
      this.attributeIndex = Number(attr.index ?? 0) & 0x1f;
      this.registers.set('attribute:0x10', Number(attr.mode_control ?? 0) & 0x3f);
      this.registers.set('attribute:0x12', Number(attr.color_plane_enable ?? 0) & 0x3f);
      this.registers.set('attribute:0x14', Number(attr.color_select ?? 0) & 0x3f);
    }
    if (regs.misc_output !== undefined) this.registers.set('misc_output', Number(regs.misc_output) & 0xff);
    this.captureState = {
      mode: guest.mode ?? null,
      modeId: guest.mode_id ?? null,
      width: guest.width ?? null,
      height: guest.height ?? null,
      bpp: guest.bpp ?? null,
      pitch: guest.pitch ?? null,
      displayAddress: guest.display_address ?? null,
      addressAdd: guest.address_add ?? null,
      linearFramebuffer: guest.linear_framebuffer ?? null,
      paletteFormat: state.palette_format ?? null,
      source: 'captured-vga-state.json',
    };
    this.clearRetraceProgression();
    return this.captureState;
  }

  configureRetraceProgression({
    initialStatus = 0,
    phaseReads = 1,
    onRead = null,
    provenance = 'spec-backed synthetic hardware progression; captured low phase is the starting state; polling cadence is synthetic, not capture-derived timing',
  } = {}) {
    if (!Number.isInteger(phaseReads) || phaseReads < 1) throw new RangeError('phaseReads must be a positive integer');
    if (initialStatus & 0x08) throw new RangeError('captured starting status must be in retrace-low phase');
    if (onRead !== null && typeof onRead !== 'function') throw new TypeError('retrace onRead hook must be a function');
    this.retraceProgression = {
      initialStatus: initialStatus & 0xff,
      phaseReads,
      reads: 0,
      samples: [],
      onRead,
      provenance,
    };
  }

  clearRetraceProgression() { this.retraceProgression = null; }

  readRegister(index) { return this.registers.get(index & 0xffff) ?? 0; }
  writeRegister(index, value) { this.registers.set(index & 0xffff, value & 0xff); }

  readPort(port, fallback = 0) {
    if (port === 0x3c7) return this.dacReadIndex ?? fallback & 0xff;
    if (port === 0x3c9) {
      // The 256-entry DAC index wraps independently; its 768 component
      // bytes are not a power-of-two span and cannot use an AND mask.
      const value = this.palette[(this.dacReadIndex & 0xff) * 3 + this.dacReadComponent];
      this.dacReadComponent += 1;
      if (this.dacReadComponent === 3) {
        this.dacReadComponent = 0;
        this.dacReadIndex = ((this.dacReadIndex ?? 0) + 1) & 0xff;
      }
      return value;
    }
    if (port === 0x3c5 || port === 0x3cf || port === 0x3d5) {
      const [group] = indexedPortGroups.get(port);
      const index = this.registers.get(`${group}:index`) ?? this.indexes.get(group);
      return this.indexedValue(group, index);
    }
    if (port === 0x3da) {
      this.attributeDataPhase = false;
      const progression = this.retraceProgression;
      if (progression) {
        const high = Math.floor(progression.reads / progression.phaseReads) % 2 === 1;
        const value = ((fallback & ~0x08) | (high ? 0x08 : 0)) & 0xff;
        if (progression.samples.length < 64) progression.samples.push({ read: progression.reads + 1, value, retraceHigh: high });
        progression.reads += 1;
        progression.onRead?.({ read: progression.reads, value, retraceHigh: high });
        return value;
      }
    }
    return fallback & 0xff;
  }

  writePort(port, value) {
    const byte = value & 0xff;
    const indexed = indexedPortGroups.get(port);
    if (indexed) {
      const [group, kind] = indexed;
      if (kind === 'index') {
        this.indexes.set(group, byte);
        this.registers.set(`${group}:index`, byte);
      } else {
        const index = this.indexes.get(group);
        this.registers.set(this.indexedKey(group, index), byte);
        this.registers.set(index, byte); // retained for existing diagnostics
      }
      return;
    }
    if (port === 0x3c0) {
      if (!this.attributeDataPhase) {
        this.attributeIndex = byte & 0x1f;
        this.attributeDataPhase = true;
      } else {
        this.registers.set(`attribute:${this.attributeIndex}`, byte & 0x3f);
        this.attributeDataPhase = false;
      }
      return;
    }
    if (port === 0x3c8) {
      this.dacIndex = byte;
      this.dacComponent = 0;
      return;
    }
    if (port === 0x3c7) {
      this.dacReadIndex = byte;
      this.dacReadComponent = 0;
      return;
    }
    if (port === 0x3c6) {
      this.pelMask = byte;
      return;
    }
    if (port === 0x3c9) {
      this.palette[this.dacIndex * 3 + this.dacComponent] = byte & 0x3f;
      this.dacComponent += 1;
      if (this.dacComponent === 3) {
        this.dacComponent = 0;
        this.dacIndex = (this.dacIndex + 1) & 0xff;
      }
    }
  }
}
