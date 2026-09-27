import { midiToAbcNote } from './chordComping';

export type TriadQuality = 'major' | 'minor' | 'diminished' | 'augmented';
export type ExerciseType = 1 | 2 | 3;

const TRIAD_INTERVALS: Record<TriadQuality, readonly [number, number, number]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
};

export interface TcaTriad {
  quality: TriadQuality;
  /**
   * The actual play order for this triad — one of the 6 root/3rd/5th
   * orderings (see PREFERRED_SHAPES / FALLBACK_SHAPES), chosen so it
   * connects to the previous triad by exactly one semitone, after
   * octave-skip.
   */
  notes: [number, number, number];
}

/**
 * The 12-quality sequence as the root climbs one semitone at a time, one
 * entry per exercise type: exercise 1 stays major throughout, exercise 2
 * alternates major/minor, exercise 3 round-robins all four qualities (12/4 =
 * exactly 3 full cycles).
 */
export function qualitySequence(exerciseType: ExerciseType): TriadQuality[] {
  const cycles: Record<ExerciseType, TriadQuality[]> = {
    1: ['major'],
    2: ['major', 'minor'],
    3: ['major', 'minor', 'diminished', 'augmented'],
  };
  const cycle = cycles[exerciseType];
  return Array.from({ length: 12 }, (_, i) => cycle[i % cycle.length]);
}

/** Root-3rd-5th, ascending, before any octave-skip. */
export function triadNotes(root: number, quality: TriadQuality): [number, number, number] {
  const [r, third, fifth] = TRIAD_INTERVALS[quality];
  return [root + r, root + third, root + fifth];
}

/**
 * The inclusive range of whole-octave shift amounts `k` (in units of an
 * octave, i.e. the actual semitone shift is `12k`) that keep every one of
 * `notes` within [low, high]: `k` must satisfy both `min + 12k >= low` and
 * `max + 12k <= high`. Empty (`kMin > kMax`) means no octave placement of
 * this triad fits the range at all.
 */
function octaveShiftRange(notes: readonly [number, number, number], low: number, high: number): { kMin: number; kMax: number } {
  const min = Math.min(...notes);
  const max = Math.max(...notes);
  return { kMin: Math.ceil((low - min) / 12), kMax: Math.floor((high - max) / 12) };
}

/**
 * Shifts all three notes of a triad together by whole octaves (a single
 * integer multiple of 12, never a mix) until every note is within [low,
 * high] (inclusive), preferring the smallest possible shift (zero if the
 * triad already fits).
 *
 * A naive "shift down while too high, then shift up while too low" can
 * oscillate between an out-of-range-above and an out-of-range-below state
 * without ever landing in range — e.g. notes spanning 65-72 in [55, 71]:
 * shifting down once gives 53-60 (below 55), and shifting that back up
 * returns to 65-72 (above 71) — even though the triad's own span (7) is
 * well within the window's span (16). So instead this solves directly for
 * the valid range of shift amounts via octaveShiftRange; if it's empty, no
 * octave placement fits and this throws rather than returning an
 * out-of-range result. When it's non-empty, the shift is clamped to 0 so an
 * already-fitting triad is never needlessly shifted.
 */
export function fitTriadToRange(
  notes: readonly [number, number, number],
  low: number,
  high: number,
): [number, number, number] {
  const { kMin, kMax } = octaveShiftRange(notes, low, high);
  if (kMin > kMax) {
    throw new Error(`No octave placement of this triad fits within the given range (${low}-${high}) — widen the range.`);
  }
  const k = Math.max(kMin, Math.min(kMax, 0));
  return notes.map((n) => n + 12 * k) as [number, number, number];
}

/**
 * The three preferred triad orderings, as index permutations into a
 * [root, 3rd, 5th] triple: root-3rd-5th, 3rd-5th-root, 5th-3rd-root. Cycling
 * through these in order is the *preferred* pattern (see PREFERRED_SHAPES'
 * use in generateTcaTriads) — but which one is actually usable for a given
 * triad also depends on the harder constraint below (every triad must
 * connect to the previous one by a semitone), so a fallback set covering the
 * other 3 permutations exists too (FALLBACK_SHAPES) for when none of the
 * preferred 3 can satisfy it.
 */
const PREFERRED_SHAPES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], // 1-3-5
  [1, 2, 0], // 3-5-1
  [2, 1, 0], // 5-3-1
];

