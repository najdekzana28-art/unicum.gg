"use client";

import { useLocale } from "@onruntime/translations/react";
import { Interpolate } from "@/components/interpolate";
import { useTranslation } from "@/hooks/use-translation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  ACTIVITY_WINDOWS,
  type ActivityBand,
  activityIntensity,
  activityRate,
  ActivityWindow,
  bandsWithData,
  DEFAULT_RATING_METRIC,
  type PlayerActivity,
  RATING_COLOR_HEX,
  RATING_METRIC_LABEL,
  type RatingMetric,
  ratingBandLabel,
  ratingMetricFromCookie,
  sumCounts,
  unobservedShare,
} from "@unicum.gg/shared";
import { REGION_LABEL, type Region } from "@unicum.gg/wargaming";
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from "@/components/panel";
import { RatingMetricInlineSelect } from "@/components/rating-metric-inline-select";
import { SegmentedControl } from "@/components/segmented-control";
import STORAGE from "@/constants/storage";
import { useCookie } from "@/hooks/use-cookie";
import { cn } from "@/lib/utils";
import { unicum } from "@/services/sdk";
import { ActivityChart } from "./charts-lazy";
import { formatPlayers, formatPlayersCompact, formatShare } from "./format";

/**
 * Whether each band of the region's players is still playing.
 *
 * The histograms above count how many accounts reached a level, which says
 * nothing about whether they still log in: a band can hold a hundred thousand
 * players who all stopped in 2019. This is the other half, and it is two
 * separate things rather than one, so both are drawn. How many of the band
 * turned up is a share and gets the bar. How much the ones who did played is a
 * count per head and gets a column, because it is measured in battles and
 * putting it on the same axis as a percentage would compare two different units
 * by length.
 *
 * The bar runs against the full scale rather than against the busiest band,
 * since "fewer than half of even the best accounts played this month" is the
 * finding rather than a detail of the drawing, and normalising to the leader
 * would hide it.
 *
 * A series needs at least two days to be a line, so the chart appears when the
 * second one lands and the panel says so until then. That is not a loading
 * state: the counters are measured backwards from the instant they were read,
 * so the history begins when the recording did and no run can fill a day that
 * went unrecorded.
 */
const MIN_SERIES_DAYS = 2;

