import sanitizeHtml from "sanitize-html";
import { LinkifyIt } from "linkify-it";
import {
  type Region,
  type ClanEmblems,
  type PortalClanRecord,
  REGION_PORTAL_HOST,
} from "@unicum.gg/wargaming";
import { wg } from "../../client";

export type Emblems = ClanEmblems;

export function pickEmblem(emblems: Emblems): string {
  return (
    emblems?.x195?.portal ??
    emblems?.x64?.portal ??
    emblems?.x64?.wot ??
    emblems?.x32?.portal ??
    ""
  );
}

export type ClanFullInfo = {
  id: number;
  tag: string;
  name: string;
  color: string;
  emblem: string;
  motto: string;
  descriptionHtml: string;
  createdAt: Date;
  membersCount: number;
  leaderId: number;
  leaderName: string;
  creatorId: number;
  creatorName: string;
  isDisbanded: boolean;
  languages: string[];
  // Last time the clan's data was refreshed (from `clans.last_refreshed_at`);
  // drives the clan page's "Updated X ago" + refresh beacon. Null for a clan
  // never refreshed through the tracked pipeline.
  updatedAt: Date | null;
};

// Client-safe shape lives in `@unicum.gg/shared`; re-exported for back-compat.
import type { ClanRef } from "@unicum.gg/shared";
export type { ClanRef } from "@unicum.gg/shared";

const FULL_INFO_FIELDS = [
  "clan_id",
  "tag",
  "name",
  "color",
  "motto",
  "description_html",
  "members_count",
  "leader_id",
  "leader_name",
  "creator_id",
  "creator_name",
  "created_at",
  "is_clan_disbanded",
  "emblems",
] as const;

const SHORT_REF_FIELDS = [
  "clan_id",
  "tag",
  "name",
  "color",
  "emblems",
] as const;

type RawFullInfo = {
  clan_id: number;
  tag: string;
  name: string;
  color: string;
  motto: string;
  description_html: string;
  members_count: number;
  leader_id: number;
  leader_name: string;
  creator_id: number;
  creator_name: string;
  created_at: number;
  is_clan_disbanded: boolean;
  emblems: Emblems;
};
type RawShortRef = {
  clan_id: number;
  tag: string;
  name: string;
  color: string;
  emblems: Emblems;
};