/** The remaining 3 permutations of [root, 3rd, 5th], used only when no preferred shape can connect to the previous triad by a semitone. */
const FALLBACK_SHAPES: readonly (readonly [number, number, number])[] = [
  [0, 2, 1], // 1-5-3
  [1, 0, 2], // 3-1-5
  [2, 0, 1], // 5-1-3
];

const ALL_SHAPES = [...PREFERRED_SHAPES, ...FALLBACK_SHAPES];

export type TriadDirection = 'ascending' | 'descending' | 'mixed';

/** Classifies a played 3-note run by its overall melodic contour. */
export function triadDirection([a, b, c]: readonly [number, number, number]): TriadDirection {
  if (a < b && b < c) return 'ascending';
  if (a > b && b > c) return 'descending';
  return 'mixed';
}

interface ShapedPlacement {
  shapeIndex: number;
  notes: [number, number, number];
}

/** Every (shape, octave-shift) placement of the first triad that fits within [low, high] — no predecessor to connect to yet. */
function candidatesForFirstTriad(
  rawNotes: readonly [number, number, number],
  low: number,
  high: number,
): ShapedPlacement[] {
  const { kMin, kMax } = octaveShiftRange(rawNotes, low, high);
  const candidates: ShapedPlacement[] = [];
  for (let k = kMin; k <= kMax; k++) {
    const shifted = rawNotes.map((n) => n + 12 * k) as [number, number, number];
    ALL_SHAPES.forEach((shape, shapeIndex) => {
      candidates.push({ shapeIndex, notes: shape.map((idx) => shifted[idx]) as [number, number, number] });
    });
  }
  return candidates;
}

/**
 * Every (shape, octave-shift) placement of a triad that both connects to
 * `prevLast` (the previous triad's last sounded note) by exactly one
 * semitone and fits within [low, high].
 *
 * Since shifting a triad by an octave only ever moves all three of its
 * notes by a multiple of 12, a given starting degree (root, 3rd, or 5th)
 * can hit an exact target pitch only if that degree's pitch *class* already
 * matches the target's — so for each of the 6 possible orderings and each
 * of the two one-semitone targets (ascending preferred, descending as a
 * fallback), this checks whether the resulting whole-octave shift both
 * hits the target exactly and keeps every note within range. A triad
 * ending on a major/minor triad's plain 5th, for instance, has no
 * semitone-away note at all among a following diminished triad's
 * root/3rd/5th — so which shapes actually work depends on the specific
 * quality pair, which is why this is computed per step rather than
 * following a fixed pattern.
 */
function candidatesForNextTriad(
  rawNotes: readonly [number, number, number],
  prevLast: number,
  low: number,
  high: number,
): (ShapedPlacement & { targetRank: number })[] {
  const candidates: (ShapedPlacement & { targetRank: number })[] = [];
  [prevLast + 1, prevLast - 1].forEach((target, targetRank) => {
    ALL_SHAPES.forEach((shape, shapeIndex) => {
      const startDegreeValue = rawNotes[shape[0]];
      const delta = target - startDegreeValue;
      if (delta % 12 !== 0) return;
      const k = delta / 12;
      const shifted = rawNotes.map((n) => n + 12 * k) as [number, number, number];
      if (shifted.some((n) => n < low || n > high)) return;
      const notes = shape.map((idx) => shifted[idx]) as [number, number, number];
      candidates.push({ shapeIndex, notes, targetRank });
    });
  });
  return candidates;
}

/**
 * Orders candidates by preference: (1) the ascending (+1) semitone target
 * over the descending (-1) one where applicable — the exercise is
 * fundamentally a climb; (2) not repeating the previous triad's shape; (3)
 * not repeating the previous triad's pure direction (ascending/descending;
 * mixed is exempt); (4) using the exact next shape in the preferred
 * rotation; (5) using any preferred shape over a fallback one.
 */
function rankCandidates<T extends ShapedPlacement & { targetRank?: number }>(
  candidates: T[],
  preferredShapeIndex: number,
  prevShapeIndex: number,
  prevDirection: TriadDirection,
): T[] {
  const scoreOf = (c: T): number[] => [
    c.targetRank ?? 0,
    c.shapeIndex === prevShapeIndex ? 1 : 0,
    prevDirection !== 'mixed' && triadDirection(c.notes) === prevDirection ? 1 : 0,
    c.shapeIndex === preferredShapeIndex ? 0 : 1,
    c.shapeIndex < PREFERRED_SHAPES.length ? 0 : 1,
  ];
  return [...candidates].sort((a, b) => {
    const [sa, sb] = [scoreOf(a), scoreOf(b)];
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
    return 0;
  });
}

