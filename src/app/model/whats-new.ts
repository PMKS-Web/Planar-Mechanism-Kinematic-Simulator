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
export const WHATS_NEW_VERSION = '2026.09';

export const WHATS_NEW: ReleaseNote[] = [
  {
    icon: 'tab',
    title: 'Four modes, along the top',
    body:
      'The rail down the left is gone. Synthesis, Edit, Kinematic Analysis and Force Analysis are ' +
      'tabs in the top strip, each with a chip saying whether it can run.',
  },
  {
    icon: 'balance',
    title: 'Force analysis',
    body:
      'Give the bodies mass, hang loads on them, and read the reaction on each body at each ' +
      'joint — held still, or in motion with the forces of movement included.',
  },
  {
    icon: 'compress',
    title: 'Cylinders, sliders and slots',
    body:
      'A hydraulic ram is a part you add from the menu and can drive directly. A slot can be cut ' +
      'into a moving link rather than only into the frame.',
  },
  {
    icon: 'account_tree',
    title: 'Several mechanisms in one drawing',
    body:
      'Each independent mechanism on the grid is solved on its own, with its own driven joint, ' +
      'its own speed, and its own row in the playback bar.',
  },
  {
    icon: 'download',
    title: 'Take the work away',
    body:
      'The numbers as a CSV or an Excel workbook, the graphs as a printable report, and the ' +
      'geometry as DXF or SVG with a table of joints and links, for CAD.',
  },
];

/**
 * The rest, as one line each. Real, and not worth a paragraph.
 *
 * Empty for this release, and the dialog leaves the heading out when it is:
 * the card is what a returning reader meets before they can do anything, and
 * five notes is what fits in it without a scroll. Everything that would have
 * gone here — the library, the tutorial, the phone layout, the locks — is a
 * thing they will meet on their own the moment they look for it.
 */
export const WHATS_NEW_ALSO: string[] = [];
