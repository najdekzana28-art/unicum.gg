/**
 * Which game client a vehicle's characteristics are read from.
 *
 * A Common Test runs its own client, and what it changes about a vehicle is the
 * whole reason players read a test build: the tank page can therefore be shown
 * on either one. Distinct from a "build" everywhere else in the tank page,
 * which means the setup a player assembles (modules, equipment, crew).
 */
export enum TankClient {
  /** This region's live client: what everyone is playing right now. */
  Live = "live",
  /** The Common Test client: unreleased, and still subject to change. */
  CommonTest = "ct",
}

/** Narrow an untrusted string (a query param) to a client, defaulting to live. */
export function toTankClient(value: string | null | undefined): TankClient {
  return value === TankClient.CommonTest ? TankClient.CommonTest : TankClient.Live;
}
