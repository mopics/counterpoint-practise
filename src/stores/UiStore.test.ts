import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('UiStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // UiStore is a module-level singleton (`export default new UiStore()`),
    // constructed once per module instance — reset modules so each test's
    // dynamic import() re-runs the constructor against cleared storage,
    // instead of all tests sharing one singleton's accumulated state.
    vi.resetModules();
  });

  it('defaults numeralMode to false when nothing is persisted', async () => {
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.numeralMode).toBe(false);
  });

  it('toggleNumeralMode flips the value', async () => {
    const { default: uiStore } = await import('./UiStore');
    const initial = uiStore.numeralMode;
    uiStore.toggleNumeralMode();
    expect(uiStore.numeralMode).toBe(!initial);
  });

  it('persists the toggled value to localStorage', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.toggleNumeralMode();
    expect(localStorage.getItem('numeralMode')).toBe(String(uiStore.numeralMode));
  });

  it('loads a persisted true value on module init', async () => {
    localStorage.setItem('numeralMode', 'true');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.numeralMode).toBe(true);
  });

  it('defaults zodiacMode to false when nothing is persisted', async () => {
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.zodiacMode).toBe(false);
  });

  it('toggleZodiacMode flips the value', async () => {
    const { default: uiStore } = await import('./UiStore');
    const initial = uiStore.zodiacMode;
    uiStore.toggleZodiacMode();
    expect(uiStore.zodiacMode).toBe(!initial);
  });

  it('persists the toggled zodiacMode value to localStorage', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.toggleZodiacMode();
    expect(localStorage.getItem('zodiacMode')).toBe(String(uiStore.zodiacMode));
  });

  it('loads a persisted true zodiacMode value on module init', async () => {
    localStorage.setItem('zodiacMode', 'true');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.zodiacMode).toBe(true);
  });

  it('toggleZodiacMode turns numeralMode off when it was on', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.toggleNumeralMode();
    expect(uiStore.numeralMode).toBe(true);
    uiStore.toggleZodiacMode();
    expect(uiStore.zodiacMode).toBe(true);
    expect(uiStore.numeralMode).toBe(false);
    expect(localStorage.getItem('numeralMode')).toBe('false');
    expect(localStorage.getItem('zodiacMode')).toBe('true');
  });

  it('toggleNumeralMode turns zodiacMode off when it was on', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.toggleZodiacMode();
    expect(uiStore.zodiacMode).toBe(true);
    uiStore.toggleNumeralMode();
    expect(uiStore.numeralMode).toBe(true);
    expect(uiStore.zodiacMode).toBe(false);
    expect(localStorage.getItem('zodiacMode')).toBe('false');
    expect(localStorage.getItem('numeralMode')).toBe('true');
  });

  it('toggling a mode back off does not spuriously re-enable the other', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.toggleZodiacMode(); // zodiac on, numeral off
    uiStore.toggleZodiacMode(); // zodiac off again
    expect(uiStore.zodiacMode).toBe(false);
    expect(uiStore.numeralMode).toBe(false);
  });

  it('defaults videoPanelExpanded to true when nothing is persisted', async () => {
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.videoPanelExpanded).toBe(true);
  });

  it('toggleVideoPanelExpanded flips the value', async () => {
    const { default: uiStore } = await import('./UiStore');
    const initial = uiStore.videoPanelExpanded;
    uiStore.toggleVideoPanelExpanded();
    expect(uiStore.videoPanelExpanded).toBe(!initial);
  });

  it('persists the toggled videoPanelExpanded value to localStorage', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.toggleVideoPanelExpanded();
    expect(localStorage.getItem('videoPanelExpanded')).toBe(String(uiStore.videoPanelExpanded));
  });

  it('loads a persisted false videoPanelExpanded value on module init', async () => {
    localStorage.setItem('videoPanelExpanded', 'false');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.videoPanelExpanded).toBe(false);
  });

  it('defaults sidebarCollapsed to false when nothing is persisted', async () => {
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.sidebarCollapsed).toBe(false);
  });

  it('toggleSidebarCollapsed flips the value', async () => {
    const { default: uiStore } = await import('./UiStore');
    const initial = uiStore.sidebarCollapsed;
    uiStore.toggleSidebarCollapsed();
    expect(uiStore.sidebarCollapsed).toBe(!initial);
  });

  it('persists the toggled sidebarCollapsed value to localStorage', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.toggleSidebarCollapsed();
    expect(localStorage.getItem('sidebarCollapsed')).toBe(String(uiStore.sidebarCollapsed));
  });

  it('loads a persisted true sidebarCollapsed value on module init', async () => {
    localStorage.setItem('sidebarCollapsed', 'true');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.sidebarCollapsed).toBe(true);
  });

  it('defaults sidebarWidth to 288 when nothing is persisted', async () => {
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.sidebarWidth).toBe(288);
  });

  it('setSidebarWidth updates the value within range', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.setSidebarWidth(350);
    expect(uiStore.sidebarWidth).toBe(350);
  });

  it('setSidebarWidth clamps below the minimum', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.setSidebarWidth(50);
    expect(uiStore.sidebarWidth).toBe(180);
  });

  it('setSidebarWidth clamps above the maximum', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.setSidebarWidth(1000);
    expect(uiStore.sidebarWidth).toBe(480);
  });

  it('persists setSidebarWidth to localStorage', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.setSidebarWidth(320);
    expect(localStorage.getItem('sidebarWidth')).toBe('320');
  });

  it('loads a persisted sidebarWidth value on module init', async () => {
    localStorage.setItem('sidebarWidth', '400');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.sidebarWidth).toBe(400);
  });

  it('falls back to the default sidebarWidth for a corrupted persisted value', async () => {
    localStorage.setItem('sidebarWidth', 'not-a-number');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.sidebarWidth).toBe(288);
  });

  it('clamps a persisted sidebarWidth value that is out of range', async () => {
    localStorage.setItem('sidebarWidth', '900');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.sidebarWidth).toBe(480);
  });

  it('defaults tcaLastInstrumentKey to null when nothing is persisted', async () => {
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.tcaLastInstrumentKey).toBeNull();
  });

  it('setTcaLastInstrumentKey updates the value and persists it', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.setTcaLastInstrumentKey('tenorSax');
    expect(uiStore.tcaLastInstrumentKey).toBe('tenorSax');
    expect(localStorage.getItem('tcaLastInstrumentKey')).toBe('tenorSax');
  });

  it('loads a persisted tcaLastInstrumentKey value on module init', async () => {
    localStorage.setItem('tcaLastInstrumentKey', 'guitar');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.tcaLastInstrumentKey).toBe('guitar');
  });

  it('setTcaLastInstrumentKey(null) clears the persisted value', async () => {
    localStorage.setItem('tcaLastInstrumentKey', 'guitar');
    const { default: uiStore } = await import('./UiStore');
    uiStore.setTcaLastInstrumentKey(null);
    expect(uiStore.tcaLastInstrumentKey).toBeNull();
    expect(localStorage.getItem('tcaLastInstrumentKey')).toBeNull();
  });

  it('defaults tcaLastExerciseType to 1 when nothing is persisted', async () => {
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.tcaLastExerciseType).toBe(1);
  });

  it('setTcaLastExerciseType updates the value and persists it', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.setTcaLastExerciseType(3);
    expect(uiStore.tcaLastExerciseType).toBe(3);
    expect(localStorage.getItem('tcaLastExerciseType')).toBe('3');
  });

  it('loads a persisted tcaLastExerciseType value on module init', async () => {
    localStorage.setItem('tcaLastExerciseType', '2');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.tcaLastExerciseType).toBe(2);
  });

  it('falls back to the default tcaLastExerciseType for a corrupted persisted value', async () => {
    localStorage.setItem('tcaLastExerciseType', 'not-a-type');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.tcaLastExerciseType).toBe(1);
  });
});
