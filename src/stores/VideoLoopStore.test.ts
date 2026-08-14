import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AbcData } from '../content';

const ENTRY: AbcData = { id: 'tune-1', title: 'Tune One' };
const OTHER_ENTRY: AbcData = { id: 'tune-2', title: 'Tune Two' };

describe('VideoLoopStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Module-level singleton — reset modules so each test's dynamic
    // import() re-runs the constructor against cleared storage, matching
    // UiStore.test.ts's pattern.
    vi.resetModules();
  });

  it('returns a default empty entry for a tune with nothing saved', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    expect(videoLoopStore.entryFor(ENTRY)).toEqual({ url: '', loopStart: null, loopEnd: null, loopEnabled: false });
  });

  it('setUrl updates only the url field', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setUrl(ENTRY, 'https://youtu.be/abc12345678');
    expect(videoLoopStore.entryFor(ENTRY)).toEqual({
      url: 'https://youtu.be/abc12345678',
      loopStart: null,
      loopEnd: null,
      loopEnabled: false,
    });
  });

  it('keeps entries for different tunes independent', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setUrl(ENTRY, 'https://youtu.be/abc12345678');
    expect(videoLoopStore.entryFor(OTHER_ENTRY).url).toBe('');
  });

  it('setLoopStart and setLoopEnd update independently', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setLoopStart(ENTRY, 10);
    videoLoopStore.setLoopEnd(ENTRY, 20);
    expect(videoLoopStore.entryFor(ENTRY)).toMatchObject({ loopStart: 10, loopEnd: 20 });
  });

  it('toggleLoopEnabled is a no-op when loopStart is unset', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setLoopEnd(ENTRY, 20);
    videoLoopStore.toggleLoopEnabled(ENTRY);
    expect(videoLoopStore.entryFor(ENTRY).loopEnabled).toBe(false);
  });

  it('toggleLoopEnabled is a no-op when loopEnd is unset', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setLoopStart(ENTRY, 10);
    videoLoopStore.toggleLoopEnabled(ENTRY);
    expect(videoLoopStore.entryFor(ENTRY).loopEnabled).toBe(false);
  });

  it('toggleLoopEnabled flips the flag once both loop times are set', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setLoopStart(ENTRY, 10);
    videoLoopStore.setLoopEnd(ENTRY, 20);
    videoLoopStore.toggleLoopEnabled(ENTRY);
    expect(videoLoopStore.entryFor(ENTRY).loopEnabled).toBe(true);
    videoLoopStore.toggleLoopEnabled(ENTRY);
    expect(videoLoopStore.entryFor(ENTRY).loopEnabled).toBe(false);
  });

  it('persists entries to localStorage keyed by entry.key ?? entry.id', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setUrl(ENTRY, 'https://youtu.be/abc12345678');
    const raw = localStorage.getItem('videoLoopEntries');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed['tune-1'].url).toBe('https://youtu.be/abc12345678');
  });

  it('loads persisted entries on module init', async () => {
    localStorage.setItem(
      'videoLoopEntries',
      JSON.stringify({ 'tune-1': { url: 'https://youtu.be/xyz', loopStart: 1, loopEnd: 2, loopEnabled: true } }),
    );
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    expect(videoLoopStore.entryFor(ENTRY)).toEqual({ url: 'https://youtu.be/xyz', loopStart: 1, loopEnd: 2, loopEnabled: true });
  });

  it('uses entry.key over entry.id when both are present', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    const keyedEntry: AbcData = { id: 'internal-id', key: 'display-key', title: 'Keyed Tune' };
    videoLoopStore.setUrl(keyedEntry, 'https://youtu.be/abc12345678');
    const raw = JSON.parse(localStorage.getItem('videoLoopEntries')!);
    expect(raw['display-key']).toBeDefined();
    expect(raw['internal-id']).toBeUndefined();
  });

  it('falls back to the abc-object video field when nothing is saved yet', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    const entryWithVideo: AbcData = {
      id: 'tune-with-video',
      title: 'Tune With Video',
      video: { url: 'https://youtu.be/abc12345678', start: '0:14', end: '0:24' },
    };
    expect(videoLoopStore.entryFor(entryWithVideo)).toEqual({
      url: 'https://youtu.be/abc12345678',
      loopStart: 14,
      loopEnd: 24,
      loopEnabled: false,
    });
  });

  it('does not persist the abc-object video fallback to localStorage', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    const entryWithVideo: AbcData = {
      id: 'tune-with-video',
      title: 'Tune With Video',
      video: { url: 'https://youtu.be/abc12345678', start: '0:14', end: '0:24' },
    };
    videoLoopStore.entryFor(entryWithVideo);
    expect(localStorage.getItem('videoLoopEntries')).toBeNull();
  });

  it('persists an edit to one field, keeping the abc-object video field as the starting point for the rest', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    const entryWithVideo: AbcData = {
      id: 'tune-with-video',
      title: 'Tune With Video',
      video: { url: 'https://youtu.be/abc12345678', start: '0:14', end: '0:24' },
    };
    videoLoopStore.setUrl(entryWithVideo, 'https://youtu.be/differentVideo1');
    expect(videoLoopStore.entryFor(entryWithVideo)).toEqual({
      url: 'https://youtu.be/differentVideo1',
      loopStart: 14,
      loopEnd: 24,
      loopEnabled: false,
    });
  });

  it('a persisted loop-time edit overrides the abc-object video field for that field specifically', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    const entryWithVideo: AbcData = {
      id: 'tune-with-video',
      title: 'Tune With Video',
      video: { url: 'https://youtu.be/abc12345678', start: '0:14', end: '0:24' },
    };
    videoLoopStore.setLoopStart(entryWithVideo, 30);
    expect(videoLoopStore.entryFor(entryWithVideo)).toEqual({
      url: 'https://youtu.be/abc12345678',
      loopStart: 30,
      loopEnd: 24,
      loopEnabled: false,
    });
  });
});
