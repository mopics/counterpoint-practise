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
});
