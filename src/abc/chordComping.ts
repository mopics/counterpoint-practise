import type * as abcjs from 'abcjs';

export interface CompingEvent {
  kind: 'note' | 'rest';
  startChar: number;
  endChar: number;
  duration: number;
}

export interface CompingLine {
  lineIndex: number;
  events: CompingEvent[];
}

export interface CompingVoice {
  lines: CompingLine[];
}

interface RawCompingItem {
  el_type: string;
  startChar: number;
  endChar: number;
  duration: number;
  rest?: { type: string };
}

/**
 * Extracts the rhythm-only comping voice (V:2) from a parsed tune, ignoring
 * its pitch entirely (V:2 notes carry a placeholder pitch the author picks
 * for typing convenience — only kind/duration/char-range matter here).
 * Mirrors flatten.ts's line-skip logic (subtitle lines skipped, lineIndex
 * incremented only for staff-bearing lines) so lineIndex numbering stays in
 * sync with FlattenedTune.lines, which callers rely on to correlate the two.
 * Returns null when the tune has no second voice — abcjs puts V:2 on its own
 * staff (tuneLine.staff[1]), not as a second voice of staff[0] (verified
 * empirically; see this plan's Global Constraints).
 */
export function extractCompingVoice(tune: abcjs.TuneObject): CompingVoice | null {
  const hasSecondVoice = tune.lines.some((l) => !l.subtitle && (l.staff?.length ?? 0) > 1);
  if (!hasSecondVoice) return null;

  const lines: CompingLine[] = [];
  let lineIndex = 0;
  for (const tuneLine of tune.lines) {
    if (tuneLine.subtitle) continue;
    if (!tuneLine.staff?.length) continue;

    const events: CompingEvent[] = [];
    const voice = tuneLine.staff[1]?.voices?.[0];
    if (voice) {
      for (const item of voice as unknown as RawCompingItem[]) {
        if (item.el_type !== 'note') continue;
        events.push({
          kind: item.rest ? 'rest' : 'note',
          startChar: item.startChar,
          endChar: item.endChar,
          duration: item.duration,
        });
      }
    }
    lines.push({ lineIndex, events });
    lineIndex++;
  }
  return { lines };
}
