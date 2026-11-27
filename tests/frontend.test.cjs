const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.TZ = 'America/New_York';
const root = path.resolve(__dirname, '..');
const mascotsSource = fs.readFileSync(path.join(root, 'ui/mascots.js'), 'utf8');
const audioSource = fs.readFileSync(path.join(root, 'ui/audio.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'ui/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'ui/index.html'), 'utf8');

class Element {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.id = attrs.id;
    this.value = attrs.value || ''; this.listeners = {}; this.children = [];
    this.dataset = {}; this.style = {}; this.textContent = ''; this._classes = new Set();
    this.className = attrs.class || '';
    this.classList = {
      add: (...keys) => keys.forEach(key => this._classes.add(key)),
      remove: (...keys) => keys.forEach(key => this._classes.delete(key)),
      contains: key => this._classes.has(key),
      toggle: (key, force) => {
        const on = force ?? !this._classes.has(key);
        if (on) this._classes.add(key); else this._classes.delete(key);
        return on;
      }
    };
  }
  set className(value) { this._classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(' '); }
  set innerHTML(value) { this._html = value; this.children = []; }
  get innerHTML() { return this._html ?? this.textContent.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
  getAttribute(key) { return this.attrs[key]; }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(key, cb) { (this.listeners[key] ??= []).push(cb); }
  emit(key, extra = {}) { for (const cb of this.listeners[key] || []) cb({target: this, currentTarget: this, ...extra}); }
  appendChild(child) { child.parent = this; this.children.push(child); }
  querySelector(key) { this.queries ??= {}; return this.queries[key] ??= new Element(); }
  querySelectorAll() { return []; }
  closest(selector) {
    for (let current = this; current; current = current.parent) {
      if (selector.split(',').some(part => {
        const key = part.trim();
        return key.startsWith('.') ? current.classList.contains(key.slice(1))
          : key.startsWith('#') ? current.id === key.slice(1) : current.tagName.toLowerCase() === key;
      })) return current;
    }
    return null;
  }
  setPointerCapture() {}
  releasePointerCapture() {}
}

function fixture({at = '2026-10-25T12:00:00', state, legacy, api} = {}) {
  let time = new Date(at).getTime(), nextId = 0;
  const intervals = new Map(), timeouts = new Map(), frames = new Map(), listeners = {}, saved = new Map(), alerts = [];
  if (state) saved.set('aurafocus_state', JSON.stringify(state));
  for (const [key, value] of Object.entries(legacy || {})) saved.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  // No unsolicited default alarms in tests unless supplied explicitly.
  if (!state && !legacy?.aurafocus_alarms) saved.set('aurafocus_alarms', '[]');
  const all = [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map(match => {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]]));
    return new Element(match[1], attrs);
  });
  const byId = new Map(all.filter(el => el.id).map(el => [el.id, el]));
  const document = {
    body: new Element('body'), documentElement: new Element('html'),
    getElementById: id => { assert(byId.has(id), `Unknown DOM id: ${id}`); return byId.get(id); },
    createElement: tag => new Element(tag),
    querySelector: selector => {
      const m = selector.match(/^\[([^=\]]+)="([^"]*)"\]$/);
      if (m) return all.find(el => el.getAttribute(m[1]) === m[2]) || null;
      const part = selector.split(' ').at(-1);
      if (part.startsWith('.')) return all.find(el => el.classList.contains(part.slice(1))) || null;
      return null;
    },
    querySelectorAll: selector => {
      const part = selector.split(' ').at(-1);
      const attrMatch = part.match(/\[([^=\]]+)(?:="([^"]*)")?\]/);
      const classMatch = part.match(/\.([\w-]+)/g);
      return all.filter(el => {
        if (classMatch && !classMatch.every(cls => el.classList.contains(cls.slice(1)))) return false;
        if (attrMatch) {
          const val = el.getAttribute(attrMatch[1]);
          if (attrMatch[2] !== undefined) return val === attrMatch[2];
          return val !== undefined;
        }
        return Boolean(classMatch);
      });
    }
  };
  const window = {
    addEventListener: (key, cb) => (listeners[key] ??= []).push(cb),
    alert: message => alerts.push(message)
  };
  if (api) window.pywebview = {api};
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  }
  const sandbox = {
    window, document, Date: FakeDate, console: {log() {}, warn() {}, error() {}},
    localStorage: {getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value)},
    setInterval: (cb, ms) => { intervals.set(++nextId, {cb, ms}); return nextId; },
    clearInterval: id => intervals.delete(id),
    setTimeout: (cb, ms) => { timeouts.set(++nextId, {cb, ms}); return nextId; },
    clearTimeout: id => timeouts.delete(id),
    requestAnimationFrame: cb => { frames.set(++nextId, cb); return nextId; },
    cancelAnimationFrame: id => frames.delete(id)
  };
  vm.createContext(sandbox);
  vm.runInContext(
    mascotsSource + '\n' + audioSource + '\n' + source + '\nglobalThis.AppClass = AuraFocusApp; globalThis.SoundClass = SoundEngine;',
    sandbox
  );
  const app = new sandbox.AppClass();
  return {app, sandbox, document, window, all, saved, intervals, timeouts, alerts,
    now: () => time,
    advance: ms => { time += ms; },
    setTime: value => { time = new Date(value).getTime(); },
    emit: (key, event) => [...(listeners[key] || [])].forEach(cb => cb(event)),
    frame: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb()); }
  };
}

