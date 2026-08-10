import { observer } from 'mobx-react-lite';
import { playbackStore } from '../stores';

function Button({
  onClick,
  disabled,
  active,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
      } border border-slate-300`}
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
      <Button onClick={() => playbackStore.play()} disabled={isLoading || isPlaying}>
        ▶ Play
      </Button>
      <Button onClick={() => playbackStore.pause()} disabled={isLoading || !isPlaying}>
        ⏸ Pause
      </Button>
      <Button onClick={() => playbackStore.stop()} disabled={isLoading || playbackStore.status === 'idle'}>
        ⏹ Stop
      </Button>
      <div className="mx-2 h-5 w-px bg-slate-200" />
      <Button onClick={() => playbackStore.toggleLoopEnabled()} disabled={!hasSelection} active={playbackStore.loopEnabled}>
        🔁 Loop selection
      </Button>
      <Button onClick={() => playbackStore.clearLoop()} disabled={!hasSelection}>
        Clear selection
      </Button>
      <div className="mx-2 h-5 w-px bg-slate-200" />
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
        <span className="w-14 text-xs tabular-nums text-slate-500">
          {playbackStore.swing <= 50 ? 'Straight' : `${playbackStore.swing}%`}
        </span>
      </div>
      <div className="ml-auto text-xs text-slate-500">
        {isLoading
          ? 'Loading…'
          : hasSelection
            ? playbackStore.loopEnabled
              ? 'Looping selected region — drag on the staff to change it'
              : 'Region selected — enable loop or press Play'
            : 'Click or drag on the staff to select a loop region'}
      </div>
    </div>
  );
});
