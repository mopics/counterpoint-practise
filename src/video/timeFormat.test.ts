import { describe, it, expect } from 'vitest';
import { formatSeconds, parseTimeInput } from './timeFormat';

describe('formatSeconds', () => {
  it('formats whole minutes and seconds as mm:ss', () => {
    expect(formatSeconds(65)).toBe('1:05');
  });

  it('pads single-digit seconds with a leading zero', () => {
    expect(formatSeconds(5)).toBe('0:05');
  });

  it('handles zero', () => {
    expect(formatSeconds(0)).toBe('0:00');
  });

  it('floors fractional seconds', () => {
    expect(formatSeconds(65.9)).toBe('1:05');
  });

  it('clamps negative input to zero', () => {
    expect(formatSeconds(-5)).toBe('0:00');
  });

  it('handles minutes above 59 without wrapping', () => {
    expect(formatSeconds(3661)).toBe('61:01');
  });
});

describe('parseTimeInput', () => {
  it('parses mm:ss format', () => {
    expect(parseTimeInput('1:05')).toBe(65);
  });

  it('parses mm:ss with a two-digit minute value', () => {
    expect(parseTimeInput('12:30')).toBe(750);
  });

  it('parses a bare integer as seconds', () => {
    expect(parseTimeInput('90')).toBe(90);
  });

  it('parses a bare decimal as seconds', () => {
    expect(parseTimeInput('90.5')).toBe(90.5);
  });

  it('trims surrounding whitespace', () => {
    expect(parseTimeInput('  1:05  ')).toBe(65);
  });

  it('returns null for an empty string', () => {
    expect(parseTimeInput('')).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(parseTimeInput('not a time')).toBeNull();
  });

  it('returns null when the seconds component is 60 or more', () => {
    expect(parseTimeInput('1:60')).toBeNull();
  });
});
