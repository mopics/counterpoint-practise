import { actionBound, makeObservable, observableRef } from 'mobx';
import { FILE_TREE, type AbcData } from '../content';

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

class LibraryStore {
  tree: AbcData[] = FILE_TREE;
  selected: AbcData;

  constructor() {
    makeObservable(this, {
      selected: observableRef,
      setSelected: actionBound,
    });

    assignKeys(this.tree, 'lib');
    this.selected = firstLeaf(this.tree) ?? this.tree[0];
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
}

export default new LibraryStore();
