/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { extractKeyMarkers } from './keyMarkers';
import { extractChordGrips } from './chordGrips';
import { extractCompingVoice } from './chordComping';

/**
 * Regression guard for false-positive comping-voice detection.
 *
 * Several real tunes in the shipped content library already carry a
 * hand-written second voice (`V:2 clef=bass`) with real pitches — nothing to
 * do with this feature. Detecting those as comping voices makes
 * expandCompingVoice rewrite their notes and corrupt playback/print, so this
 * walks every real library file on disk and asserts detection stays off.
 *
 * No shipped library tune uses this (brand-new) feature yet, so "off" is the
 * right expectation for all of them. Once a real tune is authored with a
 * `V:comp` voice, exclude that file here rather than loosening the guard.
 */
const LIBRARY_DIR = path.resolve(process.cwd(), 'server', 'data', 'library');

const files = readdirSync(LIBRARY_DIR).filter((f) => f.endsWith('.json'));

describe('extractCompingVoice against the real content library', () => {
  it('finds library files to check (guards against a silently empty suite)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files)('%s', (file) => {
    it('is not detected as having a chord-comping voice', () => {
      const record = JSON.parse(readFileSync(path.join(LIBRARY_DIR, file), 'utf8')) as {
        type?: string;
        data?: string;
      };
      if (record.type !== 'tune' || typeof record.data !== 'string') return;

      let compingVoice;
      try {
        const { cleanAbc: afterKeyMarkers } = extractKeyMarkers(record.data);
        const { cleanAbc } = extractChordGrips(afterKeyMarkers);
        const tune = parseTune(cleanAbc);
        compingVoice = extractCompingVoice(tune, cleanAbc);
      } catch {
        // Malformed/unparseable content is out of scope here — this test
        // guards detection, not that every stored tune parses.
        return;
      }
      expect(compingVoice).toBeNull();
    });
  });
});
