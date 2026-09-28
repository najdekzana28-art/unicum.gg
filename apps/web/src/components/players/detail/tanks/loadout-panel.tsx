import {
  iconUrl,
  isSkillTree,
  premiumShellShare,
  type LoadoutCrewMember,
  type StoredPlayerLoadout,
} from "@unicum.gg/shared";
import { crewRoleBadgeUrl, isRegion, type Region } from "@unicum.gg/wargaming";
import {
  crewSkillIcon,
  loadoutIcons,
  type LoadoutIcon,
} from "@unicum.gg/core/tanks/loadout-icons";
import { getTankCrew } from "@unicum.gg/core/wargaming/wot/tanks/crew";
import {
  CrewGroup,
  Group,
  LoadoutTooltips,
  ShellGroup,
  SlotGroup,
  type LoadoutCrewView,
  type LoadoutSlotView,
} from "@/components/players/detail/tanks/loadout-boxes";
import { gradeOverlay } from "@/components/players/detail/tanks/loadout-marks";
import { getTranslation } from "@/lib/translations.server";
import { RelativeTime } from "@/components/relative-time";

// WG's own shell-type pictures, from our assets mirror, keyed by the kind of
// round the client reports. The same ones the tank page's ammo panel draws.
const AMMO_ICONS = iconUrl("ammopanel/ammo");

/**
 * How this player has set this vehicle up.
 *
 * A **server** component, and everything it does is naming: the catalogues
 * that name equipment, consumables, directives, crew perks and roles in the
 * reader's own language are stripped before the dictionaries cross the wire
 * (`SERVER_ONLY_NAMESPACES`), so a client component asking for one gets its
 * key back. What it hands down is finished text and finished URLs.
 *
 * The boxes themselves are drawn by `loadout-boxes.tsx`, which is a client
 * component because a tooltip is interaction. That split is load-bearing
 * rather than tidy: rendering the tooltips from here cost the server
 * rendering of everything they wrapped, measured at one box out of
 * forty-seven, the rest appearing only once hydration had run.
 *
 * It reads as the tank page's own build does, because it is the same thing
 * seen from the other side: that page asks what a vehicle CAN mount, this one
 * shows what one player DID.
 */
