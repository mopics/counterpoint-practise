/**
 * True when playback has reached the loop's end and should be seeked back
 * to its start. A backwards or zero-length region (loopEnd <= loopStart) is
 * inert rather than an error state — it simply never fires.
 */
export function shouldSeekToLoopStart(
  currentTime: number,
  loopEnabled: boolean,
  loopStart: number | null,
  loopEnd: number | null,
): boolean {
  if (!loopEnabled || loopStart === null || loopEnd === null) return false;
  if (loopEnd <= loopStart) return false;
  return currentTime >= loopEnd;
}
