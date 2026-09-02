import { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { TuneRecord } from '../api/tunesClient';
import { videoLoopStore, uiStore } from '../stores';
import { extractYouTubeVideoId } from '../video/youtubeUrl';
import { shouldSeekToLoopStart } from '../video/loopEnforcement';
import { YouTubePlayer, type YouTubePlayerHandle } from '../video/YouTubePlayer';
import { LoopControls } from './LoopControls';

interface Props {
  entry: TuneRecord;
}

export const VideoLoopPanel = observer(function VideoLoopPanel({ entry }: Props) {
  const playerHandle = useRef<YouTubePlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const state = videoLoopStore.entryFor(entry);
  const videoId = extractYouTubeVideoId(state.url);

  function handleTimeUpdate(seconds: number): void {
    setCurrentTime(seconds);
    const { loopEnabled, loopStart, loopEnd } = state;
    if (shouldSeekToLoopStart(seconds, loopEnabled, loopStart, loopEnd) && loopStart !== null) {
      playerHandle.current?.seekTo(loopStart);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs font-medium text-slate-700">Video</span>
        <input
          type="text"
          value={state.url}
          onChange={(e) => videoLoopStore.setUrl(entry, e.target.value)}
          placeholder="YouTube URL or video ID"
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-800"
        />
        <button
          type="button"
          onClick={() => uiStore.toggleVideoPanelExpanded()}
          className="text-xs text-slate-500 underline hover:text-slate-800"
        >
          {uiStore.videoPanelExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {uiStore.videoPanelExpanded && (
        <>
          {/* min-h-0 so this can actually shrink below the video's natural (width-driven) size;
              the video itself is sized by height (aspect-video h-full), not width, so it's the
              one that shrinks — centered here rather than stretched to the panel's full width. */}
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
            {videoId ? (
              <YouTubePlayer ref={playerHandle} videoId={videoId} onTimeUpdate={handleTimeUpdate} />
            ) : (
              <div className="flex aspect-video h-full items-center justify-center bg-slate-100 text-xs text-slate-500">
                Enter a valid YouTube URL to load a video.
              </div>
            )}
          </div>
          <LoopControls
            loopStart={state.loopStart}
            loopEnd={state.loopEnd}
            loopEnabled={state.loopEnabled}
            currentTime={currentTime}
            onSetLoopStart={(seconds) => videoLoopStore.setLoopStart(entry, seconds)}
            onSetLoopEnd={(seconds) => videoLoopStore.setLoopEnd(entry, seconds)}
            onToggleLoopEnabled={() => videoLoopStore.toggleLoopEnabled(entry)}
          />
        </>
      )}
    </div>
  );
});
