"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { FeaturedPlayer } from "@/components/home/featured-player";
import { useAfterLoad } from "@/hooks/use-after-load";

/** Twitch hands the preview out as a template rather than a URL. */
function thumb(url: string, w: number, h: number): string {
  return url.replace("{width}", String(w)).replace("{height}", String(h));
}

/**
 * The featured stream: the preview first, the player a moment later, on its own.
 *
 * **The embed is the most expensive thing on the site and it was starting in the
 * middle of the page load.** Twitch's player is a whole application, and
 * mounting it with the rest of the page pulled 159 requests and 2.6 MB of the
 * home page's 4.2 MB, a 446 KB WASM decoder among them, all of it competing for
 * the bandwidth and the main thread the page needed to paint. Measured on the
 * page as served: first paint at 8.2 s and largest paint at 11.9 s on a
 * throttled phone, against a 60 ms server response.
 *
 * So the order changes, not the outcome. Twitch's own preview is a still of the
 * stream at 27 KB, so the band paints immediately with the right picture, and
 * the player is built once the document has loaded and the browser has a free
 * moment. Nobody presses anything: the stream starts by itself, as it always
 * did, having cost the page nothing to get there. This is what Twitch's own
 * developers recommend for the cost, and it is the one mitigation that keeps
 * autoplay, which a click-to-play facade spends.
 *
 * The deadline matters as much as the idle callback. A busy page never reports
 * an idle moment, and that is exactly the page where the stream would otherwise
 * never start.
 */
export function StreamSurface({
  channel,
  parent,
  thumbnailUrl,
  title,
}: {
  channel: string;
  /**
   * The host serving the page, which Twitch's embed requires and which is only
   * known client-side. Null on the server and the first client render, so the
   * preview is what the prerendered HTML carries.
   */
  parent: string | null;
  thumbnailUrl: string;
  title: string;
}) {
  /**
   * Two stages rather than one, and the first is free.
   *
   * Opening the connections to Twitch's hosts is a DNS lookup and a TLS
   * handshake that cost nothing to have already done, and on a phone they are a
   * few hundred milliseconds of the wait. Warming them a beat before the player
   * is built means the player's first request goes out on an open socket.
   */
  const afterLoad = useAfterLoad();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!afterLoad) return;
    // A frame after the preconnects are in the document, so the SDK's first
    // request goes out on a socket that is already open.
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, [afterLoad]);

  return (
    <>
      {/* React hoists these into the head. Rendered only once the page is done
          with its own loading, so the handshakes are spent on the player rather
          than taken from the paint. */}
      {afterLoad ? (
        <>
          <link rel="preconnect" href="https://player.twitch.tv" />
          <link rel="preconnect" href="https://assets.twitch.tv" />
          <link rel="preconnect" href="https://gql.twitch.tv" />
          <link rel="preconnect" href="https://video-weaver.fra02.hls.ttvnw.net" />
        </>
      ) : null}
      {mounted && parent ? (
        <FeaturedPlayer channel={channel} parent={parent} />
      ) : (
        <Image
          src={thumb(thumbnailUrl, 960, 540)}
          alt={title}
          fill
          // The band is the top of the home page, so this is the page's largest
          // paint and it is ours: a 27 KB still rather than a video player.
          priority
          // Twitch's own CDN, on a template URL whose width and height we
          // already pick: routing it through the optimizer would be a second
          // fetch of a picture that changes every few minutes.
          unoptimized
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover"
        />
      )}
    </>
  );
}
