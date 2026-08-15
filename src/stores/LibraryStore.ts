import { actionBound, makeObservable, observableRef, runInAction } from 'mobx';
import { FILE_TREE, type AbcData } from '../content';
import { fetchTunes, type OverrideRecord, type TuneRecord } from '../api/tunesClient';

const MY_TUNES_ID = 'my-tunes';

// Sibling `id`s are occasionally duplicated in the source content (e.g. two
// unrelated "Cherokee" entries under Tunes both use id "cherokee") — dedupe
// with a numeric suffix so every key stays unique and stable across reloads.
function assignKeys(nodes: AbcData[], prefix: string): void {
  const seen = new Map<string, number>();
  for (const node of nodes) {
    const base = `${prefix}/${node.id}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    node.key = count === 0 ? base : `${base}-${count}`;
    if (node.children) assignKeys(node.children, node.key);
  }
}

function firstLeaf(nodes: AbcData[]): AbcData | undefined {
  for (const node of nodes) {
    if (!node.children) return node;
    const leaf = firstLeaf(node.children);
    if (leaf) return leaf;
  }
  return undefined;
}

/** Applies overrides to static nodes, cloning only the nodes an override actually touches. */
function applyOverrides(nodes: AbcData[], overridesByKey: Map<string, OverrideRecord>): AbcData[] {
  let changed = false;
  const result = nodes.map((node) => {
    if (node.children) {
      const children = applyOverrides(node.children, overridesByKey);
      if (children === node.children) return node;
      changed = true;
      return { ...node, children };
    }
    const override = node.key ? overridesByKey.get(node.key) : undefined;
    if (!override) return node;
    changed = true;
    return { ...node, title: override.title, data: override.data, video: override.video };
  });
  return changed ? result : nodes;
}

function tuneRecordToNode(tune: TuneRecord): AbcData {
  return { id: tune.id, title: tune.title, data: tune.data, video: tune.video };
}

class LibraryStore {
  tree: AbcData[] = FILE_TREE;
  // Assigned in rebuildTree(), called from the constructor — TS can't see
  // through that indirection for definite-assignment analysis.
  selected!: AbcData;

  private overridesByKey = new Map<string, OverrideRecord>();
  private newTunes: TuneRecord[] = [];

  constructor() {
    makeObservable(this, {
      tree: observableRef,
      selected: observableRef,
      setSelected: actionBound,
      applyOverride: actionBound,
      removeOverride: actionBound,
      applyNewTune: actionBound,
      removeTune: actionBound,
    });

    this.rebuildTree();
    void this.loadFromServer();
  }

  private rebuildTree(): void {
    // Static keys must exist before override lookup, and stay stable across
    // rebuilds since FILE_TREE's structure/order never changes at runtime.
    assignKeys(FILE_TREE, 'lib');
    const patchedStatic = applyOverrides(FILE_TREE, this.overridesByKey);

    const combined =
      this.newTunes.length > 0
        ? [...patchedStatic, { id: MY_TUNES_ID, title: 'My Tunes', children: this.newTunes.map(tuneRecordToNode) }]
        : patchedStatic;

    assignKeys(combined, 'lib');
    this.tree = combined;

    const previousKey = this.selected?.key;
    const previous = previousKey ? this.findByKey(previousKey) : undefined;
    this.selected = previous ?? firstLeaf(this.tree) ?? this.tree[0];
  }

  private async loadFromServer(): Promise<void> {
    const listing = await fetchTunes();
    if (!listing) return; // static tree already rendered — no server, no problem
    runInAction(() => {
      this.overridesByKey = new Map(listing.overrides.map((o) => [o.key, o]));
      this.newTunes = listing.tunes;
      this.rebuildTree();
    });
  }

  setSelected(entry: AbcData): void {
    if (!entry.children) this.selected = entry;
  }

  findByKey(key: string): AbcData | undefined {
    const search = (nodes: AbcData[]): AbcData | undefined => {
      for (const node of nodes) {
        if (node.key === key) return node;
        if (node.children) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return search(this.tree);
  }

  hasOverride(key: string | undefined): boolean {
    return !!key && this.overridesByKey.has(key);
  }

  applyOverride(record: OverrideRecord): void {
    this.overridesByKey.set(record.key, record);
    this.rebuildTree();
  }

  removeOverride(key: string): void {
    this.overridesByKey.delete(key);
    this.rebuildTree();
  }

  applyNewTune(record: TuneRecord): void {
    const existingIndex = this.newTunes.findIndex((t) => t.key === record.key);
    if (existingIndex === -1) this.newTunes = [...this.newTunes, record];
    else this.newTunes = this.newTunes.map((t, i) => (i === existingIndex ? record : t));
    this.rebuildTree();
  }

  removeTune(key: string): void {
    this.newTunes = this.newTunes.filter((t) => t.key !== key);
    this.rebuildTree();
  }
}

export default new LibraryStore();