function silent(app) {
  for (const key of ['init', 'play8BitTone', 'playVictoryFanfare', 'startEscalatingAlarm', 'stopAlarm', 'playCartridgeClick', 'playGentleChime', 'playNudgeBlip']) {
    app.sound[key] = () => {};
  }
}
function state(overrides = {}) { return {version: 2, settings: {}, alarms: [], stats: {days: {}}, ...overrides}; }
function alarm(at, overrides = {}) { return {id: 'test', time: '12:00', title: 'test', repeat: 'daily', enabled: true, nextTriggerAt: new Date(at).getTime(), ...overrides}; }
function plain(value) { return JSON.parse(JSON.stringify(value)); }
async function microtasks() { for (let i = 0; i < 15; i++) await Promise.resolve(); }

test('countdown catches up after a delayed callback and completes only once', () => {
  const e = fixture({state: state({settings: {flowOvertime: false}})}); silent(e.app); e.app.toggleFocusTimer();
  e.advance(300000); e.app.tickFocus(); assert.equal(e.app.focusRemaining, 1200);
  e.advance(1200000); e.app.tickFocus(); e.app.tickFocus();
  assert.equal(e.app.focusState, 'idle');
  assert.deepEqual(plain(e.app.stats.days['2026-10-25']), {minutes: 25, sessions: 1});
});

test('pause preserves fractional seconds and excludes paused time', () => {
  const e = fixture(); silent(e.app); e.app.toggleFocusTimer();
  e.advance(550); e.app.toggleFocusTimer();
  assert.equal(e.app.focusRemainingMs, 1499450);
  e.advance(600000); e.app.toggleFocusTimer(); e.advance(450); e.app.tickFocus();
  assert.equal(e.app.focusRemainingMs, 1499000);
  e.app.resetFocusTimer(); assert.equal(e.app.focusRemainingMs, 1500000);
});

test('late completion is recorded on its deadline date, not wake-up date', () => {
  const e = fixture({at: '2026-10-24T23:00:00', state: state({settings: {flowOvertime: false}})}); silent(e.app); e.app.toggleFocusTimer();
  e.setTime('2026-10-25T08:00:00'); e.app.tickFocus();
  assert.equal(e.app.stats.days['2026-10-24'].minutes, 25);
  assert.equal(e.app.stats.days['2026-10-25'], undefined);
});

test('running duration selection cannot change its highlight; paused selection resets', () => {
  const e = fixture(); silent(e.app); e.app.init(); e.app.toggleFocusTimer();
  const chip = e.all.find(el => el.getAttribute('data-mins') === '60');
  assert(chip.disabled); chip.emit('click');
  assert(!chip.classList.contains('active')); assert.equal(e.app.focusDuration, 1500);
  e.app.toggleFocusTimer(); chip.emit('click');
  assert.equal(e.app.focusState, 'idle'); assert.equal(e.app.focusRemainingMs, 3600000);
  assert(chip.classList.contains('active'));
});

test('saving preferences after midnight cannot relabel yesterday\'s statistics', () => {
  const e = fixture({at: '2026-10-24T23:59:00', state: state({stats: {days: {'2026-10-24': {minutes: 25, sessions: 1}}}})});
  e.setTime('2026-10-25T00:01:00'); e.app.applyTheme('sunset'); e.app.checkGlobalClock();
  assert.equal(e.document.getElementById('stat-today-minutes').textContent, '0m');
  const saved = JSON.parse(e.saved.get('aurafocus_state'));
  assert.equal(saved.stats.days['2026-10-24'].minutes, 25); assert.equal(saved.stats.days['2026-10-25'], undefined);
});

test('seven-day chart includes today, fills gaps and uses real weekdays', () => {
  const e = fixture({state: state({stats: {days: {'2026-10-15': {minutes: 60, sessions: 2}, '2026-10-25': {minutes: 25, sessions: 1}}}})});
  e.app.renderStats();
  const cols = e.document.getElementById('heat-bars-container').children;
  assert.equal(cols.length, 7); assert.equal(cols[0].children[1].textContent, '周一');
  assert.equal(cols[6].children[1].textContent, '周日');
  assert.equal(cols[0].children[0].children.length, 0);
  assert(cols[6].children[0].children.length > 0); assert.match(cols[6].title, /2026-10-25: 25/);
});

