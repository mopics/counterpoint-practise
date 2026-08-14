import { useEffect, useState } from 'react';
import { formatSeconds, parseTimeInput } from '../video/timeFormat';

interface Props {
  loopStart: number | null;
  loopEnd: number | null;
  loopEnabled: boolean;
  currentTime: number;
  onSetLoopStart: (seconds: number | null) => void;
  onSetLoopEnd: (seconds: number | null) => void;
  onToggleLoopEnabled: () => void;
}

export function LoopControls({
  loopStart,
  loopEnd,
  loopEnabled,
  currentTime,
  onSetLoopStart,
  onSetLoopEnd,
  onToggleLoopEnabled,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-slate-200 px-3 py-2">
      <TimeRow label="Loop start" value={loopStart} onCapture={() => onSetLoopStart(currentTime)} onCommit={onSetLoopStart} />
      <TimeRow label="Loop end" value={loopEnd} onCapture={() => onSetLoopEnd(currentTime)} onCommit={onSetLoopEnd} />
      <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
        <input
          type="checkbox"
          checked={loopEnabled}
          disabled={loopStart === null || loopEnd === null}
          onChange={onToggleLoopEnabled}
        />
        Loop enabled
      </label>
    </div>
  );
}

function TimeRow({
  label,
  value,
  onCapture,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCapture: () => void;
  onCommit: (seconds: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : formatSeconds(value));

  useEffect(() => {
    setText(value === null ? '' : formatSeconds(value));
  }, [value]);

  function commit(): void {
    const parsed = parseTimeInput(text);
    onCommit(parsed);
    setText(parsed === null ? '' : formatSeconds(parsed));
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs font-medium text-slate-700">{label}</span>
      <button
        type="button"
        onClick={onCapture}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
      >
        Set from current
      </button>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="mm:ss"
        className="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-800"
      />
    </div>
  );
}
