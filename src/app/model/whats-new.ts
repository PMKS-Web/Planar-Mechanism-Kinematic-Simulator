/**
 * What changed, for somebody who was here before.
 *
 * Written as data rather than markup for the same reason the mechanism library
 * is: a release note is a list that grows, and a list that grows in a template
 * grows by copy-paste. The dialog renders whatever it finds here.
 *
 * The audience is a returning reader, which is what makes this hard to write
 * well. They do not want three hundred commits; they want to know what is in a
 * different place than they left it, and what the app can do now that it could
 * not. So the headline entries are the ones that change what is on screen or
 * what can be attempted, ordered by how likely a returning user is to walk into
 * them, and the small print underneath is everything that is a pleasant
 * surprise rather than a relearning.
 */

/** One thing worth saying, with the sentence that says why it matters. */
export interface ReleaseNote {
  /** The Material icon beside it. */
  icon: string;
  title: string;
  body: string;
}

/**
 * The version these notes are about.
 *
 * Kept beside the notes rather than read from the environment: what decides
 * whether a reader has seen this is whether they have seen *these words*, and
 * tying that to a build number means a patch release re-announces a feature
 * nobody re-shipped.
 */
export const WHATS_NEW_VERSION = '2026.08';

export const WHATS_NEW: ReleaseNote[] = [
  {
    icon: 'tab',
    title: 'The modes are tabs along the top',
    body:
      'Synthesis, Edit, Kinematic Analysis and Force Analysis, each with a chip saying whether ' +
      'it can run on what you have drawn. The panel below the strip is whichever one you are in.',
  },
  {
    icon: 'account_tree',
    title: 'One drawing can hold several machines',
    body:
      'PMKS+ finds the independent mechanisms on the grid and solves each on its own, with its ' +
      'own driven joint, its own speed and direction, and its own row in the playback bar.',
  },
  {
    icon: 'compress',
    title: 'Cylinders, slides and floating slots',
    body:
      'A ram is a part you add from the menu and can drive directly, and a slot can be cut into ' +
      'a moving link rather than only into the frame.',
  },
  {
    icon: 'download',
    title: 'Export Data',
    body:
      'Take the numbers away as a CSV, an Excel workbook, graph images, or a printable report ' +
      'with the drawing, the graphs and the table in it.',
  },
  {
    icon: 'balance',
    title: 'Force analysis that says what it needs',
    body:
      'A chip counts what is missing and the setup drawer names it, with every link’s mass in ' +
      'one table. Static or in-motion, and the reaction on each body at a joint rather than one ' +
      'merged number.',
  },
  {
    icon: 'apps',
    title: 'Forty-two mechanisms in the library',
    body:
      'There were four. They are searchable now, filed by family, and every card is a picture of ' +
      'the mechanism it opens.',
  },
  {
    icon: 'school',
    title: 'A tutorial that follows your drawing',
    body:
      'Five steps from a bare grid to reading a velocity. It works out which step you are on by ' +
      'looking at what you have built, so it can start halfway and follow an undo backwards.',
  },
  {
    icon: 'phone_iphone',
    title: 'It works on a phone',
    body:
      'Hold a finger where you would right-click. The mode panel becomes a sheet you pull up ' +
      'when you want it, and the drawing keeps the rest of the screen.',
  },
];

/** The rest, as one line each. Real, and not worth a paragraph. */
export const WHATS_NEW_ALSO: string[] = [
  'Lock a joint or a link so a shared linkage can only be adjusted where you meant it to be',
  'Velocity, acceleration and force drawn on the mechanism itself while it runs',
  'A photograph pinned behind the grid to build a linkage on top of',
  'Traced paths that stay up while you analyze, and centers of mass you can place',
  'Keyboard shortcuts for the modes, playback, the view and undo: press ? for the list',
  'Playback that measures the input rather than the clock, so a ram runs end to end of its stroke',
  'Undo and redo across everything, because the whole project is one shareable link',
];
