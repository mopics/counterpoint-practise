/** Formats a seconds count as "m:ss" (minutes unpadded, seconds zero-padded). */
export function formatSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Parses "mm:ss" or a bare number of seconds. Returns null if unparseable. */
export function parseTimeInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const mmss = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (mmss) {
    const minutes = Number(mmss[1]);
    const seconds = Number(mmss[2]);
    return minutes * 60 + seconds;
  }

  const bare = trimmed.match(/^\d+(\.\d+)?$/);
  if (bare) return Number(trimmed);

  return null;
}
