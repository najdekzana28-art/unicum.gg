"use client";

import { ScalesIcon } from "@phosphor-icons/react";
import { useRouter } from "@/hooks/use-router";
import type { Region } from "@unicum.gg/wargaming";
import { TankSearchPopover } from "@/components/tanks/tank-search-popover";
import ROUTES from "@/constants/routes";
import { formatTankRef, TankClient } from "@unicum.gg/shared";
import { useTranslation } from "@/hooks/use-translation";
import {
  encodeSetups,
  SETUP_PARAM,
} from "@/components/tanks/detail/specifications/config-url";

/**
 * Put this vehicle up against another: pick a second tank and land on the
 * comparison with both columns, this one carrying the build currently on screen
 * (the other opens on its top modules, like every unseeded column).
 *
 * Picking THIS vehicle is allowed, and is the shortest way to the question a
 * reader on a tank page actually has: this build against another of the same
 * tank. Both columns then open on the build that is on screen, so the reader
 * changes one side and reads what moved rather than rebuilding it twice.
 *
 * It takes the build's *portable* token, the one that spells its modules out: a
 * comparison column opens on the top configuration where a tank page opens on
 * stock, so the short token would land this vehicle on modules the reader never
 * chose.
 *
 * The counterpart of `CopyToTank`, which moves a build sideways. This one keeps
 * the build where it is and adds something to read it against.
 */
export function CompareWithTank({
  region,
  slug,
  /** The build's portable setup token, or null when it is pristine. */
  setupToken,
  /** How the mark is drawn, since the two places that offer it are not alike. */
  triggerClassName = "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-fd-border bg-fd-secondary/30 text-fd-muted-foreground transition-colors hover:bg-fd-secondary hover:text-fd-foreground",
}: {
  region: Region;
  slug: string;
  setupToken: string | null;
  triggerClassName?: string;
}) {
  const { t: tView } = useTranslation("components/tanks/detail/viewer");
  const router = useRouter();

  return (
    <TankSearchPopover
      region={region}
      onPick={(tank) => {
        // Nothing is excluded, so the second column may be this vehicle again.
        // It has to say so: a repeat spelled exactly like the column already
        // there collapses, and `~2` is what makes it a column of its own.
        const again = tank.slug === slug;
        const second = again
          ? formatTankRef({ slug, client: TankClient.Live, occurrence: 2 })
          : tank.slug;
        const href = ROUTES.COMPARE_TANKS(region, [slug, second]);
        const setups = encodeSetups([setupToken, again ? setupToken : null]);
        router.push(setups ? `${href}?${SETUP_PARAM}=${setups}` : href);
      }}
      triggerAriaLabel={tView("compare-tank")}
      tooltip={tView("compare-tank")}
      placeholder={tView("compare-tank-placeholder")}
      triggerClassName={triggerClassName}
      triggerContent={<ScalesIcon className="size-3.5" weight="bold" />}
    />
  );
}
