"use client";

import dynamic from "next/dynamic";

// The lazy boundary for the servers page's three charts, and the last one the
// site was missing.
//
// **recharts is the heaviest thing in the client bundle** (107 KB gzipped,
// 372 KB parsed) and every other chart on the site already sits behind a
// boundary like this one. These three did not, and being reachable from more
// than one route entry is what put the library in a chunk the bundler hands to
// every page: measured on the served site, 105 KB of recharts downloaded and
// parsed on the home page, the players landing and a tank page, and executed on
// none of them.
//
// The boundary has to be its own Client Component: the consumers are Server
// Components, and Next does not code-split a Client Component dynamically
// imported from one (nor does it allow `ssr: false` there). `ssr: false` is the
// part that keeps the chunk out of the initial graph, since a server-rendered
// lazy component still has to download it to hydrate.
//
// Each placeholder reserves its chart's own height (the `ChartContainer`'s
// `h-64`/`h-56`), so swapping the real one in shifts nothing.
export const PopulationChart = dynamic(
  () => import("./population-chart").then((m) => m.PopulationChart),
  { ssr: false, loading: () => <div className="h-64 w-full" /> },
);

export const RegionsChart = dynamic(
  () => import("./regions-chart").then((m) => m.RegionsChart),
  { ssr: false, loading: () => <div className="h-56 w-full" /> },
);

export const DistributionChart = dynamic(
  () => import("./distribution-chart").then((m) => m.DistributionChart),
  { ssr: false, loading: () => <div className="h-64 w-full" /> },
);
