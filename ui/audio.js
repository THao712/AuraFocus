/**
 * AuraFocus - Pure Web Audio Multi-Track DSP & Retro SFX Synthesizer
 * Zero external audio assets; all ambient scenes, masking beds and 8-bit tones
 * are synthesized in real time and routed exclusively through masterGain.
 */

const AMBIENT_TRACK_META = [
  { id: 'rain', label: '细雨' },
  { id: 'fire', label: '篝火' },
  { id: 'cafe', label: '咖啡馆' },
  { id: 'white', label: '白噪音' },
  { id: 'zen', label: '和风' },
  { id: 'shield', label: '人声掩蔽' },
  { id: 'train', label: '深夜列车' },
  { id: 'study', label: '安静书房' },
  { id: 'binaural', label: '40Hz律动' }
];

const AUDIO_PRESETS = {
  rain_fire: { label: '雨夜壁炉', tracks: { rain: 55, fire: 45 } },
  office_shield: { label: '办公降噪', tracks: { shield: 70, cafe: 20 } },
  night_train: { label: '深夜列车', tracks: { train: 65, rain: 30 } },
  pixel_zen: { label: '像素禅房', tracks: { zen: 60, study: 35 } }
};

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.currentAmbient = null;
    this.ambientGain = null;
    this.currentLfo = null;
    this.ambientNodes = [];
    this.ambientSources = [];
    this.ambientIntervals = [];
    this.ambientTimeouts = [];
    this.alarmInterval = null;
    this.alarmGain = null;
    this.zenTimer = null;
    this.masterVolume = 0.8;
    this.masterGain = null;
    this.analyser = null;
    this.noiseBuffers = new Map();
    this.activeTracks = new Map(); // id -> { gain, sources, nodes, intervals, timeouts, level }
    this.ambientMuted = false;
    this.ambientScale = 1.0;
    this._spectrumBuf = null;
  }

  init() {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (!this.masterGain) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
      if (!this.analyser && typeof this.ctx.createAnalyser === 'function') {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.smoothingTimeConstant = 0.78;
        this._spectrumBuf = new Uint8Array(this.analyser.frequencyBinCount);
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('AudioContext init error:', e);
    }
  }

  setVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
  }

  _ensureAmbientBus(fadeSec = 0.6) {
    this.init();
    if (!this.ctx) return null;
    if (!this.ambientGain) {
      const now = this.ctx.currentTime;
      this.ambientGain = this.ctx.createGain();
      const target = this.ambientMuted ? 0.0001 : 0.28 * this.ambientScale;
      this.ambientGain.gain.setValueAtTime(0.001, now);
      this.ambientGain.gain.linearRampToValueAtTime(target, now + Math.max(0.05, fadeSec));
      if (this.analyser) {
        this.ambientGain.connect(this.analyser);
        this.analyser.connect(this.masterGain);
      } else {
        this.ambientGain.connect(this.masterGain);
      }
    }
    return this.ambientGain;
  }

  _updateAmbientBusGain(fadeSec = 0.35) {
    if (!this.ambientGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this.ambientMuted ? 0.0001 : Math.max(0.0001, 0.28 * this.ambientScale);
    if (typeof this.ambientGain.gain.cancelScheduledValues === 'function') {
      this.ambientGain.gain.cancelScheduledValues(now);
    }
    this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value || target, now);
    this.ambientGain.gain.linearRampToValueAtTime(target, now + Math.max(0.04, fadeSec));
  }

  setAmbientMuted(muted, fadeSec = 0.25) {
    this.ambientMuted = Boolean(muted);
    this._updateAmbientBusGain(fadeSec);
  }

  fadeAmbient(active, fadeSec = 0.8) {
    this.ambientScale = active ? 1.0 : 0.0;
    this._updateAmbientBusGain(fadeSec);
  }

  // Sixteen-second, seam-blended noise beds for distinct ambient textures.
  createNoiseBuffer(type = 'velvet_brown') {
    this.init();
    if (!this.ctx) return null;
    const key = `${type}:${this.ctx.sampleRate}`;
    if (this.noiseBuffers.has(key)) return this.noiseBuffers.get(key);
    const bufferSize = this.ctx.sampleRate * 16;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0.0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'white') {
        data[i] = white;
      } else if (type === 'soft_pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
        b6 = white * 0.115926;
      } else {
        lastOut = (lastOut + (0.02 * white)) / 1.02;
        data[i] = lastOut;
      }
    }

    const crossfade = Math.min(Math.floor(this.ctx.sampleRate * 0.025), Math.floor(bufferSize / 2));
    if (crossfade > 0) {
      const seam = (data[0] + data[bufferSize - 1]) / 2;
      const head = data.slice(0, crossfade);
      const tail = data.slice(bufferSize - crossfade);
      if (crossfade === 1) {
        data[0] = seam;
        data[bufferSize - 1] = seam;
      } else {
        for (let i = 0; i < crossfade; i++) {
          const mix = i / (crossfade - 1);
          data[i] = seam * (1 - mix) + head[i] * mix;
          data[bufferSize - crossfade + i] = tail[i] * (1 - mix) + seam * mix;
        }
      }
    }
    let energy = 0;
    for (let i = 0; i < bufferSize; i++) energy += data[i] * data[i];
    const scale = 0.18 / Math.sqrt(energy / bufferSize || 1);
    for (let i = 0; i < bufferSize; i++) data[i] *= scale;

    this.noiseBuffers.set(key, buffer);
    return buffer;
  }

  _registerTrackSource(track, source) {
    track.sources.push(source);
    this.ambientSources.push(source);
    if (!this.currentAmbient) this.currentAmbient = source;
  }

  _registerTrackNodes(track, nodes) {
    track.nodes.push(...nodes);
    this.ambientNodes.push(...nodes);
  }

  addNoiseLayer(color, filters, volume = 1, track = null) {
    const dest = track ? track.gain : this.ambientGain;
    const source = this.ctx.createBufferSource();
    source.buffer = this.createNoiseBuffer(color);
    source.loop = true;
    let output = source;
    const nodes = [];

    filters.forEach(settings => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = settings.type;
      filter.frequency.setValueAtTime(settings.frequency, this.ctx.currentTime);
      filter.Q.setValueAtTime(settings.Q ?? 0.7, this.ctx.currentTime);
      if (settings.gain !== undefined && filter.gain && typeof filter.gain.setValueAtTime === 'function') {
        filter.gain.setValueAtTime(settings.gain, this.ctx.currentTime);
      }
      output.connect(filter);
      output = filter;
      nodes.push(filter);
    });

    const layerGain = this.ctx.createGain();
    layerGain.gain.setValueAtTime(volume, this.ctx.currentTime);
    output.connect(layerGain);
    layerGain.connect(dest);
    nodes.push(layerGain);

    if (track) {
      this._registerTrackNodes(track, nodes);
      this._registerTrackSource(track, source);
    } else {
      this.ambientNodes.push(...nodes);
      this.ambientSources.push(source);
      if (!this.currentAmbient) this.currentAmbient = source;
    }
    source.start();
    return { source, filters: nodes.slice(0, -1), gain: layerGain };
  }

  addAmbientLfo(target, frequency, depth, track = null) {
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(frequency, this.ctx.currentTime);
    lfoGain.gain.setValueAtTime(depth, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(target);
    lfo.start();
    if (track) {
      this._registerTrackSource(track, lfo);
      this._registerTrackNodes(track, [lfoGain]);
    } else {
      this.ambientSources.push(lfo);
      this.ambientNodes.push(lfoGain);
    }
    if (!this.currentLfo) this.currentLfo = lfo;
    return lfo;
  }

  addAmbientInterval(callback, delay, track = null) {
    const timer = setInterval(callback, delay);
    this.ambientIntervals.push(timer);
    if (track) track.intervals.push(timer);
    this.zenTimer = timer;
    return timer;
  }

  addAmbientRandomLoop(callback, minDelay, maxDelay, track = null) {
    const runGain = track ? track.gain : this.ambientGain;
    const isAlive = () => track ? this.activeTracks.get(track.id) === track : this.ambientGain === runGain;
    const schedule = () => {
      if (!isAlive()) return;
      const timer = setTimeout(() => {
        this.ambientTimeouts = this.ambientTimeouts.filter(id => id !== timer);
        if (track) track.timeouts = track.timeouts.filter(id => id !== timer);
        if (!isAlive()) return;
        callback();
        schedule();
      }, minDelay + Math.random() * (maxDelay - minDelay));
      this.ambientTimeouts.push(timer);
      if (track) track.timeouts.push(timer);
    };
    schedule();
  }

  createTransientBuffer(duration) {
    const sampleRate = this.ctx.sampleRate;
    const size = Math.max(16, Math.floor(sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, size, sampleRate);
    const data = buffer.getChannelData(0);
    const attack = Math.max(1, Math.floor(sampleRate * 0.002));
    for (let i = 0; i < size; i++) {
      const fadeIn = Math.min(1, i / attack);
      const fadeOut = Math.pow(Math.max(0, 1 - i / size), 2);
      data[i] = (Math.random() * 2 - 1) * fadeIn * fadeOut;
    }
    return buffer;
  }

  trackOneShot(source, nodes, startAt, endAt, track = null) {
    this.ambientSources.push(source);
    this.ambientNodes.push(...nodes);
    if (track) {
      track.sources.push(source);
      track.nodes.push(...nodes);
    }
    source.onended = () => {
      this.ambientSources = this.ambientSources.filter(item => item !== source);
      this.ambientNodes = this.ambientNodes.filter(item => !nodes.includes(item));
      if (track) {
        track.sources = track.sources.filter(item => item !== source);
        track.nodes = track.nodes.filter(item => !nodes.includes(item));
      }
      try { source.disconnect(); } catch (e) {}
      nodes.forEach(node => { try { node.disconnect(); } catch (e) {} });
    };
    source.start(startAt);
    source.stop(endAt);
  }

  addNoiseTransient({ duration, filters, volume }, track = null) {
    const dest = track ? track.gain : this.ambientGain;
    const source = this.ctx.createBufferSource();
    source.buffer = this.createTransientBuffer(duration);
    const nodes = [];
    let output = source;
    filters.forEach(settings => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = settings.type;
      filter.frequency.setValueAtTime(settings.frequency, this.ctx.currentTime);
      filter.Q.setValueAtTime(settings.Q ?? 0.8, this.ctx.currentTime);
      output.connect(filter);
      output = filter;
      nodes.push(filter);
    });
    const envelope = this.ctx.createGain();
    const now = this.ctx.currentTime;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    output.connect(envelope);
    envelope.connect(dest);
    nodes.push(envelope);
    this.trackOneShot(source, nodes, now, now + duration + 0.005, track);
  }

  addAmbientTone(frequency, volume, duration, partials = [{ ratio: 1, level: 1 }], track = null) {
    const dest = track ? track.gain : this.ambientGain;
    const now = this.ctx.currentTime;
    partials.forEach(partial => {
      const oscillator = this.ctx.createOscillator();
      const envelope = this.ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency * partial.ratio, now);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.linearRampToValueAtTime(volume * partial.level, now + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(envelope);
      envelope.connect(dest);
      this.trackOneShot(oscillator, [envelope], now, now + duration + 0.02, track);
    });
  }

  _startTrack(type, level = 1.0) {
    if (!AMBIENT_TRACK_META.some(item => item.id === type) || !this.ctx) return;
    this._ensureAmbientBus();
    const now = this.ctx.currentTime;
    const trackGain = this.ctx.createGain();
    const safeLevel = Math.max(0.0001, Math.min(1, level));
    trackGain.gain.setValueAtTime(0.001, now);
    trackGain.gain.linearRampToValueAtTime(safeLevel, now + 0.35);
    trackGain.connect(this.ambientGain);

    const track = {
      id: type,
      gain: trackGain,
      sources: [],
      nodes: [trackGain],
      intervals: [],
      timeouts: [],
      level: safeLevel
    };
    this.ambientNodes.push(trackGain);
    this.activeTracks.set(type, track);

    if (type === 'rain') {
      this.addNoiseLayer('velvet_brown', [
        { type: 'highpass', frequency: 45 }, { type: 'lowpass', frequency: 260, Q: 0.55 }
      ], 0.22, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 220 }, { type: 'lowpass', frequency: 5100, Q: 0.45 }
      ], 0.34, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 1600 }, { type: 'lowpass', frequency: 6500, Q: 0.5 }
      ], 0.04, track);

      this.addAmbientRandomLoop(() => {
        this.addNoiseTransient({
          duration: 0.026 + Math.random() * 0.025,
          filters: [
            { type: 'highpass', frequency: 900 + Math.random() * 700 },
            { type: 'bandpass', frequency: 2200 + Math.random() * 2200, Q: 0.85 },
            { type: 'lowpass', frequency: 6200 }
          ],
          volume: 0.085 + Math.random() * 0.055
        }, track);
      }, 350, 1200, track);

      this.addAmbientRandomLoop(() => {
        this.addNoiseTransient({
          duration: 0.07 + Math.random() * 0.05,
          filters: [
            { type: 'bandpass', frequency: 360 + Math.random() * 420, Q: 2.0 },
            { type: 'lowpass', frequency: 1350 }
          ],
          volume: 0.34 + Math.random() * 0.2
        }, track);
        this.addNoiseTransient({
          duration: 0.018 + Math.random() * 0.022,
          filters: [
            { type: 'highpass', frequency: 1000 },
            { type: 'bandpass', frequency: 2400 + Math.random() * 1800, Q: 0.85 }
          ],
          volume: 0.1 + Math.random() * 0.09
        }, track);
      }, 800, 2200, track);

    } else if (type === 'fire') {
      this.addNoiseLayer('velvet_brown', [
        { type: 'lowpass', frequency: 260, Q: 0.65 }
      ], 0.95, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'lowpass', frequency: 1150, Q: 0.65 }
      ], 0.42, track);
      this.addAmbientRandomLoop(() => {
        const duration = 0.012 + Math.random() * 0.035;
        this.addNoiseTransient({
          duration,
          filters: [{ type: 'bandpass', frequency: 1100 + Math.random() * 3800, Q: 0.75 }],
          volume: 0.2 + Math.random() * 0.22
        }, track);
        if (Math.random() < 0.18) {
          this.addNoiseTransient({
            duration: 0.025 + Math.random() * 0.035,
            filters: [{ type: 'lowpass', frequency: 650 + Math.random() * 500 }],
            volume: 0.16 + Math.random() * 0.14
          }, track);
        }
      }, 130, 1050, track);

    } else if (type === 'cafe') {
      this.addNoiseLayer('velvet_brown', [
        { type: 'lowpass', frequency: 240, Q: 0.6 }
      ], 0.42, track);
      [
        { frequency: 310, volume: 0.38, drift: 42, rate: 0.13 },
        { frequency: 760, volume: 0.25, drift: 95, rate: 0.17 },
        { frequency: 1480, volume: 0.13, drift: 170, rate: 0.11 }
      ].forEach(band => {
        const layer = this.addNoiseLayer('soft_pink', [
          { type: 'highpass', frequency: 140 },
          { type: 'bandpass', frequency: band.frequency, Q: 0.55 }
        ], band.volume, track);
        this.addAmbientLfo(layer.filters[1].frequency, band.rate, band.drift, track);
      });
      this.addAmbientInterval(() => {
        if (this.activeTracks.get('cafe') !== track || Math.random() > 0.7) return;
        this.addAmbientTone(1350 + Math.random() * 650, 0.012 + Math.random() * 0.008, 0.45 + Math.random() * 0.35,
          [{ ratio: 1, level: 1 }, { ratio: 2.72, level: 0.22 }, { ratio: 4.15, level: 0.06 }], track);
      }, 7000, track);

    } else if (type === 'white') {
      this.addNoiseLayer('white', [
        { type: 'highpass', frequency: 80 }, { type: 'lowpass', frequency: 10500, Q: 0.5 }
      ], 0.72, track);

    } else if (type === 'zen') {
      this.addNoiseLayer('velvet_brown', [
        { type: 'lowpass', frequency: 190, Q: 0.6 }
      ], 0.55, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'lowpass', frequency: 520, Q: 0.55 }
      ], 0.76, track);
      const windLayer = this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 900 }, { type: 'lowpass', frequency: 4200, Q: 0.4 }
      ], 0.18, track);
      this.addAmbientLfo(windLayer.filters[1].frequency, 0.055, 950, track);
      this.addAmbientInterval(() => {
        if (this.activeTracks.get('zen') !== track || Math.random() > 0.68) return;
        const pentatonic = [523.25, 659.25, 783.99, 987.77, 1046.5];
        const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
        this.addAmbientTone(freq, 0.075 + Math.random() * 0.025, 3.2,
          [{ ratio: 1, level: 1 }, { ratio: 2.76, level: 0.22 }, { ratio: 5.4, level: 0.08 }], track);
      }, 4000, track);

    } else if (type === 'shield') {
      // Speech-band acoustic masking: deep velvet rumble + warm vocal-range pink cocoon
      this.addNoiseLayer('velvet_brown', [
        { type: 'highpass', frequency: 38 }, { type: 'lowpass', frequency: 310, Q: 0.55 }
      ], 0.85, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 240 }, { type: 'lowpass', frequency: 2900, Q: 0.45 }
      ], 0.62, track);
      const airLayer = this.addNoiseLayer('soft_pink', [
        { type: 'bandpass', frequency: 1100, Q: 0.5 }
      ], 0.28, track);
      this.addAmbientLfo(airLayer.filters[0].frequency, 0.04, 180, track);

    } else if (type === 'train') {
      // Midnight carriage hum + rhythmic soft rail-joint pulse
      this.addNoiseLayer('velvet_brown', [
        { type: 'highpass', frequency: 32 }, { type: 'lowpass', frequency: 185, Q: 0.7 }
      ], 1.0, track);
      const cabinWind = this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 140 }, { type: 'lowpass', frequency: 1200, Q: 0.5 }
      ], 0.26, track);
      this.addAmbientLfo(cabinWind.filters[1].frequency, 0.09, 220, track);
      this.addAmbientInterval(() => {
        if (this.activeTracks.get('train') !== track) return;
        this.addNoiseTransient({
          duration: 0.09,
          filters: [{ type: 'lowpass', frequency: 190, Q: 0.9 }],
          volume: 0.42
        }, track);
        const beat = setTimeout(() => {
          this.ambientTimeouts = this.ambientTimeouts.filter(id => id !== beat);
          track.timeouts = track.timeouts.filter(id => id !== beat);
          if (this.activeTracks.get('train') !== track) return;
          this.addNoiseTransient({
            duration: 0.08,
            filters: [{ type: 'lowpass', frequency: 165, Q: 0.85 }],
            volume: 0.3
          }, track);
        }, 230);
        this.ambientTimeouts.push(beat);
        track.timeouts.push(beat);
      }, 1850, track);

    } else if (type === 'study') {
      // Quiet library room tone + subtle page turns & pencil whispers
      this.addNoiseLayer('velvet_brown', [
        { type: 'lowpass', frequency: 220, Q: 0.55 }
      ], 0.36, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 220 }, { type: 'lowpass', frequency: 1800, Q: 0.45 }
      ], 0.16, track);
      this.addAmbientRandomLoop(() => {
        this.addNoiseTransient({
          duration: 0.14 + Math.random() * 0.12,
          filters: [
            { type: 'highpass', frequency: 650 },
            { type: 'bandpass', frequency: 1600 + Math.random() * 900, Q: 0.75 },
            { type: 'lowpass', frequency: 3600 }
          ],
          volume: 0.12 + Math.random() * 0.07
        }, track);
      }, 2800, 7200, track);

    } else if (type === 'binaural') {
      // Gentle 40Hz focus beat (200Hz L / 240Hz R when stereo panning available)
      const pairs = [
        { freq: 200, pan: -0.75 },
        { freq: 240, pan: 0.75 }
      ];
      pairs.forEach(({ freq, pan }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.055, now);
        osc.connect(gain);
        if (typeof this.ctx.createStereoPanner === 'function') {
          const panner = this.ctx.createStereoPanner();
          panner.pan.setValueAtTime(pan, now);
          gain.connect(panner);
          panner.connect(trackGain);
          this._registerTrackNodes(track, [gain, panner]);
        } else {
          gain.connect(trackGain);
          this._registerTrackNodes(track, [gain]);
        }
        osc.start();
        this._registerTrackSource(track, osc);
      });
    }
  }

  _stopTrack(type) {
    const track = this.activeTracks.get(type);
    if (!track) return;
    this.activeTracks.delete(type);

    track.intervals.forEach(timer => {
      clearInterval(timer);
      this.ambientIntervals = this.ambientIntervals.filter(id => id !== timer);
    });
    track.timeouts.forEach(timer => {
      clearTimeout(timer);
      this.ambientTimeouts = this.ambientTimeouts.filter(id => id !== timer);
    });
    track.sources.forEach(source => {
      try { source.stop(); } catch (e) {}
      try { source.disconnect(); } catch (e) {}
      this.ambientSources = this.ambientSources.filter(item => item !== source);
    });
    track.nodes.forEach(node => {
      try { node.disconnect(); } catch (e) {}
      this.ambientNodes = this.ambientNodes.filter(item => item !== node);
    });
    if (this.activeTracks.size === 0) {
      this._teardownAmbientBus();
    }
  }

  _teardownAmbientBus() {
    this.currentAmbient = null;
    this.currentLfo = null;
    this.zenTimer = null;
    if (this.ambientGain) {
      try { this.ambientGain.disconnect(); } catch (e) {}
      this.ambientGain = null;
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (e) {}
    }
  }

  // Backward-compatible single ambient launcher
  playAmbient(type) {
    this.init();
    this.stopAmbient();
    if (!AMBIENT_TRACK_META.some(item => item.id === type) || !this.ctx) return;
    this.ambientScale = 1.0;
    this._startTrack(type, 1.0);
  }

  // Multi-track mixer reconciliation: tracks = { rain: 0..100, fire: 0..100, ... }
  setTrackMix(tracks = {}, { active = true } = {}) {
    this.init();
    if (!this.ctx) return;
    const entries = AMBIENT_TRACK_META.map(meta => [meta.id, Math.max(0, Math.min(100, Number(tracks[meta.id]) || 0))]);
    const hasAny = entries.some(([, pct]) => pct > 0);
    if (!hasAny) {
      this.stopAmbient();
      return;
    }
    this.ambientScale = active ? 1.0 : 0.0;
    this._ensureAmbientBus();
    this._updateAmbientBusGain(0.35);

    entries.forEach(([id, pct]) => {
      const level = pct / 100;
      const existing = this.activeTracks.get(id);
      if (pct <= 0) {
        if (existing) this._stopTrack(id);
      } else if (!existing) {
        this._startTrack(id, level);
      } else {
        existing.level = level;
        const now = this.ctx.currentTime;
        existing.gain.gain.setValueAtTime(existing.gain.gain.value || level, now);
        existing.gain.gain.linearRampToValueAtTime(level, now + 0.15);
      }
    });
  }

  stopAmbient() {
    for (const id of [...this.activeTracks.keys()]) {
      this._stopTrack(id);
    }
    this.ambientIntervals.forEach(timer => clearInterval(timer));
    this.ambientIntervals = [];
    this.ambientTimeouts.forEach(timer => clearTimeout(timer));
    this.ambientTimeouts = [];

    const sources = this.ambientSources;
    this.ambientSources = [];
    sources.forEach(source => {
      try { source.stop(); } catch (e) {}
      try { source.disconnect(); } catch (e) {}
    });

    const nodes = this.ambientNodes;
    this.ambientNodes = [];
    nodes.forEach(node => {
      try { node.disconnect(); } catch (e) {}
    });
    this._teardownAmbientBus();
  }

  getSpectrumLevels(barCount = 12) {
    if (!this.activeTracks.size || this.ambientMuted || this.ambientScale <= 0.01 || this.masterVolume <= 0) {
      return new Array(barCount).fill(0.08);
    }
    if (this.analyser && this._spectrumBuf && typeof this.analyser.getByteFrequencyData === 'function') {
      this.analyser.getByteFrequencyData(this._spectrumBuf);
      const binStep = Math.max(1, Math.floor(this._spectrumBuf.length / barCount));
      const out = [];
      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < binStep; j++) sum += this._spectrumBuf[Math.min(this._spectrumBuf.length - 1, i * binStep + j)];
        const norm = (sum / binStep) / 255;
        out.push(Math.max(0.12, Math.min(1, norm * 1.45)));
      }
      return out;
    }
    const t = Date.now() / 600;
    return Array.from({ length: barCount }, (_, i) => 0.25 + 0.35 * Math.abs(Math.sin(t + i * 0.55)));
  }

  // Subtle magnetic snap audio tick
  playSnapClick() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.025);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start(now);
    osc.stop(now + 0.03);
  }

  // Retro console cartridge click for focus launch ritual
  playCartridgeClick() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [0, 0.055].forEach((offset, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(idx === 0 ? 420 : 760, now + offset);
      osc.frequency.exponentialRampToValueAtTime(idx === 0 ? 180 : 320, now + offset + 0.035);
      gain.gain.setValueAtTime(0.18, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.04);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(now + offset);
      osc.stop(now + offset + 0.045);
    });
  }

  // Warm non-jarring bell when Flowtime reaches 00:00 and begins overtime
  playGentleChime() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 783.99].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      const start = now + idx * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.75);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(start);
      osc.stop(start + 0.8);
    });
  }

  // Playful soft double-tap when Focus Guard companion nudges user
  playNudgeBlip() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [659.25, 587.33].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const start = now + idx * 0.11;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(start);
      osc.stop(start + 0.1);
    });
  }

  // 8-Bit Retro Chime (Square Wave Arpeggio)
  play8BitTone(freqs = [523.25, 659.25, 783.99, 1046.5], duration = 0.08) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + idx * duration);

      const start = now + idx * duration;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 1.8);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(start);
      osc.stop(start + duration * 2);
    });
  }

  // 8-Bit Victory Fanfare on Focus Complete
  playVictoryFanfare(secret = false) {
    if (secret) {
      this.play8BitTone([523.25, 659.25, 783.99, 1046.5, 987.77, 1318.5, 1567.98], 0.09);
    } else {
      this.play8BitTone([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.1);
    }
  }

  // Escalating 8-bit alarm ringing
  startEscalatingAlarm(gentle = true) {
    this.init();
    this.stopAlarm();
    if (!this.ctx) return;
    this.alarmGain = this.ctx.createGain();
    this.alarmGain.connect(this.masterGain);
    let step = 0;

    const playBeep = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      const baseFreq = gentle ? 587.33 + Math.min(step * 30, 300) : 887.33;
      osc.frequency.setValueAtTime(baseFreq, now);

      const currentVol = gentle ? Math.min(0.15 + step * 0.05, 0.8) : 0.8;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(currentVol, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.alarmGain);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(now);
      osc.stop(now + 0.4);

      step++;
    };

    playBeep();
    this.alarmInterval = setInterval(playBeep, 1600);
  }

  stopAlarm() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
    if (this.alarmGain) {
      this.alarmGain.disconnect();
      this.alarmGain = null;
    }
  }
}
