import { actionBound, makeObservable, observable, observableRef, runInAction } from 'mobx';
import {
  createFolder as apiCreateFolder,
  createTune as apiCreateTune,
  deleteFolder as apiDeleteFolder,
  deleteTune as apiDeleteTune,
  fetchLibrary,
  renameFolder as apiRenameFolder,
  saveTune as apiSaveTune,
  type FolderRecord,
  type LibraryNode,
  type TuneRecord,
} from '../api/tunesClient';

function isFolder(node: LibraryNode): node is FolderRecord {
  return node.type === 'folder';
}

function byTitle(a: LibraryNode, b: LibraryNode): number {
  return a.title.localeCompare(b.title);
}

function firstTuneDepthFirst(parentId: string | null, byParent: Map<string | null, LibraryNode[]>): TuneRecord | undefined {
  const siblings = [...(byParent.get(parentId) ?? [])].sort(byTitle);
  for (const node of siblings) {
    if (!isFolder(node)) return node;
    const found = firstTuneDepthFirst(node.id, byParent);
    if (found) return found;
  }
  return undefined;
}

class LibraryStore {
  currentFolderId: string | null = null;
  selected: TuneRecord | undefined = undefined;
  loaded = false;
  loadError = false;

  // Not `private`: TypeScript's `keyof` excludes `private`-modified members
  // (even from within the declaring class), so a private field's name can
  // never legally appear in makeObservable's annotations object literal.
  // These are internal state and not meant to be used outside this class.
  nodesById = new Map<string, LibraryNode>();
  childrenByParent = new Map<string | null, LibraryNode[]>();

  constructor() {
    makeObservable(this, {
      currentFolderId: observable,
      selected: observableRef,
      loaded: observable,
      loadError: observable,
      nodesById: observable,
      childrenByParent: observable,
      navigateTo: actionBound,
      setSelected: actionBound,
      createFolder: actionBound,
      createTune: actionBound,
      rename: actionBound,
      remove: actionBound,
      applyTuneEdit: actionBound,
    });

    void this.load();
  }

  private async load(): Promise<void> {
    const listing = await fetchLibrary();
    runInAction(() => {
      if (!listing) {
        this.loadError = true;
        return;
      }
      this.loadError = false;
      this.loaded = true;
      this.rebuildIndexes(listing.nodes);
      const first = firstTuneDepthFirst(null, this.childrenByParent);
      this.selected = first;
      this.currentFolderId = first ? first.parentId : null;
    });
  }

  private rebuildIndexes(nodes: LibraryNode[]): void {
    this.nodesById = new Map(nodes.map((n) => [n.id, n]));
    this.childrenByParent = new Map();
    for (const node of nodes) {
      const siblings = this.childrenByParent.get(node.parentId) ?? [];
      siblings.push(node);
      this.childrenByParent.set(node.parentId, siblings);
    }
  }

  childrenOf(folderId: string | null): LibraryNode[] {
    return [...(this.childrenByParent.get(folderId) ?? [])].sort((a, b) => {
      if (isFolder(a) !== isFolder(b)) return isFolder(a) ? -1 : 1;
      return byTitle(a, b);
    });
  }

  get breadcrumb(): FolderRecord[] {
    const trail: FolderRecord[] = [];
    let current = this.currentFolderId;
    while (current) {
      const node = this.nodesById.get(current);
      if (!node || !isFolder(node)) break;
      trail.unshift(node);
      current = node.parentId;
    }
    return trail;
  }

  navigateTo(folderId: string | null): void {
    this.currentFolderId = folderId;
  }

  setSelected(tune: TuneRecord): void {
    this.selected = tune;
    this.currentFolderId = tune.parentId;
  }

  async createFolder(title: string): Promise<boolean> {
    const record = await apiCreateFolder({ parentId: this.currentFolderId, title });
    if (!record) return false;
    runInAction(() => this.insertNode(record));
    return true;
  }

  async createTune(title: string): Promise<TuneRecord | null> {
    const record = await apiCreateTune({ parentId: this.currentFolderId, title, data: '' });
    if (!record) return null;
    runInAction(() => {
      this.insertNode(record);
      this.setSelected(record);
    });
    return record;
  }

  async rename(id: string, title: string): Promise<boolean> {
    const node = this.nodesById.get(id);
    if (!node) return false;
    const record = isFolder(node)
      ? await apiRenameFolder(id, { title })
      : await apiSaveTune(id, { title, data: node.data, video: node.video });
    if (!record) return false;
    runInAction(() => this.replaceNode(record));
    return true;
  }

  async remove(id: string): Promise<'deleted' | 'not-empty' | 'error'> {
    const node = this.nodesById.get(id);
    if (!node) return 'error';

    if (isFolder(node)) {
      const result = await apiDeleteFolder(id);
      if (result === 'deleted') runInAction(() => this.removeNode(node));
      return result;
    }
    const ok = await apiDeleteTune(id);
    if (!ok) return 'error';
    runInAction(() => this.removeNode(node));
    return 'deleted';
  }

  applyTuneEdit(record: TuneRecord): void {
    this.replaceNode(record);
  }

  private insertNode(node: LibraryNode): void {
    this.nodesById.set(node.id, node);
    const siblings = this.childrenByParent.get(node.parentId) ?? [];
    this.childrenByParent.set(node.parentId, [...siblings, node]);
  }

  private replaceNode(node: LibraryNode): void {
    this.nodesById.set(node.id, node);
    const siblings = this.childrenByParent.get(node.parentId) ?? [];
    const index = siblings.findIndex((n) => n.id === node.id);
    this.childrenByParent.set(
      node.parentId,
      index === -1 ? [...siblings, node] : siblings.map((n, i) => (i === index ? node : n)),
    );
    if (this.selected?.id === node.id && node.type === 'tune') this.selected = node;
  }

  private removeNode(node: LibraryNode): void {
    this.nodesById.delete(node.id);
    const siblings = this.childrenByParent.get(node.parentId) ?? [];
    this.childrenByParent.set(node.parentId, siblings.filter((n) => n.id !== node.id));

    if (this.currentFolderId === node.id) this.currentFolderId = node.parentId;

    if (this.selected?.id === node.id) {
      const replacement = firstTuneDepthFirst(null, this.childrenByParent);
      this.selected = replacement;
      if (replacement) this.currentFolderId = replacement.parentId;
    }
  }
}

export default new LibraryStore();
