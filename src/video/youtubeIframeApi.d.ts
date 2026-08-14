export {};

declare global {
  namespace YT {
    type PlayerState = -1 | 0 | 1 | 2 | 3 | 5;

    interface OnStateChangeEvent {
      data: PlayerState;
      target: Player;
    }

    interface PlayerEvents {
      onReady?: (event: { target: Player }) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
    }

    interface PlayerOptions {
      videoId?: string;
      events?: PlayerEvents;
    }

    class Player {
      constructor(elementId: string | HTMLElement, options: PlayerOptions);
      playVideo(): void;
      pauseVideo(): void;
      seekTo(seconds: number, allowSeekAhead: boolean): void;
      getCurrentTime(): number;
      loadVideoById(videoId: string): void;
      destroy(): void;
    }
  }

  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}
