"use client";

import type { ReactNode } from "react";
import { RankMedal } from "@/components/rank-medal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOrdinal } from "@/hooks/use-ordinal";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const DASH = "—";

/**
 * How a team's run ended, as every list on the site states it.
 *
 * Two different numbers, and keeping them apart is the whole point. The final
 * place is the tournament's own result, read by the one rule its bracket page
 * and the winner's crest already share. The group place is the best any single
 * group put the team at, which a tournament drawn into 561 pools hands out 561
 * times: shown as a result, as it was until this component existed, a pool won
 * in a Tier VI daily read as "1st" with a gold medal beside a profile carrying
 * no winner's crest, which is how a player found it.
 *
 * So a group place is never a medal and never a bare ordinal. It says which
 * group it is a place in.
 *
 * Neither is a last place: a double-elimination bracket records no placement at
 * all, and a team that never got out of registration was never placed either.
 * Both fall through to the caller's own `fallback`.
 */
export function TournamentResult({
  finalPlace,
  groupPlace,
  fallback,
  className,
}: {
  finalPlace: number | null;
  groupPlace: number | null;
  /** What to draw when the tournament placed the team nowhere at all. A dash by
   * default; the "my tournaments" panel shows the tournament's status instead,
   * which is the more useful answer while one is still being played. */
  fallback?: ReactNode;
  className?: string;
}) {
  const ord = useOrdinal();
  const { t } = useTranslation("components/tournaments/result");

  if (finalPlace !== null) {
    if (finalPlace <= 3) {
      return (
        <span
          className={cn("flex items-center justify-end gap-1.5 tabular-nums", className)}
        >
          <RankMedal rank={finalPlace as 1 | 2 | 3} className="h-4" />
          {ord(finalPlace)}
        </span>
      );
    }
    return (
      <span className={cn("tabular-nums", className)}>{ord(finalPlace)}</span>
    );
  }

  if (groupPlace !== null) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "cursor-help text-fd-muted-foreground underline decoration-dotted underline-offset-4 tabular-nums",
                className,
              )}
            >
              {t("in-group", { place: ord(groupPlace) })}
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("in-group-hint")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <span className={cn("text-fd-muted-foreground", className)}>
      {fallback ?? DASH}
    </span>
  );
}
