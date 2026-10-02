"use client";

import { format, formatDistanceStrict } from "date-fns";
import Image from "next/image";

import { ClanTag } from "@/components/entity/clan-tag";
import { clanRoleName } from "@/components/game-name";
import Link from "@/components/link";
import { TableCell, TableRow } from "@/components/ui/table";
import ROUTES from "@/constants/routes";
import { useLocale } from "@onruntime/translations/react";
import { useTranslation } from "@/hooks/use-translation";
import { dateLocale } from "@/lib/date-locale";
import { styles } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { clanAddress, type ClanStint } from "@unicum.gg/shared";
import type { Region } from "@unicum.gg/wargaming";

const DAY_FORMAT = "d MMM yyyy";

/**
 * One row of a player's clan history: the clan, the role held in it, and when.
 *
 * Its own file because the table around it had grown past the size this repo
 * keeps files to, and a row that renders itself from a single stint is where
 * that table comes apart cleanly.
 */
export function ClanHistoryRow({
  region,
  stint: s,
}: {
  region: Region;
  stint: ClanStint;
}) {
  const { locale } = useLocale();
  const { t } = useTranslation(
    "components/players/detail/overview/clans-history",
  );
  const { t: tRoles } = useTranslation("game/clan-roles");
  // By address, not by tag: a clan that has ended keeps its page at `TAG-<id>`,
  // and linking it by the bare tag would send the reader to whichever clan
  // holds that name today, which this player was never in.
  const clanHref = ROUTES.CLAN(region, clanAddress(s.clan));
  return (
    <TableRow>
      {/* A clan that has since been disbanded is struck through and drained of
          colour, the same two signals its own page carries, so the row says
          where the link goes before it is followed: an archive, not a clan
          anyone can still join. */}
      <TableCell className="font-semibold">
        <Link href={clanHref} className="hover:underline">
          <ClanTag
            tag={s.clan.tag}
            color={s.clan.color}
            className={cn(
              s.clan.isDisbanded && "text-muted-foreground line-through",
            )}
          />
        </Link>
      </TableCell>
      <TableCell>
        <Link
          href={clanHref}
          className={cn(
            "flex items-center gap-2 whitespace-nowrap hover:underline",
            s.clan.isDisbanded && "text-muted-foreground line-through",
          )}
        >
          {/* Guarded like the clan header's: `emblem` is a non-null column that
              can still hold an empty string (an archive stored while the portal
              was down carries no emblem URL), and `<Image src="">` throws in dev
              and resolves to the page's own URL in production. */}
          {s.clan.emblem && (
            <Image
              src={s.clan.emblem}
              alt={`${s.clan.tag} emblem`}
              width={20}
              height={20}
              className={cn(
                "size-5 shrink-0 rounded-sm",
                s.clan.isDisbanded && "grayscale",
              )}
            />
          )}
          {s.clan.name}
        </Link>
      </TableCell>
      <TableCell className={styles.hiddenColumn}>
        {clanRoleName(s.role, tRoles)}
      </TableCell>
      <TableCell
        className={cn("whitespace-nowrap tabular-nums", styles.hiddenColumn)}
      >
        {format(s.joinedAt, DAY_FORMAT, { locale: dateLocale(locale) })}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {s.leftAt ? (
          format(s.leftAt, DAY_FORMAT, { locale: dateLocale(locale) })
        ) : (
          <span className="text-muted-foreground">{t("current")}</span>
        )}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {formatDistanceStrict(s.joinedAt, s.leftAt ?? new Date())}
      </TableCell>
    </TableRow>
  );
}
