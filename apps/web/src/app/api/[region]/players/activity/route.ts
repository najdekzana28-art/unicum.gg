import {
  DEFAULT_ACTIVITY_WINDOW,
  isActivityWindow,
} from "@unicum.gg/shared";
import { loadPlayerActivity } from "@unicum.gg/core/players/activity";
import { isRegion } from "@unicum.gg/wargaming";
import { jsonResponse } from "@/services/openapi/json-response";
import { measured } from "@/services/perf";
import { PlayerActivityResponse } from "./schema.api";

/**
 * Player activity by band
 * @description Whether each band of the region's players is still playing, as a daily series. The histograms on `/players/distribution` count how many accounts reached a level; this counts how many of them turned up, which is the only way to tell a thriving band from a large dormant one. Rates should be read against `observed` (accounts actually read inside the window) rather than against `players`, since an account nobody read is not known to be idle. Recorded hourly and keyed by UTC day, so the newest day is still refining. The series cannot be backfilled: every counter is measured relative to the instant it was read. 404 until the first run. Dates are ISO 8601 strings.
 * @pathParams regionParams
 * @queryParams playerActivityQuery
 * @response PlayerActivityResponse
 * @openapi
 * @tag Players
 */
export async function GET(...args: Parameters<typeof GET__perf>) {
  return measured("GET /{region}/players/activity", () => GET__perf(...args));
}
async function GET__perf(
  req: Request,
  { params }: { params: Promise<{ region: string }> },
) {
  const { region } = await params;
  if (!isRegion(region)) {
    return Response.json({ error: "invalid_region" }, { status: 400 });
  }
  const requested = new URL(req.url).searchParams.get("window");
  // An unknown window answers on the default rather than 400, like the server
  // stats' range beside it: the parameter names a span, and no span a caller
  // could ask for makes the region's activity an error.
  const window =
    requested && isActivityWindow(requested)
      ? requested
      : DEFAULT_ACTIVITY_WINDOW;

  const activity = await loadPlayerActivity(region, window);
  // No row yet: the cron has not run for this region. A 404 rather than an empty
  // shape, so a caller can tell "nothing recorded" from "a region where nobody
  // plays", and so the page renders its waiting state instead of a row of zeros.
  if (!activity) {
    return Response.json({ error: "not_computed" }, { status: 404 });
  }
  return jsonResponse(PlayerActivityResponse, activity);
}
