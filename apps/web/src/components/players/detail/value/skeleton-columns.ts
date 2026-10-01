import type { SkeletonColumn } from "@/components/table-skeleton";

// Column widths/alignment mirroring TankCostsTable, for the on-demand loading
// placeholder. Its own neutral (non-"use client") module for the reason the
// tanks table's is: a plain value exported from a client module crosses the
// boundary as a client REFERENCE, not as the array, and the server-rendered
// profile skeleton reads this one too.
//
// The four leading columns are the site's own vehicle columns, so they carry
// the same widths as `TANKS_SKELETON_COLUMNS`; only the three money columns
// are this table's own.
export const COSTS_SKELETON_COLUMNS: SkeletonColumn[] = [
  { width: "w-6", align: "center", hideOnMobile: true }, // Nation
  { width: "w-6", align: "center", hideOnMobile: true }, // Type
  { width: "w-6", align: "center", hideOnMobile: true }, // Tier
  { width: "w-28" }, // Name
  { width: "w-24", align: "right" }, // Research
  { width: "w-24", align: "right" }, // Purchase
  { width: "w-16", align: "right" }, // Total
];
