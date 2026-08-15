export interface VideoRef {
  url: string;
  start: string;
  end: string;
}

export interface FolderRecord {
  id: string;
  type: 'folder';
  parentId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface TuneRecord {
  id: string;
  type: 'tune';
  parentId: string | null;
  title: string;
  data: string;
  video?: VideoRef;
  createdAt: string;
  updatedAt: string;
}

export type LibraryNode = FolderRecord | TuneRecord;

export interface LibraryListing {
  nodes: LibraryNode[];
}

export interface CreateFolderInput {
  parentId: string | null;
  title: string;
}

export interface RenameFolderInput {
  title: string;
}

export interface CreateTuneInput {
  parentId: string | null;
  title: string;
  data: string;
  video?: VideoRef;
}

export interface SaveTuneInput {
  title: string;
  data: string;
  video?: VideoRef;
}

const BASE_URL = '/api/library';

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
 * missing/unreachable server should never crash the app. Callers that need
 * to tell the user an action failed track that themselves (see
 * EditorStore.save), since this layer only reports success/failure.
 */
export async function fetchLibrary(): Promise<LibraryListing | null> {
  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) return null;
    return await parseJson<LibraryListing>(response);
  } catch {
    return null;
  }
}

export async function createFolder(input: CreateFolderInput): Promise<FolderRecord | null> {
  try {
    const response = await fetch(`${BASE_URL}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    return await parseJson<FolderRecord>(response);
  } catch {
    return null;
  }
}

export async function renameFolder(id: string, input: RenameFolderInput): Promise<FolderRecord | null> {
  try {
    const response = await fetch(`${BASE_URL}/folders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    return await parseJson<FolderRecord>(response);
  } catch {
    return null;
  }
}

export async function deleteFolder(id: string): Promise<'deleted' | 'not-empty' | 'error'> {
  try {
    const response = await fetch(`${BASE_URL}/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (response.status === 204) return 'deleted';
    if (response.status === 409) return 'not-empty';
    return 'error';
  } catch {
    return 'error';
  }
}

export async function createTune(input: CreateTuneInput): Promise<TuneRecord | null> {
  try {
    const response = await fetch(`${BASE_URL}/tunes`, {
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

export async function saveTune(id: string, input: SaveTuneInput): Promise<TuneRecord | null> {
  try {
    const response = await fetch(`${BASE_URL}/tunes/${encodeURIComponent(id)}`, {
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

export async function deleteTune(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/tunes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}
