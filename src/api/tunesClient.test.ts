import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFolder, createTune, deleteFolder, deleteTune, fetchLibrary, renameFolder, saveTune } from './tunesClient';

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

  describe('fetchLibrary', () => {
    it('returns the parsed listing on success', async () => {
      const listing = { nodes: [] };
      mockFetchOnce(() => jsonResponse(listing));
      await expect(fetchLibrary()).resolves.toEqual(listing);
    });

    it('returns null when fetch rejects', async () => {
      mockFetchOnce(() => Promise.reject(new Error('network down')));
      await expect(fetchLibrary()).resolves.toBeNull();
    });

    it('returns null on a non-2xx response', async () => {
      mockFetchOnce(() => new Response('', { status: 500 }));
      await expect(fetchLibrary()).resolves.toBeNull();
    });
  });

  describe('createFolder / renameFolder / deleteFolder', () => {
    it('createFolder returns the created record', async () => {
      const record = { id: 'tunes-abcd1234', type: 'folder', parentId: null, title: 'Tunes', createdAt: 'now', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record, 201));
      await expect(createFolder({ parentId: null, title: 'Tunes' })).resolves.toEqual(record);
    });

    it('createFolder returns null when unreachable', async () => {
      mockFetchOnce(() => Promise.reject(new Error('offline')));
      await expect(createFolder({ parentId: null, title: 'Tunes' })).resolves.toBeNull();
    });

    it('renameFolder returns the updated record', async () => {
      const record = { id: 'tunes-abcd1234', type: 'folder', parentId: null, title: 'Jazz', createdAt: 'now', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record));
      await expect(renameFolder('tunes-abcd1234', { title: 'Jazz' })).resolves.toEqual(record);
    });

    it('deleteFolder returns "deleted" on 204', async () => {
      mockFetchOnce(() => new Response(null, { status: 204 }));
      await expect(deleteFolder('tunes-abcd1234')).resolves.toBe('deleted');
    });

    it('deleteFolder returns "not-empty" on 409', async () => {
      mockFetchOnce(() => new Response('', { status: 409 }));
      await expect(deleteFolder('tunes-abcd1234')).resolves.toBe('not-empty');
    });

    it('deleteFolder returns "error" when unreachable or on any other non-2xx status', async () => {
      mockFetchOnce(() => Promise.reject(new Error('offline')));
      await expect(deleteFolder('tunes-abcd1234')).resolves.toBe('error');
      mockFetchOnce(() => new Response('', { status: 404 }));
      await expect(deleteFolder('tunes-abcd1234')).resolves.toBe('error');
    });
  });

  describe('createTune / saveTune / deleteTune', () => {
    it('createTune returns the created record', async () => {
      const record = { id: 'x-1234abcd', type: 'tune', parentId: null, title: 'X', data: '', createdAt: 'now', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record, 201));
      await expect(createTune({ parentId: null, title: 'X', data: '' })).resolves.toEqual(record);
    });

    it('saveTune returns the updated record on success, null on 404', async () => {
      const record = { id: 'x-1234abcd', type: 'tune', parentId: null, title: 'X', data: 'edited', createdAt: 'now', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record));
      await expect(saveTune('x-1234abcd', { title: 'X', data: 'edited' })).resolves.toEqual(record);

      mockFetchOnce(() => new Response('', { status: 404 }));
      await expect(saveTune('unknown', { title: 'X', data: '' })).resolves.toBeNull();
    });

    it('deleteTune returns true on 204 and false when unreachable', async () => {
      mockFetchOnce(() => new Response(null, { status: 204 }));
      await expect(deleteTune('x-1234abcd')).resolves.toBe(true);

      mockFetchOnce(() => Promise.reject(new Error('offline')));
      await expect(deleteTune('x-1234abcd')).resolves.toBe(false);
    });
  });
});
