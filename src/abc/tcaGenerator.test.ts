import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { flattenTune } from './flatten';
import {
  qualitySequence,
  triadNotes,
  fitTriadToRange,
  triadDirection,
  generateTcaTriads,
  renderTcaAbc,
  type TcaTriad,
} from './tcaGenerator';

describe('qualitySequence', () => {
  it('exercise 1 is major for all 12 roots', () => {
    expect(qualitySequence(1)).toEqual(Array(12).fill('major'));
  });

  it('exercise 2 alternates major/minor, starting major', () => {
    expect(qualitySequence(2)).toEqual([
      'major', 'minor', 'major', 'minor', 'major', 'minor',
      'major', 'minor', 'major', 'minor', 'major', 'minor',
    ]);
  });

  it('exercise 3 round-robins major/minor/diminished/augmented across exactly 3 full cycles', () => {
    const seq = qualitySequence(3);
    expect(seq).toEqual([
      'major', 'minor', 'diminished', 'augmented',
      'major', 'minor', 'diminished', 'augmented',
      'major', 'minor', 'diminished', 'augmented',
    ]);
    expect(seq[3]).toBe('augmented');
    expect(seq[4]).toBe('major');
    expect(seq[11]).toBe('augmented');
  });
});

describe('triadNotes', () => {
  it('builds a major triad as root, +4, +7', () => {
    expect(triadNotes(60, 'major')).toEqual([60, 64, 67]);
  });

  it('builds a minor triad as root, +3, +7', () => {
    expect(triadNotes(60, 'minor')).toEqual([60, 63, 67]);
  });

  it('builds a diminished triad as root, +3, +6', () => {
    expect(triadNotes(60, 'diminished')).toEqual([60, 63, 66]);
  });

  it('builds an augmented triad as root, +4, +8', () => {
    expect(triadNotes(60, 'augmented')).toEqual([60, 64, 68]);
  });
});

describe('fitTriadToRange', () => {
  it('leaves an already-in-range triad untouched', () => {
    expect(fitTriadToRange([60, 64, 67], 55, 79)).toEqual([60, 64, 67]);
  });

  it('shifts a triad above the range down by one octave', () => {
    expect(fitTriadToRange([74, 78, 81], 60, 80)).toEqual([62, 66, 69]);
  });

  it('shifts a triad requiring multiple octaves down until it fits', () => {
    // 98-105 needs three octaves down (36 semitones) to land inside [60, 80].
    expect(fitTriadToRange([98, 102, 105], 60, 80)).toEqual([62, 66, 69]);
  });

  it('shifts a triad below the range up by one octave', () => {
    expect(fitTriadToRange([40, 44, 47], 50, 90)).toEqual([52, 56, 59]);
  });

  it('treats the range bounds as inclusive — a note exactly at low or high is not shifted', () => {
    expect(fitTriadToRange([60, 64, 67], 60, 67)).toEqual([60, 64, 67]);
  });

  it('throws when the triad itself spans more than the given range', () => {
    // Augmented triad spans 8 semitones; a 7-semitone-wide range can never hold it.
    expect(() => fitTriadToRange([60, 64, 68], 60, 67)).toThrow();
  });

  it('throws when no octave-aligned placement fits, even though the triad span fits within the window span', () => {
    // Triad spans 7 (65-72); window spans 16 (55-71) — wider than the triad — but
    // the only two octave placements are 65-72 (above 71) and 53-60 (below 55).
    expect(() => fitTriadToRange([65, 69, 72], 55, 71)).toThrow();
  });
});

describe('triadDirection', () => {
  it('classifies a strictly increasing run as ascending', () => {
    expect(triadDirection([60, 64, 67])).toBe('ascending');
  });

  it('classifies a strictly decreasing run as descending', () => {
    expect(triadDirection([67, 64, 60])).toBe('descending');
  });

  it('classifies an up-then-down run as mixed', () => {
    expect(triadDirection([64, 67, 60])).toBe('mixed');
  });

  it('classifies a down-then-up run as mixed', () => {
    expect(triadDirection([64, 60, 67])).toBe('mixed');
  });
});

