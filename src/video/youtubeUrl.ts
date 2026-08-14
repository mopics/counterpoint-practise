const ID_PATTERN = '[A-Za-z0-9_-]{11}';

/**
 * Extracts an 11-character YouTube video ID from a watch/short/embed URL, or
 * accepts a bare ID typed directly. Returns null for anything unparseable.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (new RegExp(`^${ID_PATTERN}$`).test(trimmed)) return trimmed;

  const watchMatch = trimmed.match(new RegExp(`[?&]v=(${ID_PATTERN})`));
  if (watchMatch) return watchMatch[1];

  const shortMatch = trimmed.match(new RegExp(`youtu\\.be/(${ID_PATTERN})`));
  if (shortMatch) return shortMatch[1];

  const embedMatch = trimmed.match(new RegExp(`youtube\\.com/embed/(${ID_PATTERN})`));
  if (embedMatch) return embedMatch[1];

  return null;
}
