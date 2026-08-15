// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AbcData } from '../src/content/index.ts';
import { buildRecords, slugify } from './migrate.ts';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Jens Larsen - Coltrane Patterns')).toBe('jens-larsen-coltrane-patterns');
  });

  it('falls back to "item" for a title with no alphanumeric characters', () => {
    expect(slugify('***')).toBe('item');
  });
});

describe('buildRecords', () => {
  const FIXED_TIME = () => '2026-01-01T00:00:00.000Z';

  it('converts root-level leaves into root-level tune records, in order', () => {
    const tree: AbcData[] = [
      { id: 'a', title: 'Tune A', data: 'X:1\nA\n' },
      { id: 'b', title: 'Tune B', data: 'X:1\nB\n' },
    ];
    let counter = 0;
    const records = buildRecords(tree, () => `id-${counter++}`, FIXED_TIME);

    expect(records).toEqual([
      { id: 'id-0', type: 'tune', parentId: null, title: 'Tune A', data: 'X:1\nA\n', video: undefined, createdAt: FIXED_TIME(), updatedAt: FIXED_TIME() },
      { id: 'id-1', type: 'tune', parentId: null, title: 'Tune B', data: 'X:1\nB\n', video: undefined, createdAt: FIXED_TIME(), updatedAt: FIXED_TIME() },
    ]);
  });

  it('preserves nesting: a folder record is created and its children get parentId set to it', () => {
    const tree: AbcData[] = [
      {
        id: 'folder', title: 'A Folder', children: [
          { id: 'leaf', title: 'A Tune', data: 'X:1\n' },
        ],
      },
    ];
    let counter = 0;
    const records = buildRecords(tree, () => `id-${counter++}`, FIXED_TIME);

    expect(records).toHaveLength(2);
    const folder = records.find((r) => r.type === 'folder');
    const tune = records.find((r) => r.type === 'tune');
    expect(folder).toMatchObject({ id: 'id-0', type: 'folder', title: 'A Folder', parentId: null });
    expect(tune).toMatchObject({ id: 'id-1', type: 'tune', title: 'A Tune', parentId: 'id-0' });
  });

  it('handles multiple levels of nesting, wiring each level to its immediate parent', () => {
    const tree: AbcData[] = [
      {
        id: 'outer', title: 'Outer', children: [
          {
            id: 'inner', title: 'Inner', children: [
              { id: 'leaf', title: 'Deep Tune', data: 'X:1\n' },
            ],
          },
        ],
      },
    ];
    let counter = 0;
    const records = buildRecords(tree, () => `id-${counter++}`, FIXED_TIME);

    const outer = records.find((r) => r.title === 'Outer');
    const inner = records.find((r) => r.title === 'Inner');
    const leaf = records.find((r) => r.title === 'Deep Tune');
    expect(outer?.parentId).toBeNull();
    expect(inner?.parentId).toBe(outer?.id);
    expect(leaf?.parentId).toBe(inner?.id);
  });

  it('carries the video field through when present, and leaves it undefined when absent', () => {
    const tree: AbcData[] = [
      { id: 'a', title: 'Tune A', data: 'X:1\n', video: { url: 'https://youtu.be/x', start: '0:00', end: '1:00' } },
      { id: 'b', title: 'Tune B', data: 'X:1\n' },
    ];
    const records = buildRecords(tree, (title) => slugify(title), FIXED_TIME);
    expect(records[0]).toMatchObject({ video: { url: 'https://youtu.be/x', start: '0:00', end: '1:00' } });
    expect(records[1]).toMatchObject({ video: undefined });
  });

  it('defaults a leaf with no data field to an empty string', () => {
    const tree: AbcData[] = [{ id: 'a', title: 'Empty Tune' }];
    const records = buildRecords(tree, (title) => slugify(title), FIXED_TIME);
    expect(records[0]).toMatchObject({ type: 'tune', data: '' });
  });
});