test('legacy statistics migrate by date and malformed settings do not discard alarms', () => {
  const e = fixture({legacy: {
    aurafocus_settings: '{broken',
    aurafocus_alarms: [alarm('2026-10-25T12:00:00')],
    aurafocus_stats: {lastActiveDate: '2026-10-15', todayMinutes: 25, todaySessions: 1, history: [1,2,3,4,5,6,7]}
  }});
  assert.equal(e.app.alarms.length, 1); assert.equal(e.app.stats.days['2026-10-15'].minutes, 25);
  assert.equal(e.app.stats.days['2026-10-14'].minutes, 7);
  e.app.renderStats(); assert.equal(e.document.getElementById('stat-today-minutes').textContent, '0m');
});

test('missed one-time alarm fires once on resume and stays disabled across reload', () => {
  const e = fixture({at: '2026-10-25T11:59:50', state: state({alarms: [alarm('2026-10-25T12:00:00', {repeat: 'once'})]})});
  silent(e.app); e.setTime('2026-10-25T12:01:01'); e.app.checkAlarms(); e.app.checkAlarms();
  assert(e.app.activeRingingAlarm); assert(!e.app.alarms[0].enabled); assert.equal(e.app.alarmQueue.length, 0);
  const reloaded = fixture({state: JSON.parse(e.saved.get('aurafocus_state'))});
  assert(!reloaded.app.alarms[0].enabled);
});

test('long suspension catches up one occurrence per recurring alarm', () => {
  const e = fixture({state: state({alarms: [alarm('2026-10-15T12:00:00')]})}); silent(e.app);
  e.app.checkAlarms(); e.app.checkAlarms();
  assert(e.app.alarms[0].nextTriggerAt > e.now()); assert.equal(e.app.alarmQueue.length, 0);
});

test('workday scheduling skips weekends, including after missed Friday alarm', () => {
  const e = fixture({state: state({alarms: [alarm('2026-10-23T12:00:00', {repeat: 'workday'})]})}); silent(e.app);
  e.app.checkAlarms();
  assert.equal(new Date(e.app.alarms[0].nextTriggerAt).getDay(), 1);
  assert.equal(new Date(e.app.alarms[0].nextTriggerAt).getDate(), 26);
});

test('next workday occurrence follows local wall time across DST', () => {
  const e = fixture();
  const next = new Date(e.app.nextAlarmTime('09:00', 'workday', new Date('2026-10-30T10:00:00').getTime()));
  assert.equal(next.getDate(), 2); assert.equal(next.getMonth(), 10); assert.equal(next.getHours(), 9);
});

test('simultaneous alarms queue once and snooze is exactly five minutes across midnight', () => {
  const e = fixture({at: '2026-10-25T23:59:59', state: state({alarms: [alarm('2026-10-25T23:59:00'), alarm('2026-10-25T23:59:00', {title: 'second'})]})});
  silent(e.app); e.app.checkAlarms(); e.app.checkAlarms();
  assert.equal(e.app.alarmQueue.length, 1); const before = e.now(); e.app.snoozeAlarm();
  assert.equal(e.app.activeRingingAlarm.title, 'second');
  const snooze = e.app.alarms.at(-1);
  assert.equal(snooze.nextTriggerAt - before, 300000); assert.equal(snooze.time, '00:04');
});

test('nearest alarm respects the next actual workday', () => {
  const e = fixture({at: '2026-10-25T08:00:00', state: state({alarms: [
    alarm('2026-10-26T09:00:00', {title: 'workday', time: '09:00', repeat: 'workday'}),
    alarm('2026-10-25T10:00:00', {title: 'daily', time: '10:00'})
  ]})});
  e.app.checkGlobalClock(); assert.match(e.document.getElementById('capsule-subtext').textContent, /daily/);
});

test('gentle alarm preference reaches the audio engine', () => {
  const e = fixture({state: state({settings: {gentleAlarm: false}})}); let mode;
  e.app.sound.startEscalatingAlarm = gentle => { mode = gentle; };
  e.app.triggerAlarm(alarm('2026-10-25T12:00:00')); assert.equal(mode, false);
});

