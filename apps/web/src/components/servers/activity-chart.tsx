"use client";

import { useLocale } from "@onruntime/translations/react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  type ActivityBand,
  activityRate,
  RATING_COLOR_HEX,
  ratingBandLabel,
} from "@unicum.gg/shared";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { dateFormat } from "@/lib/format";
import { formatShare } from "./format";

/**
 * How each band's share of players turning up has moved, one line per band.
 *
 * Lines rather than the stacked areas the population chart uses: these are
 * shares of different denominators, so they do not add up to anything and
 * stacking them would draw a total that does not exist.
 *
 * The share is plotted and the battle count is not. Both are in the table above,
 * but one chart cannot carry a percentage and a count on one axis, and the share
 * is the one that answers whether a band is leaving.
 *
 * Every line keeps the colour its band wears everywhere else on the site, which
 * is what lets nine of them share a frame: the reader matches a strand to a
 * band by a colour they already know rather than by a legend lookup.
 */
export function ActivityChart({
  bands,
  ariaLabel,
}: {
  bands: ActivityBand[];
  ariaLabel: string;
}) {
  const { locale } = useLocale();

  // One row per day with one column per band, which is the shape recharts wants
  // for several lines over one axis. Keyed by the day string the payload carries,
  // so nothing re-parses a date into a timezone.
  const data = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>();
    for (const band of bands) {
      for (const point of band.series) {
        const row = byDay.get(point.day) ?? { day: point.day };
        const rate = activityRate(point);
        if (rate !== null) row[band.band] = rate;
        byDay.set(point.day, row);
      }
    }
    return [...byDay.values()].sort((a, b) =>
      String(a.day).localeCompare(String(b.day)),
    );
  }, [bands]);

  const config = useMemo(
    () =>
      Object.fromEntries(
        bands.map((band) => [
          band.band,
          {
            label: ratingBandLabel({
              color: band.band,
              from: band.from,
              to: band.to,
            }),
            color: RATING_COLOR_HEX[band.band],
          },
        ]),
      ) as ChartConfig,
    [bands],
  );

  // The day is already a calendar day in UTC, so it is formatted from its own
  // parts rather than through a Date: parsing "2026-10-03" and printing it in
  // the reader's zone can move it a day.
  const tick = useMemo(() => {
    const fmt = dateFormat(locale, "d MMM /* UTC */");
    return (day: string) => fmt.format(new Date(`${day}T12:00:00Z`));
  }, [locale]);

  return (
    <ChartContainer config={config} className="h-64 w-full" aria-label={ariaLabel}>
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={tick}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          domain={[0, "auto"]}
          tickFormatter={(value: number) => formatShare(value, locale)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => tick(String(label))}
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-3">
                  <span className="text-fd-muted-foreground">
                    {config[name as string]?.label ?? name}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatShare(Number(value), locale)}
                  </span>
                </span>
              )}
            />
          }
        />
        {bands.map((band) => (
          <Line
            key={band.band}
            type="monotone"
            dataKey={band.band}
            stroke={RATING_COLOR_HEX[band.band]}
            strokeWidth={2}
            dot={false}
            // A band with a gap (a day the cron missed) is drawn as a gap rather
            // than bridged, since a bridge would invent a reading for a day
            // nothing recorded.
            connectNulls={false}
            name={band.band}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
