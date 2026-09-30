import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useLocalStorage } from 'usehooks-ts';

interface UseVideoControlOptions {
  storageKey?: string;
  defaultPlaying?: boolean;
}

export function useVideoControl({
  storageKey = 'video-playing',
  defaultPlaying = true,
}: UseVideoControlOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // False on the server and on the hydration render, true after. `useIsMounted`
  // reads a ref, which no render is watching, so the value that revealed the
  // mount used to be the setState in the effect below. This is the same signal
  // without the extra state.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Null until the element has reported something, so the stored preference
  // answers for it in the meantime. Mirroring that preference into state from
  // an effect was the same value held twice, and it made the first paint after
  // mount a second render.
  const [reportedPlaying, setReportedPlaying] = useState<boolean | null>(null);
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  const [savedPlayingState, setSavedPlayingState] = useLocalStorage(storageKey, defaultPlaying);

  const isPlaying = reportedPlaying ?? savedPlayingState;
  // Loading is exactly "the browser has not run yet": localStorage is only
  // readable there, so before mount there is no preference to honour.
  const isLoading = !hydrated;

  useEffect(() => {
    if (isLoading) return;

    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setReportedPlaying(true);
      setIsVideoVisible(true);
      if (!document.hidden) {
        setSavedPlayingState(true);
      }
    };
    
    const handlePause = () => {
      setReportedPlaying(false);
      if (!document.hidden) {
        setSavedPlayingState(false);
      }
    };

    const tryAutoplay = async () => {
      if (isPlaying && video.paused) {
        try {
          await video.play();
        } catch (error) {
          console.warn('Autoplay prevented by browser:', error);
          setReportedPlaying(false);
          if (!document.hidden) {
            setSavedPlayingState(false);
          }
        }
      }
    };

    // **`canplay`, not `canplaythrough`.** The two differ by the whole file:
    // `canplaythrough` fires once the browser believes it can play to the end
    // without stopping, so waiting for it is asking for every byte up front,
    // which is how a decorative loop came to be 13 MB of a 15 MB page. `canplay`
    // fires as soon as there is enough to start, and a looping muted background
    // that buffers as it goes is the same thing to look at.
    const handleCanPlay = () => {
      setTimeout(() => {
        tryAutoplay();
      }, 100);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const actuallyPlaying = !video.paused;
        setReportedPlaying(actuallyPlaying);
        setSavedPlayingState(actuallyPlaying);
      }
    };
    
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('canplay', handleCanPlay);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // `>= 3` for the same reason: HAVE_FUTURE_DATA is what `canplay` reports,
    // and the element may already be there when this effect runs.
    if (video.readyState >= 3) {
      setTimeout(() => {
        tryAutoplay();
      }, 100);
    }

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('canplay', handleCanPlay);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLoading, isPlaying, setSavedPlayingState]);

  const play = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.play();
    }
  }, []);

  const pause = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, []);

  const toggle = useCallback(() => {
    if (!videoRef.current) return;
    
    if (videoRef.current.paused) {
      play();
    } else {
      pause();
    }
  }, [play, pause]);

  return {
    videoRef,
    isPlaying: hydrated && isPlaying,
    isLoading,
    isVideoVisible: hydrated && isVideoVisible,
    play,
    pause,
    toggle,
  };
}