function fakeAudio(sampleRate = 32) {
  const nodes = []; let nextBufferId = 0;
  const parameter = () => ({events: [], setValueAtTime(value) {this.value = value; this.events.push(['set', value]);},
    linearRampToValueAtTime(value) {this.events.push(['linear', value]);}, exponentialRampToValueAtTime(value) {this.events.push(['exponential', value]);}});
  const node = () => {
    const value = {gain: parameter(), frequency: parameter(), Q: parameter(), connections: [], stopped: false, startArgs: null,
      connect(target) {this.connections.push(target);}, disconnect() {this.connections = [];},
      start(...args) {this.startArgs = args;}, stop() {this.stopped = true;}};
    nodes.push(value); return value;
  };
  return {nodes, state: 'running', currentTime: 0, sampleRate, destination: {},
    createGain: node, createOscillator: node, createBufferSource: node, createBiquadFilter: node,
    createBuffer: (_channels, size, sampleRate) => {
      const data = new Float32Array(size);
      return {id: ++nextBufferId, length: size, sampleRate, getChannelData: () => data};
    }};
}

test('ambient scenes use distinct noise beds and characteristic layers', () => {
  const scenes = {};
  for (const type of ['rain', 'fire', 'cafe', 'white', 'zen']) {
    const e = fixture(); const audio = fakeAudio(); e.app.sound.ctx = audio;
    const sound = e.app.sound;
    sound.playAmbient(type);
    scenes[type] = {
      buffers: audio.nodes.filter(node => node.buffer).map(node => node.buffer),
      filters: audio.nodes.filter(node => node.type).map(node => node.type),
      cache: sound.noiseBuffers,
      timers: e.intervals.size + e.timeouts.size
    };
    sound.stopAmbient();
  }
  const hasBed = (scene, color) => scene.buffers.includes(scene.cache.get(`${color}:32`));
  assert(hasBed(scenes.rain, 'soft_pink') && hasBed(scenes.rain, 'velvet_brown'));
  assert(hasBed(scenes.fire, 'soft_pink') && hasBed(scenes.fire, 'velvet_brown'));
  assert(hasBed(scenes.cafe, 'soft_pink') && hasBed(scenes.cafe, 'velvet_brown'));
  assert(hasBed(scenes.white, 'white'));
  assert(!hasBed(scenes.white, 'soft_pink') && !hasBed(scenes.white, 'velvet_brown'));
  assert(scenes.cafe.filters.filter(type => type === 'bandpass').length >= 3);
  assert.equal(scenes.white.timers, 0);
  assert.equal(scenes.rain.timers, 2);
  for (const type of ['fire', 'cafe', 'zen']) assert.equal(scenes[type].timers, 1);
});

test('looping noise buffers keep constant RMS energy across the repeat boundary without dips', () => {
  const e = fixture(); const audio = fakeAudio(400); e.app.sound.ctx = audio;
  for (const color of ['white', 'soft_pink', 'velvet_brown']) {
    const data = e.app.sound.createNoiseBuffer(color).getChannelData(0);
    assert.equal(data.length, audio.sampleRate * 24);
    const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
    assert(Math.abs(mean) < 0.005, `${color} DC offset too high: ${mean}`);
    const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    assert(Math.abs(rms - 0.18) < 0.01, `${color} overall RMS off: ${rms}`);
    // Measure energy across the 100ms seam window wrapping end -> start (old bug collapsed here).
    const halfWin = Math.floor(audio.sampleRate * 0.05);
    let seamEnergy = 0;
    for (let i = 0; i < halfWin; i++) {
      const a = data[data.length - halfWin + i];
      const b = data[i];
      seamEnergy += a * a + b * b;
    }
    const seamRms = Math.sqrt(seamEnergy / (halfWin * 2));
    if (color !== 'velvet_brown') {
      assert(seamRms > rms * 0.65, `${color} seam RMS dropped (audible dip): ${seamRms} vs ${rms}`);
    } else {
      assert(Math.abs(data[0] - data[data.length - 1]) < 0.08, `brown wrap step too large: ${Math.abs(data[0] - data[data.length - 1])}`);
    }
  }
});

test('multi-layer ambient tracks stagger buffer start offsets to prevent synchronized seams and phasing', () => {
  const e = fixture(); const audio = fakeAudio(200); e.app.sound.ctx = audio;
  e.app.sound.playAmbient('shield');
  const offsets = e.app.sound.ambientSources
    .filter(src => src.buffer)
    .map(src => src.startArgs?.[1]);
  assert.equal(offsets.length, 3);
  assert.equal(new Set(offsets.map(v => v.toFixed(3))).size, 3);
  e.app.sound.stopAmbient();
});

test('switching ambience clears every event timer and stops all scene sources', () => {
  const e = fixture(); const audio = fakeAudio(); e.app.sound.ctx = audio;
  e.app.sound.playAmbient('rain');
  const oldSources = [...e.app.sound.ambientSources];
  assert.equal(e.timeouts.size, 2);
  e.app.sound.playAmbient('white');
  assert.equal(e.timeouts.size, 0);
  assert(oldSources.every(source => source.stopped && source.connections.length === 0));
  e.app.sound.stopAmbient();
  assert.equal(e.app.sound.ambientSources.length, 0);
  assert.equal(e.app.sound.ambientNodes.length, 0);
});

