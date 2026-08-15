import { actionBound, makeObservable, observable } from 'mobx';

const NUMERAL_MODE_KEY = 'numeralMode';
const VIDEO_PANEL_EXPANDED_KEY = 'videoPanelExpanded';
const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';
const SIDEBAR_WIDTH_KEY = 'sidebarWidth';
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 288;

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

class UiStore {
  numeralMode = loadNumeralMode();
  videoPanelExpanded = loadVideoPanelExpanded();
  sidebarCollapsed = loadSidebarCollapsed();
  sidebarWidth = loadSidebarWidth();

  constructor() {
    makeObservable(this, {
      numeralMode: observable,
      videoPanelExpanded: observable,
      sidebarCollapsed: observable,
      sidebarWidth: observable,
      toggleNumeralMode: actionBound,
      toggleVideoPanelExpanded: actionBound,
      toggleSidebarCollapsed: actionBound,
      setSidebarWidth: actionBound,
    });
  }

  toggleNumeralMode(): void {
    this.numeralMode = !this.numeralMode;
    try {
      localStorage.setItem(NUMERAL_MODE_KEY, String(this.numeralMode));
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
}

export default new UiStore();
