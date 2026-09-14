export type ActiveObjType =
  | 'Nothing'
  | 'Joint'
  | 'Force'
  | 'Link'
  | 'Grid'
  | 'SynthesisPose'
  | 'Mechanism'
  | 'MultiSelection'
  /** The tracing underlay, which is scenery rather than part of the linkage. */
  | 'BackgroundImage';
