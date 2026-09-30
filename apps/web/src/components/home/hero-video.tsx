'use client';

import { useEffect } from 'react';
import { PauseIcon, PlayIcon, SpinnerIcon } from '@phosphor-icons/react';
import { useTranslation } from "@/hooks/use-translation";
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { promoVideoAssetUrl } from '@unicum.gg/wargaming';
import STORAGE from '@/constants/storage';
import { useAfterLoad } from '@/hooks/use-after-load';
import { useRegion } from '@/hooks/use-region';
import { useVideoControl } from '@/hooks/use-video-control';
import { cn } from '@/lib/utils';

export function HeroVideo() {
  const { t } = useTranslation("components/home/hero-video");
  const { region } = useRegion();
  const { videoRef, isPlaying, isLoading, isVideoVisible, toggle } = useVideoControl({
    storageKey: STORAGE.LOCAL_STORAGE.HERO_VIDEO_PLAYING,
    defaultPlaying: true
  });
  /**
   * **This band is decoration and it was the heaviest thing on the site.**
   * Measured on the home page as served: 7.2 MB of mp4 AND 6.1 MB of webm, both
   * fetched, 13.2 MB of the page's 14.9 MB, for a loop playing behind the
   * heading. Two things caused it. The element carried no `preload`, so the
   * browser fetched at will, and the hook waits for `canplaythrough`, which
   * means "the whole file is buffered" rather than "playback can start".
   *
   * The sources are therefore not in the document until the page has finished
   * loading, which is what `preload="none"` alone cannot guarantee: a source
   * that is not there cannot be fetched early by anything. The poster and the
   * CSS background stand in meanwhile, which is what the band looked like
   * before the video faded up anyway, and the video still starts by itself.
   */
  const afterLoad = useAfterLoad();

  useEffect(() => {
    const video = videoRef.current;
    if (!afterLoad || !video) return;
    // **Both halves are needed and neither is obvious.** A `<source>` added
    // after the element exists is not looked at: the browser picks a resource
    // when the element is inserted, so the sources appearing a second later
    // reach a video that has already decided it has none. `load()` is what asks
    // it again. And `preload="none"` then means it still fetches nothing, which
    // is the point for a reader whose stored preference is paused, so the one
    // whose preference is playing needs the play to come from here. Both are the
    // cost of the video not being in the document during the page load.
    video.load();
    if (isPlaying) void video.play().catch(() => {});
  }, [afterLoad, isPlaying, videoRef]);

  return (
    <div className="absolute inset-0" style={{backgroundImage: `url('${promoVideoAssetUrl(region, 'promo-mobile.jpg')}')`}}>
      <video
        ref={videoRef}
        loop
        muted
        playsInline
        className={cn(
          "absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-out",
          isVideoVisible ? "opacity-100" : "opacity-0"
        )}
        poster={promoVideoAssetUrl(region, 'poster.jpg')}
        preload="none"
      >
        {afterLoad ? (
          <>
            {/* webm first: it is the smaller of the two (6.1 MB against 7.2),
                so the browsers that can take it take the cheaper one. */}
            <source src={promoVideoAssetUrl(region, 'video-bg.webm')} type="video/webm" />
            <source src={promoVideoAssetUrl(region, 'video-bg.mp4')} type="video/mp4" />
          </>
        ) : null}
      </video>
      
      {/* Video Control Button */}
      <button
        onClick={toggle}
        className={cn(
          buttonVariants({ size: "icon-xs" }),
          "absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20 backdrop-blur-sm border border-white/20 cursor-pointer"
        )}
        aria-label={t("toggle")}
      >
        {isLoading ? (
          <SpinnerIcon className="size-4 animate-spin text-white" />
        ) : isPlaying ? (
          <PauseIcon weight="fill" className="size-4 text-white" />
        ) : (
          <PlayIcon weight="fill" className="size-4 text-white" />
        )}
      </button>
    </div>
  );
}