describe('generateTcaTriads', () => {
  it('always returns 12 triads, each with every note inside [low, high], for every exercise type', () => {
    for (const exerciseType of [1, 2, 3] as const) {
      const triads = generateTcaTriads({ startRoot: 50, exerciseType, low: 45, high: 90 });
      expect(triads).toHaveLength(12);
      for (const triad of triads) {
        for (const note of triad.notes) {
          expect(note).toBeGreaterThanOrEqual(45);
          expect(note).toBeLessThanOrEqual(90);
        }
      }
    }
  });

  it('the quality sequence matches qualitySequence for the chosen exercise type', () => {
    const triads = generateTcaTriads({ startRoot: 50, exerciseType: 3, low: 45, high: 90 });
    expect(triads.map((t) => t.quality)).toEqual(qualitySequence(3));
  });

  it('matches a hand-computed golden case: alternating ascending/descending shapes, each connected to the last by exactly one semitone', () => {
    // startRoot 65, exercise 1 (major only), range [60, 84]. Wide enough that no
    // octave-skip is needed; every triad's first note is exactly the previous
    // triad's last note + 1 (the search prefers the ascending connector whenever
    // one is available), alternating 1-3-5 (ascending) and 5-3-1 (descending).
    const triads = generateTcaTriads({ startRoot: 65, exerciseType: 1, low: 60, high: 84 });
    const expected: [number, number, number][] = [
      [65, 69, 72], // 1-3-5
      [73, 70, 66], // 5-3-1, starts at 72+1
      [67, 71, 74], // 1-3-5, starts at 66+1
      [75, 72, 68], // 5-3-1, starts at 74+1
      [69, 73, 76], // 1-3-5, starts at 68+1
      [77, 74, 70], // 5-3-1, starts at 76+1
      [71, 75, 78], // 1-3-5, starts at 70+1
      [79, 76, 72], // 5-3-1, starts at 78+1
      [73, 77, 80], // 1-3-5, starts at 72+1
      [81, 78, 74], // 5-3-1, starts at 80+1
      [75, 79, 82], // 1-3-5, starts at 74+1
      [83, 80, 76], // 5-3-1, starts at 82+1
    ];
    expect(triads.map((t) => t.notes)).toEqual(expected);
    expect(triads.every((t) => t.quality === 'major')).toBe(true);
  });

  it('shifts the whole run down an octave when needed to keep every triad connected and in range', () => {
    // startRoot 72 lands too high in [60, 84] for a fully-connected run to stay
    // there for all 12 triads (verified empirically: this exact combination has
    // no valid solution without a shift), so the search backtracks all the way
    // to the very first triad and anchors the whole sequence an octave lower.
    const triads = generateTcaTriads({ startRoot: 72, exerciseType: 1, low: 60, high: 84 });
    expect(triads[0].notes).toEqual([60, 64, 67]); // triadNotes(72, 'major') shifted down one octave
    for (const triad of triads) {
      for (const note of triad.notes) {
        expect(note).toBeGreaterThanOrEqual(60);
        expect(note).toBeLessThanOrEqual(84);
      }
    }
  });

  it('throws a descriptive error when no fully-connected sequence fits the given range', () => {
    // [60, 80] is only 20 semitones wide — too narrow for every triad in a
    // 12-triad major run to both connect by a semitone and stay in range;
    // verified empirically (widening to [60, 84] succeeds).
    expect(() => generateTcaTriads({ startRoot: 65, exerciseType: 1, low: 60, high: 80 })).toThrow(/semitone/);
  });

  it('connects every consecutive triad by exactly one semitone (first note of one = last note of the previous, +-1)', () => {
    const cases: { startRoot: number; low: number; high: number }[] = [
      { startRoot: 65, low: 60, high: 84 },
      { startRoot: 50, low: 45, high: 90 },
      { startRoot: 44, low: 40, high: 76 },
      { startRoot: 68, low: 68, high: 100 }, // the tenor sax preset
      { startRoot: 40, low: 40, high: 83 }, // the guitar preset
    ];
    for (const exerciseType of [1, 2, 3] as const) {
      for (const { startRoot, low, high } of cases) {
        const triads = generateTcaTriads({ startRoot, exerciseType, low, high });
        for (let i = 1; i < triads.length; i++) {
          const diff = triads[i].notes[0] - triads[i - 1].notes[2];
          expect(Math.abs(diff)).toBe(1);
        }
      }
    }
  });

  it('never repeats the same note ordering or the same pure direction on two consecutive triads', () => {
    const cases: { startRoot: number; low: number; high: number }[] = [
      { startRoot: 65, low: 60, high: 84 },
      { startRoot: 50, low: 45, high: 90 },
      { startRoot: 44, low: 40, high: 76 },
    ];
    for (const exerciseType of [1, 2, 3] as const) {
      for (const { startRoot, low, high } of cases) {
        const triads = generateTcaTriads({ startRoot, exerciseType, low, high });
        for (let i = 1; i < triads.length; i++) {
          const prev = triads[i - 1].notes;
          const curr = triads[i].notes;

          // Same ordering would mean each note's rank (0=lowest, 1=mid, 2=highest)
          // among its own triad's three notes matches, position for position.
          const rankOf = (notes: readonly [number, number, number]) => {
            const sorted = [...notes].sort((a, b) => a - b);
            return notes.map((n) => sorted.indexOf(n));
          };
          expect(rankOf(curr)).not.toEqual(rankOf(prev));

          const prevDir = triadDirection(prev);
          const currDir = triadDirection(curr);
          if (prevDir !== 'mixed') expect(currDir).not.toBe(prevDir);
        }
      }
    }
  });
});

describe('renderTcaAbc', () => {
  const sampleTriads: TcaTriad[] = generateTcaTriads({ startRoot: 60, exerciseType: 3, low: 55, high: 84 });

  it('includes the expected headers and no V: line', () => {
    const abc = renderTcaAbc(sampleTriads, 'TCA Exercise 3 — Guitar');
    expect(abc).toContain('X:1');
    expect(abc).toContain('T:TCA Exercise 3 — Guitar');
    expect(abc).toContain('M:4/4');
    expect(abc).toContain('L:1/8');
    expect(abc).toContain('K:C');
    expect(abc).not.toMatch(/^V:/m);
  });

  it('marks each triad as an explicit (3 triplet', () => {
    const abc = renderTcaAbc(sampleTriads, 'TCA triplet test');
    expect(abc.match(/\(3/g)).toHaveLength(12);
  });

  it('round-trips through the app\'s real ABC parser into exactly 36 note events with no rests, correctly grouped into 12 triplets', () => {
    const abc = renderTcaAbc(sampleTriads, 'TCA round-trip test');
    const tune = parseTune(abc);
    const flattened = flattenTune(tune);
    const events = flattened.lines.flatMap((line) => line.events);
    expect(events).toHaveLength(36);
    expect(events.every((e) => e.kind === 'note')).toBe(true);

    // Every 3rd event (0, 3, 6, ...) starts a triplet; the one after it ends one.
    for (let i = 0; i < events.length; i += 3) {
      expect(events[i].tripletStart).toBeTruthy();
      expect(events[i + 1].tripletStart).toBeUndefined();
      expect(events[i + 2].tripletEnd).toBe(true);
    }
  });
});
