import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { libraryStore, uiStore } from '../stores';
import { TCA_INSTRUMENT_PRESETS } from '../abc/tcaInstruments';
import { generateTcaTriads, renderTcaAbc, type ExerciseType } from '../abc/tcaGenerator';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Friendly display label (e.g. "Ab2" spelled as "G#2") — distinct from midiToAbcNote, whose output is ABC-token spelling, not a UI label. */
function midiToDisplayName(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  1: '1: Major triads',
  2: '2: Major & minor',
  3: '3: Major, minor, diminished & augmented',
};

/** Inline, collapsible form for generating a George Garzone TCA (Triadic Chromatic Approach) exercise into the library. */
export const TcaGeneratorForm = observer(function TcaGeneratorForm() {
  const [expanded, setExpanded] = useState(false);
  const [exerciseType, setExerciseType] = useState<ExerciseType>(uiStore.tcaLastExerciseType);
  const initialPreset =
    TCA_INSTRUMENT_PRESETS.find((p) => p.key === uiStore.tcaLastInstrumentKey) ?? TCA_INSTRUMENT_PRESETS[0];
  const [instrumentKey, setInstrumentKey] = useState(initialPreset.key);
  const [low, setLow] = useState(initialPreset.low);
  const [high, setHigh] = useState(initialPreset.high);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstrumentChange = (key: string) => {
    setInstrumentKey(key);
    const preset = TCA_INSTRUMENT_PRESETS.find((p) => p.key === key);
    if (preset) {
      setLow(preset.low);
      setHigh(preset.high);
    }
    uiStore.setTcaLastInstrumentKey(key);
  };

  const handleExerciseTypeChange = (type: ExerciseType) => {
    setExerciseType(type);
    uiStore.setTcaLastExerciseType(type);
  };

  const handleGenerate = async () => {
    if (submitting) return;
    setError(null);
    const instrumentLabel = TCA_INSTRUMENT_PRESETS.find((p) => p.key === instrumentKey)?.label ?? 'Custom Range';
    const title = `TCA Exercise ${exerciseType} — ${instrumentLabel}`;
    let abc: string;
    try {
      const triads = generateTcaTriads({ startRoot: low, exerciseType, low, high });
      abc = renderTcaAbc(triads, title);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setSubmitting(true);
    const created = await libraryStore.createTune(title, abc);
    setSubmitting(false);
    if (created) setExpanded(false);
    else alert('Could not create the exercise — check the server is running and try again.');
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded px-2 py-1 text-left text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        + Generate TCA exercise…
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded border border-slate-200 bg-white p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Generate TCA exercise</span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Close"
          className="text-xs text-slate-400 hover:text-slate-700"
        >
          ✕
        </button>
      </div>

      <select
        value={exerciseType}
        onChange={(e) => handleExerciseTypeChange(Number(e.target.value) as ExerciseType)}
        className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-blue-400"
      >
        {([1, 2, 3] as const).map((type) => (
          <option key={type} value={type}>
            {EXERCISE_TYPE_LABELS[type]}
          </option>
        ))}
      </select>

      <select
        value={instrumentKey}
        onChange={(e) => handleInstrumentChange(e.target.value)}
        className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-blue-400"
      >
        {TCA_INSTRUMENT_PRESETS.map((preset) => (
          <option key={preset.key} value={preset.key}>
            {preset.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1">
        <label className="flex flex-1 items-center gap-1 text-xs text-slate-600">
          Low
          <input
            type="number"
            value={low}
            onChange={(e) => setLow(Number(e.target.value))}
            className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-blue-400"
          />
        </label>
        <span className="w-10 shrink-0 text-right text-[11px] text-slate-400">{midiToDisplayName(low)}</span>
      </div>
      <div className="flex items-center gap-1">
        <label className="flex flex-1 items-center gap-1 text-xs text-slate-600">
          High
          <input
            type="number"
            value={high}
            onChange={(e) => setHigh(Number(e.target.value))}
            className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-blue-400"
          />
        </label>
        <span className="w-10 shrink-0 text-right text-[11px] text-slate-400">{midiToDisplayName(high)}</span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={submitting}
        className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Generate
      </button>
    </div>
  );
});
