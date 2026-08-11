import { describe, it, expect } from 'vitest';
import { extractKeyMarkers } from './keyMarkers';

describe('extractKeyMarkers', () => {
  it('strips a valid marker and records its offset and root', () => {
    const { cleanAbc, markers } = extractKeyMarkers('CD**Db**EF');
    expect(cleanAbc).toBe('CD      EF');
    expect(markers).toEqual([{ charOffset: 2, root: 'Db' }]);
  });

  it('preserves string length exactly (offset stability)', () => {
    const raw = 'X:1\nK:C\n**F#**CDEF|';
    const { cleanAbc } = extractKeyMarkers(raw);
    expect(cleanAbc.length).toBe(raw.length);
  });

  it('leaves every character after the marker at the same offset', () => {
    const raw = '**C**DEFG';
    const { cleanAbc } = extractKeyMarkers(raw);
    const noteIndex = raw.indexOf('D');
    expect(cleanAbc[noteIndex]).toBe('D');
  });

  it('handles multiple markers, including ones abutting other tokens with no whitespace', () => {
    const raw = '"F-7"**Eb**B,2 G,B,';
    const { markers } = extractKeyMarkers(raw);
    expect(markers).toEqual([{ charOffset: 5, root: 'Eb' }]);
  });

  it('strips invalid marker content as a no-op, without recording a root', () => {
    const { cleanAbc, markers } = extractKeyMarkers('CD**_**EF');
    expect(markers).toEqual([]);
    expect(cleanAbc).toBe('CD     EF');
  });

  it('returns no markers for text with no ** tokens', () => {
    const { cleanAbc, markers } = extractKeyMarkers('CDEFGAB');
    expect(cleanAbc).toBe('CDEFGAB');
    expect(markers).toEqual([]);
  });

  it('records sharp and flat roots correctly', () => {
    const { markers } = extractKeyMarkers('**F#**C **Bb**D');
    expect(markers).toEqual([
      { charOffset: 0, root: 'F#' },
      { charOffset: 8, root: 'Bb' },
    ]);
  });
});