test('rain drops are short noise bursts mixed and reclaimed with the scene', () => {
  const e = fixture(); const audio = fakeAudio(); e.app.sound.ctx = audio;
  e.sandbox.Math = Object.create(Math);
  e.sandbox.Math.random = () => 0.05;
  e.app.sound.playAmbient('rain');
  const sound = e.app.sound;
  const steadySources = new Set(sound.ambientSources);
  const steadyNodes = new Set(sound.ambientNodes);
  [...e.timeouts.values()].forEach(timer => timer.cb());
  const eventSources = sound.ambientSources.filter(source => !steadySources.has(source));
  const eventNodes = sound.ambientNodes.filter(node => !steadyNodes.has(node));
  assert.equal(eventSources.length, 3);
  assert(eventSources.every(source => source.buffer.length < audio.sampleRate * 16));
  const reaches = (node, target, seen = new Set()) => {
    if (node === target) return true;
    if (seen.has(node)) return false;
    seen.add(node);
    return node.connections.some(next => reaches(next, target, seen));
  };
  assert(eventSources.every(source => reaches(source, sound.ambientGain) && source.connections.length === 1));
  eventSources.forEach(source => source.onended());
  assert(eventSources.every(source => source.connections.length === 0));
  assert(eventNodes.every(node => node.connections.length === 0));
  assert(eventSources.every(source => !sound.ambientSources.includes(source)));
  e.app.sound.stopAmbient();
});

test('fire uses stronger crackle bursts and wind chimes play on a shorter cadence', () => {
  const fire = fixture(); const fireAudio = fakeAudio(); fire.app.sound.ctx = fireAudio;
  fire.sandbox.Math = Object.create(Math);
  fire.sandbox.Math.random = () => 0.05;
  fire.app.sound.playAmbient('fire');
  assert.equal([...fire.timeouts.values()][0].ms, 176);
  const fireBeds = new Set(fire.app.sound.ambientSources);
  [...fire.timeouts.values()][0].cb();
  const crackles = fire.app.sound.ambientSources.filter(source => !fireBeds.has(source));
  assert.equal(crackles.length, 2);
  assert(crackles.every(source => source.buffer));
  fire.app.sound.stopAmbient();

  const zen = fixture(); const zenAudio = fakeAudio(); zen.app.sound.ctx = zenAudio;
  zen.sandbox.Math = Object.create(Math);
  zen.sandbox.Math.random = () => 0.05;
  zen.app.sound.playAmbient('zen');
  assert.equal([...zen.intervals.values()][0].ms, 4000);
  [...zen.intervals.values()][0].cb();
  assert.equal(zenAudio.nodes.filter(node => node.type === 'sine').length, 3);
  assert(zenAudio.nodes.some(node => node.gain.events.some(([kind, value]) => kind === 'linear' && value >= 0.075)));
  zen.app.sound.stopAmbient();
});

test('zero volume mutes all audio paths even with ambient LFOs', () => {
  for (const type of ['rain', 'white', 'zen', 'fire', 'cafe']) {
    const e = fixture(); const audio = fakeAudio(); e.app.sound.ctx = audio;
    e.app.sound.setVolume(0); e.app.sound.playAmbient(type); e.app.sound.startEscalatingAlarm(); e.app.sound.playVictoryFanfare();
    assert.equal(e.app.sound.masterGain.gain.value, 0);
    const direct = audio.nodes.filter(node => node.connections.includes(audio.destination));
    assert.deepEqual(direct, [e.app.sound.masterGain]);
    e.app.sound.stopAlarm(); e.app.sound.stopAmbient();
  }
});

test('alarm has an immediate fixed mode and stopped beeps disconnect', () => {
  const e = fixture(); const audio = fakeAudio(); e.app.sound.ctx = audio;
  e.app.sound.startEscalatingAlarm(false);
  const group = e.app.sound.alarmGain;
  const envelope = audio.nodes.find(node => node.connections.includes(group));
  assert(envelope.gain.events.some(([kind, value]) => kind === 'linear' && value === 0.8));
  e.app.sound.stopAlarm(); assert.equal(group.connections.length, 0);
});

test('noise buffers are reused and segment nodes survive progress updates', () => {
  const e = fixture(); e.app.sound.ctx = fakeAudio();
  assert.equal(e.app.sound.createNoiseBuffer(), e.app.sound.createNoiseBuffer());
  e.app.renderSegmentBar('capsule-segments', 10, 0);
  const first = e.document.getElementById('capsule-segments').children[0];
  e.app.renderSegmentBar('capsule-segments', 10, 0.5);
  assert.equal(e.document.getElementById('capsule-segments').children[0], first);
});

