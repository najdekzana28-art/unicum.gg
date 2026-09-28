import {
  twitchLoginOf,
  unlinkGameClient,
  wargamingAccountOf,
} from "@unicum.gg/core/game-link";
import { twitchChatAccess } from "@unicum.gg/core/twitch/chat";
import { isSupporter } from "@unicum.gg/core/subscription";
import {
  isLoadoutHidden,
  setLoadoutHidden,
} from "@unicum.gg/core/tanks/loadouts";
import { gameClientSecret, gameClientUser } from "@/services/game";

export const dynamic = "force-dynamic";

/**
 * What the game mod's link acts for: the account's name, its Twitch channel
 * and whether that chat can be written to. 401 until the link exists, which is what the mod
 * polls on while its sign-in browser is open. Not part of the public API: its
 * only caller is the mod, with the secret the link was made for.
 *
 * It also carries whether the player supports the site and whether they have
 * hidden their loadouts, because the mod's settings window draws that switch
 * and cannot draw it honestly without both: a switch offered to somebody who
 * may not use it, or one whose position is guessed, is worse than none.
 */
export async function GET(req: Request): Promise<Response> {
  const client = await gameClientUser(req);
  if (!client) {
    return Response.json({ error: "not_linked" }, { status: 401 });
  }
  const [twitch, twitchLogin, supporter, wargaming] = await Promise.all([
    twitchChatAccess(client.userId),
    twitchLoginOf(client.userId),
    isSupporter(client.userId),
    wargamingAccountOf(client.userId),
  ]);
  return Response.json(
    {
      name: client.name,
      twitch,
      twitchLogin,
      supporter,
      loadoutsHidden: wargaming ? await isLoadoutHidden(wargaming) : false,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * Hide this player's loadouts from their public page, or show them again.
 *
 * A supporter's switch, and the other half of the deal the mod is published
 * on: loadouts are public by default because the aggregates they feed are
 * what pays for a mod with no advertising, and somebody funding it directly
 * has already paid another way.
 *
 * Distinct from unticking "share my loadouts", which stops the uploads and
 * deletes what was sent. This one keeps contributing to the population
 * figures and only takes the panel off the player's own page, so the two are
 * worded as the different things they are.
 */
export async function PATCH(req: Request): Promise<Response> {
  const client = await gameClientUser(req);
  if (!client) {
    return Response.json({ error: "not_linked" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    loadoutsHidden?: unknown;
  } | null;
  if (typeof body?.loadoutsHidden !== "boolean") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const [supporter, wargaming] = await Promise.all([
    isSupporter(client.userId),
    wargamingAccountOf(client.userId),
  ]);
  if (!supporter) {
    return Response.json({ error: "not_a_supporter" }, { status: 403 });
  }
  if (!wargaming) {
    // Nothing to hide: the loadouts are keyed by the Wargaming account, and
    // this link has none bound to it.
    return Response.json({ error: "no_wargaming_account" }, { status: 409 });
  }
  await setLoadoutHidden(wargaming, client.userId, body.loadoutsHidden);
  return Response.json(
    { loadoutsHidden: body.loadoutsHidden },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Unlink the game mod making the request: its secret acts for no account any more. */
export async function DELETE(req: Request): Promise<Response> {
  const secret = gameClientSecret(req);
  if (!secret || !(await unlinkGameClient(secret))) {
    return Response.json({ error: "not_linked" }, { status: 401 });
  }
  return new Response(null, { status: 204 });
}
