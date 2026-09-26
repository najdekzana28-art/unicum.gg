"use client";

import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The boxes a loadout is drawn as, and the only part of it that is a client
 * component.
 *
 * The split is not decoration. Everything that NAMES a thing happens on the
 * server, in `loadout-panel.tsx`, because the catalogues that name equipment
 * and crew perks never cross the wire. Everything that REACTS to a pointer
 * happens here, because a tooltip is interaction.
 *
 * Measured, and this is why the file exists: rendering the Radix tooltips
 * from inside the server component cost the server rendering of everything
 * they wrapped. The panel came back with one box out of forty-seven and five
 * empty crew rows, and the rest appeared only once hydration had run, which
 * is exactly what a reader notices as "it arrives after the page". With the
 * tooltips removed the same panel server-rendered all forty-seven. So the
 * boxes are drawn here, from data the server already resolved, and they
 * render on both sides.
 */

/** One slot: what is in it, or nothing. */
export interface LoadoutSlotView {
  /** The game's own name, or null for a free slot. */
  name: string | null;
  image: string | null;
  /** The grade badge the game composites on bond, bounty or experimental gear. */
  overlay?: string | null;
  /** Equipment 2.0 categories, drawn as the game's coloured dots. */
  categories?: string[];
}

/** One kind of round the gun fires, and how many are loaded. */
export interface LoadoutShellView {
  id: number;
  kind: string;
  count: number;
  premium: boolean;
  image: string;
}

/** One crew member: who they are, then what they were taught. */
export interface LoadoutCrewView {
  role: string;
  roleImage: string | null;
  skills: { name: string; image: string }[];
}

export function SlotGroup({
  label,
  slots,
}: {
  label: string;
  slots: LoadoutSlotView[];
}) {
  return (
    <Group label={label}>
      {slots.map((slot, index) => (
        <Box
          key={index}
          tip={slot.name ?? undefined}
          filled={!!slot.name}
          overlay={slot.overlay}
          categories={slot.categories}
        >
          {slot.name && slot.image ? (
            <Picture src={slot.image} alt={slot.name} size={26} />
          ) : slot.name ? (
            // Wargaming publishes no picture for this one. Its name is still
            // the answer, so the box carries it rather than a hole.
            <span className="px-0.5 text-center text-[8px] leading-tight text-fd-muted-foreground">
              {slot.name}
            </span>
          ) : null}
        </Box>
      ))}
    </Group>
  );
}

export function ShellGroup({
  label,
  shells,
  goldPercent,
}: {
  label: string;
  shells: LoadoutShellView[];
  goldPercent: number | null;
}) {
  return (
    <Group label={label}>
      {shells.map((shell) => (
        <Box
          key={shell.id}
          tip={`${shell.kind} x ${shell.count}`}
          filled
          accent={shell.premium && shell.count > 0}
          dimmed={shell.count === 0}
        >
          <Picture src={shell.image} alt={shell.kind} size={26} />
          {/* The count on the box rather than beside it, which is where the
              game itself puts it. */}
          <span className="absolute -right-1 -bottom-1.5 rounded bg-fd-background px-0.5 text-[10px] leading-tight font-medium tabular-nums">
            {shell.count}
          </span>
        </Box>
      ))}
      {goldPercent !== null && goldPercent > 0 ? (
        <span className="self-center pl-1 text-xs font-medium tabular-nums text-amber-600 dark:text-amber-400">
          {goldPercent}%
        </span>
      ) : null}
    </Group>
  );
}

