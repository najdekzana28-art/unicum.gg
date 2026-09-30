import React from "react";
import { notFound } from "next/navigation";
import Image from "next/image";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelSeparator,
  PanelTitle,
} from "@/components/panel";
import { constructMetadata } from "@/lib/metadata";
import { getTranslation } from "@/lib/translations.server";
import { cn } from "@/lib/utils";
import {
  PARTNER_ASSET_IDS,
  PARTNER_ASSETS,
  PARTNER_KITS,
} from "@/constants/partner-kits";

const NS = "app/partners/[slug]/page";

/**
 * A creator's asset kit: the overlay, panel and offline screen we made for
 * them, with their vanity URL.
 *
 * Unlisted on purpose (`noIndex`, and nothing links to it): the page is a
 * handover between us and one creator, not content. It exists so the files
 * arrive as a link they can reopen whenever they change their layout, rather
 * than as an attachment lost in a chat two weeks later.
 *
 * Translated like every other page. The images it lists are not: they are
 * rendered pixels, so their wording follows the creator's own audience instead,
 * from `ASSET_COPY` keyed by the locale their kit declares.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const kit = PARTNER_KITS[slug];
  const { t } = await getTranslation(NS, locale);
  const canonical = `/partners/${slug}`;
  if (!kit)
    return constructMetadata({
      locale,
      title: t("creator-kit"),
      canonical,
      noIndex: true,
    });
  return constructMetadata({
    locale,
    title: t("title", { NAME: kit.name }),
    description: t("description", { NAME: kit.name }),
    canonical,
    noIndex: true,
  });
}

export default async function PartnerKitPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const kit = PARTNER_KITS[slug];
  if (!kit) notFound();
  const { t } = await getTranslation(NS, locale);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <Panel>
        <PanelContent className="px-4 py-12 text-center sm:py-16">
          <div className="mb-2 text-sm uppercase tracking-wide text-fd-muted-foreground">
            {t("creator-kit")}
          </div>
          <h1 className="mx-auto max-w-3xl font-heading text-4xl font-bold tracking-tight text-balance md:text-5xl">
            {t("your-visuals", { NAME: kit.name })}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-fd-muted-foreground">
            {t("sized-the-way-twitch-expects-them-ready-to-u", {
              URL: `unicum.gg/${slug}`,
            })}
          </p>
        </PanelContent>
      </Panel>

      <div className="flex flex-col">
        {PARTNER_ASSET_IDS.map((id) => {
          const asset = PARTNER_ASSETS[id];
          const src = `/api/partners/${slug}/${id}`;
          return (
            <React.Fragment key={id}>
              <PanelSeparator />
              <Panel>
                <PanelHeader className="flex items-center justify-between gap-3">
                  <PanelTitle>{t(asset.labelKey)}</PanelTitle>
                  <a
                    href={src}
                    download={`unicum-${id}.png`}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-fd-border",
                      "px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-fd-secondary",
                    )}
                  >
                    <DownloadSimpleIcon className="size-4" />
                    {asset.width}×{asset.height}
                  </a>
                </PanelHeader>
                <PanelContent className="flex flex-col gap-3 px-4 py-6">
                  <p className="text-sm text-fd-muted-foreground">
                    {t(asset.hintKey)}
                  </p>
                  {/* Checkerboard behind the transparent overlays so the cut-out
                      reads as one rather than as a black rectangle. */}
                  <div
                    className="flex justify-center rounded-md p-4"
                    style={{
                      backgroundColor: "#0d0d0d",
                      backgroundImage:
                        "linear-gradient(45deg,#181818 25%,transparent 25%,transparent 75%,#181818 75%),linear-gradient(45deg,#181818 25%,transparent 25%,transparent 75%,#181818 75%)",
                      backgroundSize: "16px 16px",
                      backgroundPosition: "0 0, 8px 8px",
                    }}
                  >
                    <Image
                      src={src}
                      alt={t(asset.labelKey)}
                      width={asset.width}
                      height={asset.height}
                      unoptimized
                      className="h-auto max-w-full"
                      style={{ maxHeight: 300, width: "auto" }}
                    />
                  </div>
                </PanelContent>
              </Panel>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