const DESCRIPTION_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "a",
    "ul",
    "ol",
    "li",
  ],
  allowedAttributes: { a: ["href", "title", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      // User-generated outbound links: nofollow so we neither pass link equity
      // to arbitrary sites nor reward spamming URLs into a clan description.
      rel: "nofollow noopener noreferrer",
    }),
  },
};
const DOUBLE_ENCODED_ENTITY_REGEX = /&amp;(#?\w+;)/g;
// Split into HTML tags and the text runs between them, so linkify only ever
// touches visible text and never the inside of a tag.
const TOKEN_REGEX = /<[^>]+>|[^<]+/g;

// linkify-it does TLD-aware fuzzy detection, so it catches scheme-less domains
// (discord.gg/x, www.clan.com) and emails without false-positiving on
// "3.5k"/"e.g."/"IS7", trims trailing punctuation, and keeps its TLD list
// upstream. fuzzyLink (off by default) enables the scheme-less case; `m.url` is
// the normalized href (http:// or mailto: prepended for fuzzy matches).
const linkify = new LinkifyIt({ fuzzyLink: true });

function linkifyText(text: string): string {
  const matches = linkify.match(text);
  if (!matches) return text;
  let out = "";
  let last = 0;
  for (const m of matches) {
    out += `${text.slice(last, m.index)}<a href="${m.url}">${m.text}</a>`;
    last = m.lastIndex;
  }
  return out + text.slice(last);
}

/**
 * Sanitize a WG clan description and turn bare URLs into links. WG wraps URLs in
 * tags (`<strong>https://…</strong>`), so a lookbehind that vetoes on a
 * preceding `>` would skip most of them. Instead we walk tag/text tokens and
 * linkify only text, tracking `<a>` depth so an existing anchor's visible text
 * is never double-wrapped. Idempotent, so it is safe to re-run on stored HTML.
 */
export function sanitizeClanDescription(html: string): string {
  const normalized = (html || "").replace(DOUBLE_ENCODED_ENTITY_REGEX, "&$1");
  let anchorDepth = 0;
  const linkified = (normalized.match(TOKEN_REGEX) ?? [])
    .map((token) => {
      if (token[0] === "<") {
        if (/^<a[\s/>]/i.test(token)) anchorDepth++;
        else if (/^<\/a\s*>/i.test(token))
          anchorDepth = Math.max(0, anchorDepth - 1);
        return token;
      }
      return anchorDepth > 0 ? token : linkifyText(token);
    })
    .join("");
  return sanitizeHtml(linkified, DESCRIPTION_SANITIZE_OPTIONS);
}

/**
 * WG's answer for a clan that has been disbanded: the row is still there and
 * `is_clan_disbanded` is set, but everything a reader would see is blank
 * (`tag: ""`, `name: ""`, `members_count: 0`). Measured on EU, where the same
 * request answers `null` for an id WG never issued, and the two must stay
 * distinguishable: one is a clan that ended, the other a clan that never was.
 *
 * The tag is checked beside the flag because a payload with no tag is unusable
 * whatever the flag says, and that empty tag is the whole reason this used to be
 * read as a failure: both getters below discarded it, so `is_disbanded` was
 * never written for a single one of 160,380 stored clans, 770 of which had
 * ended.
 */
function isDisbandedPayload(raw: {
  tag?: string | null;
  is_clan_disbanded: boolean;
}): boolean {
  return raw.is_clan_disbanded || !raw.tag;
}

function clanFullInfoFromRaw(
  region: Region,
  raw: RawFullInfo,
  portal: ClanPortalLookup,
): ClanFullInfo {
  // Everything visible comes off the portal for a clan that has ended, because
  // the API has nothing left to give: it answers blank tag, blank name, no
  // emblems and `created_at: 0`. Taking the API's answer there is what made a
  // disbanded clan unnameable, and therefore silently dropped from every
  // player's clan history it appears in.
  const record = isDisbandedPayload(raw) ? portal.record : null;
  return {
    id: raw.clan_id,
    tag: record?.tag || raw.tag || "",
    name: record?.name || raw.name || "",
    color: record?.color || raw.color || "",
    emblem: record ? portalEmblem(region, record) : pickEmblem(raw.emblems),
    motto: record?.motto || raw.motto || "",
    descriptionHtml: sanitizeClanDescription(
      record?.description || raw.description_html || "",
    ),
    createdAt: record?.created_at
      ? portalDate(record.created_at)
      : new Date(raw.created_at * 1000),
    membersCount: record?.members_count ?? raw.members_count,
    leaderId: raw.leader_id,
    leaderName: raw.leader_name || "",
    creatorId: raw.creator_id,
    creatorName: raw.creator_name || "",
    // Read through the predicate, not off the flag: a tag-less payload has
    // nothing a page could be built from or addressed by, so it is an ended
    // clan whatever the flag says. Taking the flag alone would let such a
    // payload through as live and have the repository store an empty
    // `tag_lower`, which every other one of them would then collide with.
    isDisbanded: isDisbandedPayload(raw),
    languages: portal.languages,
    // Fetched live from WG just now, so the data is current as of this moment.
    updatedAt: new Date(),
  };
}

function clanRefFromShort(raw: RawShortRef): ClanRef {
  return {
    id: raw.clan_id,
    tag: raw.tag || "",
    name: raw.name || "",
    color: raw.color || "",
    emblem: pickEmblem(raw.emblems),
    languages: [],
  };
}

const LANGUAGES_CONCURRENCY = 5;

/**
 * What the clan portal holds about one clan, from the single call we already
 * make for its languages.
 *
 * The record beside them is what makes a disbanded clan nameable at all. The
 * public API blanks every visible field the moment a clan ends, down to
 * `created_at: 0` (the same shape of answer as the tournament system's
 * unscheduled dates, and storable as 1970 in exactly the same way), while this
 * endpoint keeps the tag, the name, the colour, the emblem and the real
 * creation date indefinitely. Measured on three EU clans disbanded in 2015,
 * 2018 and 2023: all three still answer here in full.
 */
type ClanPortalLookup = {
  languages: string[];
  record: PortalClanRecord | null;
};

const NO_PORTAL: ClanPortalLookup = { languages: [], record: null };

/** The portal serves its emblems as site-relative paths, where the API serves
 * the same files as absolute URLs on that same host. */
function portalEmblem(region: Region, record: PortalClanRecord): string {
  const path = record.huge_emblem_url ?? record.large_emblem_url;
  return path ? `https://${REGION_PORTAL_HOST[region]}${path}` : "";
}

/** The portal writes its timestamps with no zone marker
 * (`2023-03-13T09:57:19.277`), so the zone is stated here rather than left to
 * whatever the reading process happens to run in. */
function portalDate(value: string): Date {
  return new Date(`${value}Z`);
}

async function clanPortalLookup(
  region: Region,
  clanId: number,
): Promise<ClanPortalLookup> {
  try {
    const profile = await wg.region(region).portal.clans.profile({ clanId });
    return {
      languages:
        profile.clanview?.profiles?.find((p) => p.type === "clan")
          ?.languages_list ?? [],
      record: profile.clanview?.clan ?? null,
    };
  } catch {
    return NO_PORTAL;
  }
}

export const getClanFullInfo = async (
  region: Region,
  clanId: number,
): Promise<ClanFullInfo | null> => {
  const [raw, portal] = await Promise.all([
    wg.region(region).api.wot.clans.info({ clanId, fields: FULL_INFO_FIELDS }),
    clanPortalLookup(region, clanId),
  ]);
  // `null` only for an id WG never issued. A disbanded clan is an answer, and
  // the caller writes the flag rather than treating it as a failed fetch.
  if (!raw) return null;
  return clanFullInfoFromRaw(region, raw, portal);
};

export const getClansFullInfoBatch = async (
  region: Region,
  clanIds: number[],
): Promise<Map<number, ClanFullInfo>> => {
  const out = new Map<number, ClanFullInfo>();
  const unique = Array.from(new Set(clanIds));
  if (unique.length === 0) return out;
  const rawByClan = await wg
    .region(region)
    .api.wot.clans.infoBatch({ clanIds: unique, fields: FULL_INFO_FIELDS });
  // One portal call per clan, for its languages when it is alive and for its
  // whole identity when it is not: the portal is the 1 rps budget the clan
  // backfill is paced by, so this is deliberately the same single call either
  // way rather than a second one for the dead.
  const ids = Array.from(rawByClan.keys());
  const portalById = new Map<number, ClanPortalLookup>();
  for (let i = 0; i < ids.length; i += LANGUAGES_CONCURRENCY) {
    const batch = ids.slice(i, i + LANGUAGES_CONCURRENCY);
    const results = await Promise.all(
      batch.map(
        async (id) => [id, await clanPortalLookup(region, id)] as const,
      ),
    );
    for (const [id, lookup] of results) portalById.set(id, lookup);
  }
  // Disbanded clans are kept in the map, carrying their flag: the caller has to
  // see them to record the state, and they now carry a tag and a name too, so
  // one we have never tracked can be stored rather than discarded.
  for (const [id, raw] of rawByClan) {
    out.set(
      id,
      clanFullInfoFromRaw(region, raw, portalById.get(id) ?? NO_PORTAL),
    );
  }
  return out;
};

const DISBANDED_CHECK_FIELDS = ["clan_id", "tag", "is_clan_disbanded"] as const;

/**
 * Which of these clan ids WG now reports as disbanded.
 *
 * The narrowest question the info endpoint can be asked, and all the catch-up
 * sweep needs: no emblems, no description, and above all no portal hop for
 * languages, so a whole region is a few hundred requests instead of a day spent
 * against the 1 rps clan portal.
 *
 * An id WG did not answer for is reported neither way. The SDK logs a failed
 * chunk and leaves its clans out of the map, so a read that failed can never be
 * recorded as a clan that ended, which is the one mistake this sweep must not
 * make: marking is a one-way door, it takes the clan out of the leaderboards,
 * the search and the sitemap.
 */
export const findDisbandedClans = async (
  region: Region,
  clanIds: number[],
): Promise<number[]> => {
  if (clanIds.length === 0) return [];
  const rawByClan = await wg
    .region(region)
    .api.wot.clans.infoBatch({ clanIds, fields: DISBANDED_CHECK_FIELDS });
  const out: number[] = [];
  for (const [id, raw] of rawByClan) {
    if (isDisbandedPayload(raw)) out.push(id);
  }
  return out;
};

export const getClansShortRefBatch = async (
  region: Region,
  clanIds: number[],
): Promise<Map<number, ClanRef>> => {
  const out = new Map<number, ClanRef>();
  const rawByClan = await wg
    .region(region)
    .api.wot.clans.infoBatch({ clanIds, fields: SHORT_REF_FIELDS });
  for (const [id, raw] of rawByClan) {
    if (!raw.tag) continue;
    out.set(id, clanRefFromShort(raw));
  }
  return out;
};
