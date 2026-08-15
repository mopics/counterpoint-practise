import { observer } from 'mobx-react-lite';
import { useRef, useState } from 'react';
import { libraryStore, uiStore } from '../stores';
import { createTune } from '../api/tunesClient';
import { TreeNode } from './TreeNode';

const COLLAPSED_WIDTH = 40;

export const Sidebar = observer(function Sidebar() {
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const [newTuneTitle, setNewTuneTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateTune = async () => {
    const title = newTuneTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    const record = await createTune({ title, data: '' });
    setCreating(false);
    if (!record) return;
    libraryStore.applyNewTune(record);
    setNewTuneTitle('');
    const node = libraryStore.findByKey(record.key);
    if (node) libraryStore.setSelected(node);
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
        <nav className="flex-1 py-2">
          {libraryStore.tree.map((node) => (
            <TreeNode key={node.key ?? node.id} node={node} depth={0} />
          ))}
        </nav>
        <div className="flex items-center gap-1 border-t border-slate-200 p-2">
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
            disabled={!newTuneTitle.trim() || creating}
            className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + New tune
          </button>
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
