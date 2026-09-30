/**
 * The creators we partner with and the assets we hand them, keyed by the same
 * slug as their vanity URL (`config/redirects/partners.ts`), so `/remi` and
 * `/partners/remi` always name the same person.
 *
 * Nothing here is a file. Every asset is rendered on demand by
 * `/api/partners/[slug]/[asset]`, the way the OG cards are, so onboarding a
 * creator is one entry below and a redirect line: no binaries to produce, and a
 * change to the brand reaches every kit at once.
 */

/** The wording baked into a creator's images.
 *
 * The page around them is English like the rest of the site, which is what lets
 * it be translated; the images cannot be, since they are rendered pixels. So the
 * copy that ends up inside them follows the creator's own audience instead,
 * declared per kit. */
export const ASSET_COPY = {
  en: {
    tagline: "World of Tanks stats, tanks and clans",
    kicker: "WORLD OF TANKS STATS",
    kickerYours: "YOUR WORLD OF TANKS STATS",
    scan: "SCAN ME",
  },
  fr: {
    tagline: "Stats, chars et clans World of Tanks",
    kicker: "STATS WORLD OF TANKS",
    kickerYours: "TES STATS WORLD OF TANKS",
    scan: "SCANNE-MOI",
  },
} as const;

export type AssetLocale = keyof typeof ASSET_COPY;

export const PARTNER_ASSETS = {
  overlay: {
    labelKey: "overlay",
    hintKey: "overlay-hint",
    width: 326,
    height: 74,
  },
  "overlay-compact": {
    labelKey: "overlay-compact",
    hintKey: "overlay-compact-hint",
    width: 290,
    height: 70,
  },
  panel: {
    labelKey: "panel",
    hintKey: "panel-hint",
    width: 320,
    height: 160,
  },
  offline: {
    labelKey: "offline",
    hintKey: "offline-hint",
    width: 1920,
    height: 1080,
  },
  "offline-qr": {
    labelKey: "offline-qr",
    hintKey: "offline-qr-hint",
    width: 1920,
    height: 1080,
  },
} as const;

export type PartnerAssetId = keyof typeof PARTNER_ASSETS;

export const PARTNER_ASSET_IDS = Object.keys(PARTNER_ASSETS) as PartnerAssetId[];

export type PartnerKit = { name: string; locale: AssetLocale };

export const PARTNER_KITS: Record<string, PartnerKit> = {
  remi: { name: "Remi_iD", locale: "fr" },
};
