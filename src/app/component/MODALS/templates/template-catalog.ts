import { DevTemplateID } from './dev-templates';
import { TemplateID } from './template-linkages';

/**
 * What the library dialog shows, as data.
 *
 * The dialog used to be twenty-five copy-pasted blocks of markup, so adding a
 * mechanism meant writing a card by hand and the library had no way to say
 * anything about what it was offering. It is one table now: a row here is a
 * card there, and the dialog groups and filters whatever it finds.
 *
 * The payload behind a row lives in `template-linkages.ts` (or `dev-templates.ts`
 * for the development-only drawings), which is generated from the verification
 * fixtures -- so a row here names a mechanism the test suite already covers.
 */

/**
 * The families the library is filtered by, in the order they are shown.
 *
 * A category with no cards is not shown at all -- no chip, no heading -- so one
 * can be declared here before the mechanism that fills it exists, and appears
 * the moment a row names it.
 */
export const TEMPLATE_CATEGORIES = [
  // Development drawings first, because that is where whoever wants them is
  // looking. The dialog only offers this category in a development build.
  { id: 'dev', name: 'For Development' },
  { id: 'start', name: 'Start Here' },
  { id: 'sixbar', name: 'Six-Bars and Harder' },
  { id: 'slots', name: 'Slots and Sliders' },
  { id: 'cylinders', name: 'Cylinders' },
  { id: 'paths', name: 'Paths and Curves' },
  { id: 'forces', name: 'Forces' },
  { id: 'drives', name: 'Unusual Drives' },
  { id: 'machines', name: 'Many Machines' },
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
export type TemplateCategoryID = TemplateCategory['id'];

/** One card: what it is called, where it files, and why it is worth opening. */
export interface TemplateCard {
  readonly id: TemplateID | DevTemplateID;
  readonly name: string;
  readonly category: TemplateCategoryID;
  /** The line over the thumbnail. One sentence, about the mechanism. */
  readonly description: string;
  /** The still, under `assets/gifs/`. Shown at rest and behind the animation. */
  readonly thumbnail: string;
  /** Optional loop, faded in over the still while the card is hovered. */
  readonly animation?: string;
}

/**
 * Every mechanism the library offers.
 *
 * Order within a category is the order shown. To add one: generate its payload
 * into `template-linkages.ts`, drop its still into `src/assets/gifs/`, and add a
 * row here.
 */
export const TEMPLATE_CARDS: readonly TemplateCard[] = [
  {
    id: '4-Bar',
    name: 'Four-Bar',
    category: 'start',
    description:
      'The one every other mechanism is a variation of: a crank turns, a rocker swings, and ' +
      'the coupler between them draws a curve.',
    thumbnail: 'assets/gifs/fourbag.jpg',
    animation: 'assets/gifs/fourbar.gif',
  },
  {
    id: 'Slider_Crank',
    name: 'Slider-Crank',
    category: 'start',
    description: 'Rotation into a straight push — the engine and the pump both live here.',
    thumbnail: 'assets/gifs/slider.jpg',
    animation: 'assets/gifs/slider.gif',
  },
  {
    id: 'Drag_Link',
    name: 'Drag Link',
    category: 'start',
    description:
      'The four-bar whose output crank goes round too: move the shortest bar to the frame and ' +
      'the rocker stops rocking.',
    thumbnail: 'assets/gifs/drag-link.png',
  },
  {
    id: 'Bell_Crank',
    name: 'Bell Crank',
    category: 'start',
    description:
      'Two bars welded into one body at a right angle, so a push one way comes out of the far ' +
      'side pointing another.',
    thumbnail: 'assets/gifs/bell-crank.png',
  },
  {
    id: 'Locked_Four_Bar',
    name: 'Locked Four-Bar',
    category: 'start',
    description:
      'Everything pinned but the crank. Lock marks ride the share link, so a class can only ' +
      'drag the handle they are meant to.',
    thumbnail: 'assets/gifs/locked-four-bar.png',
  },

  {
    id: 'Watt_I',
    name: 'Watt I',
    category: 'sixbar',
    description: 'Two four-bars sharing a link, so the output can do what one four-bar cannot.',
    thumbnail: 'assets/gifs/watt.jpg',
    animation: 'assets/gifs/watt.gif',
  },
  {
    id: 'Watt_II',
    name: 'Watt II',
    category: 'sixbar',
    description: 'The other Watt chain: its two loops meet at a link rather than at a joint.',
    thumbnail: 'assets/gifs/watt2.jpg',
    animation: 'assets/gifs/watt2.gif',
  },
  {
    id: 'Stephenson_III',
    name: 'Stephenson III',
    category: 'sixbar',
    description:
      'A six-bar whose ternary links sit apart, so both loops have to be solved at once.',
    thumbnail: 'assets/gifs/steph3.jpg',
    animation: 'assets/gifs/steph3.gif',
  },
  {
    id: 'Double_Butterfly',
    name: 'Double Butterfly',
    category: 'sixbar',
    description:
      'The eight-bar with no four-bar loop anywhere in it: six joints that will not come apart ' +
      'and have to be solved together.',
    thumbnail: 'assets/gifs/double-butterfly.png',
  },

  {
    id: 'Whitworth_Quick_Return',
    name: 'Whitworth Quick-Return',
    category: 'slots',
    description: 'Crank longer than the ground offset, so the lever turns instead of rocking.',
    thumbnail: 'assets/gifs/whitworth.png',
  },
  {
    id: 'Shaper_Quick_Return',
    name: 'Shaper Quick-Return',
    category: 'slots',
    description:
      'A floating slot handing off to a grounded one: the ram cuts slow and returns fast.',
    thumbnail: 'assets/gifs/shaper-quick-return.png',
  },
  {
    id: 'Scotch_Yoke',
    name: 'Scotch Yoke',
    category: 'slots',
    description: 'A welded rider translating on its guide — pure cosine motion.',
    thumbnail: 'assets/gifs/scotch-yoke.png',
  },
  {
    id: 'Radial_Engine',
    name: 'Radial Engine',
    category: 'slots',
    description: 'Five sliders on one crank pin; piston stroke is exactly twice the throw.',
    thumbnail: 'assets/gifs/radial-engine.png',
  },
  {
    id: 'Elliptical_Crank',
    name: 'Elliptical Crank',
    category: 'slots',
    description:
      'A six-bar no chain of dyads reaches: the coupler and its guided end solve together.',
    thumbnail: 'assets/gifs/elliptical-crank.png',
  },
  {
    id: 'Flywheel_Engine',
    name: 'Engine with a Flywheel',
    category: 'slots',
    description:
      'The one crank drawn as the disc it sweeps, rather than as a bar, driving a piston down ' +
      'its guide.',
    thumbnail: 'assets/gifs/flywheel-engine.png',
  },
  {
    id: 'Screw_Jack',
    name: 'Screw Jack',
    category: 'slots',
    description:
      'A plain guided ram with no cylinder skin: its drive is a length per second, not an rpm.',
    thumbnail: 'assets/gifs/screw-jack.png',
  },
  {
    id: 'Elliptical_Trammel',
    name: 'Elliptical Trammel',
    category: 'slots',
    description:
      'No pin touches ground. Two blocks on crossed guides swing the bar between them through a ' +
      'true ellipse.',
    thumbnail: 'assets/gifs/elliptical-trammel.png',
  },

  {
    id: 'Cylinder_Boom',
    name: 'Cylinder-Driven Boom',
    category: 'cylinders',
    description: 'The cylinder is the drive, and the boom follows the law of cosines.',
    thumbnail: 'assets/gifs/cylinder-boom.png',
  },
  {
    id: 'Cylinder_Gripper',
    name: 'Gripper',
    category: 'cylinders',
    description: 'Counter-rotating jaw levers: extending the cylinder pinches them shut.',
    thumbnail: 'assets/gifs/cylinder-gripper.png',
  },
  {
    id: 'Backhoe_Bucket',
    name: 'Backhoe Bucket',
    category: 'cylinders',
    description:
      'A driven ram feeding an ordinary four-bar: bell crank, link, and the bucket curls.',
    thumbnail: 'assets/gifs/backhoe-bucket.png',
  },
  {
    id: 'Scissor_Lift',
    name: 'Scissor Lift',
    category: 'cylinders',
    description:
      'Ram, supporting block and a slot in the moving platform — three parts, three jobs.',
    thumbnail: 'assets/gifs/scissor-lift.png',
  },

  {
    id: 'Chebyshev_Straight_Line',
    name: 'Chebyshev Straight-Line',
    category: 'paths',
    description:
      'Approximate straight-line generation: the coupler midpoint runs flat along the top.',
    thumbnail: 'assets/gifs/chebyshev.png',
  },
  {
    id: 'Jansen_Leg',
    name: 'Jansen Leg',
    category: 'paths',
    description:
      "One leg of a Strandbeest — eight bars on Jansen's holy numbers, and the foot walks.",
    thumbnail: 'assets/gifs/jansen-leg.png',
  },
  {
    id: 'Windshield_Wiper',
    name: 'Windshield Wiper',
    category: 'paths',
    description: 'One motor, two arms: continuous rotation into two bounded sweeps.',
    thumbnail: 'assets/gifs/windshield-wiper.png',
  },
  {
    id: 'Peaucellier',
    name: 'Peaucellier-Lipkin',
    category: 'paths',
    description:
      'Exact straight-line generation, where Chebyshev only approximates it: the rhombus ' +
      'inverts a circle into a ruled line.',
    thumbnail: 'assets/gifs/peaucellier.png',
  },
  {
    id: 'Pantograph',
    name: 'Pantograph',
    category: 'paths',
    description:
      "Pen and tracer held in line with the pivot, so one draws the other's curve at half the " +
      'size.',
    thumbnail: 'assets/gifs/pantograph.png',
  },

  {
    id: 'Punch_Press',
    name: 'Punch Press',
    category: 'forces',
    description:
      'A load on the ram: the crank torque spikes where the rod comes into line with the slide.',
    thumbnail: 'assets/gifs/punch-press.png',
  },
  {
    id: 'Derrick_Crane',
    name: 'Derrick Crane',
    category: 'forces',
    description:
      'A weight far out on a boom held close in — the link carries several times the load.',
    thumbnail: 'assets/gifs/derrick-crane.png',
  },
  {
    id: 'Toggle_Clamp',
    name: 'Toggle Clamp',
    category: 'forces',
    description:
      'Where mechanical advantage comes from: the clamping force runs away as the links line up.',
    thumbnail: 'assets/gifs/toggle-clamp.png',
  },
  {
    id: 'Offset_Load_Rocker',
    name: 'Offset Load Rocker',
    category: 'forces',
    description:
      'A load off the line of its link is a moment — the term a free-body sketch leaves out.',
    thumbnail: 'assets/gifs/offset-load-rocker.png',
  },
  {
    id: 'Crane_Two_Loads',
    name: 'Crane with Two Loads',
    category: 'forces',
    description:
      'Global against local: the hook hangs vertical whatever the jib does, while the rope pull ' +
      'swings with it.',
    thumbnail: 'assets/gifs/crane-two-loads.png',
  },

  {
    id: 'Oscillating_Fan',
    name: 'Oscillating Fan',
    category: 'drives',
    description:
      'The motor rides the head it sweeps: the driven pin turns right round, the head does not.',
    thumbnail: 'assets/gifs/oscillating-fan.png',
  },
  {
    id: 'Pumpjack',
    name: 'Pumpjack',
    category: 'drives',
    description:
      'Driven where the pitman meets the beam, and the output is a straight-line stroke.',
    thumbnail: 'assets/gifs/pumpjack.png',
  },
  {
    id: 'Pedaling_Leg',
    name: 'Pedaling Leg',
    category: 'drives',
    description: 'A driven knee carried by the thigh: one leg can only rock the crank half a turn.',
    thumbnail: 'assets/gifs/pedaling-leg.png',
  },

  {
    id: 'Three_Machines',
    name: 'Three Machines',
    category: 'machines',
    description:
      'Three machines in one drawing, each on its own playback row at its own speed and ' +
      'direction.',
    thumbnail: 'assets/gifs/three-machines.png',
  },
];

/**
 * Drawings for working on the app rather than for learning a mechanism.
 *
 * Kept apart from the list above because the dialog only offers them in a
 * development build, and because their payloads come from a different file.
 */
export const DEV_TEMPLATE_CARDS: readonly TemplateCard[] = [
  {
    id: 'Dev_All_Mechanism_Types',
    name: 'Every Kind of Machine',
    category: 'dev',
    description:
      'A crank, a ram, a slider and a chain that never reaches ground — every readiness state ' +
      'and every playback row at once.',
    thumbnail: 'assets/gifs/dev-all-machines.png',
  },
  {
    id: 'Dev_Object_Gallery',
    name: 'Object Gallery',
    category: 'dev',
    description:
      'Every kind of pin, block, weld, slot and cylinder, with forces. Deliberately not ' +
      'simulatable.',
    thumbnail: 'assets/gifs/dev-object-gallery.png',
  },
  {
    id: 'Dev_Render_Stress',
    name: 'Render Stress Test',
    category: 'dev',
    description:
      "Ross McSweeney's Running Horse Automata, from MotionGen: forty-five joints on one " +
      'degree of freedom, tracing both hooves.',
    thumbnail: 'assets/gifs/dev-render-stress.png',
  },
];
