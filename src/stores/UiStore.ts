import { actionBound, makeObservable, observable } from 'mobx';

const STORAGE_KEY = 'numeralMode';

function loadNumeralMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

class UiStore {
  numeralMode = loadNumeralMode();

  constructor() {
    makeObservable(this, {
      numeralMode: observable,
      toggleNumeralMode: actionBound,
    });
  }

  toggleNumeralMode(): void {
    this.numeralMode = !this.numeralMode;
    try {
      localStorage.setItem(STORAGE_KEY, String(this.numeralMode));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }
}

export default new UiStore();
