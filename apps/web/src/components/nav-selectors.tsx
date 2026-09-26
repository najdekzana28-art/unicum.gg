import { LocaleSelector } from "@/components/locale-selector";
import { RatingSelector } from "@/components/rating-selector";
import { RegionSelector } from "@/components/region-selector";

/**
 * The rating metric, region and language pickers, as one nav entry rather than
 * three.
 *
 * They stopped being three separate `links` entries because fumadocs lays its
 * secondary row out as `flex flex-row` with no wrapping and a `flex-1` spacer
 * before the theme switch: three pills of 72, 84 and 58 pixels, plus the two
 * icon links and the switch, filled a 390px phone to the pixel, and anything
 * narrower pushed the theme switch under the panel's own `overflow-auto`, where
 * it was simply clipped. Grouped, the row holds one child that can wrap inside
 * itself, so the pills move to a second line instead of the switch leaving the
 * menu.
 */
export function NavSelectors() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <RatingSelector />
      <RegionSelector />
      <LocaleSelector />
    </div>
  );
}
