import type { TuneInput } from './tuneStore.ts';

function isValidVideo(video: unknown): video is NonNullable<TuneInput['video']> {
  if (typeof video !== 'object' || video === null) return false;
  const { url, start, end } = video as Record<string, unknown>;
  return typeof url === 'string' && typeof start === 'string' && typeof end === 'string';
}

export function parseTuneInput(body: unknown): TuneInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { title, data, video } = body as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (typeof data !== 'string') return null;
  if (video !== undefined && !isValidVideo(video)) return null;
  return { title, data, video: video as TuneInput['video'] };
}
