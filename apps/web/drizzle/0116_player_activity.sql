-- Whether a band of the region's players is still playing: one row per
-- (metric, window, band, day), 81 per region per day, written hourly by the
-- `player-distribution-cron`.
--
-- The histograms that cron already materialises count accounts per band, which
-- says how many players reached a level and nothing about whether they still
-- log in. These counters separate the two: the share of a band seen inside the
-- window, and how many battles the ones who turned up played.
--
-- A SERIES, not a singleton, which is why it is a table rather than four more
-- columns on `*_player_distribution`: that row is deleted and rewritten every
-- hour, so it can only answer for the present instant, and the question here is
-- the movement over time. Nothing can recover an overwritten day, so this has
-- to start accumulating before it can be read, like `*_server_online`.
--
-- Daily rather than hourly because the shortest window is 24 hours and two
-- consecutive hourly points share 23 of them. The cron still runs hourly and
-- upserts the current day, so the day in progress refines until midnight and
-- then never moves again, and an outage costs resolution on one day rather than
-- a hole in the series.
--
-- `observed` is the honest denominator and the reason the table carries four
-- counters instead of a rate: an account is only known to be idle if we read it
-- recently enough to tell, and that coverage runs from 96% of the top band down
-- to 88% of the bottom one on EU. Scoring activity against the accounts we
-- actually observed is what keeps the answer about the players rather than
-- about our own refresh cadence.
--
-- Additive CREATE TABLE only, no per-region DROP (the schema factory pattern
-- makes drizzle-kit blind to these tables, so this is written by hand).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['eu','na','asia'] LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I_player_activity (
        -- The UTC day the counters were READ on, not a day the battles fell in:
        -- every window looks backwards from the read. Pinned to UTC like the
        -- rhythm heatmap's buckets so nothing depends on the worker's timezone.
        day date NOT NULL,
        metric text NOT NULL,
        band text NOT NULL,
        -- How far back "active" looked: '24h', '7d' or '30d'. Rows rather than
        -- three sets of columns, so a fourth window is data not a migration.
        activity_window text NOT NULL,
        -- The band's edges as the colour function drew them when the row was
        -- written, half-open and null at the scale's two open ends. Stored so a
        -- threshold that moves later cannot relabel a row it never measured.
        band_from integer,
        band_to integer,
        min_battles integer NOT NULL,
        -- Accounts in the band, whatever we know about them.
        players integer NOT NULL,
        -- Accounts read inside the window: the denominator of the rate.
        observed integer NOT NULL,
        -- Observed accounts whose last battle falls inside the window.
        active integer NOT NULL,
        -- Active accounts whose battle count for the window is known, which is
        -- 96 to 99 of every hundred: the window's battles are a diff between two
        -- snapshots of ours, so an account can be known to have played while we
        -- hold no pair of snapshots to measure it with.
        measured integer NOT NULL,
        -- Battles the measured accounts played inside the window, stored beside
        -- its own denominator so bands can be re-summed rather than averaged.
        battles bigint NOT NULL,
        computed_at timestamptz NOT NULL DEFAULT now(),
        -- Ordered the way the page reads it rather than the way the cron writes
        -- it: a panel asks for one metric and one window and wants every band's
        -- days ascending, which this serves as one contiguous range.
        PRIMARY KEY (metric, activity_window, band, day)
      )
    $f$, r);
  END LOOP;
END $$;
