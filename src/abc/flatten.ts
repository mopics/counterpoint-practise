import type * as abcjs from 'abcjs';
import type { BarMarker, FlattenedTune, NotationEvent, NotationLine, NotationPitch } from './types';

// abcjs's own `VoiceItemNote`/`VoiceItemBar` type declarations only cover the
// fields abcjs itself always sets; at runtime (verified against parseOnly output)
// notes/bars carry a good deal more structured data than the shipped types admit.
// These local interfaces describe what we actually observe and rely on.
interface RawPitch {
  pitch: number;
  name: string;
  accidental?: string;
  verticalPos: number;
  startTie?: unknown;
  endTie?: boolean;
  startSlur?: { label: number }[];
  endSlur?: number[];
}

interface RawNoteItem {
  el_type: 'note';
  startChar: number;
  endChar: number;
  duration: number;
  rest?: { type: string };
  pitches?: RawPitch[];
  chord?: { name: string; position?: string }[];
  decoration?: string[];
  style?: string;
  gracenotes?: { pitch: number; name: string; verticalPos: number }[];
  startBeam?: true;
  endBeam?: true;
  startTriplet?: number;
  endTriplet?: true;
  tripletMultiplier?: number;
  tripletR?: number;
}

interface RawBarItem {
  el_type: 'bar';
  type: string;
  startEnding?: string;
  endEnding?: boolean;
}

function toNotationEvent(item: RawNoteItem, measureIndex: number): NotationEvent {
  const pitches: NotationPitch[] | undefined = item.pitches?.map((p) => ({
    pitch: p.pitch,
    name: p.name,
    accidental: p.accidental,
    verticalPos: p.verticalPos,
    tieStart: !!p.startTie,
    tieEnd: !!p.endTie,
    slurStart: p.startSlur?.map((s) => s.label) ?? [],
    slurEnd: p.endSlur ?? [],
  }));

  return {
    kind: item.rest ? 'rest' : 'note',
    startChar: item.startChar,
    endChar: item.endChar,
    measureIndex,
    duration: item.duration,
    pitches,
    chordSymbol: item.chord?.map((c) => c.name).join(' ') || undefined,
    decorations: item.decoration ?? [],
    noteheadStyle: item.style,
    grace: item.gracenotes?.map((g) => ({ pitch: g.pitch, name: g.name, verticalPos: g.verticalPos })),
    beamStart: !!item.startBeam,
    beamEnd: !!item.endBeam,
    tripletStart:
      item.startTriplet !== undefined
        ? { r: item.tripletR ?? item.startTriplet, multiplier: item.tripletMultiplier ?? 1 }
        : undefined,
    tripletEnd: !!item.endTriplet,
  };
}

/**
 * Walks abcjs's parsed TuneObject and produces a flattened, renderer/cursor/
 * selection-friendly line+event model. Only the first voice of the first
 * staff per tune-line is used (this app renders monophonic melody lines).
 *
 * abcjs treats inline `T:` (or `P:`) markers appearing after the tune body
 * starts as separate "subtitle" tune-lines rather than as VoiceItemPart
 * elements — confirmed empirically against the real transcription data,
 * where section labels are authored as mid-tune `T:A` / `T:B` lines. We
 * carry that label forward onto the next staff-bearing line.
 */
export function flattenTune(tune: abcjs.TuneObject): FlattenedTune {
  const lines: NotationLine[] = [];
  let pendingPartLabel: string | undefined;
  let lineIndex = 0;

  for (const tuneLine of tune.lines) {
    if (tuneLine.subtitle) {
      pendingPartLabel = tuneLine.subtitle.text;
      continue;
    }
    if (!tuneLine.staff?.length) continue;

    const events: NotationEvent[] = [];
    const bars: BarMarker[] = [];
    let measureIndex = 0;

    const voice = tuneLine.staff[0].voices?.[0];
    if (voice) {
      for (const item of voice as unknown as (RawNoteItem | RawBarItem | { el_type: string })[]) {
        if (item.el_type === 'bar') {
          const bar = item as RawBarItem;
          bars.push({
            eventIndex: events.length,
            type: bar.type,
            startEnding: bar.startEnding,
            endEnding: bar.endEnding,
          });
          measureIndex++;
          continue;
        }
        if (item.el_type !== 'note') continue;
        events.push(toNotationEvent(item as RawNoteItem, measureIndex));
      }
    }

    lines.push({ lineIndex, partLabel: pendingPartLabel, events, bars });
    pendingPartLabel = undefined;
    lineIndex++;
  }

  const key = tune.getKeySignature();
  const meter = tune.getMeter();
  const meterStr =
    meter.type === 'common_time'
      ? 'C'
      : meter.type === 'cut_time'
        ? 'C|'
        : meter.value?.map((v) => `${v.num}/${v.den}`).join(' ') ?? '';

  return {
    lines,
    title: tune.metaText.title ?? '',
    key: `${key.root ?? ''}${key.acc ?? ''}${key.mode ?? ''}`,
    meter: meterStr,
    qpm: tune.getBpm(),
  };
}
