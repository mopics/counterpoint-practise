import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTune, deleteOverride, deleteTune, fetchTunes, saveOverride, saveTune } from './tunesClient';

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => impl());
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('tunesClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchTunes', () => {
    it('returns the parsed listing on success', async () => {
      const listing = { overrides: [], tunes: [] };
      mockFetchOnce(() => jsonResponse(listing));
      await expect(fetchTunes()).resolves.toEqual(listing);
    });

    it('returns null when fetch rejects (server unreachable)', async () => {
      mockFetchOnce(() => Promise.reject(new Error('network down')));
      await expect(fetchTunes()).resolves.toBeNull();
    });

    it('returns null on a non-2xx response', async () => {
      mockFetchOnce(() => new Response('', { status: 500 }));
      await expect(fetchTunes()).resolves.toBeNull();
    });

    it('returns null when the response body is not valid JSON', async () => {
      mockFetchOnce(() => new Response('not json', { status: 200 }));
      await expect(fetchTunes()).resolves.toBeNull();
    });
  });

  describe('createTune', () => {
    it('returns the created record on success', async () => {
      const record = { key: 'lib/my-tunes/x', id: 'x', title: 'X', data: '', createdAt: 'now', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record, 201));
      await expect(createTune({ title: 'X', data: '' })).resolves.toEqual(record);
    });

    it('returns null when the request fails', async () => {
      mockFetchOnce(() => Promise.reject(new Error('offline')));
      await expect(createTune({ title: 'X', data: '' })).resolves.toBeNull();
    });

    it('returns null on a validation error response', async () => {
      mockFetchOnce(() => new Response('', { status: 400 }));
      await expect(createTune({ title: '', data: '' })).resolves.toBeNull();
    });
  });

  describe('saveOverride / deleteOverride', () => {
    it('saveOverride returns the record on success', async () => {
      const record = { key: 'lib/tunes/cherokee', title: 'Cherokee', data: '', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record));
      await expect(saveOverride('lib/tunes/cherokee', { title: 'Cherokee', data: '' })).resolves.toEqual(record);
    });

    it('saveOverride returns null when unreachable', async () => {
      mockFetchOnce(() => Promise.reject(new Error('offline')));
      await expect(saveOverride('lib/tunes/cherokee', { title: 'Cherokee', data: '' })).resolves.toBeNull();
    });

    it('deleteOverride returns true on 204', async () => {
      mockFetchOnce(() => new Response(null, { status: 204 }));
      await expect(deleteOverride('lib/tunes/cherokee')).resolves.toBe(true);
    });

    it('deleteOverride returns false when unreachable', async () => {
      mockFetchOnce(() => Promise.reject(new Error('offline')));
      await expect(deleteOverride('lib/tunes/cherokee')).resolves.toBe(false);
    });
  });

  describe('saveTune / deleteTune', () => {
    it('saveTune returns the record on success', async () => {
      const record = { key: 'lib/my-tunes/x', id: 'x', title: 'X', data: '', createdAt: 'now', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record));
      await expect(saveTune('lib/my-tunes/x', { title: 'X', data: '' })).resolves.toEqual(record);
    });

    it('saveTune returns null on 404', async () => {
      mockFetchOnce(() => new Response('', { status: 404 }));
      await expect(saveTune('lib/my-tunes/unknown', { title: 'X', data: '' })).resolves.toBeNull();
    });

    it('deleteTune returns true on 204 and false when unreachable', async () => {
      mockFetchOnce(() => new Response(null, { status: 204 }));
      await expect(deleteTune('lib/my-tunes/x')).resolves.toBe(true);

      mockFetchOnce(() => Promise.reject(new Error('offline')));
      await expect(deleteTune('lib/my-tunes/x')).resolves.toBe(false);
    });
  });
});
