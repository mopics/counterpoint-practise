import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { AbcData } from '../content';
import { libraryStore } from '../stores';

interface Props {
  node: AbcData;
  depth: number;
}

export const TreeNode = observer(function TreeNode({ node, depth }: Props) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isLeaf = !node.children;
  const isSelected = isLeaf && libraryStore.selected.key === node.key;

  if (isLeaf) {
    return (
      <button
        type="button"
        onClick={() => libraryStore.setSelected(node)}
        style={{ paddingLeft: 14 + depth * 14 }}
        className={`block w-full truncate rounded px-2 py-1 text-left text-sm ${
          isSelected ? 'bg-blue-100 font-medium text-blue-900' : 'text-slate-700 hover:bg-slate-100'
        }`}
      >
        {node.title}
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{ paddingLeft: depth * 14 }}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100"
      >
        <span className="inline-block w-3 text-slate-400">{expanded ? '▾' : '▸'}</span>
        {node.title}
      </button>
      {expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.key ?? child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
});
