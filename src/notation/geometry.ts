// Shared engraving geometry for the custom SVG notation renderer.
// Pitch values follow abcjs's convention: diatonic steps from middle C (C4 = 0),
// independent of accidentals (D=1, E=2, F=3, G=4, A=5, B=6, c(C5)=7, ...).

export const LINE_SPACING = 8; // px between adjacent staff lines
export const HALF_STEP = LINE_SPACING / 2; // px per diatonic step
export const BOTTOM_LINE_PITCH = 2; // E4 — bottom line of a treble staff
export const STAFF_LINE_COUNT = 5;
export const STAFF_HEIGHT = LINE_SPACING * (STAFF_LINE_COUNT - 1);

export const NOTE_RADIUS = 4.2;
export const STEM_LENGTH = LINE_SPACING * 3.5;
export const FLAG_GAP = 5;

export const MIN_EVENT_WIDTH = 24;
export const UNIT_WIDTH = 92; // px per whole note of duration
export const GRACE_NOTE_WIDTH = 10;

export const LEFT_MARGIN = 12;
export const PART_LABEL_WIDTH = 30;
export const END_PADDING = 24;
export const BAR_PAD = 10;

export const CHORD_ROW_HEIGHT = 20;
export const STAFF_TOP_OFFSET = 34; // from top of a line's vertical band to its top staff line
export const LINE_VERTICAL_GAP = 104; // vertical space allotted per rendered notation line

// Chord-grip fretboard diagrams (always a fixed 6 strings x 6 fret rows).
export const CHORD_GRIP_STRING_COUNT = 6;
export const CHORD_GRIP_FRET_ROWS = 6;
export const CHORD_GRIP_STRING_SPACING = 5; // px between adjacent string lines
export const CHORD_GRIP_FRET_SPACING = 5; // px between adjacent fret lines
export const CHORD_GRIP_WIDTH = CHORD_GRIP_STRING_SPACING * (CHORD_GRIP_STRING_COUNT - 1);
export const CHORD_GRIP_GRID_HEIGHT = CHORD_GRIP_FRET_SPACING * CHORD_GRIP_FRET_ROWS;
export const CHORD_GRIP_MUTE_OPEN_ROW_HEIGHT = 8; // space above the nut for x/o string indicators
export const CHORD_GRIP_TOTAL_HEIGHT = CHORD_GRIP_MUTE_OPEN_ROW_HEIGHT + CHORD_GRIP_GRID_HEIGHT;

// Layout variants used only for tunes that actually contain a chord grip
// (checked once per tune, not per line — see SheetView.parseSheet) so tunes
// without grips render pixel-identical to before this feature existed.
const GRIP_TO_STAFF_GAP = 14; // clearance between the grip diagram's bottom and the staff
// Clearance between the chord text baseline and the grip diagram's top edge. Deliberately
// small/tight (previously effectively 13px via GRIP_TO_CHORD_GAP + CHORD_ROW_HEIGHT / 2) —
// keep this above ~0 to avoid the text and diagram visually touching/overlapping.
const GRIP_TO_CHORD_GAP = 2;
const GRIP_EXTRA_SPACE = CHORD_GRIP_TOTAL_HEIGHT + GRIP_TO_STAFF_GAP + GRIP_TO_CHORD_GAP;
export const STAFF_TOP_OFFSET_WITH_GRIPS = STAFF_TOP_OFFSET + GRIP_EXTRA_SPACE;
// Trailing space between one line's staff and the next grip line's chord text is otherwise
// LINE_VERTICAL_GAP + GRIP_EXTRA_SPACE — trimmed down per feedback (was too much top margin
// above the chord text). This only affects inter-line spacing, not the room reserved above
// each line's own staff (STAFF_TOP_OFFSET_WITH_GRIPS, left untouched on purpose).
const GRIP_LINE_GAP_TRIM = 30;
export const LINE_VERTICAL_GAP_WITH_GRIPS = LINE_VERTICAL_GAP + GRIP_EXTRA_SPACE - GRIP_LINE_GAP_TRIM;

/** Top edge of the grip diagram, relative to staffTopY (only meaningful when a tune has grips). */
export const CHORD_GRIP_Y_OFFSET = -(CHORD_GRIP_TOTAL_HEIGHT + GRIP_TO_STAFF_GAP);
/** Chord text baseline, relative to staffTopY, for a line that has room reserved for grips below it. */
export const CHORD_ROW_Y_OFFSET_WITH_GRIPS = CHORD_GRIP_Y_OFFSET - GRIP_TO_CHORD_GAP;

export function pitchToY(pitch: number, staffBottomY: number): number {
  return staffBottomY - (pitch - BOTTOM_LINE_PITCH) * HALF_STEP;
}

export function eventWidth(duration: number): number {
  return Math.max(MIN_EVENT_WIDTH, duration * UNIT_WIDTH);
}

/** Number of beam/flag flags for an unbeamed note of the given duration. */
export function flagCount(duration: number): number {
  if (duration >= 0.25) return 0;
  if (duration >= 0.125) return 1;
  if (duration >= 0.0625) return 2;
  return 3;
}

export function isFilledNotehead(duration: number): boolean {
  return duration < 0.5;
}

export function hasStem(duration: number): boolean {
  return duration < 1;
}

export function stemUp(pitch: number): boolean {
  return pitch <= 6; // at/below the middle line (B4) -> stem up
}

/** Ledger-line pitches (staff-line-aligned, even values) needed for a note beyond the staff. */
export function ledgerLinePitches(pitch: number): number[] {
  const lines: number[] = [];
  if (pitch < BOTTOM_LINE_PITCH) {
    const end = pitch % 2 === 0 ? pitch : pitch + 1;
    for (let p = 0; p >= end; p -= 2) lines.push(p);
  } else if (pitch > BOTTOM_LINE_PITCH + (STAFF_LINE_COUNT - 1) * 2) {
    const top = BOTTOM_LINE_PITCH + (STAFF_LINE_COUNT - 1) * 2;
    const start = top + 2;
    const end = pitch % 2 === 0 ? pitch : pitch - 1;
    for (let p = start; p <= end; p += 2) lines.push(p);
  }
  return lines;
}
