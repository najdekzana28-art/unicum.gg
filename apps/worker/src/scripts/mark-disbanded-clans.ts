// Record every clan we hold that Wargaming now reports as disbanded.
//
//   pnpm --filter @unicum.gg/worker mark-disbanded-clans [eu|na|asia] [--from ID]
//
// Run once, to close the gap the state was never written in: an ended clan comes
// back from WG with its tag and name blanked, that was read as a failed fetch
// and discarded, so the flag was false for every one of the 160,380 clans we
// hold while 770 of them had ended. Until they are marked, each of those keeps a
// page claiming a living clan, a place in the leaderboards and the search, and a
// tag anyone may now take.
//
// Already run once, on 2026-10-01: 584 EU, 137 NA, 49 Asia, in 332s, 51s and
// 31s. A re-run re-checks every live clan and should mark close to nothing,
// which is also how to confirm a previous run was complete.
//
// Interruptible and resumable: marking IS the progress, since a marked clan
// leaves the set the sweep reads, so a killed run loses only the page it was on
// and `--from` restarts it on the last id printed. The clan backfill marks any
// clan that ends from here on, so this has nothing left to do once it has run.
import { numberArg, regionArgs } from "./args";
import { sweepDisbandedClans } from "@unicum.gg/core/clans/disbanded";

async function main(): Promise<void> {
  const regions = regionArgs();
  const fromId = numberArg("--from");
  // A cursor belongs to one region: clan ids are sequential per region, so
  // resuming with no region named would hand an EU id to NA and Asia too, where
  // it means a different position entirely.
  if (fromId !== undefined && regions.length > 1) {
    console.error(
      "--from names a position in one region's id space: pass the region too, " +
        "e.g. `mark-disbanded-clans eu --from 500123456`.",
    );
    process.exit(1);
  }

  for (const region of regions) {
    const at = Date.now();
    let reported = 0;
    const result = await sweepDisbandedClans(region, {
      fromId,
      onProgress: (p) => {
        // One line per 10k checked, so a run measured in minutes stays
        // followable without a line per WG request.
        if (p.checked - reported < 10_000) return;
        reported = p.checked;
        console.log(
          `[mark-disbanded-clans-${region}] at ${p.lastId}: ${p.checked} checked, ${p.marked} marked`,
        );
      },
    });
    console.log(
      `[mark-disbanded-clans-${region}] done in ${Math.round((Date.now() - at) / 1000)}s: ` +
        `${result.marked} marked of ${result.checked} checked (last id ${result.lastId})`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[mark-disbanded-clans] failed:", err);
  process.exit(1);
});
