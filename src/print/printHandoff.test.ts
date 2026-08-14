import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writePrintPayload, readPrintPayload } from './printHandoff';

describe('printHandoff', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing has been written', () => {
    expect(readPrintPayload()).toBeNull();
  });

  it('round-trips a written payload', () => {
    writePrintPayload('X:1\nK:C\nCDEF|\n', 'My Tune');
    expect(readPrintPayload()).toEqual({ abc: 'X:1\nK:C\nCDEF|\n', title: 'My Tune' });
  });

  it('returns null for corrupted JSON in storage', () => {
    localStorage.setItem('printPayload', '{not valid json');
    expect(readPrintPayload()).toBeNull();
  });

  it('returns null when the stored value is missing expected fields', () => {
    localStorage.setItem('printPayload', JSON.stringify({ abc: 'X:1' }));
    expect(readPrintPayload()).toBeNull();
  });

  it('overwrites a previous payload with a new write', () => {
    writePrintPayload('X:1\nK:C\nC|\n', 'First');
    writePrintPayload('X:1\nK:C\nD|\n', 'Second');
    expect(readPrintPayload()).toEqual({ abc: 'X:1\nK:C\nD|\n', title: 'Second' });
  });

  it('writePrintPayload does not throw when localStorage.setItem throws', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => writePrintPayload('X:1\nK:C\nC|\n', 'Some Tune')).not.toThrow();
    setItemSpy.mockRestore();
  });

  it('readPrintPayload returns null when localStorage.getItem throws', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(readPrintPayload()).toBeNull();
    getItemSpy.mockRestore();
  });
});
