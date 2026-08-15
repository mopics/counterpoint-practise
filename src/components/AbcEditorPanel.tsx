import type { AbcData } from '../content';
import type { SaveStatus } from '../stores/EditorStore';
import { VideoLoopPanel } from './VideoLoopPanel';

interface Props {
  entry: AbcData;
  value: string;
  edited: boolean;
  /** True if this entry has a saved server override, even when there's no in-progress edit right now. */
  hasOverride: boolean;
  saveStatus?: SaveStatus;
  saveError?: string;
  onChange: (text: string) => void;
  onReset: () => void;
  onSave: () => void;
}

export function AbcEditorPanel({ entry, value, edited, hasOverride, saveStatus, saveError, onChange, onReset, onSave }: Props) {
  const canReset = edited || hasOverride;
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-medium text-slate-700">ABC source</span>
        {edited && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            Edited
          </span>
        )}
        {saveStatus === 'saving' && <span className="text-xs text-slate-500">Saving…</span>}
        {saveStatus === 'saved' && <span className="text-xs text-emerald-600">Saved</span>}
        {saveStatus === 'error' && (
          <span className="text-xs text-red-600" title={saveError}>
            Save failed
          </span>
        )}
        {edited && (
          <button
            type="button"
            onClick={onSave}
            disabled={saveStatus === 'saving'}
            className="ml-auto text-xs font-medium text-blue-600 underline hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        )}
        {canReset && (
          <button
            type="button"
            onClick={onReset}
            className={`text-xs text-slate-500 underline hover:text-slate-800 ${edited ? '' : 'ml-auto'}`}
          >
            Reset to original
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none p-3 font-mono text-sm text-slate-800 outline-none"
      />
      <VideoLoopPanel key={entry.key ?? entry.id} entry={entry} />
    </div>
  );
}
