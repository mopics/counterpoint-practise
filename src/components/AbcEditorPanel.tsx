interface Props {
  value: string;
  edited: boolean;
  onChange: (text: string) => void;
  onReset: () => void;
}

export function AbcEditorPanel({ value, edited, onChange, onReset }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-medium text-slate-700">ABC source</span>
        {edited && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            Edited
          </span>
        )}
        {edited && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-xs text-slate-500 underline hover:text-slate-800"
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
    </div>
  );
}
