import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { flattenTune } from './flatten';
import { extractKeyMarkers } from './keyMarkers';
import { computeScaleDegrees } from './scaleDegrees';
import { computeZodiacOverlay, ZODIAC_GLYPHS } from './zodiacOverlay';

describe('ZODIAC_GLYPHS', () => {
  it('has exactly the 12 confirmed pitch-class -> glyph entries, in chromatic order from C', () => {
    expect(ZODIAC_GLYPHS).toEqual({
      0: '♈', 1: '♉', 2: '♊', 3: '♋', 4: '♌', 5: '♍',
      6: '♎', 7: '♏', 8: '♐', 9: '♑', 10: '♒', 11: '♓',
    });
  });
});

describe('computeZodiacOverlay', () => {
  it('maps a chromatic run to its glyph sequence, with the octave-up c matching the first C', () => {
    const flattened = flattenTune(parseTune('X:1\nK:C\nCDEFGABc|\n'));
    const overlay = computeZodiacOverlay(flattened);
    expect(overlay.lines[0].glyphs).toEqual([
      ['♈'], // C
      ['♊'], // D
      ['♌'], // E
      ['♍'], // F
      ['♏'], // G
      ['♑'], // A
      ['♓'], // B
      ['♈'], // c (same pitch class as C)
    ]);
  });

  it('gives the same glyph to two different spellings of the same pitch class (the core point of the feature)', () => {
    const sharp = flattenTune(parseTune('X:1\nK:C\n^C|\n'));
    const flat = flattenTune(parseTune('X:1\nK:C\n_D|\n'));
    expect(computeZodiacOverlay(sharp).lines[0].glyphs[0]).toEqual(['♉']);
    expect(computeZodiacOverlay(flat).lines[0].glyphs[0]).toEqual(['♉']);
  });

  it('produces null for rests', () => {
    const flattened = flattenTune(parseTune('X:1\nK:C\nCz|\n'));
    const overlay = computeZodiacOverlay(flattened);
    expect(overlay.lines[0].glyphs).toEqual([['♈'], null]);
  });

  it('produces one glyph per pitch for a chord', () => {
    const flattened = flattenTune(parseTune('X:1\nK:C\n[CE]D|\n'));
    const overlay = computeZodiacOverlay(flattened);
    expect(overlay.lines[0].glyphs[0]).toEqual(['♈', '♌']);
  });

  it('carries a measure-persisted accidental to a later bare note, resetting across the bar line', () => {
    const flattened = flattenTune(parseTune('X:1\nK:C\n^CC|CC|\n'));
    const overlay = computeZodiacOverlay(flattened);
    // Measure 1: ^C (Taurus), then bare C persists as sharp (Taurus).
    // Measure 2 (after the bar line): bare C resets to natural (Aries).
    expect(overlay.lines[0].glyphs).toEqual([['♉'], ['♉'], ['♈'], ['♈']]);
  });

  it('resolves a key-signature-implied accidental with no explicit mark', () => {
    const flattened = flattenTune(parseTune('X:1\nK:Bb\nB|\n'));
    const overlay = computeZodiacOverlay(flattened);
    expect(overlay.lines[0].glyphs).toEqual([['♒']]); // Bb -> pitch class 10, Aquarius
  });

  it('is independent of key markers/root, unlike computeScaleDegrees', () => {
    const plain = extractKeyMarkers('X:1\nK:C\nCDEF|\n');
    const withMarker = extractKeyMarkers('X:1\nK:C\n**F**CDEF|\n');

    const plainFlattened = flattenTune(parseTune(plain.cleanAbc));
    const markerFlattened = flattenTune(parseTune(withMarker.cleanAbc));

    // computeScaleDegrees genuinely changes output when a root marker precedes the notes...
    const plainDegrees = computeScaleDegrees(plainFlattened, plain.markers, plainFlattened.keyRoot, plain.cleanAbc);
    const markerDegrees = computeScaleDegrees(markerFlattened, withMarker.markers, markerFlattened.keyRoot, withMarker.cleanAbc);
    expect(plainDegrees.lines[0].degrees).not.toEqual(markerDegrees.lines[0].degrees);

    // ...but the zodiac overlay, having no root concept, does not.
    expect(computeZodiacOverlay(plainFlattened).lines[0].glyphs).toEqual(
      computeZodiacOverlay(markerFlattened).lines[0].glyphs,
    );
  });
});
