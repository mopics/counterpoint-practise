import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { extractCompingVoice } from './chordComping';

describe('extractCompingVoice', () => {
  it('returns null for a single-voice tune', () => {
    const tune = parseTune('X:1\nK:C\nCDEF|\n');
    expect(extractCompingVoice(tune)).toBeNull();
  });

  it('extracts V:2 note/rest events with duration and char range, ignoring V:1', () => {
    const tune = parseTune('X:1\nK:C\nV:1\nCDEF|\nV:2\nC8|z8|\n');
    const comping = extractCompingVoice(tune);
    expect(comping).not.toBeNull();
    expect(comping!.lines).toHaveLength(1);
    expect(comping!.lines[0].events.map((e) => ({ kind: e.kind, duration: e.duration }))).toEqual([
      { kind: 'note', duration: 1 },
      { kind: 'rest', duration: 1 },
    ]);
  });

  it('preserves the source char range of each event for later text-splicing', () => {
    const raw = 'X:1\nK:C\nV:1\nCDEF|\nV:2\nC8|\n';
    const tune = parseTune(raw);
    const comping = extractCompingVoice(tune)!;
    const event = comping.lines[0].events[0];
    expect(raw.slice(event.startChar, event.endChar)).toBe('C8');
  });

  it('numbers lineIndex the same way flattenTune does (per staff-bearing written line)', () => {
    const tune = parseTune('X:1\nK:C\nV:1\nCDEF|\ncBAG|\nV:2\nC8|\nC8|\n');
    const comping = extractCompingVoice(tune)!;
    expect(comping.lines.map((l) => l.lineIndex)).toEqual([0, 1]);
    expect(comping.lines[1].events).toHaveLength(1);
  });
});
