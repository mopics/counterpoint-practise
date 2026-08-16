import { observer } from 'mobx-react-lite';
import { useRef, useState } from 'react';
import { libraryStore, uiStore } from '../stores';
import type { FolderRecord, LibraryNode } from '../api/tunesClient';
import { Breadcrumb } from './Breadcrumb';

const COLLAPSED_WIDTH = 40;

function isFolder(node: LibraryNode): node is FolderRecord {
  return node.type === 'folder';
}

const LibraryRow = observer(function LibraryRow({ node }: { node: LibraryNode }) {
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(node.title);

  const isSelected = node.type === 'tune' && libraryStore.selected?.id === node.id;

  const commitRename = () => {
    const title = draftTitle.trim();
    setRenaming(false);
    if (title && title !== node.title) void libraryStore.rename(node.id, title);
    else setDraftTitle(node.title);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${node.title}"?`)) return;
    const result = await libraryStore.remove(node.id);
    if (result === 'not-empty') alert('This folder isn\'t empty — remove its contents first.');
  };

  if (renaming) {
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <input
          autoFocus
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraftTitle(node.title);
              setRenaming(false);
            }
          }}
          className="min-w-0 flex-1 rounded border border-blue-400 px-1.5 py-0.5 text-sm text-slate-800 outline-none"
        />
      </div>
    );
  }

  return (
    <div className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${isSelected ? 'bg-blue-100 font-medium text-blue-900' : 'text-slate-700 hover:bg-slate-100'}`}>
      <button
        type="button"
        onClick={() => {
          if (isFolder(node)) libraryStore.navigateTo(node.id);
          else libraryStore.setSelected(node);
        }}
        className="min-w-0 flex-1 truncate text-left"
      >
        {isFolder(node) ? '📁 ' : ''}
        {node.title}
      </button>
      <button
        type="button"
        onClick={() => setRenaming(true)}
        aria-label={`Rename ${node.title}`}
        className="hidden shrink-0 text-xs text-slate-400 hover:text-slate-700 group-hover:block"
      >
        ✎
      </button>
      <button
        type="button"
        onClick={() => void handleDelete()}
        aria-label={`Delete ${node.title}`}
        className="hidden shrink-0 text-xs text-slate-400 hover:text-red-600 group-hover:block"
      >
        🗑
      </button>
    </div>
  );
});

export const Sidebar = observer(function Sidebar() {
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [newTuneTitle, setNewTuneTitle] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingTune, setCreatingTune] = useState(false);

  const handleCreateFolder = async () => {
    const title = newFolderTitle.trim();
    if (!title || creatingFolder) return;
    setCreatingFolder(true);
    await libraryStore.createFolder(title);
    setCreatingFolder(false);
    setNewFolderTitle('');
  };

  const handleCreateTune = async () => {
    const title = newTuneTitle.trim();
    if (!title || creatingTune) return;
    setCreatingTune(true);
    await libraryStore.createTune(title);
    setCreatingTune(false);
    setNewTuneTitle('');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = uiStore.sidebarWidth;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const delta = e.clientX - dragStartX.current;
    uiStore.setSidebarWidth(dragStartWidth.current + delta);
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  if (uiStore.sidebarCollapsed) {
    return (
      <aside
        className="flex h-full shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50 py-3"
        style={{ width: COLLAPSED_WIDTH }}
      >
        <button
          type="button"
          onClick={() => uiStore.toggleSidebarCollapsed()}
          aria-label="Expand sidebar"
          className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
        >
          »
        </button>
      </aside>
    );
  }

  return (
    <div className="flex h-full shrink-0">
      <aside
        className="flex h-full min-w-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50"
        style={{ width: uiStore.sidebarWidth }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-wide text-slate-900">Jazz Solo Transcriptions</h1>
            <p className="text-xs text-slate-500">Lick &amp; solo library</p>
          </div>
          <button
            type="button"
            onClick={() => uiStore.toggleSidebarCollapsed()}
            aria-label="Collapse sidebar"
            className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          >
            «
          </button>
        </div>
        <Breadcrumb trail={libraryStore.breadcrumb} onNavigate={(id) => libraryStore.navigateTo(id)} />
        <nav className="flex-1 py-2">
          {libraryStore.childrenOf(libraryStore.currentFolderId).map((node) => (
            <LibraryRow key={node.id} node={node} />
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-slate-200 p-2">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newFolderTitle}
              onChange={(e) => setNewFolderTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateFolder();
              }}
              placeholder="New folder name…"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={() => void handleCreateFolder()}
              disabled={!newFolderTitle.trim() || creatingFolder}
              className="shrink-0 rounded bg-slate-600 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Folder
            </button>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTuneTitle}
              onChange={(e) => setNewTuneTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateTune();
              }}
              placeholder="New tune title…"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={() => void handleCreateTune()}
              disabled={!newTuneTitle.trim() || creatingTune}
              className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Tune
            </button>
          </div>
        </div>
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-blue-400 active:bg-blue-500"
      />
    </div>
  );
});
