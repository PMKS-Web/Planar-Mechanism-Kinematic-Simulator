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
  { type: 'POINT', layer: 'PMKS_JOINT_CENTERS', geometry: [-2, 3] },
  { type: 'CIRCLE', layer: 'PMKS_JOINT_CENTERS', geometry: [-2, 3, 0.08] },
  { type: 'POINT', layer: 'PMKS_JOINT_CENTERS', geometry: [4, -1] },
  { type: 'CIRCLE', layer: 'PMKS_JOINT_CENTERS', geometry: [4, -1, 0.08] },
] as const;
