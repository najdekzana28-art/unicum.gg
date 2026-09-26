"use client";

import { forwardRef, type ReactNode } from "react";
import { Slot } from "radix-ui";

import { ScrollRail } from "@/components/scroll-rail";
import { cn } from "@/lib/utils";

// A segmented row of pills: the site's filter control, used by the tank and
// map galleries, the leaderboards and the glossary index. A primitive rather
// than part of any one of them, which is also where the Radix import belongs.

/**
 * The row itself, which scrolls rather than wraps and says so with the rail's
 * arrow, like the tab bars.
 *
 * It had a native scrollbar, and that is what a reader is told nothing by: the
 * tank catalogue's eleven nations hide 168px of themselves on a phone, the
 * overlay bar appears only once you are already scrolling, and on Windows the
 * permanent one is drawn straight through the chips. `compact` because the row
 * is a single line of them, where the full-size button is taller than the row.
 *
 * `overflow-hidden` on the frame rather than the scroller, since the two are no
 * longer the same box: the rounded corners are here and the chips slide past
 * them.
 */
export function ChipRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ScrollRail
      compact
      containerClassName={cn(
        "w-fit max-w-full overflow-hidden rounded-md border border-fd-border",
        className,
      )}
      className="flex"
    >
      {children}
    </ScrollRail>
  );
}

export const Chip = forwardRef<
  HTMLButtonElement,
  { active: boolean; asChild?: boolean } & React.ComponentProps<"button">
>(({ active, asChild, className, children, ...props }, ref) => {
  // A chip that navigates rather than toggles renders as whatever it wraps (a
  // link), so a filter can be a real URL where that is the better page.
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: "button" as const })}
      {...props}
      className={cn(
        // `inline-flex`, not the button's default block box: the preflight
        // sets `svg { display: block }`, so a chip carrying an icon (the
        // Featured star) stacked it above its own label and grew taller than
        // every chip beside it. Text-only chips are unaffected.
        //
        // `shrink-0` because the row is a scroller: a flex child shrinks by
        // default, so eleven nation flags in a phone-width row were squeezed to
        // under half their width instead of scrolling, and a flag whose height
        // is fixed and whose width is squeezed is simply the wrong picture.
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border-r border-fd-border px-3 py-1.5 font-medium transition-colors last:border-r-0",
        active
          ? "bg-fd-secondary/50 text-fd-foreground"
          : "text-fd-muted-foreground hover:bg-fd-secondary/25 hover:text-fd-foreground",
        className,
      )}
    >
      {children}
    </Comp>
  );
});
Chip.displayName = "Chip";
