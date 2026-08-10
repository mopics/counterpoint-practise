import { observer } from 'mobx-react-lite';
import { libraryStore } from '../stores';
import { TreeNode } from './TreeNode';

export const Sidebar = observer(function Sidebar() {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-3 py-3">
        <h1 className="text-sm font-bold tracking-wide text-slate-900">Jazz Solo Transcriptions</h1>
        <p className="text-xs text-slate-500">Lick &amp; solo library</p>
      </div>
      <nav className="flex-1 py-2">
        {libraryStore.tree.map((node) => (
          <TreeNode key={node.key ?? node.id} node={node} depth={0} />
        ))}
      </nav>
    </aside>
  );
});
