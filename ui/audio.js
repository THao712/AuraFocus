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
  rain_fire: { label: '雨夜壁炉', tracks: { rain: 50, fire: 82 } },
  office_shield: { label: '办公降噪', tracks: { shield: 75, cafe: 22 } },
  night_train: { label: '深夜列车', tracks: { train: 85, rain: 28 } },
  pixel_zen: { label: '像素禅房', tracks: { zen: 62, study: 38, shield: 15 } }
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
    this._layerCounter = 0;
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

  _ensureAmbientBus(fadeSec = 0.85) {
    this.init();
    if (!this.ctx) return null;
    if (!this.ambientGain) {
      const now = this.ctx.currentTime;
      this.ambientGain = this.ctx.createGain();
      const target = this.ambientMuted ? 0.0001 : 0.32 * this.ambientScale;
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

  _updateAmbientBusGain(fadeSec = 0.45) {
    if (!this.ambientGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this.ambientMuted ? 0.0001 : Math.max(0.0001, 0.32 * this.ambientScale);
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

  fadeAmbient(active, fadeSec = 0.85) {
    this.ambientScale = active ? 1.0 : 0.0;
    this._updateAmbientBusGain(fadeSec);
  }

  // Twenty-four-second equal-power overlap-add noise beds:
  // continuous across loop wrap with constant RMS energy (no loudness dip or click).
  createNoiseBuffer(type = 'velvet_brown') {
    this.init();
    if (!this.ctx) return null;
    const key = `${type}:${this.ctx.sampleRate}`;
    if (this.noiseBuffers.has(key)) return this.noiseBuffers.get(key);

    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 24;
    const overlap = Math.max(1, Math.min(Math.floor(sampleRate * 0.75), Math.floor(bufferSize / 4)));
    const warmup = Math.min(sampleRate * 2, 4096);
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    const tail = new Float32Array(overlap);

    let lastOut = 0.0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    const nextSample = () => {
      const white = Math.random() * 2 - 1;
      if (type === 'white') return white;
      if (type === 'soft_pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const out = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
        b6 = white * 0.115926;
        return out;
      }
      lastOut = (lastOut + (0.02 * white)) / 1.02;
      return lastOut;
    };

    // Warm up filter state so sample 0 starts in steady-state distribution.
    for (let i = 0; i < warmup; i++) nextSample();
    for (let i = 0; i < bufferSize; i++) data[i] = nextSample();
    // Continue the exact filter trajectory past bufferSize-1 for seamless wraparound.
    for (let i = 0; i < overlap; i++) tail[i] = nextSample();

    // Equal-power cosine/sine overlap-add: cos^2 + sin^2 = 1 preserves exact RMS across seam.
    for (let i = 0; i < overlap; i++) {
      const phase = (i / overlap) * (Math.PI * 0.5);
      data[i] = tail[i] * Math.cos(phase) + data[i] * Math.sin(phase);
    }

    // Remove residual DC offset (prevents slow brown-noise drift/thumps) before RMS normalization.
    let sum = 0;
    for (let i = 0; i < bufferSize; i++) sum += data[i];
    const mean = sum / bufferSize;
    let energy = 0;
    for (let i = 0; i < bufferSize; i++) {
      const centered = data[i] - mean;
      data[i] = centered;
      energy += centered * centered;
    }
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
    const buffer = this.createNoiseBuffer(color);
    source.buffer = buffer;
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

    // Stagger each layer's start offset so shared noise beds stay decorrelated
    // (eliminates comb-filtering and prevents multiple layers wrapping together).
    const duration = buffer ? (buffer.duration || (buffer.length / (buffer.sampleRate || this.ctx.sampleRate || 48000))) : 0;
    const offset = duration > 0 ? ((this._layerCounter++ * 4.317) % duration) : 0;
    source.start(0, offset);
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

  createTransientBuffer(duration, attackSec = 0.004) {
    const sampleRate = this.ctx.sampleRate;
    const size = Math.max(16, Math.floor(sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, size, sampleRate);
    const data = buffer.getChannelData(0);
    const attack = Math.max(1, Math.min(Math.floor(size * 0.4), Math.floor(sampleRate * attackSec)));
    for (let i = 0; i < size; i++) {
      const fadeIn = i < attack ? Math.sin((i / attack) * (Math.PI * 0.5)) : 1;
      const fadeOut = Math.pow(Math.max(0, 1 - i / size), 2.1);
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

  addNoiseTransient({ duration, filters, volume, attack = 0.004 }, track = null) {
    const dest = track ? track.gain : this.ambientGain;
    const source = this.ctx.createBufferSource();
    source.buffer = this.createTransientBuffer(duration, attack);
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
    const rampIn = Math.min(duration * 0.35, Math.max(0.003, attack));
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(volume, now + rampIn);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    output.connect(envelope);
    envelope.connect(dest);
    nodes.push(envelope);
    this.trackOneShot(source, nodes, now, now + duration + 0.006, track);
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
      envelope.gain.linearRampToValueAtTime(volume * partial.level, now + 0.04);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(envelope);
      envelope.connect(dest);
      this.trackOneShot(oscillator, [envelope], now, now + duration + 0.025, track);
    });
  }

  _startTrack(type, level = 1.0) {
    if (!AMBIENT_TRACK_META.some(item => item.id === type) || !this.ctx) return;
    this._ensureAmbientBus();
    const now = this.ctx.currentTime;
    const trackGain = this.ctx.createGain();
    const safeLevel = Math.max(0.0001, Math.min(1, level));
    trackGain.gain.setValueAtTime(0.001, now);
    trackGain.gain.linearRampToValueAtTime(safeLevel, now + 0.45);
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
      // Plush enveloping rainfall: warm low floor + smooth voice-masking mid body + soft fine mist
      this.addNoiseLayer('velvet_brown', [
        { type: 'highpass', frequency: 42 }, { type: 'lowpass', frequency: 240, Q: 0.5 }
      ], 0.36, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 180 }, { type: 'lowpass', frequency: 3400, Q: 0.45 }
      ], 0.48, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 1200 }, { type: 'lowpass', frequency: 4800, Q: 0.45 }
      ], 0.07, track);

      this.addAmbientRandomLoop(() => {
        this.addNoiseTransient({
          duration: 0.028 + Math.random() * 0.024,
          attack: 0.005,
          filters: [
            { type: 'highpass', frequency: 850 + Math.random() * 550 },
            { type: 'bandpass', frequency: 1800 + Math.random() * 1500, Q: 0.8 },
            { type: 'lowpass', frequency: 4400 }
          ],
          volume: 0.055 + Math.random() * 0.035
        }, track);
      }, 380, 1250, track);

      this.addAmbientRandomLoop(() => {
        this.addNoiseTransient({
          duration: 0.065 + Math.random() * 0.045,
          attack: 0.006,
          filters: [
            { type: 'bandpass', frequency: 340 + Math.random() * 340, Q: 1.6 },
            { type: 'lowpass', frequency: 1150 }
          ],
          volume: 0.17 + Math.random() * 0.11
        }, track);
        this.addNoiseTransient({
          duration: 0.022 + Math.random() * 0.02,
          attack: 0.004,
          filters: [
            { type: 'highpass', frequency: 900 },
            { type: 'bandpass', frequency: 1900 + Math.random() * 1200, Q: 0.8 },
            { type: 'lowpass', frequency: 4200 }
          ],
          volume: 0.06 + Math.random() * 0.05
        }, track);
      }, 900, 2400, track);

    } else if (type === 'fire') {
      // Rich crackling fireplace: deep warm hearth + lively dancing flame glow + unmistakable warm wood pops
      this.addNoiseLayer('velvet_brown', [
        { type: 'highpass', frequency: 36 }, { type: 'lowpass', frequency: 280, Q: 0.6 }
      ], 1.05, track);
      const glow = this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 140 }, { type: 'lowpass', frequency: 1500, Q: 0.55 }
      ], 0.64, track);
      this.addAmbientLfo(glow.filters[1].frequency, 0.16, 260, track);
      this.addAmbientRandomLoop(() => {
        const duration = 0.014 + Math.random() * 0.026;
        this.addNoiseTransient({
          duration,
          attack: 0.002,
          filters: [
            { type: 'bandpass', frequency: 1500 + Math.random() * 2300, Q: 1.05 },
            { type: 'lowpass', frequency: 5200 }
          ],
          volume: 0.38 + Math.random() * 0.34
        }, track);
        if (Math.random() < 0.42) {
          this.addNoiseTransient({
            duration: 0.028 + Math.random() * 0.03,
            attack: 0.003,
            filters: [
              { type: 'bandpass', frequency: 550 + Math.random() * 550, Q: 1.35 },
              { type: 'lowpass', frequency: 1600 }
            ],
            volume: 0.28 + Math.random() * 0.22
          }, track);
        }
      }, 130, 1050, track);

    } else if (type === 'cafe') {
      // Cozy cafe murmur: warm room floor + speech-band blanket + slow drifting vocal formants
      this.addNoiseLayer('velvet_brown', [
        { type: 'highpass', frequency: 38 }, { type: 'lowpass', frequency: 230, Q: 0.55 }
      ], 0.50, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 180 }, { type: 'lowpass', frequency: 2200, Q: 0.45 }
      ], 0.22, track);
      [
        { frequency: 290, volume: 0.38, drift: 38, rate: 0.08 },
        { frequency: 720, volume: 0.27, drift: 82, rate: 0.11 },
        { frequency: 1420, volume: 0.14, drift: 145, rate: 0.07 }
      ].forEach(band => {
        const layer = this.addNoiseLayer('soft_pink', [
          { type: 'highpass', frequency: 140 },
          { type: 'bandpass', frequency: band.frequency, Q: 0.5 }
        ], band.volume, track);
        this.addAmbientLfo(layer.filters[1].frequency, band.rate, band.drift, track);
      });
      this.addAmbientInterval(() => {
        if (this.activeTracks.get('cafe') !== track || Math.random() > 0.65) return;
        this.addAmbientTone(1300 + Math.random() * 550, 0.009 + Math.random() * 0.006, 0.5 + Math.random() * 0.35,
          [{ ratio: 1, level: 1 }, { ratio: 2.72, level: 0.18 }, { ratio: 4.15, level: 0.04 }], track);
      }, 7000, track);

    } else if (type === 'white') {
      // Velvet-contoured broadband masking noise (rolls off harsh >5.5kHz ear fatigue)
      this.addNoiseLayer('white', [
        { type: 'highpass', frequency: 90 }, { type: 'lowpass', frequency: 5500, Q: 0.5 }
      ], 0.66, track);

    } else if (type === 'zen') {
      // Silky mountain breeze + warm speech-masking floor + mellow pentatonic wind chimes
      this.addNoiseLayer('velvet_brown', [
        { type: 'highpass', frequency: 36 }, { type: 'lowpass', frequency: 200, Q: 0.55 }
      ], 0.62, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 130 }, { type: 'lowpass', frequency: 820, Q: 0.5 }
      ], 0.78, track);
      const windLayer = this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 700 }, { type: 'lowpass', frequency: 2800, Q: 0.42 }
      ], 0.22, track);
      this.addAmbientLfo(windLayer.filters[1].frequency, 0.038, 650, track);
      this.addAmbientInterval(() => {
        if (this.activeTracks.get('zen') !== track || Math.random() > 0.65) return;
        const pentatonic = [523.25, 659.25, 783.99, 987.77, 1046.5];
        const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
        this.addAmbientTone(freq, 0.075 + Math.random() * 0.015, 3.8,
          [{ ratio: 1, level: 1 }, { ratio: 2.76, level: 0.14 }, { ratio: 5.4, level: 0.04 }], track);
      }, 4000, track);

    } else if (type === 'shield') {
      // Dedicated speech-band acoustic cocoon: warm brown base + lush vocal-range pink blanket
      this.addNoiseLayer('velvet_brown', [
        { type: 'highpass', frequency: 40 }, { type: 'lowpass', frequency: 280, Q: 0.55 }
      ], 0.90, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 180 }, { type: 'lowpass', frequency: 2400, Q: 0.5 }
      ], 0.78, track);
      const airLayer = this.addNoiseLayer('soft_pink', [
        { type: 'bandpass', frequency: 1200, Q: 0.45 },
        { type: 'lowpass', frequency: 3400, Q: 0.5 }
      ], 0.26, track);
      this.addAmbientLfo(airLayer.filters[0].frequency, 0.025, 120, track);

    } else if (type === 'train') {
      // Distinct midnight sleeper carriage: low rail resonance + swaying wind + iconic 4-beat cushioned rail-joint cadence
      this.addNoiseLayer('velvet_brown', [
        { type: 'highpass', frequency: 38 }, { type: 'lowpass', frequency: 185, Q: 0.7 }
      ], 0.85, track);
      const railRoll = this.addNoiseLayer('soft_pink', [
        { type: 'bandpass', frequency: 320, Q: 1.7 }
      ], 0.44, track);
      this.addAmbientLfo(railRoll.filters[0].frequency, 0.43, 55, track);
      const cabinWind = this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 260 }, { type: 'lowpass', frequency: 1550, Q: 0.5 }
      ], 0.34, track);
      this.addAmbientLfo(cabinWind.filters[1].frequency, 0.08, 340, track);

      const playRailClack = (bodyVol, woodyVol, pitchShift = 0) => {
        // Low cushioned wheel thud
        this.addNoiseTransient({
          duration: 0.105,
          attack: 0.008,
          filters: [{ type: 'lowpass', frequency: 190 + pitchShift, Q: 0.9 }],
          volume: bodyVol
        }, track);
        // Audible woody/steel rail-joint character (240-520Hz) so it reads clearly on speakers & headphones
        this.addNoiseTransient({
          duration: 0.075,
          attack: 0.005,
          filters: [
            { type: 'bandpass', frequency: 310 + pitchShift * 2, Q: 1.5 },
            { type: 'lowpass', frequency: 900 }
          ],
          volume: woodyVol
        }, track);
      };

      const triggerBogieCycle = () => {
        if (this.activeTracks.get('train') !== track) return;
        // Front bogie pair ("ku-dong") + rear bogie pair ("ku-dong")
        const pattern = [
          { delay: 0, body: 0.56, woody: 0.44, shift: 12 },
          { delay: 195, body: 0.44, woody: 0.34, shift: -10 },
          { delay: 720, body: 0.48, woody: 0.38, shift: 6 },
          { delay: 915, body: 0.38, woody: 0.28, shift: -14 }
        ];
        pattern.forEach(hit => {
          if (hit.delay === 0) {
            playRailClack(hit.body, hit.woody, hit.shift);
            return;
          }
          const beat = setTimeout(() => {
            this.ambientTimeouts = this.ambientTimeouts.filter(id => id !== beat);
            track.timeouts = track.timeouts.filter(id => id !== beat);
            if (this.activeTracks.get('train') !== track) return;
            playRailClack(hit.body, hit.woody, hit.shift);
          }, hit.delay);
          this.ambientTimeouts.push(beat);
          track.timeouts.push(beat);
        });
      };

      triggerBogieCycle();
      this.addAmbientInterval(triggerBogieCycle, 2250, track);

    } else if (type === 'study') {
      // Quiet library room tone + warm masking floor + gentle soft page rustles
      this.addNoiseLayer('velvet_brown', [
        { type: 'highpass', frequency: 38 }, { type: 'lowpass', frequency: 210, Q: 0.55 }
      ], 0.46, track);
      this.addNoiseLayer('soft_pink', [
        { type: 'highpass', frequency: 180 }, { type: 'lowpass', frequency: 2000, Q: 0.45 }
      ], 0.30, track);
      this.addAmbientRandomLoop(() => {
        this.addNoiseTransient({
          duration: 0.16 + Math.random() * 0.12,
          attack: 0.015,
          filters: [
            { type: 'highpass', frequency: 580 },
            { type: 'bandpass', frequency: 1400 + Math.random() * 750, Q: 0.7 },
            { type: 'lowpass', frequency: 2600 }
          ],
          volume: 0.08 + Math.random() * 0.05
        }, track);
      }, 3200, 7800, track);

    } else if (type === 'binaural') {
      // Warm soothing 40Hz focus beat (180Hz L / 220Hz R when stereo panning available)
      const pairs = [
        { freq: 180, pan: -0.75 },
        { freq: 220, pan: 0.75 }
      ];
      pairs.forEach(({ freq, pan }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.045, now);
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
    this._updateAmbientBusGain(0.45);

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
        existing.gain.gain.linearRampToValueAtTime(level, now + 0.18);
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
