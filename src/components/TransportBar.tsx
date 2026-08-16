import { observer } from 'mobx-react-lite';
import { playbackStore, uiStore, editorStore, libraryStore } from '../stores';
import { writePrintPayload } from '../print/printHandoff';

function Button({
  onClick,
  tooltip,
  disabled,
  active,
  className,
  children,
}: {
  onClick: () => void;
  tooltip?: string,
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
        } border border-slate-300 ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

export const TransportBar = observer(function TransportBar() {
  const isLoading = playbackStore.status === 'loading';
  const isPlaying = playbackStore.status === 'playing';
  const hasSelection = !!(playbackStore.loopStart && playbackStore.loopEnd);

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <div className="flex items-center gap-2 border-slate-200 bg-white px-4 py-2">
        <Button onClick={() => playbackStore.play()} disabled={isLoading || isPlaying}>
          ▶
        </Button>
        <Button onClick={() => playbackStore.pause()} disabled={isLoading || !isPlaying}>
          ⏸
        </Button>
        <Button onClick={() => playbackStore.stop()} disabled={isLoading || playbackStore.status === 'idle'}>
          ⏹
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="swing-range" className="text-sm font-medium text-slate-700">
          Swing
        </label>
        <input
          id="swing-range"
          type="range"
          min={50}
          max={75}
          step={1}
          value={playbackStore.swing}
          onChange={(e) => playbackStore.setSwing(Number(e.target.value))}
          className="w-28 accent-blue-600"
        />
        <div className="w-14 text-xs tabular-nums text-slate-500">
          {playbackStore.swing <= 50 ? 'Straight' : `${playbackStore.swing}%`}
        </div>
      </div>
      <div className="mx-2 h-5 w-px bg-slate-200" />
      <div className="flex flex-col gap-1">
        <div>
          <Button tooltip="toggle loop" className="mr-2" onClick={() => playbackStore.toggleLoopEnabled()} disabled={!hasSelection} active={playbackStore.loopEnabled}>
            🔁
          </Button>
          <Button onClick={() => playbackStore.clearLoop()} disabled={!hasSelection}>
            Clear selection
          </Button>
        </div>
        {/* <div className="text-xs text-slate-500">
          {isLoading
            ? 'Loading…'
            : hasSelection
              ? playbackStore.loopEnabled
                ? 'Looping selected region — drag on the staff to change it'
                : 'Region selected — enable loop or press Play'
              : 'Click or drag on the staff to select a loop region'}
        </div> */}
      </div>
      <div className="mx-2 h-5 w-px bg-slate-200" />
      <Button tooltip="Toggle numeric scale degrees" onClick={() => uiStore.toggleNumeralMode()} active={uiStore.numeralMode}>
        🔢
      </Button>
      <Button tooltip="Print"
        disabled={!libraryStore.selected}
        onClick={() => {
          const entry = libraryStore.selected;
          if (!entry) return;
          writePrintPayload(editorStore.currentAbcSource(entry), entry.title);
          window.open('/print', '_blank');
        }}
      >
        🖨
      </Button>
      <div className="mx-2 h-5 w-px bg-slate-200" />
    </div>
  );
});
