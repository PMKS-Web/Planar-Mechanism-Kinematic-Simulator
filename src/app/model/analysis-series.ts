/**
 * The colour of each analysis series, in one place.
 *
 * A graph, its legend and the collapsed header that previews its values all
 * have to agree about which colour means X, so the answer lives beside the
 * model rather than inside whichever component happened to need it first.
 */
export const ANALYSIS_SERIES_COLORS = {
  X: '#313aa7',
  Y: '#ea2b29',
  Z: '#fdb50e',
} as const;
