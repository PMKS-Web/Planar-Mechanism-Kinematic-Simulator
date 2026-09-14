/** Only unfinished document consumers are unavailable; the shell remains the shared editor. */
export const NATIVE_PREVIEW_FEATURES = {
  analysis:
    'Graphs are not available in this preview yet. You can play, pause and edit the mechanism on the grid.',
  synthesis: 'Synthesis is not available in this preview yet. Switch to Edit to build a mechanism.',
  export:
    'Data and drawing export are not available in this preview yet. Save the project to keep your work.',
  tutorial:
    'The tutorial is not available in this preview yet. Right-click the grid to start a link or cylinder.',
  library:
    'The mechanism library is not available in this preview yet. Open a saved mechanism or build one in Edit.',
} as const;
