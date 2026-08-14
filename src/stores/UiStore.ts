import { actionBound, makeObservable, observable } from 'mobx';

const NUMERAL_MODE_KEY = 'numeralMode';
const VIDEO_PANEL_EXPANDED_KEY = 'videoPanelExpanded';

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

class UiStore {
  numeralMode = loadNumeralMode();
  videoPanelExpanded = loadVideoPanelExpanded();

  constructor() {
    makeObservable(this, {
      numeralMode: observable,
      videoPanelExpanded: observable,
      toggleNumeralMode: actionBound,
      toggleVideoPanelExpanded: actionBound,
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
}

export default new UiStore();
