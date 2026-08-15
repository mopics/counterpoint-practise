import type { FolderEditInput, FolderInput, TuneEditInput, TuneInput } from './libraryStore.ts';

function isValidVideo(video: unknown): video is NonNullable<TuneInput['video']> {
  if (typeof video !== 'object' || video === null) return false;
  const { url, start, end } = video as Record<string, unknown>;
  return typeof url === 'string' && typeof start === 'string' && typeof end === 'string';
}

function parseParentId(value: unknown): { ok: true; parentId: string | null } | { ok: false } {
  if (value === null) return { ok: true, parentId: null };
  if (typeof value === 'string' && value.trim() !== '') return { ok: true, parentId: value };
  return { ok: false };
}

export function parseFolderInput(body: unknown): FolderInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { parentId, title } = body as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') return null;
  const parsedParent = parseParentId(parentId);
  if (!parsedParent.ok) return null;
  return { parentId: parsedParent.parentId, title };
}

export function parseFolderEditInput(body: unknown): FolderEditInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { title } = body as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') return null;
  return { title };
}

export function parseTuneInput(body: unknown): TuneInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { parentId, title, data, video } = body as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (typeof data !== 'string') return null;
  const parsedParent = parseParentId(parentId);
  if (!parsedParent.ok) return null;
  if (video !== undefined && !isValidVideo(video)) return null;
  return { parentId: parsedParent.parentId, title, data, video: video as TuneInput['video'] };
}

export function parseTuneEditInput(body: unknown): TuneEditInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { title, data, video } = body as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (typeof data !== 'string') return null;
  if (video !== undefined && !isValidVideo(video)) return null;
  return { title, data, video: video as TuneEditInput['video'] };
}
