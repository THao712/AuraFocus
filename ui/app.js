/**
 * AuraFocus v2 - Pocket Focus Console Engine
 * Pure offline JS state engine: 3-in-1 Flowtime timer, multi-track DSP bridge,
 * distraction parking lot, priority alarm shield, focus guard & companion ecology.
 */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const DEFAULT_GUARD_RULES = ['bilibili', '哔哩哔哩', '抖音', 'douyin', '微博', 'weibo', 'steam', '小红书'];
const BASE_THEMES = ['cyber', 'gameboy', 'sunset', 'lavender', 'obsidian', 'phosphor'];
const SECRET_THEMES = ['atomic', 'famicom'];
const ALL_THEMES = [...BASE_THEMES, ...SECRET_THEMES];

function defaultTracks() {
  const tracks = {};
  (typeof AMBIENT_TRACK_META !== 'undefined' ? AMBIENT_TRACK_META : []).forEach(meta => {
    tracks[meta.id] = 0;
  });
  return tracks;
}

class AuraFocusApp {
  constructor() {
    this.sound = new SoundEngine();

    // Window & UI state
    this.currentMode = 'capsule'; // 'capsule' | 'expanded' | 'peek'
    this.currentTab = 'focus';
    this.currentStatsSub = 'overview';
    this.currentSettingsSub = 'look';
    this.lcdViewMode = 'digits'; // 'digits' | 'minimal' | 'spectrum'
    this._mixerOpen = false;
    this._parkListOpen = false;
    this._spectrumTimer = null;
    this._ritualTimer = null;

    // Focus Timer Engine (Pomodoro + Flowtime Overtime + Stopwatch + Break)
    this.timerMode = 'countdown'; // 'countdown' | 'stopwatch' | 'break'
    this.focusDuration = 25 * 60;
    this.focusRemaining = 25 * 60;
    this.focusState = 'idle'; // 'idle' | 'running' | 'paused' | 'overtime'
    this.focusTimer = null;
    this.focusDeadline = null;
    this.focusRemainingMs = this.focusDuration * 1000;
    this.focusStartedAt = null;
    this.elapsedMs = 0; // used for stopwatch & overtime
    this.overtimeMs = 0;
    this._lastTickAt = null;
    this._completedRounds = 0;
    this._currentSessionId = null;
    this._sessionDistractions = 0;
    this._isNudging = false;
    this._nudgeText = '';
    this._nudgeTarget = '';

    // Window coordinates
    this.windowPos = { x: null, y: null };

    // Audio Mix State
    this.audio = {
      preset: 'none',
      tracks: defaultTracks(),
      muted: false
    };
    this.currentAmbientType = 'none';

    // Alarms & Deferred Focus Queue
    this.alarms = [];
    this.activeRingingAlarm = null;
    this.alarmQueue = [];
    this.deferredAlarms = [];

    // Stats, Sessions, Parking Lot, Collection
    this.stats = { days: {} };
    this.sessions = [];
    this.parkingLot = [];
    this.collection = { items: [], unlockedThemes: [], totalMinutes: 0 };

    // Internal bridges
    this._idCounter = 0;
    this._nativeReady = false;
    this._saveChain = Promise.resolve();
    this._windowSyncChain = Promise.resolve();
    this._pinSyncChain = Promise.resolve();
    this._nativeConfigChain = Promise.resolve();

    // Settings
    this.settings = {
      mascot: 'fire',
      theme: 'cyber',
      alwaysOnTop: true,
      autoSnap: true,
      gentleAlarm: true,
      volume: 80,
      flowOvertime: true,
      shortBreakMins: 5,
      longBreakMins: 15,
      hideSeconds: false,
      launchRitual: true,
      hoverFade: false,
      edgePeek: false,
      closeToTray: true,
      hotkeysEnabled: true,
      audioFollowFocus: true,
      focusGuardEnabled: false,
      focusGuardStrict: false,
      focusGuardDelaySec: 15,
      focusGuardRules: [...DEFAULT_GUARD_RULES]
    };

    this.loadState();
  }

  init() {
    this.renderMixerControls();
    this.bindDOM();
    this.bindDragHandler();
    this.applySettings();
    this.renderMascots();
    this.renderAlarmsList();
    this.renderParkingLot();
    this.renderStats();
    this.updateFocusDisplay();
    this.startGlobalClock();

    window.addEventListener('pywebviewready', () => this.initializeNative());
    if (window.pywebview && window.pywebview.api) this.initializeNative();
  }

  _getTodayStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  _formatHM(d) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  _computeTotalMinutes() {
    const fromDays = Object.values(this.stats.days || {}).reduce((sum, entry) => sum + (Number(entry?.minutes) || 0), 0);
    return Math.max(fromDays, Number(this.collection.totalMinutes) || 0);
  }

  _recomputeUnlocks() {
    const total = this._computeTotalMinutes();
    this.collection.totalMinutes = total;
    const unlocked = new Set(Array.isArray(this.collection.unlockedThemes) ? this.collection.unlockedThemes : []);
    const newlyUnlocked = [];
    if (typeof THEME_MILESTONES !== 'undefined') {
      for (const [themeKey, info] of Object.entries(THEME_MILESTONES)) {
        if (total >= info.minutes && !unlocked.has(themeKey)) {
          unlocked.add(themeKey);
          newlyUnlocked.push({ key: themeKey, label: info.label });
        }
      }
    }
    this.collection.unlockedThemes = [...unlocked];
    return newlyUnlocked;
  }

  isThemeUnlocked(themeKey) {
    if (BASE_THEMES.includes(themeKey)) return true;
    return (this.collection.unlockedThemes || []).includes(themeKey);
  }

  loadState() {
    const read = key => {
      try { return JSON.parse(localStorage.getItem(key)); }
      catch (error) { console.warn(`Cannot read ${key}:`, error); return null; }
    };
    const saved = read('aurafocus_state');
    this.applyState(saved || {
      settings: read('aurafocus_settings'),
      alarms: read('aurafocus_alarms') || [
        { id: 1, time: '12:00', title: '午餐 & 离开屏幕休息', repeat: 'daily', priority: 'normal', enabled: true },
        { id: 2, time: '15:30', title: '补充水分与舒展腰背', repeat: 'daily', priority: 'normal', enabled: true },
        { id: 3, time: '18:30', title: '整理今日进度 & 准备下班', repeat: 'workday', priority: 'normal', enabled: false }
      ],
      stats: read('aurafocus_stats')
    });
  }