test('native hydration restores volume and pin after bridge readiness', async () => {
  const calls = [];
  const api = {load_state: async () => ({status: 'ok', state: state({settings: {volume: 0, alwaysOnTop: false}})}),
    save_state: async () => ({status: 'ok'}), toggle_size: async mode => calls.push(['mode', mode]),
    set_on_top: async pinned => calls.push(['pin', pinned])};
  const e = fixture(); e.app.init(); e.window.pywebview = {api}; e.emit('pywebviewready');
  await e.app._nativeInitPromise; await e.app._pinSyncChain;
  assert.equal(e.app.sound.masterVolume, 0); assert.equal(e.document.getElementById('volume-slider').value, 0);
  assert(calls.some(([key, value]) => key === 'pin' && value === false));
  assert(calls.some(([key, value]) => key === 'mode' && value === 'capsule'));
});

test('native saves run sequentially and closing waits for the final state', async () => {
  let release, active = 0, maxActive = 0, closed = false; const writes = [];
  const api = {save_state: async value => {
    maxActive = Math.max(maxActive, ++active); writes.push(value.settings.volume);
    if (writes.length === 1) await new Promise(resolve => { release = resolve; });
    active--; return {status: 'ok'};
  }, close: async () => { closed = true; }};
  const e = fixture({api}); e.app._nativeReady = true;
  e.app.settings.volume = 10; e.app.saveState(); await microtasks();
  e.app.settings.volume = 20; const closing = e.app.closeApp(); await microtasks();
  assert(!closed); release(); await closing;
  assert.equal(maxActive, 1); assert.deepEqual(writes, [10,20]); assert(closed);
});

test('failed native hydration does not overwrite existing state', async () => {
  let writes = 0;
  const e = fixture({api: {load_state: async () => ({status: 'error', message: 'denied'}), save_state: async () => {writes++;}}});
  await assert.rejects(e.app.initializeNative(), /denied/); await microtasks();
  assert.equal(writes, 0); assert.equal(e.app._nativeReady, false); assert.equal(e.alerts.length, 1);
});

test('closing after read failure preserves existing data; failed writes can be retried', async () => {
  let closed = 0, writes = 0, fail = true;
  const api = {load_state: async () => ({status: 'error', message: 'denied'}),
    save_state: async () => {writes++; return fail ? {status: 'error', message: 'busy'} : {status: 'ok'};},
    close: async () => {closed++;}};
  const e = fixture({api});
  await assert.rejects(e.app.initializeNative()); await e.app.closeApp();
  assert.equal(closed, 1); assert.equal(writes, 0);
  e.app._nativeReady = true;
  await e.app.closeApp(); assert.equal(closed, 1);
  fail = false; await e.app.closeApp(); assert.equal(closed, 2);
});

test('volume input is immediate but disk saves wait for a committed change', () => {
  const e = fixture(); e.app.init();
  const slider = e.document.getElementById('volume-slider');
  slider.value = '20'; slider.emit('input');
  assert.equal(e.app.sound.masterVolume, 0.2); assert(!e.saved.has('aurafocus_state'));
  slider.emit('change'); assert.equal(JSON.parse(e.saved.get('aurafocus_state')).settings.volume, 20);
});

test('rapid mode switches send only the latest requested mode', async () => {
  const calls = []; const e = fixture({api: {toggle_size: async mode => calls.push(mode)}}); e.app._nativeReady = true;
  e.app.switchMode('expanded'); e.app.switchMode('capsule'); await e.app._windowSyncChain;
  assert.deepEqual(calls, ['capsule']);
});

test('pointer moves coalesce and release waits for the pending native move', async () => {
  let release; const calls = [];
  const api = {begin_drag: async () => calls.push('begin'), drag_to: async () => {
    calls.push('move'); await new Promise(resolve => { release = resolve; });
  }, end_drag: async () => {calls.push('end'); return {};}};
  const e = fixture({api}); e.app._nativeReady = true; e.app.bindDragHandler();
  const target = new Element('div', {class: 'capsule-view'});
  e.emit('pointerdown', {button: 0, pointerId: 1, target});
  for (let i = 0; i < 20; i++) e.emit('pointermove', {pointerId: 1, target});
  e.frame(); await microtasks(); assert.deepEqual(calls, ['begin', 'move']);
  e.emit('pointerup', {pointerId: 1, target}); await microtasks(); assert(!calls.includes('end'));
  release(); await microtasks(); assert.deepEqual(calls, ['begin', 'move', 'end']);
});