export interface GenerateTcaOptions {
  /** MIDI root of triad #1, before octave-skip. */
  startRoot: number;
  exerciseType: ExerciseType;
  low: number;
  high: number;
}

/**
 * The full 12-triad chromatic-climb sequence: octave-skip, inversion
 * cycling, and semitone-to-semitone connection between every consecutive
 * pair of triads, all satisfied together.
 *
 * A purely greedy, one-triad-at-a-time choice isn't enough: picking a
 * locally-fine placement for one triad can still leave *no* valid
 * continuation for a later triad (e.g. ending a triad exactly on the
 * range's high boundary leaves no room for an ascending semitone next, and
 * no descending one either if no degree of the next triad happens to share
 * that pitch class) — a dead end only discoverable by looking ahead. So
 * this is a depth-first search with backtracking: try each triad's
 * candidates in preference order, and if a choice leads to an unsolvable
 * rest of the sequence, undo it and try the next-best candidate, cascading
 * back as far as needed. The search space is tiny (12 triads x at most a
 * couple dozen candidates each), so this is effectively instant.
 */
export function generateTcaTriads({ startRoot, exerciseType, low, high }: GenerateTcaOptions): TcaTriad[] {
  const qualities = qualitySequence(exerciseType);
  const rawNotesByIndex = qualities.map((quality, i) => triadNotes(startRoot + i, quality));
  const placements: ShapedPlacement[] = new Array(qualities.length);

  function attempt(i: number, prevLast: number | null, prevShapeIndex: number, prevDirection: TriadDirection): boolean {
    if (i === qualities.length) return true;
    const raw = rawNotesByIndex[i];
    const preferredShapeIndex = i % PREFERRED_SHAPES.length;
    const rawCandidates =
      prevLast === null ? candidatesForFirstTriad(raw, low, high) : candidatesForNextTriad(raw, prevLast, low, high);
    const ranked = rankCandidates(rawCandidates, preferredShapeIndex, prevShapeIndex, prevDirection);
    for (const candidate of ranked) {
      placements[i] = candidate;
      if (attempt(i + 1, candidate.notes[2], candidate.shapeIndex, triadDirection(candidate.notes))) return true;
    }
    return false;
  }

  if (!attempt(0, null, -1, 'mixed')) {
    throw new Error(
      `No sequence of triads connects every consecutive pair by a semitone within the given range (${low}-${high}) — widen the range.`,
    );
  }

  return qualities.map((quality, i) => ({ quality, notes: placements[i].notes }));
}

const TRIADS_PER_BAR = 4;

/**
 * Renders a triad sequence as a complete, parseable ABC tune. No `V:` header
 * — no single-voice tune in this app's library uses one (flattenTune reads
 * staff[0]'s voice unconditionally), so adding one here would be inert but
 * inconsistent.
 *
 * M:4/4, L:1/8, each triad marked `(3`: each triad is written as an explicit
 * eighth-note triplet (`(3`) — abc's standard "3 in the time of 2" shorthand
 * — so its 3 written eighths take one quarter-note beat. That puts exactly
 * one triad per beat and 4 triads per bar in plain 4/4 (12 triads / 4 per
 * bar = 3 clean bars, matching the earlier plain-12/8 encoding's grouping),
 * but as real ABC triplets — which abcjs (and this app's own beaming/triplet
 * bracket rendering, see flatten.ts's tripletStart/tripletEnd and
 * TripletBracket.tsx) recognizes and displays with a bracketed "3", unlike
 * bare 12/8 eighth notes.
 */
export function renderTcaAbc(triads: TcaTriad[], title: string): string {
  const tokens = triads.map((t) => `(3${t.notes.map(midiToAbcNote).join('')}`);
  const bars: string[] = [];
  for (let i = 0; i < tokens.length; i += TRIADS_PER_BAR) {
    bars.push(tokens.slice(i, i + TRIADS_PER_BAR).join(' '));
  }
  const body = `${bars.join(' | ')} |]`;
  return `X:1\nT:${title}\nM:4/4\nL:1/8\nK:C\n${body}\n`;
}