  applyState(state) {
    if (!state || typeof state !== 'object') return;
    const settings = state.settings || {};

    if (['fire', 'cat', 'coffee', 'sprout'].includes(settings.mascot)) {
      this.settings.mascot = settings.mascot;
    }

    const boolKeys = [
      'alwaysOnTop', 'autoSnap', 'gentleAlarm', 'flowOvertime',
      'hideSeconds', 'launchRitual', 'hoverFade', 'edgePeek',
      'closeToTray', 'hotkeysEnabled', 'audioFollowFocus',
      'focusGuardEnabled', 'focusGuardStrict'
    ];
    for (const key of boolKeys) {
      if (typeof settings[key] === 'boolean') this.settings[key] = settings[key];
    }

    if (Number.isFinite(settings.volume)) {
      this.settings.volume = Math.max(0, Math.min(100, settings.volume));
    }
    if (Number.isFinite(settings.shortBreakMins)) {
      this.settings.shortBreakMins = Math.max(1, Math.min(30, Math.round(settings.shortBreakMins)));
    }
    if (Number.isFinite(settings.longBreakMins)) {
      this.settings.longBreakMins = Math.max(5, Math.min(60, Math.round(settings.longBreakMins)));
    }
    if (Number.isFinite(settings.focusGuardDelaySec)) {
      this.settings.focusGuardDelaySec = Math.max(5, Math.min(120, Math.round(settings.focusGuardDelaySec)));
    }
    if (Array.isArray(settings.focusGuardRules)) {
      this.settings.focusGuardRules = settings.focusGuardRules
        .map(item => String(item || '').trim()).filter(Boolean).slice(0, 60);
    }

    if (state.window && typeof state.window === 'object') {
      if (Number.isInteger(state.window.x) && Number.isInteger(state.window.y)) {
        this.windowPos = { x: state.window.x, y: state.window.y };
      }
    }

    if (state.audio && typeof state.audio === 'object') {
      const tracks = defaultTracks();
      if (state.audio.tracks && typeof state.audio.tracks === 'object') {
        for (const key of Object.keys(tracks)) {
          const val = Number(state.audio.tracks[key]);
          if (Number.isFinite(val)) tracks[key] = Math.max(0, Math.min(100, Math.round(val)));
        }
      }
      this.audio = {
        preset: typeof state.audio.preset === 'string' ? state.audio.preset : 'none',
        tracks,
        muted: Boolean(state.audio.muted)
      };
    }

    if (Array.isArray(state.alarms)) {
      this.alarms = state.alarms.filter(alarm => alarm && /^([01]\d|2[0-3]):[0-5]\d$/.test(alarm.time)).map(alarm => {
        const repeat = ['daily', 'workday', 'once'].includes(alarm.repeat) ? alarm.repeat : 'once';
        const priority = alarm.priority === 'urgent' ? 'urgent' : 'normal';
        return {
          id: /^[\w-]+$/.test(String(alarm.id ?? '')) ? String(alarm.id) : this.newAlarmId(),
          title: typeof alarm.title === 'string' ? alarm.title : '提醒事项',
          time: alarm.time,
          repeat,
          priority,
          enabled: typeof alarm.enabled === 'boolean' ? alarm.enabled : true,
          nextTriggerAt: Number.isFinite(alarm.nextTriggerAt) && alarm.nextTriggerAt > 0
            ? alarm.nextTriggerAt : this.nextAlarmTime(alarm.time, repeat, Math.floor(Date.now() / 60000) * 60000)
        };
      });
    }

    const stats = state.stats || {};
    this.stats = { days: {} };
    const addDay = (key, minutes, sessions = 0) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || this._getTodayStr(new Date(`${key}T12:00:00`)) !== key) return;
      this.stats.days[key] = {
        minutes: Number.isFinite(minutes) ? Math.max(0, minutes) : 0,
        sessions: Number.isFinite(sessions) ? Math.max(0, Math.floor(sessions)) : 0
      };
    };
    if (stats.days && typeof stats.days === 'object') {
      for (const [key, value] of Object.entries(stats.days)) {
        if (value && typeof value === 'object') addDay(key, value.minutes, value.sessions);
      }
    } else if (typeof stats.lastActiveDate === 'string' && stats.lastActiveDate) {
      addDay(stats.lastActiveDate, stats.todayMinutes, stats.todaySessions);
      if (Array.isArray(stats.history)) {
        stats.history.slice(-7).forEach((minutes, index, history) => {
          const day = new Date(`${stats.lastActiveDate}T12:00:00`);
          day.setDate(day.getDate() - history.length + index);
          addDay(this._getTodayStr(day), minutes);
        });
      }
    }

    if (Array.isArray(state.sessions)) {
      this.sessions = state.sessions
        .filter(item => item && typeof item === 'object' && typeof item.date === 'string')
        .slice(-300);
    }

    if (Array.isArray(state.parkingLot)) {
      this.parkingLot = state.parkingLot
        .filter(item => item && typeof item.text === 'string' && item.text.trim())
        .slice(-120);
    }

    if (state.collection && typeof state.collection === 'object') {
      this.collection = {
        items: Array.isArray(state.collection.items) ? state.collection.items.slice(-200) : [],
        unlockedThemes: Array.isArray(state.collection.unlockedThemes)
          ? state.collection.unlockedThemes.filter(key => SECRET_THEMES.includes(key))
          : [],
        totalMinutes: Number.isFinite(state.collection.totalMinutes) ? Math.max(0, state.collection.totalMinutes) : 0
      };
    }

    this._recomputeUnlocks();

    if (ALL_THEMES.includes(settings.theme) && this.isThemeUnlocked(settings.theme)) {
      this.settings.theme = settings.theme;
    }
  }

  newAlarmId() {
    return `${Date.now()}-${++this._idCounter}`;
  }

  snapshot() {
    return JSON.parse(JSON.stringify({
      version: 3,
      window: this.windowPos,
      settings: this.settings,
      audio: this.audio,
      alarms: this.alarms,
      stats: this.stats,
      parkingLot: this.parkingLot,
      sessions: this.sessions,
      collection: this.collection
    }));
  }

  saveState() {
    const state = this.snapshot();
    try {
      localStorage.setItem('aurafocus_state', JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save storage:', e);
    }
    if (!this._nativeReady) return this._saveChain;
    this._saveChain = this._saveChain.catch(error => console.error('Previous save failed:', error)).then(async () => {
      const result = await window.pywebview.api.save_state(state);
      if (result.status !== 'ok') throw new Error(result.message || '保存失败');
    });
    this._saveChain.catch(error => console.error('Failed to save state:', error));
    return this._saveChain;
  }

  initializeNative() {
    if (this._nativeInitPromise) return this._nativeInitPromise;
    this._nativeInitPromise = (async () => {
      const result = await window.pywebview.api.load_state();
      if (result.status !== 'ok') throw new Error(result.message || '读取数据失败');
      if (result.state) {
        if (![2, 3].includes(result.state.version)) throw new Error('不支持的数据版本');
        this.applyState(result.state);
      }
      this._nativeReady = true;
      this.applySettings();
      this.renderAlarmsList();
      this.renderParkingLot();
      this.renderStats();
      await this.syncWindowMode(this.currentMode);
      await this.syncNativeConfig();
      await this.saveState();
      this.checkGlobalClock();
    })();
    this._nativeInitPromise.catch(error => {
      console.error('Native initialization failed:', error);
      window.alert(`AuraFocus 无法读取或保存数据：${error.message}`);
    });
    return this._nativeInitPromise;
  }

  syncNativeConfig() {
    if (!this._nativeReady || !window.pywebview?.api?.configure_native) return Promise.resolve();
    const payload = {
      hoverFade: this.settings.hoverFade,
      edgePeek: this.settings.edgePeek,
      closeToTray: this.settings.closeToTray,
      hotkeysEnabled: this.settings.hotkeysEnabled,
      focusGuardEnabled: this.settings.focusGuardEnabled,
      focusGuardStrict: this.settings.focusGuardStrict,
      focusGuardDelaySec: this.settings.focusGuardDelaySec,
      focusGuardRules: this.settings.focusGuardRules,
      focusActive: this.isFocusActive(),
      task: document.getElementById('task-input')?.value?.trim() || ''
    };
    this._nativeConfigChain = this._nativeConfigChain.catch(console.error).then(() =>
      window.pywebview.api.configure_native(payload)
    );
    return this._nativeConfigChain;
  }

  applySettings() {
    this.applyTheme(this.settings.theme, false);
    this.renderThemeLocks();
    this.renderMascots();
    this.sound.setVolume(this.settings.volume / 100);
    this.sound.setAmbientMuted(this.audio.muted, 0.05);
    this.syncAudioUI();

    const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = Boolean(val); };
    const setValue = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setValue('volume-slider', this.settings.volume);
    const volLabel = document.getElementById('sound-vol-label');
    if (volLabel) volLabel.textContent = `${this.settings.volume}%`;

    setChecked('toggle-snap', this.settings.autoSnap);
    setChecked('toggle-gentle', this.settings.gentleAlarm);
    setChecked('toggle-flow-overtime', this.settings.flowOvertime);
    setChecked('toggle-hide-seconds', this.settings.hideSeconds);
    setChecked('toggle-launch-ritual', this.settings.launchRitual);
    setChecked('toggle-hover-fade', this.settings.hoverFade);
    setChecked('toggle-edge-peek', this.settings.edgePeek);
    setChecked('toggle-close-tray', this.settings.closeToTray);
    setChecked('toggle-hotkeys', this.settings.hotkeysEnabled);
    setChecked('toggle-audio-follow', this.settings.audioFollowFocus);
    setChecked('toggle-guard-enabled', this.settings.focusGuardEnabled);
    setChecked('toggle-guard-strict', this.settings.focusGuardStrict);

    setValue('short-break-input', this.settings.shortBreakMins);
    setValue('long-break-input', this.settings.longBreakMins);
    setValue('guard-delay-input', this.settings.focusGuardDelaySec);
    setValue('guard-rules-input', this.settings.focusGuardRules.join(', '));

    this.setAlwaysOnTop(this.settings.alwaysOnTop, false);
    this.updateFocusDisplay();
  }

  // ================= DRAG HANDLER =================
  bindDragHandler() {
    let session = null;
    let dragChain = Promise.resolve();
    const scheduleMove = current => {
      if (current.frame || current.moving) return;
      current.frame = requestAnimationFrame(() => {
        current.frame = null;
        if (session !== current) return;
        current.dirty = false;
        current.moving = current.ready.then(() => current.api.drag_to()).catch(console.error).finally(() => {
          current.moving = null;
          if (session === current && current.dirty) scheduleMove(current);
        });
      });
    };
    const onPointerDown = e => {
      if (e.button !== 0 || session || !this._nativeReady) return;
      if (!e.target.closest('.capsule-view, .card-header')) return;
      if (e.target.closest('button, input, select, textarea, .no-drag, .pixel-switch, #mini-mascot-box')) return;
      const api = window.pywebview.api;
      const current = { api, pointerId: e.pointerId, target: e.target, frame: null, moving: null, dirty: false };
      current.ready = dragChain.catch(console.error).then(() => api.begin_drag());
      session = current;
      try { e.target.setPointerCapture(e.pointerId); } catch (error) {}
      document.body.classList.add('is-dragging');
    };
    const onPointerMove = e => {
      if (!session || session.pointerId !== e.pointerId) return;
      session.dirty = true;
      scheduleMove(session);
    };
    const onPointerUp = e => {
      if (!session || session.pointerId !== e.pointerId) return;
      const current = session;
      session = null;
      if (current.frame) cancelAnimationFrame(current.frame);
      document.body.classList.remove('is-dragging');
      try { current.target.releasePointerCapture(e.pointerId); } catch (error) {}
      dragChain = current.ready.then(() => current.moving).then(() => current.api.end_drag(this.settings.autoSnap)).then(result => {
        if (result && Number.isInteger(result.x) && Number.isInteger(result.y)) {
          this.windowPos = { x: result.x, y: result.y };
          this.saveState();
        }
        if (this.settings.autoSnap && result && result.snapped) this.sound.playSnapClick();
      }).catch(console.error);
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  // ================= DOM BINDING =================
  bindDOM() {
    const on = (id, event, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, fn);
    };

    // Mode & window actions
    on('btn-capsule-expand', 'click', () => this.switchMode('expanded'));
    on('btn-collapse-top', 'click', () => this.switchMode('capsule'));
    on('btn-capsule-close', 'click', () => this.requestCloseWindow());
    on('btn-close-app', 'click', () => this.requestCloseWindow());
    on('btn-capsule-pin', 'click', () => this.togglePinTop());
    on('btn-pin-top', 'click', () => this.togglePinTop());
    on('peek-view', 'click', () => this.switchMode('capsule'));

    // Quick mute & tactile speaker easter egg
    on('btn-capsule-mute', 'click', () => this.toggleAmbientMute());
    on('btn-console-speaker', 'click', () => this.toggleAmbientMute());

    // LCD click view switcher
    const lcd = document.getElementById('lcd-screen');
    if (lcd) {
      lcd.addEventListener('click', () => this.cycleLcdView());
      lcd.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.cycleLcdView();
        }
      });
    }

    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', e => this.switchTab(e.currentTarget.getAttribute('data-tab')));
    });

    // Stats sub-tabs
    document.querySelectorAll('[data-subtab]').forEach(btn => {
      btn.addEventListener('click', e => this.switchStatsSubtab(e.currentTarget.getAttribute('data-subtab')));
    });

    // Settings sub-tabs
    document.querySelectorAll('[data-settings-sub]').forEach(btn => {
      btn.addEventListener('click', e => this.switchSettingsSubtab(e.currentTarget.getAttribute('data-settings-sub')));
    });

    // Focus Controls
    on('btn-capsule-toggle', 'click', () => this.toggleFocusTimer(true));
    on('btn-focus-start', 'click', () => this.toggleFocusTimer(true));
    on('btn-capsule-reset', 'click', () => this.resetFocusTimer());
    on('btn-focus-reset', 'click', () => this.resetFocusTimer());
    on('btn-capsule-finish', 'click', () => this.finishFocusSession());
    on('btn-focus-finish', 'click', () => this.finishFocusSession());

    // Duration & Mode Chips
    document.querySelectorAll('.duration-chips .chip[data-mins]').forEach(chip => {
      chip.addEventListener('click', e => {
        if (this.isFocusActive()) return;
        const mins = parseInt(e.currentTarget.getAttribute('data-mins'), 10);
        if (!this.setFocusDuration(mins)) return;
        this._highlightDurationChip(mins);
      });
    });

    on('btn-mode-stopwatch', 'click', () => {
      if (this.isFocusActive()) return;
      this.setStopwatchMode();
    });

    const customInput = document.getElementById('custom-mins-input');
    if (customInput) {
      customInput.addEventListener('change', () => {
        if (this.isFocusActive()) return;
        const mins = parseInt(customInput.value, 10);
        if (Number.isFinite(mins) && mins >= 1 && mins <= 180) {
          this.setFocusDuration(mins);
          this._highlightDurationChip(mins);
        }
      });
      customInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') customInput.blur();
      });
    }

    // Soundscape Presets & Mixer
    document.querySelectorAll('.sound-chip[data-preset]').forEach(chip => {
      chip.addEventListener('click', e => {
        const preset = e.currentTarget.getAttribute('data-preset');
        this.applyAudioPreset(preset);
      });
    });

    on('btn-toggle-mixer', 'click', () => {
      this._mixerOpen = !this._mixerOpen;
      const drawer = document.getElementById('mixer-drawer');
      const btn = document.getElementById('btn-toggle-mixer');
      if (drawer) drawer.classList.toggle('hidden', !this._mixerOpen);
      if (btn) {
        btn.classList.toggle('active', this._mixerOpen);
        btn.setAttribute('aria-expanded', String(this._mixerOpen));
      }
    });

    // Parking Lot Quick Capture
    on('btn-capsule-park', 'click', () => this.openQuickPark());
    on('btn-card-park', 'click', () => this.openQuickPark());
    on('btn-capsule-park-save', 'click', () => this.submitCapsulePark());
    on('btn-capsule-park-cancel', 'click', () => this.closeCapsulePark());
    on('capsule-park-input', 'keydown', e => {
      if (e.key === 'Enter') this.submitCapsulePark();
      else if (e.key === 'Escape') this.closeCapsulePark();
    });
    on('btn-card-park-add', 'click', () => this.submitCardPark());
    on('card-park-input', 'keydown', e => {
      if (e.key === 'Enter') this.submitCardPark();
    });
    on('btn-view-park-list', 'click', () => {
      this._parkListOpen = !this._parkListOpen;
      const list = document.getElementById('park-inline-list');
      const btn = document.getElementById('btn-view-park-list');
      if (list) list.classList.toggle('hidden', !this._parkListOpen);
      if (btn) btn.textContent = this._parkListOpen ? '收起列表' : '展开查看';
    });

    // Alarms & Overlays
    on('btn-add-alarm', 'click', () => this.addAlarm());
    on('btn-alarm-snooze', 'click', () => this.snoozeAlarm());
    on('btn-alarm-dismiss', 'click', () => this.dismissAlarm());
    on('btn-celebrate-dismiss', 'click', () => {
      this.setOverlay('celebrate-overlay', false);
      this.flushDeferredAlarms();
    });
    on('btn-celebrate-break', 'click', () => {
      this.setOverlay('celebrate-overlay', false);
      this.startBreakSession(this._recommendedBreakMins || this.settings.shortBreakMins);
    });
    on('btn-guard-return', 'click', () => this.resolveGuardOverlay(false));
    on('btn-guard-allow', 'click', () => this.resolveGuardOverlay(true));

    // Focus trap inside active modal overlays
    window.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const overlay = this.activeOverlay();
      if (!overlay) return;
      const buttons = [...overlay.querySelectorAll('button')].filter(b => !b.classList.contains('hidden'));
      if (!buttons.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    // Mascot & Theme Pickers
    document.querySelectorAll('.mascot-card').forEach(card => {
      card.addEventListener('click', e => this.setMascot(e.currentTarget.getAttribute('data-mascot')));
    });
    on('mini-mascot-box', 'click', () => {
      const mascots = ['fire', 'cat', 'coffee', 'sprout'];
      this.setMascot(mascots[(mascots.indexOf(this.settings.mascot) + 1) % mascots.length]);
    });
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const themeKey = e.currentTarget.getAttribute('data-theme');
        if (!this.isThemeUnlocked(themeKey)) {
          const info = typeof THEME_MILESTONES !== 'undefined' ? THEME_MILESTONES[themeKey] : null;
          if (info) {
            document.getElementById('mascot-focus-status').textContent =
              `累计专注满 ${info.minutes} 分钟可解锁「${info.label}」外壳（当前 ${this._computeTotalMinutes()} 分钟）`;
          }
          return;
        }
        this.applyTheme(themeKey);
      });
    });

    // Volume slider
    const volSlider = document.getElementById('volume-slider');
    if (volSlider) {
      volSlider.value = this.settings.volume;
      volSlider.addEventListener('input', e => {
        const val = parseInt(e.target.value, 10);
        this.settings.volume = val;
        this.sound.setVolume(val / 100);
        const label = document.getElementById('sound-vol-label');
        if (label) label.textContent = `${val}%`;
      });
      volSlider.addEventListener('change', () => this.saveState());
    }

    // Settings Toggles
    const bindToggle = (id, key, after) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = Boolean(this.settings[key]);
      el.addEventListener('change', e => {
        this.settings[key] = e.target.checked;
        if (after) after(e.target.checked);
        this.saveState();
      });
    };

    const ontopToggle = document.getElementById('toggle-ontop');
    if (ontopToggle) {
      ontopToggle.checked = this.settings.alwaysOnTop;
      ontopToggle.addEventListener('change', e => this.setAlwaysOnTop(e.target.checked));
    }
    bindToggle('toggle-snap', 'autoSnap');
    bindToggle('toggle-gentle', 'gentleAlarm', () => {
      if (this.activeRingingAlarm) this.sound.startEscalatingAlarm(this.settings.gentleAlarm);
    });
    bindToggle('toggle-flow-overtime', 'flowOvertime');
    bindToggle('toggle-hide-seconds', 'hideSeconds', () => this.updateFocusDisplay());
    bindToggle('toggle-launch-ritual', 'launchRitual');
    bindToggle('toggle-audio-follow', 'audioFollowFocus');
    bindToggle('toggle-hover-fade', 'hoverFade', () => this.syncNativeConfig());
    bindToggle('toggle-edge-peek', 'edgePeek', () => this.syncNativeConfig());
    bindToggle('toggle-close-tray', 'closeToTray', () => this.syncNativeConfig());
    bindToggle('toggle-hotkeys', 'hotkeysEnabled', () => this.syncNativeConfig());
    bindToggle('toggle-guard-enabled', 'focusGuardEnabled', () => this.syncNativeConfig());
    bindToggle('toggle-guard-strict', 'focusGuardStrict', () => this.syncNativeConfig());

    // Break & Guard number settings
    on('short-break-input', 'change', e => {
      const val = parseInt(e.target.value, 10);
      if (Number.isFinite(val)) {
        this.settings.shortBreakMins = Math.max(1, Math.min(30, val));
        e.target.value = this.settings.shortBreakMins;
        this.saveState();
      }
    });
    on('long-break-input', 'change', e => {
      const val = parseInt(e.target.value, 10);
      if (Number.isFinite(val)) {
        this.settings.longBreakMins = Math.max(5, Math.min(60, val));
        e.target.value = this.settings.longBreakMins;
        this.saveState();
      }
    });
    on('guard-delay-input', 'change', e => {
      const val = parseInt(e.target.value, 10);
      if (Number.isFinite(val)) {
        this.settings.focusGuardDelaySec = Math.max(5, Math.min(120, val));
        e.target.value = this.settings.focusGuardDelaySec;
        this.saveState();
        this.syncNativeConfig();
      }
    });
    on('btn-save-guard-rules', 'click', () => {
      const raw = document.getElementById('guard-rules-input')?.value || '';
      this.settings.focusGuardRules = raw.split(/[,，\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 60);
      this.saveState();
      this.syncNativeConfig();
      this.sound.play8BitTone([659.25, 783.99], 0.06);
    });
    on('btn-open-win-dnd', 'click', () => {
      if (this._nativeReady && window.pywebview?.api?.open_system_dnd) {
        window.pywebview.api.open_system_dnd().catch(console.error);
      }
    });

    // Receipt Export buttons (full renderer completed in Milestone 3)
    on('btn-copy-receipt-md', 'click', () => this.copyReceiptMarkdown());
    on('btn-export-receipt-png', 'click', () => this.exportReceiptPng());
  }

  // ================= MIXER & AUDIO =================
  renderMixerControls() {
    const container = document.getElementById('mixer-tracks-list');
    if (!container || typeof AMBIENT_TRACK_META === 'undefined') return;
    container.innerHTML = '';
    AMBIENT_TRACK_META.forEach(meta => {
      const wrap = document.createElement('div');
      wrap.className = 'mixer-track';
      const val = this.audio.tracks[meta.id] || 0;
      wrap.innerHTML = `
        <div class="mixer-track-head"><strong>${escapeHtml(meta.label)}</strong><span data-track-val="${meta.id}">${val}%</span></div>
        <input type="range" class="mixer-slider" min="0" max="100" value="${val}" data-track-id="${meta.id}" aria-label="${escapeHtml(meta.label)}音量">
      `;
      const slider = wrap.querySelector('input');
      slider.addEventListener('input', e => {
        const pct = parseInt(e.target.value, 10) || 0;
        this.setTrackLevel(meta.id, pct, false);
      });
      slider.addEventListener('change', () => this.saveState());
      container.appendChild(wrap);
    });
  }

  hasActiveMix() {
    return Object.values(this.audio.tracks).some(v => v > 0);
  }

  syncAudioUI() {
    document.querySelectorAll('.sound-chip[data-preset]').forEach(chip => {
      const selected = chip.getAttribute('data-preset') === this.audio.preset;
      chip.classList.toggle('active', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    if (typeof AMBIENT_TRACK_META !== 'undefined') {
      AMBIENT_TRACK_META.forEach(meta => {
        const pct = this.audio.tracks[meta.id] || 0;
        const slider = document.querySelector(`.mixer-slider[data-track-id="${meta.id}"]`);
        const valEl = document.querySelector(`[data-track-val="${meta.id}"]`);
        if (slider) slider.value = pct;
        if (valEl) valEl.textContent = `${pct}%`;
      });
    }
    const muteBtn = document.getElementById('btn-capsule-mute');
    const muteIcon = document.getElementById('capsule-mute-icon');
    const speaker = document.getElementById('btn-console-speaker');
    if (muteBtn) {
      muteBtn.classList.toggle('active', this.audio.muted);
      muteBtn.setAttribute('aria-pressed', String(this.audio.muted));
    }
    if (muteIcon) muteIcon.setAttribute('href', this.audio.muted ? '#icon-mute' : '#icon-volume');
    if (speaker) speaker.classList.toggle('muted', this.audio.muted);
  }

  applyAudioPreset(presetKey, persist = true) {
    const tracks = defaultTracks();
    if (presetKey !== 'none' && typeof AUDIO_PRESETS !== 'undefined' && AUDIO_PRESETS[presetKey]) {
      Object.assign(tracks, AUDIO_PRESETS[presetKey].tracks);
      this.audio.preset = presetKey;
      this.audio.muted = false;
    } else {
      this.audio.preset = 'none';
    }
    this.audio.tracks = tracks;
    this.currentAmbientType = presetKey;
    this.sound.setAmbientMuted(this.audio.muted, 0.15);
    this.sound.setTrackMix(this.audio.tracks, { active: true });
    this.syncAudioUI();
    if (persist) this.saveState();
  }

  setTrackLevel(trackId, pct, persist = true) {
    if (!(trackId in this.audio.tracks)) return;
    this.audio.tracks[trackId] = Math.max(0, Math.min(100, Math.round(pct)));
    this.audio.preset = this.hasActiveMix() ? 'custom' : 'none';
    if (this.audio.tracks[trackId] > 0 && this.audio.muted) {
      this.audio.muted = false;
      this.sound.setAmbientMuted(false, 0.15);
    }
    this.sound.setTrackMix(this.audio.tracks, { active: true });
    this.syncAudioUI();
    if (persist) this.saveState();
  }

  toggleAmbientMute() {
    this.audio.muted = !this.audio.muted;
    this.sound.setAmbientMuted(this.audio.muted, 0.2);
    this.syncAudioUI();
    this.saveState();
  }

  // ================= WINDOW & NAVIGATION =================
  switchMode(mode, syncNative = true) {
    this.currentMode = mode;
    const capsuleView = document.getElementById('capsule-view');
    const cardView = document.getElementById('card-view');
    const peekView = document.getElementById('peek-view');

    if (peekView) peekView.classList.toggle('hidden', mode !== 'peek');
    if (mode === 'expanded') {
      capsuleView.classList.add('hidden');
      cardView.classList.add('active');
    } else if (mode === 'peek') {
      cardView.classList.remove('active');
      capsuleView.classList.add('hidden');
    } else {
      cardView.classList.remove('active');
      capsuleView.classList.remove('hidden');
    }

    if (syncNative) this.syncWindowMode(mode);
  }

  syncWindowMode(mode) {
    if (!this._nativeReady) return Promise.resolve();
    this._windowSyncChain = this._windowSyncChain.catch(console.error).then(() => {
      if (mode === this.currentMode) return window.pywebview.api.toggle_size(mode);
    });
    return this._windowSyncChain;
  }

  switchTab(tabKey) {
    this.currentTab = tabKey;
    document.querySelectorAll('.nav-tab').forEach(t => {
      const selected = t.getAttribute('data-tab') === tabKey;
      t.classList.toggle('active', selected);
      t.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === `tab-pane-${tabKey}`);
    });
    if (tabKey === 'stats') this.renderStats();
  }

  switchStatsSubtab(subKey) {
    this.currentStatsSub = subKey;
    document.querySelectorAll('[data-subtab]').forEach(btn => {
      const active = btn.getAttribute('data-subtab') === subKey;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    ['overview', 'shelf', 'receipt'].forEach(key => {
      const pane = document.getElementById(`stats-sub-${key}`);
      if (pane) pane.classList.toggle('active', key === subKey);
    });
    if (subKey === 'shelf') this.renderShelf();
    if (subKey === 'receipt') this.renderReceipt();
  }

  switchSettingsSubtab(subKey) {
    this.currentSettingsSub = subKey;
    document.querySelectorAll('[data-settings-sub]').forEach(btn => {
      const active = btn.getAttribute('data-settings-sub') === subKey;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    ['look', 'guard', 'window', 'timer'].forEach(key => {
      const pane = document.getElementById(`settings-sub-${key}`);
      if (pane) pane.classList.toggle('active', key === subKey);
    });
  }

  cycleLcdView() {
    const order = ['digits', 'minimal', 'spectrum'];
    const labels = { digits: '数字', minimal: '极简', spectrum: '音谱' };
    this.lcdViewMode = order[(order.indexOf(this.lcdViewMode) + 1) % order.length];
    const badge = document.getElementById('screen-view-badge');
    if (badge) badge.textContent = labels[this.lcdViewMode];
    ['digits', 'minimal', 'spectrum'].forEach(mode => {
      const el = document.getElementById(`screen-${mode}-view`);
      if (el) el.classList.toggle('hidden', mode !== this.lcdViewMode);
    });
    if (this.lcdViewMode === 'spectrum') {
      this._startSpectrumLoop();
    } else {
      this._stopSpectrumLoop();
    }
    this.updateFocusDisplay();
  }

  _startSpectrumLoop() {
    this._stopSpectrumLoop();
    const container = document.getElementById('lcd-spectrum-bars');
    if (!container) return;
    if (container.children.length !== 12) {
      container.innerHTML = '';
      for (let i = 0; i < 12; i++) {
        const bar = document.createElement('div');
        bar.className = 'lcd-spec-bar';
        bar.style.height = '18%';
        container.appendChild(bar);
      }
    }
    const update = () => {
      const levels = this.sound.getSpectrumLevels(12);
      Array.from(container.children).forEach((bar, i) => {
        bar.style.height = `${Math.round(levels[i] * 100)}%`;
      });
    };
    update();
    this._spectrumTimer = setInterval(update, 140);
  }

  _stopSpectrumLoop() {
    if (this._spectrumTimer) {
      clearInterval(this._spectrumTimer);
      this._spectrumTimer = null;
    }
  }

  activeOverlay() {
    return ['alarm-overlay', 'guard-overlay', 'celebrate-overlay']
      .map(id => document.getElementById(id))
      .find(overlay => overlay && overlay.classList.contains('active'));
  }

  setOverlay(id, visible) {
    const target = document.getElementById(id);
    if (!target) return;
    if (visible && !this.activeOverlay()) this._dialogReturnFocus = document.activeElement;
    target.classList.toggle('active', visible);
    const active = this.activeOverlay();
    ['card-view', 'capsule-view'].forEach(view => {
      const el = document.getElementById(view);
      if (el) el.inert = Boolean(active);
    });
    ['alarm-overlay', 'guard-overlay', 'celebrate-overlay'].forEach(overlayId => {
      const el = document.getElementById(overlayId);
      if (el) el.inert = Boolean(active && active.id !== overlayId);
    });
    if (active) {
      const btn = [...active.querySelectorAll('button')].find(b => !b.classList.contains('hidden'));
      btn?.focus?.();
    } else {
      this._dialogReturnFocus?.focus?.();
      this._dialogReturnFocus = null;
    }
  }

  applyTheme(theme, persist = true) {
    if (!ALL_THEMES.includes(theme)) return;
    this.settings.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-btn').forEach(btn => {
      const selected = btn.getAttribute('data-theme') === theme;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    if (persist) this.saveState();
  }

  renderThemeLocks() {
    document.querySelectorAll('.theme-btn').forEach(btn => {
      const key = btn.getAttribute('data-theme');
      const unlocked = this.isThemeUnlocked(key);
      btn.classList.toggle('theme-locked', !unlocked);
    });
  }

  setMascot(mascotKey) {
    if (!['fire', 'cat', 'coffee', 'sprout'].includes(mascotKey)) return;
    this.settings.mascot = mascotKey;
    this.renderMascots();
    this.saveState();
  }

  currentMascotStage() {
    if (this._isNudging) return 'nudge';
    if (this.timerMode === 'break' && this.focusState === 'running') return 'break';
    if (this.focusState === 'overtime') return 'complete';
    if (this.focusState === 'running') {
      const ratio = this._focusProgressRatio();
      return ratio >= 0.45 ? 'flow' : 'start';
    }
    return 'idle';
  }

  renderMascots() {
    const key = this.settings.mascot || 'fire';
    const stage = this.currentMascotStage();
    const svg = typeof getMascotSvg === 'function' ? getMascotSvg(key, stage) : (PixelMascots[key] || PixelMascots.fire);

    const miniEl = document.getElementById('mini-mascot-svg');
    const cardEl = document.getElementById('card-mascot-avatar');
    const screenEl = document.getElementById('screen-mascot-avatar');
    if (miniEl) miniEl.innerHTML = svg;
    if (cardEl) cardEl.innerHTML = typeof getMascotSvg === 'function' ? getMascotSvg(key, 'idle') : svg;
    if (screenEl) screenEl.innerHTML = svg;

    ['fire', 'cat', 'coffee', 'sprout'].forEach(k => {
      const el = document.getElementById(`preview-mascot-${k}`);
      if (el) el.innerHTML = typeof getMascotSvg === 'function' ? getMascotSvg(k, 'idle') : PixelMascots[k];
    });

    document.querySelectorAll('.mascot-card').forEach(c => {
      const selected = c.getAttribute('data-mascot') === key;
      c.classList.toggle('active', selected);
      c.setAttribute('aria-pressed', String(selected));
    });

    const names = typeof MASCOT_NAMES !== 'undefined' ? MASCOT_NAMES : { fire: '篝火', cat: '猫猫', coffee: '咖啡', sprout: '树苗' };
    const tagEl = document.getElementById('screen-companion-tag');
    if (tagEl) {
      const suffix = stage === 'nudge' ? '盯梢提醒中' : stage === 'break' ? '一起休息中' : stage === 'flow' ? '深度心流中' : '陪伴中';
      tagEl.textContent = `${names[key] || '伴侣'}${suffix}`;
    }
  }

  togglePinTop() {
    this.setAlwaysOnTop(!this.settings.alwaysOnTop);
  }

  setAlwaysOnTop(enabled, persist = true) {
    this.settings.alwaysOnTop = Boolean(enabled);
    const pinCapsule = document.getElementById('btn-capsule-pin');
    const pinCard = document.getElementById('btn-pin-top');
    const toggle = document.getElementById('toggle-ontop');

    if (pinCapsule) pinCapsule.classList.toggle('active', this.settings.alwaysOnTop);
    if (pinCard) pinCard.classList.toggle('active', this.settings.alwaysOnTop);
    [pinCapsule, pinCard].forEach(button => {
      if (button) button.setAttribute('aria-pressed', String(this.settings.alwaysOnTop));
    });
    if (toggle) toggle.checked = this.settings.alwaysOnTop;

    if (persist) this.saveState();

    if (this._nativeReady) {
      this._pinSyncChain = this._pinSyncChain.catch(console.error).then(() => {
        if (enabled === this.settings.alwaysOnTop) return window.pywebview.api.set_on_top(enabled);
      });
    }
  }

  async requestCloseWindow() {
    if (this._nativeReady && this.settings.closeToTray && window.pywebview?.api?.hide_to_tray) {
      await this.saveState();
      await window.pywebview.api.hide_to_tray();
      return;
    }
    return this.closeApp();
  }

  async closeApp() {
    try {
      if (!this._nativeReady && this._nativeInitPromise) await this._nativeInitPromise;
      if (this._nativeReady) {
        await this.saveState();
        await window.pywebview.api.close();
      }
    } catch (error) {
      if (!this._nativeReady && window.pywebview && window.pywebview.api) {
        await window.pywebview.api.close();
      } else {
        window.alert(`数据保存失败，请重试：${error.message}`);
      }
    }
  }

  // ================= FOCUS TIMER ENGINE =================
  isFocusActive() {
    return (this.focusState === 'running' || this.focusState === 'overtime') && this.timerMode !== 'break';
  }

  _highlightDurationChip(mins) {
    document.querySelectorAll('.duration-chips .chip').forEach(c => {
      const m = parseInt(c.getAttribute('data-mins'), 10);
      const active = this.timerMode === 'countdown' && m === mins;
      c.classList.toggle('active', active);
      c.setAttribute('aria-pressed', String(active));
    });
    const swBtn = document.getElementById('btn-mode-stopwatch');
    if (swBtn) {
      const isSw = this.timerMode === 'stopwatch';
      swBtn.classList.toggle('active', isSw);
      swBtn.setAttribute('aria-pressed', String(isSw));
    }
  }

  setFocusDuration(minutes) {
    if (this.focusState === 'running' || this.focusState === 'overtime') return false;
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) return false;
    if (this.focusState === 'paused') {
      clearInterval(this.focusTimer);
      this.focusState = 'idle';
      this.updatePlayButtons(false);
    }
    this.timerMode = 'countdown';
    this.focusDuration = Math.round(minutes) * 60;
    this.focusRemaining = this.focusDuration;
    this.focusRemainingMs = this.focusDuration * 1000;
    this.focusDeadline = null;
    this.elapsedMs = 0;
    this.overtimeMs = 0;
    this.updateFocusDisplay();
    document.getElementById('mascot-focus-status').textContent = '准备好，专注一件事';
    return true;
  }

  setStopwatchMode() {
    if (this.focusState === 'running' || this.focusState === 'overtime') return false;
    if (this.focusState === 'paused') {
      clearInterval(this.focusTimer);
      this.focusState = 'idle';
      this.updatePlayButtons(false);
    }
    this.timerMode = 'stopwatch';
    this.elapsedMs = 0;
    this.overtimeMs = 0;
    this.focusDeadline = null;
    this._highlightDurationChip(-1);
    this.updateFocusDisplay();
    document.getElementById('mascot-focus-status').textContent = '自由正计时，沉浸多久就记多久';
    return true;
  }

  startBreakSession(minutes = this.settings.shortBreakMins) {
    clearInterval(this.focusTimer);
    this._clearRitual();
    this.timerMode = 'break';
    this.focusDuration = Math.max(1, Math.round(minutes)) * 60;
    this.focusRemaining = this.focusDuration;
    this.focusRemainingMs = this.focusDuration * 1000;
    this.focusState = 'running';
    this.focusDeadline = Date.now() + this.focusRemainingMs;
    this.elapsedMs = 0;
    this.overtimeMs = 0;
    if (this.settings.audioFollowFocus && this.hasActiveMix()) {
      this.sound.fadeAmbient(false, 0.8);
    }
    this.updatePlayButtons(true);
    this.renderMascots();
    this.updateFocusDisplay();
    document.getElementById('mascot-focus-status').textContent = `放松 ${minutes} 分钟，眺望远处伸个懒腰`;
    this.focusTimer = setInterval(() => this.tickFocus(), 250);
    this.syncNativeConfig();
  }

  _runLaunchRitualVisual() {
    this._clearRitual();
    const ritualBox = document.getElementById('screen-ritual-box');
    const digitsView = document.getElementById('screen-digits-view');
    const minimalView = document.getElementById('screen-minimal-view');
    const spectrumView = document.getElementById('screen-spectrum-view');
    if (!ritualBox || !digitsView) return;

    const steps = [
      { count: '3', text: '吸气，放下多余念头…' },
      { count: '2', text: '屏息，把注意力收回来…' },
      { count: '1', text: '呼气，进入专注心流' }
    ];
    let idx = 0;
    const showStep = () => {
      const countEl = document.getElementById('ritual-count');
      const textEl = document.getElementById('ritual-text');
      if (countEl) countEl.textContent = steps[idx].count;
      if (textEl) textEl.textContent = steps[idx].text;
    };
    digitsView.classList.add('hidden');
    if (minimalView) minimalView.classList.add('hidden');
    if (spectrumView) spectrumView.classList.add('hidden');
    ritualBox.classList.remove('hidden');
    showStep();

    this._ritualTimer = setInterval(() => {
      idx += 1;
      if (idx >= steps.length) {
        this._clearRitual();
      } else {
        showStep();
      }
    }, 950);
  }

  _clearRitual() {
    if (this._ritualTimer) {
      clearInterval(this._ritualTimer);
      this._ritualTimer = null;
    }
    const ritualBox = document.getElementById('screen-ritual-box');
    if (ritualBox) ritualBox.classList.add('hidden');
    ['digits', 'minimal', 'spectrum'].forEach(mode => {
      const el = document.getElementById(`screen-${mode}-view`);
      if (el) el.classList.toggle('hidden', mode !== this.lcdViewMode);
    });
  }

  toggleFocusTimer(interactive = false) {
    this.sound.init();
    if (this.focusState === 'overtime') {
      this.finishFocusSession();
      return;
    }
    if (this.focusState === 'running') {
      this.tickFocus();
      if (this.focusState !== 'running') return;
      clearInterval(this.focusTimer);
      this._clearRitual();
      this.focusState = 'paused';
      this.focusDeadline = null;
      this._lastTickAt = null;
      this.sound.play8BitTone([783.99, 523.25], 0.08);
      if (this.settings.audioFollowFocus && this.hasActiveMix()) {
        this.sound.fadeAmbient(false, 0.5);
      }
      this.updatePlayButtons(false);
      this.renderMascots();
      this.updateFocusDisplay();
      document.getElementById('mascot-focus-status').textContent = '歇一歇，随时可以继续';
      this.syncNativeConfig();
    } else {
      const startingFresh = this.focusState === 'idle';
      this.focusState = 'running';
      const now = Date.now();
      if (startingFresh) {
        this.focusStartedAt = now;
        this._currentSessionId = this.newAlarmId();
        this._sessionDistractions = 0;
        this.overtimeMs = 0;
        if (this.timerMode === 'stopwatch') this.elapsedMs = 0;
      }
      if (this.timerMode === 'stopwatch') {
        this._lastTickAt = now;
      } else {
        this.focusDeadline = now + this.focusRemainingMs;
      }

      if (startingFresh && interactive && this.settings.launchRitual && this.timerMode !== 'break') {
        this.sound.playCartridgeClick();
        this._runLaunchRitualVisual();
      } else {
        this.sound.play8BitTone([523.25, 659.25, 783.99, 1046.5], 0.06);
      }

      if (this.settings.audioFollowFocus && this.hasActiveMix() && this.timerMode !== 'break') {
        this.sound.setTrackMix(this.audio.tracks, { active: true });
      }

      this.updatePlayButtons(true);
      this.renderMascots();
      document.getElementById('mascot-focus-status').textContent =
        this.timerMode === 'break' ? '放松身心，准备下一程' : '这一刻，只做眼前这一件事';

      this.updateFocusDisplay();
      this.focusTimer = setInterval(() => this.tickFocus(), 250);
      this.syncNativeConfig();
    }
  }

  tickFocus() {
    if (this.focusState !== 'running' && this.focusState !== 'overtime') return;
    const now = Date.now();

    if (this.timerMode === 'stopwatch') {
      const delta = Math.max(0, now - (this._lastTickAt || now));
      this._lastTickAt = now;
      this.elapsedMs += delta;
      this.updateFocusDisplay();
      return;
    }

    if (this.focusState === 'overtime') {
      this.overtimeMs = Math.max(0, now - (this.focusDeadline || now));
      this.updateFocusDisplay();
      return;
    }

    this.focusRemainingMs = Math.max(0, this.focusDeadline - now);
    const seconds = Math.ceil(this.focusRemainingMs / 1000);
    if (seconds !== this.focusRemaining) {
      this.focusRemaining = seconds;
      this.updateFocusDisplay();
      this.renderMascots();
    }

    if (this.focusRemainingMs === 0) {
      if (this.timerMode === 'break') {
        this._completeBreakSession();
      } else if (this.settings.flowOvertime) {
        this.focusState = 'overtime';
        this.overtimeMs = Math.max(0, now - this.focusDeadline);
        this.sound.playGentleChime();
        this.updatePlayButtons(true);
        this.renderMascots();
        this.updateFocusDisplay();
        document.getElementById('mascot-focus-status').textContent = '目标已达成，心流继续中 — 随时可点「收工」结算';
      } else {
        this.completeFocusSession();
      }
    }
  }

  _completeBreakSession() {
    clearInterval(this.focusTimer);
    this._clearRitual();
    this.timerMode = 'countdown';
    this.focusState = 'idle';
    this.focusDuration = 25 * 60;
    this.focusRemaining = this.focusDuration;
    this.focusRemainingMs = this.focusDuration * 1000;
    this.focusDeadline = null;
    this._highlightDurationChip(25);
    this.sound.play8BitTone([523.25, 659.25, 783.99], 0.09);
    this.updatePlayButtons(false);
    this.renderMascots();
    this.updateFocusDisplay();
    document.getElementById('mascot-focus-status').textContent = '休息完毕，精神饱满开启下一轮！';
    this.syncNativeConfig();
  }

  finishFocusSession() {
    if (this.focusState === 'idle') return;
    if (this.timerMode === 'break') {
      this._completeBreakSession();
      return;
    }
    this.tickFocus();
    if (this.focusState === 'idle') return;

    const now = Date.now();
    let actualMins = 0;
    let targetMins = Math.round(this.focusDuration / 60);
    let overtimeMins = 0;
    let completedAt = now;

    if (this.timerMode === 'stopwatch') {
      actualMins = Math.max(1, Math.round(this.elapsedMs / 60000));
      targetMins = actualMins;
    } else if (this.focusState === 'overtime') {
      overtimeMins = Math.floor(this.overtimeMs / 60000);
      actualMins = targetMins + overtimeMins;
      completedAt = overtimeMins > 0 ? now : (this.focusDeadline || now);
    } else {
      const spentMs = Math.max(0, this.focusDuration * 1000 - this.focusRemainingMs);
      actualMins = Math.max(1, Math.round(spentMs / 60000));
    }
    this.completeFocusSession({ actualMins, targetMins, overtimeMins, completedAt });
  }

  resetFocusTimer() {
    clearInterval(this.focusTimer);
    this._clearRitual();
    if (this.timerMode === 'break') {
      this.timerMode = 'countdown';
      this.focusDuration = 25 * 60;
      this._highlightDurationChip(25);
    }
    this.focusState = 'idle';
    this.focusRemaining = this.focusDuration;
    this.focusRemainingMs = this.focusDuration * 1000;
    this.focusDeadline = null;
    this.elapsedMs = 0;
    this.overtimeMs = 0;
    this._lastTickAt = null;
    this._isNudging = false;
    if (this.settings.audioFollowFocus && this.hasActiveMix()) {
      this.sound.fadeAmbient(false, 0.5);
    }
    this.updatePlayButtons(false);
    this.renderMascots();
    this.updateFocusDisplay();
    document.getElementById('mascot-focus-status').textContent = '准备好，专注一件事';
    this.syncNativeConfig();
    this.flushDeferredAlarms();
  }

  updatePlayButtons(isRunning) {
    const miniToggle = document.getElementById('capsule-toggle-label');
    const fullToggle = document.getElementById('focus-start-text');
    const isOvertime = this.focusState === 'overtime';
    const label = isOvertime ? '收工结算' : isRunning ? '暂停专注' : this.focusState === 'paused' ? '继续专注' : '开始专注';
    if (miniToggle) miniToggle.textContent = label;
    if (fullToggle) fullToggle.textContent = isOvertime ? '收工' : isRunning ? '暂停' : this.focusState === 'paused' ? '继续' : '开始';
    ['btn-capsule-toggle', 'btn-focus-start'].forEach(id => {
      const button = document.getElementById(id);
      if (button) {
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
      }
    });
    ['capsule-play-icon', 'focus-play-icon'].forEach(id => {
      const icon = document.getElementById(id);
      if (icon) icon.setAttribute('href', isOvertime ? '#icon-check' : isRunning ? '#icon-pause' : '#icon-play');
    });

    const showFinish = (this.focusState === 'running' || this.focusState === 'paused' || isOvertime) &&
      (isOvertime || this.timerMode === 'stopwatch');
    ['btn-focus-finish', 'btn-capsule-finish'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !showFinish);
    });

    const stateLabel = isOvertime ? '心流顺延中'
      : this.timerMode === 'break' && isRunning ? '休息放松'
        : isRunning ? '正在专注' : this.focusState === 'paused' ? '已暂停' : '准备就绪';
    const screenState = document.getElementById('screen-focus-state');
    if (screenState) screenState.textContent = stateLabel;
    if (this.focusState === 'paused') {
      document.getElementById('capsule-subtext').textContent = '已暂停，随时继续';
    }
    const locked = isRunning || isOvertime;
    document.querySelectorAll('.duration-chips .chip').forEach(chip => { chip.disabled = locked; });
    const customInput = document.getElementById('custom-mins-input');
    if (customInput) customInput.disabled = locked;
  }

  completeFocusSession(override = null) {
    if (this.focusState !== 'running' && this.focusState !== 'overtime' && !override) return;
    const completedAt = override?.completedAt ?? (this.focusDeadline || Date.now());
    const targetMins = override?.targetMins ?? Math.round(this.focusDuration / 60);
    const actualMins = override?.actualMins ?? targetMins;
    const overtimeMins = override?.overtimeMins ?? 0;

    clearInterval(this.focusTimer);
    this._clearRitual();
    this.focusState = 'idle';
    this._isNudging = false;

    const day = this._getTodayStr(new Date(completedAt));
    const entry = this.stats.days[day] || { minutes: 0, sessions: 0 };
    entry.minutes += actualMins;
    entry.sessions += 1;
    this.stats.days[day] = entry;

    const task = document.getElementById('task-input')?.value?.trim() || '自由专注';
    const collectible = typeof mintCollectible === 'function'
      ? mintCollectible(this.settings.mascot, this.collection.items.length, day)
      : { id: this.newAlarmId(), mascot: this.settings.mascot, name: '专注徽章', date: day };
    this.collection.items.push(collectible);

    const startAt = this.focusStartedAt || (completedAt - actualMins * 60000);
    this.sessions.push({
      id: this._currentSessionId || this.newAlarmId(),
      date: day,
      startAt,
      endAt: completedAt,
      targetMins,
      actualMins,
      overtimeMins,
      task,
      mascot: this.settings.mascot,
      distractions: this._sessionDistractions,
      collectible: collectible.name
    });
    if (this.sessions.length > 300) this.sessions = this.sessions.slice(-300);

    const newlyUnlocked = this._recomputeUnlocks();
    this._completedRounds += 1;

    this.sound.playVictoryFanfare(newlyUnlocked.length > 0);
    if (this.settings.audioFollowFocus && this.hasActiveMix()) {
      this.sound.fadeAmbient(false, 0.8);
    }

    this.saveState();
    this.renderThemeLocks();
    this.renderStats();

    // Reset timer
    if (this.timerMode === 'stopwatch') {
      this.elapsedMs = 0;
    } else {
      this.focusRemaining = this.focusDuration;
      this.focusRemainingMs = this.focusDuration * 1000;
    }
    this.focusDeadline = null;
    this.overtimeMs = 0;
    this.updateFocusDisplay();
    this.updatePlayButtons(false);
    this.renderMascots();
    document.getElementById('mascot-focus-status').textContent = '做得很好，休息片刻再出发';
    this.syncNativeConfig();

    // Break recommendation (long break every 4 rounds, or 1/5 rule for long flow sessions)
    const isLong = this._completedRounds % 4 === 0;
    this._recommendedBreakMins = isLong
      ? this.settings.longBreakMins
      : Math.max(this.settings.shortBreakMins, Math.min(20, Math.round(actualMins / 5)));

    // Expand & Show Settlement Modal
    this.switchMode('expanded');
    const celebrateIconBox = document.getElementById('celebrate-icon-box');
    if (celebrateIconBox && typeof getCollectibleSvg === 'function') {
      celebrateIconBox.innerHTML = getCollectibleSvg(collectible);
    }
    document.getElementById('celebrate-title').textContent = '这一刻，专注完成';
    const extraText = overtimeMins > 0 ? `（含顺延心流 +${overtimeMins} 分钟）` : '';
    document.getElementById('celebrate-detail').textContent =
      `本次完成「${task}」共 ${actualMins} 分钟${extraText}，收获收藏「${collectible.name}」。`;

    const unlockBanner = document.getElementById('celebrate-unlock-banner');
    if (unlockBanner) {
      if (newlyUnlocked.length) {
        unlockBanner.textContent = `彩蛋解锁：已获得新掌机外壳「${newlyUnlocked.map(u => u.label).join('、')}」！`;
        unlockBanner.classList.remove('hidden');
      } else {
        unlockBanner.classList.add('hidden');
      }
    }

    const breakBtn = document.getElementById('btn-celebrate-break');
    if (breakBtn) breakBtn.textContent = `休息 ${this._recommendedBreakMins} 分钟`;

    this._renderCelebrateParkSummary(day);
    this.setOverlay('celebrate-overlay', true);
  }

  _focusProgressRatio() {
    if (this.timerMode === 'stopwatch') {
      return Math.min(1, (this.elapsedMs % (60 * 60 * 1000)) / (60 * 60 * 1000));
    }
    if (this.focusState === 'overtime') return 1;
    return Math.max(0, Math.min(1, 1 - (this.focusRemaining / Math.max(1, this.focusDuration))));
  }

  updateFocusDisplay() {
    let timeStr = '';
    let approxLabel = '';
    let subDuration = '';

    if (this.timerMode === 'stopwatch') {
      const totalSec = Math.floor(this.elapsedMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      timeStr = this.settings.hideSeconds && this.focusState === 'running'
        ? `${mins}m`
        : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      approxLabel = `已专注 ${mins} 分钟`;
      subDuration = '自由正计时模式';
    } else if (this.focusState === 'overtime') {
      const overSec = Math.floor(this.overtimeMs / 1000);
      const mins = Math.floor(overSec / 60);
      const secs = overSec % 60;
      timeStr = this.settings.hideSeconds
        ? `+${mins}m`
        : `+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      approxLabel = `心流顺延 +${mins}m`;
      subDuration = `已完成 ${Math.round(this.focusDuration / 60)}m · 顺延中`;
    } else {
      const mins = Math.floor(this.focusRemaining / 60);
      const secs = this.focusRemaining % 60;
      const ceilMins = Math.ceil(this.focusRemaining / 60);
      timeStr = this.settings.hideSeconds && this.focusState === 'running'
        ? `~${ceilMins}m`
        : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      approxLabel = `约 ${ceilMins} 分钟`;
      subDuration = this.timerMode === 'break'
        ? `${Math.round(this.focusDuration / 60)} 分钟休息`
        : `${Math.round(this.focusDuration / 60)} 分钟专注`;
    }

    document.getElementById('capsule-time').textContent = timeStr;
    document.getElementById('big-timer-digits').textContent = timeStr;
    document.getElementById('screen-duration-label').textContent = subDuration;

    const minLabel = document.getElementById('minimal-status-label');
    if (minLabel) minLabel.textContent = approxLabel;
    const specLabel = document.getElementById('spectrum-time-label');
    if (specLabel) specLabel.textContent = `${timeStr} · ${this.hasActiveMix() && !this.audio.muted ? '声景运行中' : '安静模式'}`;

    const ratio = this._focusProgressRatio();
    this.renderSegmentBar('capsule-segments', 10, ratio);
    this.renderSegmentBar('screen-segments', 20, ratio, 'screen-seg');

    const peekBar = document.querySelector('#peek-progress-fill .peek-progress-bar');
    if (peekBar) peekBar.style.height = `${Math.round(ratio * 100)}%`;

    if (this._isNudging && this._nudgeText) {
      document.getElementById('capsule-subtext').textContent = this._nudgeText;
    } else if (this.focusState === 'overtime') {
      document.getElementById('capsule-subtext').textContent = '心流顺延中 · 点 ✓ 收工';
    } else if (this.focusState === 'running') {
      const task = document.getElementById('task-input').value.trim();
      document.getElementById('capsule-subtext').textContent =
        this.timerMode === 'break' ? '休息放松中' : task ? `目标: ${task}` : `专注中 ${Math.round(ratio * 100)}%`;
    }
  }

  renderSegmentBar(containerId, totalBlocks, ratio, blockClass = 'seg-block') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const filledCount = Math.floor(ratio * totalBlocks);
    const renderKey = `${filledCount}:${this.focusState}`;
    if (container.dataset.renderKey === renderKey) return;
    container.dataset.renderKey = renderKey;
    if (container.children.length !== totalBlocks) {
      container.innerHTML = '';
      for (let i = 0; i < totalBlocks; i++) {
        const block = document.createElement('div');
        block.className = blockClass;
        container.appendChild(block);
      }
    }
    Array.from(container.children).forEach((block, i) => {
      const current = i === filledCount && (this.focusState === 'running' || this.focusState === 'overtime');
      block.classList.toggle('filled', i < filledCount || current);
      block.classList.toggle('current', current);
    });
  }

  // ================= DISTRACTION PARKING LOT =================
  openQuickPark() {
    if (this.currentMode === 'expanded') {
      this.switchTab('focus');
      const input = document.getElementById('card-park-input');
      input?.focus?.();
      return;
    }
    if (this.currentMode === 'peek') this.switchMode('capsule');
    document.getElementById('capsule-main-row')?.classList.add('hidden');
    document.getElementById('capsule-park-row')?.classList.remove('hidden');
    const input = document.getElementById('capsule-park-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  closeCapsulePark() {
    document.getElementById('capsule-park-row')?.classList.add('hidden');
    document.getElementById('capsule-main-row')?.classList.remove('hidden');
  }

  submitCapsulePark() {
    const input = document.getElementById('capsule-park-input');
    const text = input?.value?.trim() || '';
    if (text) this.addParkedThought(text);
    this.closeCapsulePark();
  }

  submitCardPark() {
    const input = document.getElementById('card-park-input');
    const text = input?.value?.trim() || '';
    if (!text) return;
    this.addParkedThought(text);
    input.value = '';
  }

  addParkedThought(text) {
    const clean = String(text || '').trim().slice(0, 60);
    if (!clean) return null;
    const item = {
      id: this.newAlarmId(),
      text: clean,
      createdAt: Date.now(),
      done: false,
      sessionDate: this._getTodayStr(),
      sessionId: this._currentSessionId || null
    };
    this.parkingLot.push(item);
    if (this.parkingLot.length > 120) this.parkingLot = this.parkingLot.slice(-120);
    this.saveState();
    this.renderParkingLot();
    this.sound.play8BitTone([587.33, 880], 0.045);
    document.getElementById('mascot-focus-status').textContent = `已暂存「${clean}」，继续安心专注吧`;
    return item;
  }

  toggleParkedThought(id) {
    const target = this.parkingLot.find(item => item.id === id);
    if (!target) return;
    target.done = !target.done;
    this.saveState();
    this.renderParkingLot();
  }

  deleteParkedThought(id) {
    this.parkingLot = this.parkingLot.filter(item => item.id !== id);
    this.saveState();
    this.renderParkingLot();
  }

  convertThoughtToAlarm(id, offsetMins = 15) {
    const target = this.parkingLot.find(item => item.id === id);
    if (!target) return null;
    const dueAt = Date.now() + offsetMins * 60 * 1000;
    const d = new Date(dueAt);
    const time = this._formatHM(d);
    const created = {
      id: this.newAlarmId(),
      time,
      title: target.text,
      repeat: 'once',
      priority: 'normal',
      enabled: true,
      nextTriggerAt: dueAt
    };
    this.alarms.push(created);
    target.done = true;
    this.saveState();
    this.renderAlarmsList();
    this.renderParkingLot();
    this.sound.play8BitTone([659.25, 880], 0.06);
    return created;
  }

  renderParkingLot() {
    const today = this._getTodayStr();
    const items = this.parkingLot.filter(item => item.sessionDate === today || !item.done);
    const undone = items.filter(item => !item.done);
    const badgeRow = document.getElementById('park-badge-row');
    const countLabel = document.getElementById('park-count-label');
    const list = document.getElementById('park-inline-list');
    if (badgeRow) badgeRow.classList.toggle('hidden', items.length === 0);
    if (countLabel) countLabel.textContent = `已暂存 ${undone.length} 条待处理念头（今日共 ${items.length} 条）`;
    if (!list) return;
    list.innerHTML = '';
    items.slice().reverse().forEach(item => {
      const row = document.createElement('div');
      row.className = `park-item ${item.done ? 'done' : ''}`;
      row.innerHTML = `
        <span class="park-item-text">${escapeHtml(item.text)}</span>
        <div class="park-item-actions">
          <button class="park-mini-btn" data-act="done" title="标记完成">${item.done ? '撤销' : '完成'}</button>
          <button class="park-mini-btn" data-act="alarm" title="15分钟后提醒我">转闹钟</button>
          <button class="park-mini-btn" data-act="del" title="删除">×</button>
        </div>
      `;
      row.querySelector('[data-act="done"]').addEventListener('click', () => this.toggleParkedThought(item.id));
      row.querySelector('[data-act="alarm"]').addEventListener('click', () => this.convertThoughtToAlarm(item.id));
      row.querySelector('[data-act="del"]').addEventListener('click', () => this.deleteParkedThought(item.id));
      list.appendChild(row);
    });
  }

  _renderCelebrateParkSummary(day) {
    const box = document.getElementById('celebrate-park-summary');
    const list = document.getElementById('celebrate-park-list');
    if (!box || !list) return;
    const pending = this.parkingLot.filter(item => !item.done && item.sessionDate === day);
    box.classList.toggle('hidden', pending.length === 0);
    list.innerHTML = '';
    pending.forEach(item => {
      const row = document.createElement('div');
      row.className = 'park-item';
      row.innerHTML = `
        <span class="park-item-text">${escapeHtml(item.text)}</span>
        <div class="park-item-actions">
          <button class="park-mini-btn" data-act="done">✓</button>
          <button class="park-mini-btn" data-act="alarm">转闹钟</button>
        </div>
      `;
      row.querySelector('[data-act="done"]').addEventListener('click', () => {
        this.toggleParkedThought(item.id);
        this._renderCelebrateParkSummary(day);
      });
      row.querySelector('[data-act="alarm"]').addEventListener('click', () => {
        this.convertThoughtToAlarm(item.id);
        this._renderCelebrateParkSummary(day);
      });
      list.appendChild(row);
    });
  }

  // ================= PRIORITY ALARMS ENGINE =================
  addAlarm() {
    const timeInput = document.getElementById('alarm-time-input');
    const descInput = document.getElementById('alarm-desc-input');
    const repeatSelect = document.getElementById('alarm-repeat-select');
    const prioritySelect = document.getElementById('alarm-priority-select');

    const time = timeInput.value;
    const title = descInput.value.trim() || '提醒事项';
    const repeat = repeatSelect.value;
    const priority = prioritySelect?.value === 'urgent' ? 'urgent' : 'normal';

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return;

    this.alarms.push({
      id: this.newAlarmId(),
      time,
      title,
      repeat,
      priority,
      enabled: true,
      nextTriggerAt: this.nextAlarmTime(time, repeat, Date.now())
    });

    this.saveState();
    this.renderAlarmsList();
    descInput.value = '';
    this.sound.play8BitTone([659.25, 783.99], 0.08);
  }

  renderAlarmsList() {
    const banner = document.getElementById('deferred-alarms-banner');
    if (banner) {
      banner.classList.toggle('hidden', this.deferredAlarms.length === 0);
      if (this.deferredAlarms.length > 0) {
        banner.textContent = `专注保护中：已有 ${this.deferredAlarms.length} 条普通提醒静默排队，收工后自动弹出。`;
      }
    }

    const list = document.getElementById('alarms-list');
    list.innerHTML = '';

    if (this.alarms.length === 0) {
      list.innerHTML = '<div class="empty-state"><strong>还没有提醒</strong>在上方添加一件想记住的小事</div>';
      return;
    }

    this.alarms.forEach(alarm => {
      const item = document.createElement('div');
      item.className = `alarm-item ${alarm.enabled ? '' : 'disabled'}`;

      const repeatLabel = alarm.repeat === 'daily' ? '每天' : alarm.repeat === 'workday' ? '工作日' : '单次';
      const isUrgent = alarm.priority === 'urgent';
      const safeTitle = escapeHtml(alarm.title);
      const safeTime = escapeHtml(alarm.time);

      item.innerHTML = `
        <div class="alarm-copy">
          <span class="alarm-item-time">${safeTime}</span>
          <span class="alarm-item-title">${safeTitle}</span>
          <div class="alarm-meta-line">
            <span class="alarm-repeat">${repeatLabel}</span>
            <span class="alarm-priority-badge ${isUrgent ? 'urgent' : ''}">${isUrgent ? '紧急穿透' : '普通'}</span>
          </div>
        </div>
        <div class="alarm-right-box">
          <label class="pixel-switch">
            <input type="checkbox" ${alarm.enabled ? 'checked' : ''} data-id="${alarm.id}" aria-label="启用提醒 ${safeTime}">
            <span class="pixel-slider"></span>
          </label>
          <button class="btn-pixel btn-del" data-id="${alarm.id}" title="删除提醒" aria-label="删除提醒 ${safeTime}"><svg class="icon" aria-hidden="true"><use href="#icon-close"/></svg></button>
        </div>
      `;

      item.querySelector('input[type="checkbox"]').addEventListener('change', e => {
        alarm.enabled = e.target.checked;
        if (alarm.enabled) alarm.nextTriggerAt = this.nextAlarmTime(alarm.time, alarm.repeat, Date.now());
        item.classList.toggle('disabled', !alarm.enabled);
        this.saveState();
      });

      item.querySelector('.btn-del').addEventListener('click', () => {
        this.alarms = this.alarms.filter(a => a.id !== alarm.id);
        this.alarmQueue = this.alarmQueue.filter(a => a.id !== alarm.id);
        this.deferredAlarms = this.deferredAlarms.filter(a => a.id !== alarm.id);
        this.saveState();
        this.renderAlarmsList();
      });

      list.appendChild(item);
    });
  }

  triggerAlarm(alarm) {
    if (this.activeRingingAlarm) {
      this.alarmQueue.push(alarm);
      return;
    }

    this.activeRingingAlarm = alarm;
    this.sound.startEscalatingAlarm(this.settings.gentleAlarm);

    document.getElementById('ring-title').textContent = alarm.title;
    document.getElementById('ring-time').textContent = `时间已到：${alarm.time}`;
    this.setOverlay('alarm-overlay', true);
    this.switchMode('expanded');
  }

  dismissAlarm() {
    this.sound.stopAlarm();
    this.setOverlay('alarm-overlay', false);
    this.activeRingingAlarm = null;

    if (this.alarmQueue.length > 0) {
      const next = this.alarmQueue.shift();
      this.triggerAlarm(next);
    }
  }

  snoozeAlarm() {
    const alarmToSnooze = this.activeRingingAlarm;
    if (!alarmToSnooze) return;
    this.dismissAlarm();

    const dueAt = Date.now() + 5 * 60 * 1000;
    const now = new Date(dueAt);
    const snoozeTime = this._formatHM(now);

    this.alarms.push({
      id: this.newAlarmId(),
      time: snoozeTime,
      title: `[延后] ${alarmToSnooze ? alarmToSnooze.title : '提醒事项'}`,
      repeat: 'once',
      priority: alarmToSnooze.priority || 'normal',
      enabled: true,
      nextTriggerAt: dueAt
    });
    this.saveState();
    this.renderAlarmsList();
  }

  flushDeferredAlarms() {
    if (!this.deferredAlarms.length || this.isFocusActive()) return;
    const queued = this.deferredAlarms.splice(0, this.deferredAlarms.length);
    this.renderAlarmsList();
    queued.forEach(alarm => this.triggerAlarm(alarm));
  }

  nextAlarmTime(time, repeat, after) {
    const [hour, minute] = time.split(':').map(Number);
    const candidate = new Date(after);
    candidate.setHours(hour, minute, 0, 0);
    while (candidate.getTime() < after || (repeat === 'workday' && [0, 6].includes(candidate.getDay()))) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.getTime();
  }

  checkAlarms(now = Date.now()) {
    const due = this.alarms.filter(alarm => alarm.enabled && alarm.nextTriggerAt <= now)
      .sort((a, b) => a.nextTriggerAt - b.nextTriggerAt);
    if (!due.length) return;
    const occurrences = due.map(alarm => {
      const occurrence = { ...alarm };
      if (alarm.repeat === 'once') alarm.enabled = false;
      else alarm.nextTriggerAt = this.nextAlarmTime(alarm.time, alarm.repeat, now + 1);
      return occurrence;
    });
    this.saveState();

    const immediate = [];
    occurrences.forEach(alarm => {
      if (this.isFocusActive() && alarm.priority !== 'urgent') {
        this.deferredAlarms.push(alarm);
      } else {
        immediate.push(alarm);
      }
    });
    this.renderAlarmsList();
    immediate.forEach(alarm => this.triggerAlarm(alarm));
  }

  checkGlobalClock() {
    if (!this._nativeReady && ((window.chrome && window.chrome.webview) || window.pywebview)) return;
    const now = new Date();
    this.tickFocus();
    this.checkAlarms(now.getTime());
    const today = this._getTodayStr(now);
    if (today !== this._displayDate) {
      this._displayDate = today;
      this.renderStats();
    }
    if (this.focusState === 'idle') {
      const next = this.alarms.filter(alarm => alarm.enabled)
        .sort((a, b) => a.nextTriggerAt - b.nextTriggerAt)[0];
      const currentHM = this._formatHM(now);
      document.getElementById('capsule-subtext').textContent = next
        ? `提醒 ${next.time} ${next.title}` : `当前时间 ${currentHM}`;
    }
  }

  startGlobalClock() {
    clearInterval(this.globalClock);
    this.globalClock = setInterval(() => this.checkGlobalClock(), 1000);
  }

  // ================= FOCUS GUARD & NATIVE EVENTS (M2 Hooks) =================
  handleFocusGuardEvent(event) {
    if (!event || !this.isFocusActive()) {
      this._clearNudge();
      return;
    }
    if (event.type === 'clear') {
      this._clearNudge();
      return;
    }
    if (event.type === 'nudge') {
      this._sessionDistractions += 1;
      this._isNudging = true;
      this._nudgeTarget = event.matched || event.title || '分心窗口';
      const task = document.getElementById('task-input')?.value?.trim() || '当前专注';
      this._nudgeText = `嘿，还在「${task}」呢，要回去吗？`;
      document.getElementById('capsule-view')?.classList.add('nudging');
      this.sound.playNudgeBlip();
      this.renderMascots();
      this.updateFocusDisplay();
      if (this.currentMode === 'peek') this.switchMode('capsule');
      if (event.strict) {
        document.getElementById('guard-title').textContent = `别被「${this._nudgeTarget}」带跑啦`;
        document.getElementById('guard-detail').textContent = `你正在专注「${task}」，要回到轨道还是临时放行 3 分钟？`;
        this.switchMode('expanded');
        this.setOverlay('guard-overlay', true);
      }
    }
  }

  _clearNudge() {
    if (!this._isNudging) return;
    this._isNudging = false;
    this._nudgeText = '';
    document.getElementById('capsule-view')?.classList.remove('nudging');
    this.renderMascots();
    this.updateFocusDisplay();
  }

  resolveGuardOverlay(allowTemp) {
    this.setOverlay('guard-overlay', false);
    this._clearNudge();
    if (allowTemp && this._nativeReady && window.pywebview?.api?.allow_distraction_temp) {
      window.pywebview.api.allow_distraction_temp(180).catch(console.error);
    }
  }

  handleNativeEvent(name, payload = {}) {
    if (name === 'hotkey_toggle' || name === 'tray_toggle') {
      this.toggleFocusTimer(true);
    } else if (name === 'hotkey_expand') {
      this.switchMode(this.currentMode === 'expanded' ? 'capsule' : 'expanded');
    } else if (name === 'hotkey_park') {
      this.openQuickPark();
    } else if (name === 'hotkey_mute' || name === 'tray_mute') {
      this.toggleAmbientMute();
    } else if (name === 'peek_state') {
      if (payload.peek && this.currentMode === 'capsule') this.switchMode('peek', false);
      else if (!payload.peek && this.currentMode === 'peek') this.switchMode('capsule', false);
    } else if (name === 'focus_guard') {
      this.handleFocusGuardEvent(payload);
    } else if (name === 'tray_exit') {
      this.closeApp();
    }
  }

  // ================= STATS, HEATMAP, SHELF & RECEIPT =================
  renderStats() {
    const todayKey = this._getTodayStr();
    const today = this.stats.days[todayKey] || { minutes: 0, sessions: 0 };
    document.getElementById('stat-today-minutes').textContent = `${today.minutes}m`;
    document.getElementById('stat-today-sessions').textContent = `${today.sessions}`;
    const totalEl = document.getElementById('stat-total-minutes');
    if (totalEl) totalEl.textContent = `累计 ${this._computeTotalMinutes()} 分钟`;

    // 7-day pixel tower chart
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const history = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - 6 + index);
      const key = this._getTodayStr(date);
      return { date, key, minutes: this.stats.days[key]?.minutes || 0 };
    });
    const container = document.getElementById('heat-bars-container');
    if (container) {
      container.innerHTML = '';
      const maxVal = Math.max(...history.map(day => day.minutes), 60);
      history.forEach(({ date, key, minutes: val }) => {
        const col = document.createElement('div');
        col.className = 'heat-col';
        col.title = `${key}: ${val} 分钟`;
        const stack = document.createElement('div');
        stack.className = 'heat-stack';
        const filledBlocks = Math.round((val / maxVal) * 10);
        for (let b = 0; b < filledBlocks; b++) {
          const p = document.createElement('div');
          p.className = 'stack-pixel';
          stack.appendChild(p);
        }
        col.appendChild(stack);
        const label = document.createElement('span');
        label.className = 'heat-day-label';
        label.textContent = days[date.getDay()];
        col.appendChild(label);
        container.appendChild(col);
      });
    }

    // 28-day pixel heatmap
    const monthGrid = document.getElementById('pixel-month-grid');
    if (monthGrid) {
      monthGrid.innerHTML = '';
      let activeDays = 0;
      for (let offset = 27; offset >= 0; offset--) {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() - offset);
        const key = this._getTodayStr(d);
        const mins = this.stats.days[key]?.minutes || 0;
        if (mins > 0) activeDays++;
        const cell = document.createElement('div');
        const lvl = mins >= 90 ? 'lvl-3' : mins >= 40 ? 'lvl-2' : mins > 0 ? 'lvl-1' : '';
        cell.className = `month-cell ${lvl}`;
        cell.title = `${key}: ${mins} 分钟`;
        monthGrid.appendChild(cell);
      }
      const activeEl = document.getElementById('heatmap-active-days');
      if (activeEl) activeEl.textContent = `${activeDays} 天点亮`;
    }

    // Today's session log
    const todaySessions = this.sessions.filter(s => s.date === todayKey);
    const countEl = document.getElementById('session-log-count');
    if (countEl) countEl.textContent = `${todaySessions.length} 条`;
    const listEl = document.getElementById('today-sessions-list');
    if (listEl) {
      listEl.innerHTML = '';
      if (!todaySessions.length) {
        listEl.innerHTML = '<p class="chart-hint">完成一轮专注后，这里会记录每一段心流</p>';
      } else {
        todaySessions.slice().reverse().slice(0, 8).forEach(s => {
          const row = document.createElement('div');
          row.className = 'session-log-row';
          const startStr = this._formatHM(new Date(s.startAt));
          const endStr = this._formatHM(new Date(s.endAt));
          row.innerHTML = `
            <span class="session-log-time">${startStr}-${endStr}</span>
            <span class="session-log-task">${escapeHtml(s.task || '自由专注')}</span>
            <span class="session-log-mins">${s.actualMins}m</span>
          `;
          listEl.appendChild(row);
        });
      }
    }

    if (this.currentStatsSub === 'shelf') this.renderShelf();
    if (this.currentStatsSub === 'receipt') this.renderReceipt();
  }

  renderShelf() {
    const total = this._computeTotalMinutes();
    const nextTarget = total < 120 ? 120 : 300;
    const pct = Math.min(100, Math.round((total / nextTarget) * 100));
    const textEl = document.getElementById('milestone-progress-text');
    const fillEl = document.getElementById('milestone-bar-fill');
    const hintEl = document.getElementById('milestone-hint-text');
    if (textEl) textEl.textContent = total >= 300 ? `${total}m · 已全部解锁` : `${total} / ${nextTarget}m`;
    if (fillEl) fillEl.style.width = `${total >= 300 ? 100 : pct}%`;
    if (hintEl) {
      hintEl.textContent = total < 120
        ? `再累计 ${120 - total} 分钟解锁「经典透明紫」外壳`
        : total < 300
          ? `再累计 ${300 - total} 分钟解锁「复古掌机红」外壳`
          : '全部彩蛋掌机外壳与音效已解锁，继续收集你的像素成果吧！';
    }

    const grid = document.getElementById('pixel-shelf-grid');
    const countEl = document.getElementById('shelf-count-text');
    if (countEl) countEl.textContent = `${this.collection.items.length} 件成果`;
    if (!grid) return;
    grid.innerHTML = '';
    if (!this.collection.items.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><strong>收藏架还是空的</strong>每完成一轮专注，伴侣就会为你铸造一件专属像素成果</div>';
      return;
    }
    this.collection.items.slice().reverse().slice(0, 24).forEach(item => {
      const card = document.createElement('div');
      card.className = 'shelf-item';
      const svg = typeof getCollectibleSvg === 'function' ? getCollectibleSvg(item) : getMascotSvg(item.mascot || 'fire', 'idle');
      card.innerHTML = `${svg}<span class="shelf-item-name">${escapeHtml(item.name || '成果')}</span><span class="shelf-item-meta">${escapeHtml((item.date || '').slice(5))}</span>`;
      grid.appendChild(card);
    });
  }

  buildDailyReceiptData(dateKey = this._getTodayStr()) {
    const daySessions = this.sessions.filter(s => s.date === dateKey);
    const dayStats = this.stats.days[dateKey] || { minutes: 0, sessions: 0 };
    const dayThoughts = this.parkingLot.filter(p => p.sessionDate === dateKey);
    const totalMins = daySessions.length
      ? daySessions.reduce((sum, s) => sum + (s.actualMins || 0), 0)
      : dayStats.minutes;
    const overtimeTotal = daySessions.reduce((sum, s) => sum + (s.overtimeMins || 0), 0);
    return {
      date: dateKey,
      mascot: this.settings.mascot,
      totalMinutes: totalMins,
      sessionCount: Math.max(daySessions.length, dayStats.sessions),
      overtimeTotal,
      sessions: daySessions,
      thoughts: dayThoughts
    };
  }

  renderReceipt() {
    const box = document.getElementById('receipt-preview-box');
    if (!box) return;
    const data = this.buildDailyReceiptData();
    if (typeof formatReceiptText === 'function') {
      box.textContent = formatReceiptText(data);
    } else {
      const lines = [
        '==============================',
        '   AURAFOCUS · 每日专注小票',
        `   日期: ${data.date}`,
        '------------------------------',
        `   今日专注: ${data.totalMinutes} 分钟 (${data.sessionCount} 轮)`
      ];
      data.sessions.forEach((s, i) => {
        lines.push(`   ${i + 1}. ${this._formatHM(new Date(s.startAt))}-${this._formatHM(new Date(s.endAt))} ${s.task} (${s.actualMins}m)`);
      });
      if (data.thoughts.length) {
        lines.push('------------------------------');
        lines.push(`   暂存念头 (${data.thoughts.length}):`);
        data.thoughts.forEach(t => lines.push(`   [${t.done ? 'x' : ' '}] ${t.text}`));
      }
      lines.push('==============================');
      box.textContent = lines.join('\n');
    }
  }

  async copyReceiptMarkdown() {
    const data = this.buildDailyReceiptData();
    const md = typeof formatReceiptMarkdown === 'function'
      ? formatReceiptMarkdown(data)
      : `## AuraFocus 专注记录 (${data.date})\n- 今日专注：${data.totalMinutes} 分钟（${data.sessionCount} 轮）\n` +
        data.sessions.map(s => `- ${this._formatHM(new Date(s.startAt))}-${this._formatHM(new Date(s.endAt))} **${s.task}**（${s.actualMins}m）`).join('\n');
    const feedback = document.getElementById('receipt-feedback');
    try {
      if (this._nativeReady && window.pywebview?.api?.copy_text) {
        const res = await window.pywebview.api.copy_text(md);
        if (res && res.status !== 'ok') throw new Error(res.message || '剪贴板不可用');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(md);
      }
      if (feedback) feedback.textContent = '已复制 Markdown 到剪贴板，可直接粘贴至笔记软件';
    } catch (error) {
      if (feedback) feedback.textContent = `复制失败：${error.message}`;
    }
  }

  async exportReceiptPng() {
    const feedback = document.getElementById('receipt-feedback');
    const data = this.buildDailyReceiptData();
    if (typeof renderReceiptCanvasDataUrl !== 'function') {
      if (feedback) feedback.textContent = '小票 PNG 渲染器将在里程碑 3 启用';
      return;
    }
    try {
      const dataUrl = renderReceiptCanvasDataUrl(data);
      if (this._nativeReady && window.pywebview?.api?.save_png) {
        const res = await window.pywebview.api.save_png(dataUrl, `AuraFocus-${data.date}.png`);
        if (feedback) {
          feedback.textContent = res.status === 'ok'
            ? `已保存小票：${res.path}`
            : res.status === 'cancelled' ? '已取消保存' : `保存失败：${res.message}`;
        }
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `AuraFocus-${data.date}.png`;
        link.click();
        if (feedback) feedback.textContent = '已触发浏览器下载 PNG 小票';
      }
    } catch (error) {
      if (feedback) feedback.textContent = `导出失败：${error.message}`;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new AuraFocusApp();
  window.app.init();
});
