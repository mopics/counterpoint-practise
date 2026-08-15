import type { AbcData } from '../content';

export interface OverrideRecord {
  key: string;
  title: string;
  data: string;
  video?: AbcData['video'];
  updatedAt: string;
}

export interface TuneRecord {
  key: string;
  id: string;
  title: string;
  data: string;
  video?: AbcData['video'];
  createdAt: string;
  updatedAt: string;
}

export interface TuneInput {
  title: string;
  data: string;
  video?: AbcData['video'];
}

export interface TunesListing {
  overrides: OverrideRecord[];
  tunes: TuneRecord[];
}

const BASE_URL = '/api/tunes';

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Every export here swallows network/parse failures and returns a sentinel
 * instead of throwing, mirroring printHandoff.ts's defensive style — a
 * missing/unreachable server should degrade to static content, never crash
 * the app. Callers that need to tell the user a save failed track that
 * themselves (see EditorStore.save), since this layer only reports success/failure.
 */
export async function fetchTunes(): Promise<TunesListing | null> {
  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) return null;
    return await parseJson<TunesListing>(response);
  } catch {
    return null;
  }
}

export async function createTune(input: TuneInput): Promise<TuneRecord | null> {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    return await parseJson<TuneRecord>(response);
  } catch {
    return null;
  }
}

export async function saveOverride(key: string, input: TuneInput): Promise<OverrideRecord | null> {
  try {
    const response = await fetch(`${BASE_URL}/overrides/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    return await parseJson<OverrideRecord>(response);
  } catch {
    return null;
  }
}

export async function deleteOverride(key: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/overrides/${encodeURIComponent(key)}`, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function saveTune(key: string, input: TuneInput): Promise<TuneRecord | null> {
  try {
    const response = await fetch(`${BASE_URL}/tunes/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    return await parseJson<TuneRecord>(response);
  } catch {
    return null;
  }
}

export async function deleteTune(key: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/tunes/${encodeURIComponent(key)}`, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}
