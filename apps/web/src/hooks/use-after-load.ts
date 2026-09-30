"use client";

import { useEffect, useState } from "react";

/**
 * How long to wait for an idle moment before giving up and going anyway.
 *
 * A page that never reports one is the page that most needs the heavy thing to
 * stay out of its way, but the heavy thing still has to happen: the deadline
 * turns "when the browser is free" into "soon, and free if possible".
 */
const IDLE_DEADLINE = 2_000;

/** Browsers with no `requestIdleCallback` (Safari, until recently) wait this. */
const FALLBACK_DELAY = 800;

/**
 * False until the document has finished loading and the browser has had a free
 * moment, then true for good.
 *
 * **The site's three heaviest things are all the same shape**, and none of them
 * is what a reader came for: the home page's background video (13 MB, both a
 * webm and an mp4 of it), Twitch's player (2.6 MB and a 446 KB WASM decoder) and
 * a vehicle's model (9.6 MB across thirty-five files). Each one was starting
 * with the page, so each was competing for the bandwidth and the main thread the
 * page needed to paint, and the page lost: measured on the home page as served,
 * a first paint at 8.2 s behind a 60 ms server response.
 *
 * None of them is removed and none of them asks the reader to press anything.
 * They simply go second. It is what Twitch's own developers recommend for their
 * embed, and unlike a click-to-play facade it costs nothing: the video still
 * plays, the stream still starts, the vehicle still stands up on its own.
 *
 * **Waiting for `load` is the half that matters**, the idle callback only
 * smooths the edge: fired mid-load it would do the exact thing this exists to
 * stop.
 */
export function useAfterLoad(): boolean {
  const [passed, setPassed] = useState(false);

  useEffect(() => {
    let live = true;
    let idle: number | undefined;
    let timer: number | undefined;

    const go = () => {
      if (live) setPassed(true);
    };

    const schedule = () => {
      if (!live) return;
      // `typeof`, not `"requestIdleCallback" in window`: the `in` check narrows
      // `window` to `never` on the else branch, where the fallback lives.
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(go, { timeout: IDLE_DEADLINE });
      } else {
        timer = window.setTimeout(go, FALLBACK_DELAY);
      }
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      live = false;
      window.removeEventListener("load", schedule);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return passed;
}
