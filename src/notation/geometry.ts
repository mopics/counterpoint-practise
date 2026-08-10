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