test('flowtime overtime continues past 00:00 and settles full duration on finish', () => {
  const e = fixture({at: '2026-10-25T10:00:00'}); silent(e.app);
  e.app.toggleFocusTimer();
  e.advance(25 * 60 * 1000); e.app.tickFocus();
  assert.equal(e.app.focusState, 'overtime');
  e.advance(6 * 60 * 1000); e.app.tickFocus();
  assert.equal(e.document.getElementById('capsule-time').textContent, '+06:00');
  e.app.finishFocusSession();
  assert.equal(e.app.focusState, 'idle');
  assert.deepEqual(plain(e.app.stats.days['2026-10-25']), {minutes: 31, sessions: 1});
  assert.equal(e.app.sessions.length, 1);
  assert.equal(e.app.sessions[0].overtimeMins, 6);
});

test('stopwatch mode counts up freely and custom duration supports 1-180 minutes', () => {
  const e = fixture(); silent(e.app);
  assert.equal(e.app.setFocusDuration(90), true);
  assert.equal(e.app.focusDuration, 5400);
  assert.equal(e.app.setFocusDuration(0), false);
  assert.equal(e.app.setFocusDuration(181), false);
  assert.equal(e.app.setStopwatchMode(), true);
  e.app.toggleFocusTimer();
  e.advance(12 * 60 * 1000); e.app.tickFocus();
  assert.equal(e.document.getElementById('capsule-time').textContent, '12:00');
  e.app.finishFocusSession();
  assert.equal(e.app.stats.days['2026-10-25'].minutes, 12);
});

test('break session runs cleanly without counting as focus stats and restores countdown on finish', () => {
  const e = fixture(); silent(e.app);
  e.app.startBreakSession(5);
  assert.equal(e.app.timerMode, 'break');
  assert.equal(e.app.focusState, 'running');
  e.advance(5 * 60 * 1000); e.app.tickFocus();
  assert.equal(e.app.timerMode, 'countdown');
  assert.equal(e.app.focusState, 'idle');
  assert.equal(e.app.stats.days['2026-10-25'], undefined);
});

test('multi-track mixer blends new acoustic shielding tracks and respects zero master volume', () => {
  const e = fixture(); const audio = fakeAudio(); e.app.sound.ctx = audio;
  e.app.sound.setVolume(0);
  e.app.applyAudioPreset('office_shield', false);
  assert(e.app.sound.activeTracks.has('shield'));
  assert(e.app.sound.activeTracks.has('cafe'));
  e.app.setTrackLevel('train', 40, false);
  e.app.setTrackLevel('study', 30, false);
  e.app.setTrackLevel('binaural', 25, false);
  assert.equal(e.app.sound.activeTracks.size, 5);
  const direct = audio.nodes.filter(node => node.connections.includes(audio.destination));
  assert.deepEqual(direct, [e.app.sound.masterGain]);
  e.app.setTrackLevel('train', 0, false);
  assert(!e.app.sound.activeTracks.has('train'));
  e.app.sound.stopAmbient();
  assert.equal(e.app.sound.activeTracks.size, 0);
  assert.equal(e.intervals.size, 0);
  assert.equal(e.timeouts.size, 0);
});

test('rain_fire highlights fireplace clearly and night_train produces distinct rhythmic rail beats', () => {
  const e = fixture(); const audio = fakeAudio(200); e.app.sound.ctx = audio;
  e.app.applyAudioPreset('rain_fire', false);
  assert(e.app.audio.tracks.fire > e.app.audio.tracks.rain);
  e.app.applyAudioPreset('night_train', false);
  assert(e.app.audio.tracks.train > e.app.audio.tracks.rain);
  // First bogie hit plays immediately and schedules the remaining 3 beats in the 4-beat cycle
  assert(e.timeouts.size >= 3);
  e.app.sound.stopAmbient();
  assert.equal(e.timeouts.size, 0);
  assert.equal(e.intervals.size, 0);
});

test('priority alarm shield defers normal alarms during active focus and lets urgent alarms through', () => {
  const e = fixture({at: '2026-10-25T11:59:50', state: state({alarms: [
    alarm('2026-10-25T12:00:00', {id: 'n1', title: '喝水', priority: 'normal', repeat: 'once'}),
    alarm('2026-10-25T12:00:00', {id: 'u1', title: '重要会议', priority: 'urgent', repeat: 'once'})
  ]})});
  silent(e.app);
  e.app.toggleFocusTimer();
  e.setTime('2026-10-25T12:00:05');
  e.app.checkAlarms();
  assert.equal(e.app.activeRingingAlarm.title, '重要会议');
  assert.equal(e.app.deferredAlarms.length, 1);
  assert.equal(e.app.deferredAlarms[0].title, '喝水');
  e.app.dismissAlarm();
  e.app.resetFocusTimer();
  assert.equal(e.app.activeRingingAlarm.title, '喝水');
  assert.equal(e.app.deferredAlarms.length, 0);
});

