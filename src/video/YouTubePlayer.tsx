import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface YouTubePlayerHandle {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  getCurrentTime(): number;
}

interface Props {
  videoId: string;
  onTimeUpdate: (seconds: number) => void;
}

const IFRAME_API_URL = 'https://www.youtube.com/iframe_api';

/** Module-level singleton so the IFrame API script loads exactly once per app session. */
let apiReadyPromise: Promise<void> | null = null;

function loadIframeApi(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = IFRAME_API_URL;
    document.head.appendChild(script);
  });

  return apiReadyPromise;
}

/**
 * Hand-rolled wrapper around the YouTube IFrame Player API. The player is
 * created once per mount and updated in place via loadVideoById when
 * videoId changes (not torn down/rebuilt), avoiding reload flicker.
 */
export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer(
  { videoId, onTimeUpdate },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const rafRef = useRef<number | null>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;

  useImperativeHandle(
    ref,
    () => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seekTo: (seconds: number) => playerRef.current?.seekTo(seconds, true),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    function stopPolling(): void {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    function poll(): void {
      const player = playerRef.current;
      if (!player) return;
      onTimeUpdateRef.current(player.getCurrentTime());
      rafRef.current = requestAnimationFrame(poll);
    }

    void loadIframeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: videoIdRef.current,
        events: {
          onStateChange: (event) => {
            if (event.data === 1) {
              stopPolling();
              rafRef.current = requestAnimationFrame(poll);
            } else if (event.data === 2 || event.data === 0) {
              stopPolling();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      stopPolling();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    playerRef.current?.loadVideoById(videoId);
  }, [videoId]);

  return <div ref={containerRef} className="aspect-video w-full" />;
});