export async function PlayerTankLoadoutPanel({
  loadout,
  region,
  locale,
}: {
  loadout: StoredPlayerLoadout;
  region: string;
  locale: string;
}) {
  const [
    { t: tEquipment },
    { t: tPerks },
    { t: tRoles },
    { t: tGame },
    { t },
    icons,
    seats,
  ] = await Promise.all([
    getTranslation("game/equipment", locale),
    getTranslation("game/crew-perks", locale),
    getTranslation("game/crew-roles", locale),
    getTranslation("game/vocabulary", locale),
    getTranslation("components/players/detail/tanks/loadout-panel", locale),
    isRegion(region)
      ? loadoutIcons(region as Region, loadout.tankId)
      : Promise.resolve(new Map<string, LoadoutIcon>()),
    // The seats this vehicle HAS, which is a fact about the tank rather than
    // about the player. Without it an unmanned vehicle draws no crew at all,
    // and "nobody in it" reads exactly like "we were never told".
    isRegion(region)
      ? getTankCrew(region as Region, loadout.tankId).then(
          (crew) => crew?.members.map((member) => member.roles[0] ?? "crew") ?? [],
        )
      : Promise.resolve([] as string[]),
  ]);

  // Every setup, not only the one in use: a second setup is a build the
  // player deliberately keeps, and showing one of two said nothing about
  // which. The groups carry their own active index because the client lets
  // them switch independently.
  const ammoGroup = loadout.setups?.ammo;
  const devicesGroup = loadout.setups?.devices;
  const ammoLayouts = ammoGroup?.layouts ?? [];
  const deviceLayouts = devicesGroup?.layouts ?? [];

  /**
   * One slot, named and pictured.
   *
   * The catalogue names a device as Wargaming does and the dictionary names
   * it as the game's own client does. They agree, and where the catalogue has
   * nothing the dictionary still answers, so it is the fallback rather than
   * the other way round: only the catalogue carries a picture.
   */
  const slot = (key: string | null): LoadoutSlotView => {
    if (!key) return { name: null, image: null };
    const entry = icons.get(key);
    return {
      name: entry?.name || tEquipment(key),
      image: entry?.image ?? null,
      overlay: gradeOverlay(entry),
      categories: entry?.categories,
    };
  };

  const shellRows = ammoLayouts.map((layout) => ({
    shells: layout.shells.map((shell) => ({
      id: shell.id,
      // AP, APCR, HEAT, HE, in the reader's language. The same block the tank
      // page's own module nodes read, so the two pages call a round the same.
      kind: tGame(`shells.${shell.type}`) || shell.type,
      count: shell.count,
      premium: shell.premium,
      image: `${AMMO_ICONS}/${shell.type}.png`,
    })),
    goldPercent: (() => {
      const share = premiumShellShare(layout);
      return share === null ? null : Math.round(share * 100);
    })(),
  }));

  /**
   * One row per seat the vehicle has, whoever is sitting in it.
   *
   * Joined by role rather than by position: what the mod sends is the members
   * it found, and a vehicle with a gap in its crew sends a shorter list than
   * it has seats, so index two on one side is not index two on the other. A
   * role names a seat well enough, and where two seats share one (a second
   * loader) either of them will do, since both draw the same badge.
   *
   * An unclaimed seat is drawn rather than dropped. The mod already fills the
   * seats of a vehicle whose crew is off driving another one, reading the
   * crew that last took it into battle, so a seat still empty here is a seat
   * the player has genuinely never put anybody in.
   */
  const waiting = new Map<string, LoadoutCrewMember[]>();
  for (const member of loadout.crew ?? []) {
    const queue = waiting.get(member.role);
    if (queue) queue.push(member);
    else waiting.set(member.role, [member]);
  }
  const rows = seats.length
    ? seats.map((role) => ({ role, member: waiting.get(role)?.shift() }))
    : // A vehicle whose composition we cannot read: fall back to what the
      // player sent, which is the only thing we know about its crew.
      (loadout.crew ?? []).map((member) => ({ role: member.role, member }));

  const crew: LoadoutCrewView[] = rows.map(({ role, member }) => ({
    role: tRoles(role),
    empty: !member,
    emptyLabel: t("seat-empty"),
    roleImage: isRegion(region)
      ? crewRoleBadgeUrl(region as Region, role)
      : null,
    skills: (member?.skills ?? []).map((name) => ({
      name: tPerks(name),
      image: crewSkillIcon(name),
    })),
  }));

  const progression = loadout.progression;
  const fieldMods =
    progression && !isSkillTree(progression) && progression.pairs.length
      ? {
          label: `${t("field-mods")} ${progression.level}`,
          // A pair's two sides are separate entries in the game's own
          // catalogue, keyed by the pair's name and a suffix, so the side
          // chosen is what names the entry.
          names: progression.pairs.map((pair) =>
            tEquipment(`${pair.name}_${pair.side === "first" ? 1 : 2}`),
          ),
        }
      : null;

  return (
    <LoadoutTooltips>
      {/* No padding of its own: the panel's body already carries `p-4` and
          spaces its sections with `gap-4`, so a second inset here pushed this
          one block further in than every block above it. */}
      <section className="border-t border-fd-border pt-4">
        <header className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("title")}</h3>
          <span className="text-xs text-fd-muted-foreground">
            <RelativeTime date={loadout.updatedAt} />
          </span>
        </header>

        {/* The four things a tank carries into battle, side by side rather
            than stacked: they are read together, and four rows of three boxes
            filled the panel with more label than content. Wraps group by
            group on a narrow screen. */}
        <div className="mb-4 flex flex-wrap items-start gap-x-5 gap-y-3">
          {deviceLayouts.length > 0 ? (
            <SlotGroup
              label={t("equipment")}
              layouts={deviceLayouts.map((layout) =>
                layout.optDevices.map(slot),
              )}
              active={devicesGroup?.active ?? 0}
            />
          ) : null}
          {/* Whenever the vehicle HAS the slots, not whenever the player
              filled one. Carrying no directive is a decision like carrying no
              standard AP, and hiding the row made "they run none" look
              exactly like "this vehicle takes none". The only reason to draw
              nothing is a vehicle with no such slot at all. */}
          {deviceLayouts.some((layout) => layout.boosters.length > 0) ? (
            <SlotGroup
              label={t("directives")}
              layouts={deviceLayouts.map((layout) => layout.boosters.map(slot))}
              active={devicesGroup?.active ?? 0}
            />
          ) : null}
          {ammoLayouts.length > 0 ? (
            <SlotGroup
              label={t("consumables")}
              layouts={ammoLayouts.map((layout) =>
                layout.consumables.map(slot),
              )}
              active={ammoGroup?.active ?? 0}
            />
          ) : null}
          {shellRows.some((row) => row.shells.length > 0) ? (
            <ShellGroup
              label={t("ammo")}
              layouts={shellRows}
              active={ammoGroup?.active ?? 0}
            />
          ) : null}
        </div>

        {crew.length > 0 ? <CrewGroup label={t("crew")} crew={crew} /> : null}

        {fieldMods ? (
          <div className="mt-4">
            <Group label={fieldMods.label}>
              {fieldMods.names.map((name) => (
                <span
                  key={name}
                  className="rounded border border-fd-border px-1.5 py-0.5 text-xs"
                >
                  {name}
                </span>
              ))}
            </Group>
          </div>
        ) : null}

      </section>
    </LoadoutTooltips>
  );
}
