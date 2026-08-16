import type { FolderRecord } from '../api/tunesClient';

interface Props {
  trail: FolderRecord[];
  onNavigate: (folderId: string | null) => void;
}

export function Breadcrumb({ trail, onNavigate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
      <button type="button" onClick={() => onNavigate(null)} className="rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-900">
        Library
      </button>
      {trail.map((folder) => (
        <span key={folder.id} className="flex items-center gap-1">
          <span className="text-slate-400">/</span>
          <button
            type="button"
            onClick={() => onNavigate(folder.id)}
            className="rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-900"
          >
            {folder.title}
          </button>
        </span>
      ))}
    </div>
  );
}