export function CrewGroup({
  label,
  crew,
}: {
  label: string;
  crew: LoadoutCrewView[];
}) {
  return (
    <Group label={label}>
      <div className="flex w-full flex-col gap-1">
        {crew.map((member, index) => (
          <div key={index} className="flex flex-wrap items-center gap-1">
            <Box tip={member.role} filled>
              {member.roleImage ? (
                <Picture
                  src={member.roleImage}
                  alt={member.role}
                  size={24}
                  // Inverted in the dark theme: measured, Wargaming's role
                  // badge is a near-black glyph (rgb 36,37,35) drawn to sit
                  // on the crew member's own light portrait, so it all but
                  // vanishes on a dark panel.
                  className="dark:invert"
                />
              ) : (
                <span className="text-[8px] text-fd-muted-foreground">
                  {member.role}
                </span>
              )}
            </Box>
            {member.skills.map((skill) => (
              <Box key={skill.name} tip={skill.name} filled subdued>
                <Picture src={skill.image} alt={skill.name} size={24} />
              </Box>
            ))}
          </div>
        ))}
      </div>
    </Group>
  );
}

/** Everything here shares one tooltip context; Radix needs a provider above. */
export function LoadoutTooltips({ children }: { children: React.ReactNode }) {
  return <TooltipProvider delayDuration={150}>{children}</TooltipProvider>;
}

/** A labelled group of boxes. */
export function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] tracking-wide uppercase text-fd-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap items-start gap-1">{children}</div>
    </div>
  );
}

function Picture({
  src,
  alt,
  size,
  className,
}: {
  src: string;
  alt: string;
  size: number;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * One slot, filled or free.
 *
 * Dashed when free, like the tank page's own empty slot: three devices and two
 * devices are different builds, and a row that quietly shrinks hides which one
 * this is. A free slot carries no tooltip, having nothing to say.
 */
function Box({
  tip,
  filled,
  accent,
  subdued,
  dimmed,
  overlay,
  categories,
  children,
}: {
  tip?: string;
  filled: boolean;
  accent?: boolean;
  subdued?: boolean;
  /** Present but carrying nothing: a round the gun fires and the player does not. */
  dimmed?: boolean;
  overlay?: string | null;
  categories?: string[];
  children?: React.ReactNode;
}) {
  const box = (
    <span
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-lg",
        !filled && "border-2 border-dashed border-fd-border",
        filled && "bg-fd-secondary/30",
        filled && subdued && "border border-fd-border",
        filled && !subdued && "border-2",
        filled && !subdued && accent && "border-amber-500/50",
        filled && !subdued && !accent && "border-fd-border",
        dimmed && "opacity-40",
      )}
    >
      {children}
      {/* The grade badge, composited on top exactly as the game does it: the
          picture underneath is the same one an ordinary device carries.

          Deliberately smaller than the tank page draws it. There the badge is
          half the box, which reads as a corner mark on a 56px tile; at the
          36px these boxes use, the same half swallowed the device it is
          supposed to qualify. It is a mark on a picture, so the picture has
          to stay the thing being looked at. */}
      {overlay ? (
        <Image
          src={overlay}
          alt=""
          aria-hidden
          width={OVERLAY}
          height={OVERLAY}
          className="pointer-events-none absolute top-0 left-0"
          style={{ width: OVERLAY, height: OVERLAY }}
        />
      ) : null}
      {categories?.length ? (
        <span className="absolute -bottom-1 left-1 flex gap-0.5">
          {categories.map((category) => (
            <span
              key={category}
              className="size-1.5 rounded-full ring-1 ring-fd-background"
              style={{ backgroundColor: CATEGORY_COLOR[category] ?? "#666" }}
            />
          ))}
        </span>
      ) : null}
    </span>
  );
  if (!tip) return box;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{box}</TooltipTrigger>
      <TooltipContent side="top">{tip}</TooltipContent>
    </Tooltip>
  );
}

/** The corner badge: a mark, not a second picture. */
const OVERLAY = 15;

// The site's own accent per Equipment 2.0 category (the game paints every
// specialization the same orange). Inlined rather than imported from the tank
// page's `category.ts`, which pulls a core type in behind it and would drag
// server code into this client bundle.
const CATEGORY_COLOR: Record<string, string> = {
  firepower: "#e0524c",
  mobility: "#7db61c",
  survivability: "#4a9fe0",
  stealth: "#e0b23a",
};
