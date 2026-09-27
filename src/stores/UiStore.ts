import { actionBound, makeObservable, observable } from 'mobx';
import type { ExerciseType } from '../abc/tcaGenerator';

const NUMERAL_MODE_KEY = 'numeralMode';
const ZODIAC_MODE_KEY = 'zodiacMode';
const VIDEO_PANEL_EXPANDED_KEY = 'videoPanelExpanded';
const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';
const SIDEBAR_WIDTH_KEY = 'sidebarWidth';
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 288;
const TCA_LAST_INSTRUMENT_KEY_KEY = 'tcaLastInstrumentKey';
const TCA_LAST_EXERCISE_TYPE_KEY = 'tcaLastExerciseType';

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function loadNumeralMode(): boolean {
  try {
    return localStorage.getItem(NUMERAL_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadZodiacMode(): boolean {
  try {
    return localStorage.getItem(ZODIAC_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadVideoPanelExpanded(): boolean {
  try {
    const raw = localStorage.getItem(VIDEO_PANEL_EXPANDED_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw === null) return SIDEBAR_DEFAULT_WIDTH;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function loadTcaLastInstrumentKey(): string | null {
  try {
    return localStorage.getItem(TCA_LAST_INSTRUMENT_KEY_KEY);
  } catch {
    return null;
  }
}

function loadTcaLastExerciseType(): ExerciseType {
  try {
    const raw = localStorage.getItem(TCA_LAST_EXERCISE_TYPE_KEY);
    return raw === '1' || raw === '2' || raw === '3' ? (Number(raw) as ExerciseType) : 1;
  } catch {
    return 1;
  }
}

class UiStore {
  numeralMode = loadNumeralMode();
  zodiacMode = loadZodiacMode();
  videoPanelExpanded = loadVideoPanelExpanded();
  sidebarCollapsed = loadSidebarCollapsed();
  sidebarWidth = loadSidebarWidth();
  tcaLastInstrumentKey = loadTcaLastInstrumentKey();
  tcaLastExerciseType = loadTcaLastExerciseType();

  constructor() {
    makeObservable(this, {
      numeralMode: observable,
      zodiacMode: observable,
      videoPanelExpanded: observable,
      sidebarCollapsed: observable,
      sidebarWidth: observable,
      tcaLastInstrumentKey: observable,
      tcaLastExerciseType: observable,
      toggleNumeralMode: actionBound,
      toggleZodiacMode: actionBound,
      toggleVideoPanelExpanded: actionBound,
      toggleSidebarCollapsed: actionBound,
      setSidebarWidth: actionBound,
      setTcaLastInstrumentKey: actionBound,
      setTcaLastExerciseType: actionBound,
    });
  }

  toggleNumeralMode(): void {
    this.numeralMode = !this.numeralMode;
    if (this.numeralMode) this.zodiacMode = false;
    this.persistModes();
  }

  toggleZodiacMode(): void {
    this.zodiacMode = !this.zodiacMode;
    if (this.zodiacMode) this.numeralMode = false;
    this.persistModes();
  }

  private persistModes(): void {
    try {
      localStorage.setItem(NUMERAL_MODE_KEY, String(this.numeralMode));
      localStorage.setItem(ZODIAC_MODE_KEY, String(this.zodiacMode));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }

  toggleVideoPanelExpanded(): void {
    this.videoPanelExpanded = !this.videoPanelExpanded;
    try {
      localStorage.setItem(VIDEO_PANEL_EXPANDED_KEY, String(this.videoPanelExpanded));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }

  toggleSidebarCollapsed(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(this.sidebarCollapsed));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }

  setSidebarWidth(width: number): void {
    this.sidebarWidth = clampSidebarWidth(width);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(this.sidebarWidth));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }

  setTcaLastInstrumentKey(key: string | null): void {
    this.tcaLastInstrumentKey = key;
    try {
      if (key === null) localStorage.removeItem(TCA_LAST_INSTRUMENT_KEY_KEY);
      else localStorage.setItem(TCA_LAST_INSTRUMENT_KEY_KEY, key);
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }

  setTcaLastExerciseType(exerciseType: ExerciseType): void {
    this.tcaLastExerciseType = exerciseType;
    try {
      localStorage.setItem(TCA_LAST_EXERCISE_TYPE_KEY, String(exerciseType));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }
}

export default new UiStore();