export function ActivityPanel({
  activity: initial,
  region,
}: {
  activity: PlayerActivity;
  region: Region;
}) {
  const { locale } = useLocale();
  const { t } = useTranslation("components/servers/activity-panel");
  const { t: tWindow } = useTranslation("components/servers/activity-windows");
  const [window, setWindow] = useState<ActivityWindow>(initial.window);
  const isInitial = window === initial.window;

  // Switching the window refetches rather than making the page dynamic, exactly
  // like the population range above: it is another way of reading the same
  // subject, not another page.
  const request = unicum.region(region).players.activity(window);
  const { data, isLoading } = useSWR(
    request.url(),
    async () => (await request) as unknown as PlayerActivity,
    {
      fallbackData: isInitial ? initial : undefined,
      keepPreviousData: true,
      revalidateOnFocus: false,
    },
  );
  const shown = data ?? initial;
  const pending = isLoading && !data;

  // The same cookie the navbar selector writes, like every other panel here.
  const [stored] = useCookie(STORAGE.COOKIES.RATING, DEFAULT_RATING_METRIC);
  const metric: RatingMetric = ratingMetricFromCookie(stored);

  // Best band first, so the panel reads downwards the way a leaderboard does.
  const bands = useMemo(
    () => [...bandsWithData(shown.metrics[metric] ?? [])].reverse(),
    [shown, metric],
  );
  // The region as one population, which is what each band is worth comparing
  // against. Summed from the counters rather than averaged from the rates: the
  // bands differ in size by a factor of twenty, so a mean of their rates would
  // weight the smallest one like the largest.
  const overall = useMemo(
    () =>
      sumCounts(
        bands.map((b) => b.latest).filter((p): p is NonNullable<typeof p> => !!p),
      ),
    [bands],
  );
  const overallRate = activityRate(overall);
  const days = useMemo(
    () => Math.max(0, ...bands.map((b) => b.series.length)),
    [bands],
  );

  const label = REGION_LABEL[region];

  return (
    <Panel>
      <PanelHeader className="flex flex-wrap items-center justify-between gap-3">
        <PanelTitle>{t("who-still-plays", { label })}</PanelTitle>
        <SegmentedControl
          segments={ACTIVITY_WINDOWS.map((id) => ({ id, label: tWindow(id) }))}
          active={window}
          onSelect={setWindow}
        />
      </PanelHeader>
      <PanelContent
        className={cn("p-0 transition-opacity", pending && "opacity-50")}
      >
        <section className="border-b border-fd-border">
          {/* The same heading band the distribution and grid panels use, so the
              three read alike on screen and in the outline. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-fd-border px-4 py-2.5">
            <PanelTitle as="h3" className="text-base">
              <Interpolate
                template={t("metric-band")}
                values={{ metric: <RatingMetricInlineSelect /> }}
              />
            </PanelTitle>
            {overallRate !== null ? (
              <span className="text-sm text-fd-muted-foreground">
                <Interpolate
                  template={t("region-wide-rate")}
                  values={{
                    rate: (
                      <span className="font-medium tabular-nums text-fd-foreground">
                        {formatShare(overallRate, locale)}
                      </span>
                    ),
                  }}
                />
              </span>
            ) : null}
          </div>
          <div className="p-4">
            {bands.length === 0 ? (
              <p className="text-sm text-fd-muted-foreground">
                {t("nothing-recorded", {
                  metric: RATING_METRIC_LABEL[metric],
                })}
              </p>
            ) : (
              <BandTable bands={bands} window={window} />
            )}
          </div>
        </section>

        {days >= MIN_SERIES_DAYS ? (
          <section className="border-b border-fd-border">
            <div className="border-b border-fd-border px-4 py-2.5">
              <PanelTitle as="h3" className="text-base">
                {t("how-it-has-moved")}
              </PanelTitle>
            </div>
            <div className="p-4">
              <ActivityChart
                bands={bands}
                ariaLabel={t("chart-label", { label })}
              />
            </div>
          </section>
        ) : (
          <p className="border-b border-fd-border p-4 text-sm text-fd-muted-foreground">
            {t("series-just-started")}
          </p>
        )}

        <p className="p-4 text-sm text-fd-muted-foreground">
          {t("a-band-s-share-is")}
        </p>
      </PanelContent>
    </Panel>
  );
}

/**
 * One row per band: the share that played, and what the ones who did played.
 *
 * A table rather than a chart, like the battle shares beside it. Nine rows of
 * two figures is a tally, and the bar is inside the cell it belongs to rather
 * than being a chart of its own.
 */
function BandTable({
  bands,
  window,
}: {
  bands: ActivityBand[];
  window: ActivityWindow;
}) {
  const { locale } = useLocale();
  const { t } = useTranslation("components/servers/activity-panel");
  const { t: tWindow } = useTranslation("components/servers/activity-windows");
  // The busiest band, so the battles column can be read as a shape as well as a
  // number. The share needs no such thing: it already has an absolute scale.
  const peak = useMemo(
    () =>
      Math.max(
        0,
        ...bands.map((b) => (b.latest ? (activityIntensity(b.latest) ?? 0) : 0)),
      ),
    [bands],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="text-left text-[11px] font-normal uppercase tracking-wide text-fd-muted-foreground">
            <th scope="col" className="w-24 pb-2 pe-3 font-normal">
              {t("band")}
            </th>
            <th scope="col" className="pb-2 pe-3 font-normal">
              {t("played-in-window", { window: tWindow(window) })}
            </th>
            <th scope="col" className="w-28 pb-2 text-right font-normal">
              {t("battles-each")}
            </th>
          </tr>
        </thead>
        <tbody>
          {bands.map((band) => (
            <BandRow key={band.band} band={band} peak={peak} locale={locale} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BandRow({
  band,
  peak,
  locale,
}: {
  band: ActivityBand;
  peak: number;
  locale: string;
}) {
  const { t } = useTranslation("components/servers/activity-panel");
  const point = band.latest;
  if (!point) return null;
  const rate = activityRate(point);
  const intensity = activityIntensity(point);
  const blind = unobservedShare(point);
  const hex = RATING_COLOR_HEX[band.band];

  return (
    <tr className="border-t border-fd-border/60">
      <th
        scope="row"
        className="py-2 pe-3 text-left text-[11px] font-normal tabular-nums text-fd-muted-foreground"
      >
        {ratingBandLabel({ color: band.band, from: band.from, to: band.to })}
      </th>
      <td className="py-2 pe-3">
        <div className="flex items-center gap-2">
          {/* The track carries the full scale and the fill the band's own
              colour, so a row reads as a share of its own band rather than as a
              share of the busiest one.

              Bordered like the win-rate grid's cells, and for the same reason:
              the bottom band's colour is pure black (the site's own, matching
              what every other table paints it), which on a dark background is
              a bar with no edge. The border bounds the track so the fill is
              legible whatever colour it wears, without inventing a tenth
              colour this one panel would be alone in using. */}
          <div className="h-2.5 min-w-24 flex-1 overflow-hidden rounded-[2px] border border-fd-border/60 bg-fd-border/25">
            <div
              className="h-full rounded-[1px]"
              style={{
                width: `${(rate ?? 0) * 100}%`,
                backgroundColor: hex,
              }}
            />
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums">
            {rate === null ? "-" : formatShare(rate, locale)}
          </span>
          <span className="hidden shrink-0 text-xs text-fd-muted-foreground sm:inline">
            {t("of-observed-accounts", {
              observed: formatPlayersCompact(point.observed, locale),
              blind: blind === null ? "-" : formatShare(blind, locale),
            })}
          </span>
        </div>
      </td>
      <td className="py-2 text-right tabular-nums">
        <div className="flex items-center justify-end gap-2">
          <span
            aria-hidden
            className="hidden h-1.5 rounded-[1px] sm:block"
            style={{
              width: peak > 0 ? `${((intensity ?? 0) / peak) * 3}rem` : 0,
              backgroundColor: hex,
              opacity: 0.45,
            }}
          />
          <span>
            {intensity === null ? "-" : formatPlayers(intensity, locale)}
          </span>
        </div>
      </td>
    </tr>
  );
}