test('distraction parking lot stores thoughts and converts one into an alarm', () => {
  const e = fixture({at: '2026-10-25T10:00:00'}); silent(e.app);
  const item = e.app.addParkedThought('回个快递电话');
  assert.equal(e.app.parkingLot.length, 1);
  assert.equal(item.done, false);
  const created = e.app.convertThoughtToAlarm(item.id, 15);
  assert.equal(item.done, true);
  assert.equal(created.time, '10:15');
  assert.equal(created.title, '回个快递电话');
});

test('v2 state migrates cleanly to v3 and unlocks milestone themes at 120m and 300m', () => {
  const e = fixture({state: {version: 2, settings: {theme: 'obsidian'}, alarms: [], stats: {days: {'2026-10-20': {minutes: 120, sessions: 4}}}}});
  assert.equal(e.app.snapshot().version, 3);
  assert.equal(e.app.isThemeUnlocked('obsidian'), true);
  assert.equal(e.app.isThemeUnlocked('atomic'), true);
  assert.equal(e.app.isThemeUnlocked('famicom'), false);
  e.app.stats.days['2026-10-21'] = {minutes: 180, sessions: 6};
  const unlocked = e.app._recomputeUnlocks();
  assert.equal(unlocked.length, 1);
  assert.equal(unlocked[0].key, 'famicom');
  assert.equal(e.app.isThemeUnlocked('famicom'), true);
});

test('native events handle focus guard nudges, strict overlay, hotkeys and peek without double resize', async () => {
  const calls = [];
  const api = {
    toggle_size: async mode => calls.push(['size', mode]),
    allow_distraction_temp: async sec => calls.push(['allow', sec]),
    save_state: async () => ({status: 'ok'})
  };
  const e = fixture({api}); silent(e.app); e.app._nativeReady = true;
  e.app.toggleFocusTimer();
  e.app.handleNativeEvent('peek_state', {peek: true});
  assert.equal(e.app.currentMode, 'peek');
  assert.equal(calls.filter(([k]) => k === 'size').length, 0);

  e.app.handleNativeEvent('focus_guard', {type: 'nudge', matched: 'bilibili', strict: true});
  assert.equal(e.app._sessionDistractions, 1);
  assert.equal(e.app._isNudging, true);
  assert.equal(e.app.currentMode, 'expanded');
  assert(e.document.getElementById('guard-overlay').classList.contains('active'));

  e.app.resolveGuardOverlay(true);
  assert.equal(e.app._isNudging, false);
  assert(calls.some(([k, v]) => k === 'allow' && v === 180));
});

test('companions provide 6 distinct pixel stages and mint 16 themed collectibles', () => {
  const e = fixture();
  for (const mascot of ['fire', 'cat', 'coffee', 'sprout']) {
    const stages = ['idle', 'start', 'flow', 'complete', 'nudge', 'break']
      .map(stage => e.sandbox.getMascotSvg(mascot, stage));
    assert.equal(new Set(stages).size, 6, `${mascot} should have 6 distinct stages`);
    const names = new Set([0, 1, 2, 3].map(idx => e.sandbox.mintCollectible(mascot, idx, '2026-10-25').name));
    assert.equal(names.size, 4, `${mascot} should mint 4 distinct collectibles`);
  }
});

test('daily thermal receipt formats text and markdown with sessions, overtime and parked thoughts', () => {
  const e = fixture({at: '2026-10-25T10:00:00'}); silent(e.app);
  e.document.getElementById('task-input').value = '打磨论文初稿';
  e.app.addParkedThought('下午取快递');
  e.app.toggleFocusTimer();
  e.advance(30 * 60 * 1000); e.app.tickFocus();
  e.app.finishFocusSession();
  const data = e.app.buildDailyReceiptData('2026-10-25');
  assert.equal(data.totalMinutes, 30);
  assert.equal(data.overtimeTotal, 5);
  const txt = e.sandbox.formatReceiptText(data);
  const md = e.sandbox.formatReceiptMarkdown(data);
  assert.match(txt, /打磨论文初稿/);
  assert.match(txt, /下午取快递/);
  assert.match(txt, /\+5m/);
  assert.match(md, /## AuraFocus 专注小票/);
  assert.match(md, /- \[ \] 下午取快递/);
});

test('tactile LCD cycles through digits, minimal and spectrum modes', () => {
  const e = fixture();
  assert.equal(e.app.lcdViewMode, 'digits');
  e.app.cycleLcdView(); assert.equal(e.app.lcdViewMode, 'minimal');
  e.app.cycleLcdView(); assert.equal(e.app.lcdViewMode, 'spectrum');
  e.app.cycleLcdView(); assert.equal(e.app.lcdViewMode, 'digits');
});
