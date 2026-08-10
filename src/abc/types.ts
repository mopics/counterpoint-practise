export interface NotationPitch {
  pitch: number;
  name: string;
  accidental?: string;
  verticalPos: number;
  tieStart: boolean;
  tieEnd: boolean;
  /** Slur label ids that start at this note. */
  slurStart: number[];
  /** Slur label ids that end at this note. */
  slurEnd: number[];
}

export interface NotationGraceNote {
  pitch: number;
  name: string;
  verticalPos: number;
}

export interface NotationEvent {
  kind: 'note' | 'rest';
  startChar: number;
  endChar: number;
  /** Index of the measure this event falls in, within its line. */
  measureIndex: number;
  /** Duration as a fraction of a whole note (abcjs convention). */
  duration: number;
  pitches?: NotationPitch[];
  chordSymbol?: string;
  decorations: string[];
  /** e.g. "x" for an x-shaped notehead (!style=x!). */
  noteheadStyle?: string;
  grace?: NotationGraceNote[];
  beamStart: boolean;
  beamEnd: boolean;
  tripletStart?: { r: number; multiplier: number };
  tripletEnd: boolean;
}

export interface BarMarker {
  /** Index into the line's events[] this bar falls before. */
  eventIndex: number;
  type: string;
  startEnding?: string;
  endEnding?: boolean;
}

export interface NotationLine {
  lineIndex: number;
  /** Section label (e.g. "A", "B") carried over from a preceding T:/P: marker. */
  partLabel?: string;
  events: NotationEvent[];
  bars: BarMarker[];
}

export interface FlattenedTune {
  lines: NotationLine[];
  title: string;
  key: string;
  meter: string;
  qpm: number;
}

/** Stable coordinate identifying a single note/rest event within a flattened tune. */
export interface EventRef {
  lineIndex: number;
  eventIndex: number;
}
