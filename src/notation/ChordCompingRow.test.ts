import { describe, it, expect } from 'vitest';
import { parseTune } from '../abc/parseTune';
import { flattenTune } from '../abc/flatten';
import { extractCompingVoice } from '../abc/chordComping';
import { layoutLine } from './layout';
import { interpolateX } from './ChordCompingRow';

/**
 * The comping strip must sit under the matching melody beat. It used to walk
 * its own `eventWidth` x-axis, which drifts from the melody's real layout —
 * layoutLine inserts BAR_PAD at each bar line and clamps short events to
 * MIN_EVENT_WIDTH, so by bar 2 the strip was already ~14px off.
 */
describe('interpolateX (comping strip x alignment)', () => {
  const raw = 'X:1\nM:4/4\nL:1/4\nK:C\nV:1\nCDEF|GABc|\nV:comp\nC4|C2C2|\n';
  const tune = parseTune(raw);
  const flattened = flattenTune(tune);
  const melodyLayout = layoutLine(flattened.lines[0], 0, 32);
  const comping = extractCompingVoice(tune, raw)!;

  it('lands each comping event on the x of the melody event at the same beat', () => {
    const melodyX = melodyLayout.events.map((e) => e.x);
    // Whole note on beat 1 of bar 1, then two half notes on beats 1 and 3 of
    // bar 2 -> melody events 0 (C), 4 (G) and 6 (B).
    let localTime = 0;
    const xs: number[] = [];
    for (const event of comping.lines[0].events) {
      xs.push(interpolateX(localTime, melodyLayout.events));
      localTime += event.duration;
    }
    expect(xs).toEqual([melodyX[0], melodyX[4], melodyX[6]]);
  });

  it('interpolates within a melody event for a comping onset that falls mid-note', () => {
    const first = melodyLayout.events[0];
    // Half-way through the melody's first quarter note (duration 1/4).
    expect(interpolateX(0.125, melodyLayout.events)).toBeCloseTo(first.x + first.width / 2, 6);
  });

  it('clamps past the end of the line to the last melody event rather than running away', () => {
    const last = melodyLayout.events[melodyLayout.events.length - 1];
    expect(interpolateX(99, melodyLayout.events)).toBe(last.x + last.width);
  });

  it('returns 0 when the line has no melody events to align against', () => {
    expect(interpolateX(0.5, [])).toBe(0);
  });
});
