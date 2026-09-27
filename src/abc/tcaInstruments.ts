export interface TcaInstrumentPreset {
  key: string;
  label: string;
  /** MIDI, concert pitch — this app has no transposing-instrument concept, so all ranges are concert pitch. */
  low: number;
  high: number;
}

/**
 * Tenor sax's range is derived from its written range (Bb3-F6) minus a major
 * 9th (14 semitones, its Bb transposition) to get its concert-pitch range,
 * Ab2-E5 — then bumped up two further octaves (+24) on top of that, since
 * this app draws every pitch on a plain treble (G) staff with no clef choice
 * or transposition: at true concert pitch, tenor sax's range sits mostly
 * below the staff on a wall of ledger lines, while the octave-shifted range
 * reads comfortably on/near the staff instead. This is a plain display
 * choice, not real instrument transposition — computed once as a plain
 * constant, no runtime transposition logic anywhere in this app. Guitar's
 * low end (MIDI 40 = E2) intentionally matches STANDARD_TUNING_MIDI[0] in
 * chordComping.ts. Both stay editable in the generator form; these are just
 * starting defaults.
 */
export const TCA_INSTRUMENT_PRESETS: TcaInstrumentPreset[] = [
  { key: 'tenorSax', label: 'Tenor Sax', low: 68, high: 100 }, // Ab4-E7 (concert, +2 octaves for treble-staff readability)
  { key: 'guitar', label: 'Guitar', low: 40, high: 83 }, // E2-B5
];
