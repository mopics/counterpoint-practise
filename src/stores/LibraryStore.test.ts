import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/tunesClient', () => ({
  fetchTunes: vi.fn().mockResolvedValue(null),
}));

// Imported after the mock so the constructor's fire-and-forget loadFromServer()
// call resolves to null (simulating "server unreachable") rather than hitting fetch.
const { default: libraryStore } = await import('./LibraryStore');
const { FILE_TREE } = await import('../content');

function flatten(nodes: typeof FILE_TREE): typeof FILE_TREE {
  return nodes.flatMap((node) => (node.children ? flatten(node.children) : [node]));
}

const KNOWN_KEY = 'lib/tunes/cherokee';

describe('LibraryStore', () => {
  beforeEach(() => {
    // Revert anything a previous test applied, since libraryStore is a module-level singleton.
    libraryStore.removeOverride(KNOWN_KEY);
    for (const tune of flatten(libraryStore.tree).filter((n) => n.key?.startsWith('lib/my-tunes/'))) {
      libraryStore.removeTune(tune.key!);
    }
  });

  it('renders the static tree with a leaf resolvable by key', () => {
    const node = libraryStore.findByKey(KNOWN_KEY);
    expect(node).toBeDefined();
    expect(node?.data).toBeDefined();
  });

  it('a rejected/absent server fetch leaves the static tree fully intact', async () => {
    // The module-level constructor already ran loadFromServer() with the mocked
    // null response; give any pending microtasks a chance to flush, then assert
    // the tree still matches pristine FILE_TREE content for the known key.
    await Promise.resolve();
    const node = libraryStore.findByKey(KNOWN_KEY);
    expect(node?.data).toBe(FILE_TREE.flatMap((n) => (n.children ? flatten(n.children) : [n]))
      .find((n) => n.key === KNOWN_KEY)?.data);
  });

  it('applyOverride replaces title/data/video on the matching node without touching id', () => {
    const before = libraryStore.findByKey(KNOWN_KEY);
    const originalId = before?.id;

    libraryStore.applyOverride({
      key: KNOWN_KEY,
      title: 'Cherokee (my edit)',
      data: 'X:1\nT:Cherokee (my edit)\n',
      updatedAt: new Date().toISOString(),
    });

    const after = libraryStore.findByKey(KNOWN_KEY);
    expect(after?.title).toBe('Cherokee (my edit)');
    expect(after?.data).toBe('X:1\nT:Cherokee (my edit)\n');
    expect(after?.id).toBe(originalId);
  });

  it('removeOverride reverts a node back to its original static content', () => {
    const original = libraryStore.findByKey(KNOWN_KEY);
    const originalData = original?.data;

    libraryStore.applyOverride({ key: KNOWN_KEY, title: 'Temp', data: 'X:1\ntemp\n', updatedAt: 'now' });
    expect(libraryStore.findByKey(KNOWN_KEY)?.data).toBe('X:1\ntemp\n');

    libraryStore.removeOverride(KNOWN_KEY);
    expect(libraryStore.findByKey(KNOWN_KEY)?.data).toBe(originalData);
  });

  it('applyNewTune adds a leaf under a "My Tunes" folder', () => {
    libraryStore.applyNewTune({
      key: 'lib/my-tunes/my-blues-lick-abcd1234',
      id: 'my-blues-lick-abcd1234',
      title: 'My Blues Lick',
      data: 'X:1\n',
      createdAt: 'now',
      updatedAt: 'now',
    });

    const myTunesFolder = libraryStore.tree.find((n) => n.id === 'my-tunes');
    expect(myTunesFolder).toBeDefined();
    expect(myTunesFolder?.children?.some((n) => n.title === 'My Blues Lick')).toBe(true);

    const node = libraryStore.findByKey('lib/my-tunes/my-blues-lick-abcd1234');
    expect(node?.title).toBe('My Blues Lick');
  });

  it('removeTune removes the leaf and, once empty, the "My Tunes" folder disappears', () => {
    libraryStore.applyNewTune({
      key: 'lib/my-tunes/temp-1234abcd',
      id: 'temp-1234abcd',
      title: 'Temp',
      data: '',
      createdAt: 'now',
      updatedAt: 'now',
    });
    expect(libraryStore.tree.some((n) => n.id === 'my-tunes')).toBe(true);

    libraryStore.removeTune('lib/my-tunes/temp-1234abcd');
    expect(libraryStore.tree.some((n) => n.id === 'my-tunes')).toBe(false);
  });

  it('setSelected only accepts leaf nodes', () => {
    const folder = libraryStore.tree.find((n) => n.children);
    expect(folder).toBeDefined();
    const before = libraryStore.selected;
    libraryStore.setSelected(folder!);
    expect(libraryStore.selected).toBe(before);
  });
});
