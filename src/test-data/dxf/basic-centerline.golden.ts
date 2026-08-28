/** Normalized independently-parsed entities for a two-joint centerline in centimeters. */
export const BASIC_CENTERLINE_GOLDEN = [
  {
    type: 'LINE',
    layer: 'PMKS_LINK_CENTERLINES',
    geometry: [
      [-2, 3],
      [4, -1],
    ],
  },
  // A circle apiece and no bare POINT: a sketch importer either drops a point
  // or turns it into a stray one somebody has to clean out, and the circle
  // already gives them a centre to snap and mate to.
  { type: 'CIRCLE', layer: 'PMKS_JOINT_CENTERS', geometry: [-2, 3, 0.08] },
  { type: 'CIRCLE', layer: 'PMKS_JOINT_CENTERS', geometry: [4, -1, 0.08] },
] as const;
