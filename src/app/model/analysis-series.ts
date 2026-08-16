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

/**
 * A solved value as a reader should see it.
 *
 * Two decimals, which is what the readout row above every plot uses and what
 * the axes beside it are lettered in. The values themselves leave the solver at
 * full precision, so a label printing one straight ran to seventeen digits --
 * "2.6179937801901527" hanging off the plot beside a readout of "2.62" for the
 * same instant.
 *
 * Below the point where two decimals would round to nothing, two significant
 * figures instead, so a small reaction reads as small rather than as zero.
 */
export function formatAnalysisValue(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0.00';
  return Math.abs(value) < 0.005 ? Number(value.toPrecision(2)).toString() : value.toFixed(2);
}
