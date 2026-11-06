import { BackgroundImageService } from 'src/app/services/background-image.service';
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
  { id: 'realworld', name: 'Real-Life Use Cases' },
  { id: 'backforth', name: 'Back-and-Forth Motion' },
  { id: 'swing', name: 'Swing, Lift and Grip' },
  { id: 'paths', name: 'Drawing a Path' },
  { id: 'forces', name: 'Forces' },
  { id: 'sixbar', name: 'Six-Bars and Beyond' },
  { id: 'machines', name: 'Multiple Mechanisms' },
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
export type TemplateCategoryID = TemplateCategory['id'];

/**
 * How a new tab is told which card's picture to put up.
 *
 * A hash rather than a query parameter: the query *is* the mechanism, checksum
 * and all, and anything appended to it stops decoding. Only the card's name
 * travels -- the picture is an asset the app already ships.
 */
export const BACKDROP_HASH = 'backdrop=';

/**
 * A picture a template opens on top of, for a reader to build against.
 *
 * Named rather than carried: the file is an asset the app ships, so a template
 * can arrive with the photograph or schematic it was traced from without any of
 * it reaching the URL -- an image is megabytes and a shared link is a few
 * hundred characters. It is scenery in every other respect, which is to say it
 * is outside the undo history and outside the codec, exactly like a picture the
 * reader drops in themselves.
 *
 * `width` is in the drawing's own length unit, because that is what a reader
 * would measure the real thing in; the service converts.
 */
export interface TemplateBackdrop {
  /** The file, under `assets/`. */
  readonly src: string;
  /** How wide it is drawn, in the reader's length unit. */
  readonly width: number;
  readonly centerX?: number;
  readonly centerY?: number;
  readonly rotationRad?: number;
  /** 0..1; a tracing underlay wants to be seen through. Defaults to a half. */
  readonly opacity?: number;
}

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
  /** Optional picture the mechanism opens on top of. */
  readonly backdrop?: TemplateBackdrop;
  /**
   * Who suggested it, for a mechanism added through Suggest a Mechanism: the
   * Credit As they gave, shown on the card as "Suggested by". Absent for the
   * library's own, and for a suggestion sent anonymously.
   */
  readonly credit?: string;
}

/**
 * Every mechanism the library offers.
 *
 * Order within a category is the order shown. To add one: generate its payload
 * into `template-linkages.ts`, drop its still into `src/assets/gifs/`, and add a
 * row here.
 */
export const TEMPLATE_CARDS: readonly TemplateCard[] = [
  // Start Here
  {
    id: 'Four_Bar',
    name: 'Four-Bar',
    category: 'start',
    description:
      'The mechanism most others grow from: the short crank turns all the way round, the opposite link only swings, and the coupler draws a curve.',
    thumbnail: 'assets/gifs/four-bar.png',
    animation: 'assets/gifs/four-bar.gif',
  },
  {
    id: 'Slider_Crank',
    name: 'Slider-Crank',
    category: 'start',
    description: 'Turns rotation into a straight push and pull, like a piston on a crankshaft.',
    thumbnail: 'assets/gifs/slider-crank.png',
    animation: 'assets/gifs/slider-crank.gif',
  },
  {
    id: 'Cylinder_Boom',
    name: 'Cylinder-Driven Boom',
    category: 'start',
    description:
      'A hydraulic cylinder pushes, and the boom swings up the way a digger lifts its arm.',
    thumbnail: 'assets/gifs/cylinder-boom.png',
    animation: 'assets/gifs/cylinder-boom.gif',
  },
  {
    id: 'Parallelogram',
    name: 'Parallelogram',
    category: 'start',
    description:
      'Opposite links are equal, so the coupler never tilts as the crank turns. A desk lamp’s arm uses this to keep its head level.',
    thumbnail: 'assets/gifs/parallelogram.png',
    animation: 'assets/gifs/parallelogram.gif',
  },
  {
    id: 'Locked_Four_Bar',
    name: 'Four-Bar with Fixed Lengths',
    category: 'start',
    description:
      'Fixed Length and Fixed Angle are on, so dragging a joint only changes what is left free. Turn one off and drag again.',
    thumbnail: 'assets/gifs/locked-four-bar.png',
    animation: 'assets/gifs/locked-four-bar.gif',
  },
  {
    id: 'Four_Bar_Inversions',
    name: 'Four-Bar Inversions',
    category: 'start',
    description:
      'The same four links, each time with a different one held still: watch a crank in one become the coupler in another.',
    thumbnail: 'assets/gifs/four-bar-inversions.png',
    animation: 'assets/gifs/four-bar-inversions.gif',
  },
  {
    id: 'Slider_Crank_Inversions',
    name: 'Slider-Crank Inversions',
    category: 'start',
    description:
      'One slider-crank held still four ways: an engine, a quick-return, an oscillating cylinder and a hand pump.',
    thumbnail: 'assets/gifs/slider-crank-inversions.png',
    animation: 'assets/gifs/slider-crank-inversions.gif',
  },

  // Real-Life Use Cases: each traced by hand over a picture of the machine,
  // and each card opens on that picture. The placements are the ones the
  // drawings were made at, in centimeters, which the backdrop service
  // converts into whatever unit the payload opens in.
  {
    id: 'Aircraft_Landing_Gear',
    name: 'Aircraft Landing Gear',
    category: 'realworld',
    description:
      'A cylinder folds the main gear up into the wing: drag brace, strut and wheel, traced over the aircraft.',
    thumbnail: 'assets/gifs/aircraft-landing-gear.png',
    animation: 'assets/gifs/aircraft-landing-gear.gif',
    backdrop: {
      src: 'assets/backdrops/aircraft-landing-gear.png',
      width: 14.35,
      centerX: 2.81,
      centerY: 6.22,
      opacity: 0.8,
    },
  },
  {
    id: 'Hood_Hinge',
    name: 'Car Hood Hinge',
    category: 'realworld',
    description:
      'A hood hinge with a gas strut: the hood swings up and back, clear of the fender, traced over the car.',
    thumbnail: 'assets/gifs/hood-hinge.png',
    animation: 'assets/gifs/hood-hinge.gif',
    backdrop: {
      src: 'assets/backdrops/hood-hinge.jpg',
      width: 14.36,
      centerX: 1.53,
      centerY: 0.09,
      opacity: 1,
    },
  },
  {
    id: 'Excavator_Bucket',
    name: 'Excavator Bucket',
    category: 'realworld',
    description:
      'How a digger curls its bucket, traced over its drawing: a cylinder, a bell crank, and the link that tips the bucket.',
    thumbnail: 'assets/gifs/excavator-bucket.png',
    animation: 'assets/gifs/excavator-bucket.gif',
    backdrop: {
      src: 'assets/backdrops/backhoe-bucket.png',
      width: 5.99,
      centerX: -0.08,
      centerY: -0.06,
      opacity: 0.8,
    },
  },
  {
    id: 'Car_Steering',
    name: 'Car Steering',
    category: 'realworld',
    description:
      'Swing the center arm and two tie rods steer both front wheels together. Drawn at full size, in meters.',
    thumbnail: 'assets/gifs/car-steering.png',
    animation: 'assets/gifs/car-steering.gif',
    // Drawn in meters: 2.26 m wide, centered a centimeter left and eight up.
    backdrop: {
      src: 'assets/backdrops/car-steering.png',
      width: 226,
      centerX: -1,
      centerY: 8,
      opacity: 0.8,
    },
  },
  // These two are generated from fixtures rather than drawn by hand, and their
  // pictures were drawn around the fixtures' pins (each SVG says how).
  {
    id: 'Locking_Pliers',
    name: 'Locking Pliers',
    category: 'realworld',
    description:
      'Squeeze, and the jaws stop closing as the toggle link comes into line, then lock just past it. A cylinder plays your hand.',
    thumbnail: 'assets/gifs/locking-pliers.png',
    animation: 'assets/gifs/locking-pliers.gif',
    // Drawn in inches: 11.6 in wide, centered at (5.2, -0.2) in.
    backdrop: {
      src: 'assets/backdrops/locking-pliers.svg',
      width: 29.464,
      centerX: 13.208,
      centerY: -0.508,
      opacity: 0.8,
    },
  },
  {
    id: 'Double_Wishbone',
    name: 'Double-Wishbone Suspension',
    category: 'realworld',
    description:
      'Two arms of unequal length carry a front wheel: as it rises it leans into the turn, and the tire hardly slides. Drawn at full size.',
    thumbnail: 'assets/gifs/double-wishbone.png',
    animation: 'assets/gifs/double-wishbone.gif',
    backdrop: {
      src: 'assets/backdrops/double-wishbone.svg',
      width: 104,
      centerX: 30,
      centerY: 36,
      opacity: 0.8,
    },
  },
  {
    id: 'Steam_Locomotive',
    name: 'Steam Locomotive',
    category: 'realworld',
    description:
      'A main rod and coupling rods link the piston to all three wheels, and valve gear slides the valve that lets steam in and out.',
    thumbnail: 'assets/gifs/steam-locomotive.png',
    animation: 'assets/gifs/steam-locomotive.gif',
    backdrop: {
      src: 'assets/backdrops/steam-locomotive.svg',
      width: 1060,
      centerX: 235,
      centerY: 186.5,
      opacity: 0.8,
    },
  },

  // Back-and-Forth Motion
  {
    id: 'Scotch_Yoke_Rod',
    name: 'Scotch Yoke',
    category: 'backforth',
    description:
      'A pin on a turning disc slides in the yoke’s slot and pushes the rod back and forth through its bearings in perfectly smooth strokes.',
    thumbnail: 'assets/gifs/scotch-yoke.png',
    animation: 'assets/gifs/scotch-yoke.gif',
  },
  {
    id: 'Flywheel_Engine',
    name: 'Engine with a Flywheel',
    category: 'backforth',
    description:
      'The crank drawn as the flywheel it really is, driving a piston up and down its guide.',
    thumbnail: 'assets/gifs/flywheel-engine.png',
    animation: 'assets/gifs/flywheel-engine.gif',
  },
  {
    id: 'Radial_Engine',
    name: 'Radial Engine',
    category: 'backforth',
    description:
      'Five pistons share one crank, as in an old propeller plane. Each piston travels twice the crank’s length.',
    thumbnail: 'assets/gifs/radial-engine.png',
    animation: 'assets/gifs/radial-engine.gif',
  },
  {
    id: 'Whitworth_Quick_Return',
    name: 'Whitworth Quick-Return',
    category: 'backforth',
    description:
      'A machine tool drive that cuts slowly and returns quickly: the crank turns the slotted link all the way round, unevenly.',
    thumbnail: 'assets/gifs/whitworth.png',
    animation: 'assets/gifs/whitworth.gif',
  },
  {
    id: 'Shaper_Quick_Return',
    name: 'Shaper Quick-Return',
    category: 'backforth',
    description:
      'A metal shaper’s drive: the tool slides forward slowly to cut and comes back fast, saving time on every stroke.',
    thumbnail: 'assets/gifs/shaper-quick-return.png',
    animation: 'assets/gifs/shaper-quick-return.gif',
  },
  {
    id: 'Pumpjack',
    name: 'Pumpjack',
    category: 'backforth',
    description:
      'An oil-field pump: a turning crank rocks the walking beam, which lifts the pump rod straight up and down out of the well.',
    thumbnail: 'assets/gifs/pumpjack.png',
    animation: 'assets/gifs/pumpjack.gif',
  },

  // Swing, Lift and Grip
  {
    id: 'Windshield_Wiper',
    name: 'Windshield Wiper',
    category: 'swing',
    description:
      'One motor turning round, two wiper arms sweeping back and forth together across the glass.',
    thumbnail: 'assets/gifs/windshield-wiper.png',
    animation: 'assets/gifs/windshield-wiper.gif',
  },
  {
    id: 'Oscillating_Fan',
    name: 'Oscillating Fan',
    category: 'swing',
    description:
      'The motor rides on the fan head it swings: its crank turns all the way round while the head sweeps side to side.',
    thumbnail: 'assets/gifs/oscillating-fan.png',
    animation: 'assets/gifs/oscillating-fan.gif',
  },
  {
    id: 'Cylinder_Gripper',
    name: 'Parallel Gripper',
    category: 'swing',
    description:
      'A cylinder closes two jaws that stay level the whole way and meet flat, like a robot’s gripper.',
    thumbnail: 'assets/gifs/cylinder-gripper.png',
    animation: 'assets/gifs/cylinder-gripper.gif',
  },
  {
    id: 'Scissor_Lift',
    name: 'Scissor Lift',
    category: 'swing',
    description:
      'A cylinder pushes crossed arms apart to raise the platform straight up, one end of each arm sliding.',
    thumbnail: 'assets/gifs/scissor-lift.png',
    animation: 'assets/gifs/scissor-lift.gif',
  },
  {
    id: 'Offset_Mount_Hatch',
    name: 'Bracketed Hatch',
    category: 'swing',
    description:
      'A cylinder on welded brackets lifts a hinged hatch. Trace the hatch’s tip and compare its travel with the cylinder’s.',
    thumbnail: 'assets/gifs/offset-mount-hatch.png',
    animation: 'assets/gifs/offset-mount-hatch.gif',
  },

  // Drawing a Path
  {
    id: 'Chebyshev_Straight_Line',
    name: 'Chebyshev Straight-Line',
    category: 'paths',
    description:
      'Four links that draw a nearly straight line: watch the middle of the top link run almost flat.',
    thumbnail: 'assets/gifs/chebyshev.png',
    animation: 'assets/gifs/chebyshev.gif',
  },
  {
    id: 'Watt_Straight_Line',
    name: 'Watt’s Straight-Line',
    category: 'paths',
    description:
      'Two arms rock, and the middle of the short link between them runs up and down a nearly straight line. Cars use it to guide a rear axle.',
    thumbnail: 'assets/gifs/watt-straight-line.png',
    animation: 'assets/gifs/watt-straight-line.gif',
  },
  {
    id: 'Peaucellier',
    name: 'Peaucellier-Lipkin',
    category: 'paths',
    description:
      'The first mechanism found to draw a perfectly straight line using only pins and links, with no guide to slide on.',
    thumbnail: 'assets/gifs/peaucellier.png',
    animation: 'assets/gifs/peaucellier.gif',
  },
  {
    id: 'Elliptical_Trammel',
    name: 'Elliptical Trammel',
    category: 'paths',
    description:
      'Two blocks slide on crossed guides and swing a bar between them, so the traced point on the bar runs along an ellipse.',
    thumbnail: 'assets/gifs/elliptical-trammel.png',
    animation: 'assets/gifs/elliptical-trammel.gif',
  },
  {
    id: 'Pantograph',
    name: 'Pantograph',
    category: 'paths',
    description: 'A copying tool: the pen draws the same curve as the tracer, at half the size.',
    thumbnail: 'assets/gifs/pantograph.png',
    animation: 'assets/gifs/pantograph.gif',
  },
  {
    id: 'Jansen_Leg',
    name: 'Jansen Leg',
    category: 'paths',
    description:
      'One leg of Theo Jansen’s wind-walking Strandbeest: a turning crank makes the foot step along the ground.',
    thumbnail: 'assets/gifs/jansen-leg.png',
    animation: 'assets/gifs/jansen-leg.gif',
  },

  // Forces
  {
    id: 'Punch_Press',
    name: 'Punch Press',
    category: 'forces',
    description:
      'Watch the torque the crank needs climb as the punch meets its load, then fall away on the way back up.',
    thumbnail: 'assets/gifs/punch-press.png',
    animation: 'assets/gifs/punch-press.gif',
  },
  {
    id: 'Toggle_Clamp',
    name: 'Toggle Clamp',
    category: 'forces',
    description:
      'Why a clamp holds so hard: as two links line up, a small push on the handle becomes a huge clamping force. Drawn in inches.',
    thumbnail: 'assets/gifs/toggle-clamp.png',
    animation: 'assets/gifs/toggle-clamp.gif',
  },
  {
    id: 'Crane_Two_Loads',
    name: 'Crane with Two Loads',
    category: 'forces',
    description:
      'A hook load that always hangs straight down and a rope pull that turns with the jib: two ways a force can point.',
    thumbnail: 'assets/gifs/crane-two-loads.png',
    animation: 'assets/gifs/crane-two-loads.gif',
  },
  {
    id: 'Offset_Load_Rocker',
    name: 'Offset Load Rocker',
    category: 'forces',
    description:
      'A load placed off the line of its link also twists it. Compare the joint forces with a load along the link.',
    thumbnail: 'assets/gifs/offset-load-rocker.png',
    animation: 'assets/gifs/offset-load-rocker.gif',
  },
  {
    id: 'Reciprocating_Saw',
    name: 'Reciprocating Saw',
    category: 'forces',
    description:
      'A saw blade pushed back and forth against the wood: compare the crank torque on the cutting stroke and the return.',
    thumbnail: 'assets/gifs/reciprocating-saw.png',
    animation: 'assets/gifs/reciprocating-saw.gif',
  },
  {
    id: 'Slotted_Tool_Drive',
    name: 'Slotted Tool Drive',
    category: 'forces',
    description:
      'A cutting load that turns with the tool and a weight that always hangs down: compare the torque and pin forces.',
    thumbnail: 'assets/gifs/slotted-tool-drive.png',
    animation: 'assets/gifs/slotted-tool-drive.gif',
  },

  // Six-Bars and Beyond
  {
    id: 'Bell_Crank',
    name: 'Bell Crank',
    category: 'sixbar',
    description:
      'A crank drives an L-shaped lever, welded from two links, that passes the motion round a corner to a second rocker.',
    thumbnail: 'assets/gifs/bell-crank.png',
    animation: 'assets/gifs/bell-crank.gif',
  },
  {
    id: 'Dwell_Six_Bar',
    name: 'Six-Bar with a Dwell',
    category: 'sixbar',
    description:
      'The output link swings out and back, then stands still for a third of every turn while the crank keeps going.',
    thumbnail: 'assets/gifs/dwell-six-bar.png',
    animation: 'assets/gifs/dwell-six-bar.gif',
  },
  {
    id: 'Watt_I',
    name: 'Watt I',
    category: 'sixbar',
    description:
      'Two triangles pinned straight to each other, and both free to move: the first of the two Watt six-bars.',
    thumbnail: 'assets/gifs/watt-i.png',
    animation: 'assets/gifs/watt-i.gif',
  },
  {
    id: 'Watt_II',
    name: 'Watt II',
    category: 'sixbar',
    description:
      'Two four-bars in a row, the first one’s rocker driving the second: the other Watt six-bar.',
    thumbnail: 'assets/gifs/watt-ii.png',
    animation: 'assets/gifs/watt-ii.gif',
  },
  {
    id: 'Stephenson_III',
    name: 'Stephenson III',
    category: 'sixbar',
    description:
      'A six-bar whose two triangles never touch: other links sit between them, unlike in a Watt six-bar.',
    thumbnail: 'assets/gifs/stephenson-iii.png',
    animation: 'assets/gifs/stephenson-iii.gif',
  },
  {
    id: 'Elliptical_Crank',
    name: 'Elliptical Crank',
    category: 'sixbar',
    description:
      'A turning crank and a sliding block steer one long link, so its far end draws a neat ellipse.',
    thumbnail: 'assets/gifs/elliptical-crank.png',
    animation: 'assets/gifs/elliptical-crank.gif',
  },
  {
    id: 'Double_Butterfly',
    name: 'Double Butterfly',
    category: 'sixbar',
    description:
      'Eight links with no simple four-bar anywhere inside, yet one crank still drives every one of them smoothly.',
    thumbnail: 'assets/gifs/double-butterfly.png',
    animation: 'assets/gifs/double-butterfly.gif',
  },

  // Multiple Mechanisms
  {
    id: 'Walking_Pair',
    name: 'Walking Pair',
    category: 'machines',
    description:
      'Two Jansen legs half a cycle apart: one foot stays planted while the other swings forward, the way you walk.',
    thumbnail: 'assets/gifs/walking-pair.png',
    animation: 'assets/gifs/walking-pair.gif',
  },
  {
    id: 'Pumping_Field',
    name: 'Pumping Field',
    category: 'machines',
    description:
      'Three pumpjacks at slightly different speeds drift in and out of step, each on its own animation row.',
    thumbnail: 'assets/gifs/pumping-field.png',
    animation: 'assets/gifs/pumping-field.gif',
  },
  {
    id: 'Straight_Line_Pair',
    name: 'Approximate and Exact',
    category: 'machines',
    description:
      'Chebyshev’s line beside Peaucellier’s: one bows very slightly, the other is perfectly straight.',
    thumbnail: 'assets/gifs/straight-line-pair.png',
    animation: 'assets/gifs/straight-line-pair.gif',
  },
];

/**
 * Drawings for working on the app rather than for learning a mechanism.
 *
 * Kept apart from the list above because the dialog only offers them in a
 * development build. Most payloads come from `dev-templates.ts`; the last few
 * are library drawings retired from the published library, whose payloads stay
 * in `template-linkages.ts` because specs and e2e suites still open them.
 */
export const DEV_TEMPLATE_CARDS: readonly TemplateCard[] = [
  {
    id: 'Dev_All_Mechanism_Types',
    name: 'Every Kind of Mechanism',
    category: 'dev',
    description:
      'A crank, a cylinder, a slider and a chain that never reaches ground — every readiness state ' +
      'and every animation row at once.',
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
  // Redrawn in the 2026-11 review: the library's Four-Bar and Scotch Yoke cards
  // open new drawings now, and these are the old ones under their old ids.
  {
    id: '4-Bar',
    name: 'Four-Bar, First Drawing',
    category: 'dev',
    description:
      'The first four-bar drawing, with no traced point. Specs and e2e suites open it; the library’s Four-Bar adds a coupler point.',
    thumbnail: 'assets/gifs/four-bar-plain.png',
    animation: 'assets/gifs/four-bar-plain.gif',
  },
  {
    id: 'Scotch_Yoke',
    name: 'Scotch Yoke on One Guide',
    category: 'dev',
    description:
      'The yoke on a single guide under its slot. Specs and e2e suites open it; the library draws the yoke on a rod through two bearings.',
    thumbnail: 'assets/gifs/scotch-yoke-one-guide.png',
    animation: 'assets/gifs/scotch-yoke-one-guide.gif',
  },
  // Retired from the published library in the 2026-11 review
  // (PMKS-Web/PMKSWeb issue 247): the crosshead tested welds rather than
  // teaching anything, the derrick repeated Crane with Two Loads, and Three
  // Mechanisms only showed what Walking Pair and Pumping Field show with a story
  // attached.
  {
    id: 'Hydraulic_Crosshead',
    name: 'Hydraulic Crosshead',
    category: 'dev',
    description:
      'A barrel welded to its frame and a crosshead welded to its rod: both ends keep their attachments rigid.',
    thumbnail: 'assets/gifs/hydraulic-crosshead.png',
    animation: 'assets/gifs/hydraulic-crosshead.gif',
  },
  {
    id: 'Derrick_Crane',
    name: 'Derrick Crane',
    category: 'dev',
    description:
      'A weight far out on a boom held close in — the link carries several times the load.',
    thumbnail: 'assets/gifs/derrick-crane.png',
    animation: 'assets/gifs/derrick-crane.gif',
  },
  {
    id: 'Three_Machines',
    name: 'Three Mechanisms',
    category: 'dev',
    description:
      'Three mechanisms in one drawing, each on its own animation row at its own speed and direction.',
    thumbnail: 'assets/gifs/three-machines.png',
    animation: 'assets/gifs/three-machines.gif',
  },
];

/** Where every shipped backdrop lives, which is how one is told from a reader's own. */
export const BACKDROP_ASSETS = 'assets/backdrops/';

/**
 * Put a card's picture up, or take down the one the last card left.
 *
 * Both doors into the library end here -- opening in place, and a fresh tab
 * reading the name off its own hash -- so the two cannot drift.
 *
 * A picture the *reader* dropped in is left alone. Opening a template replaces
 * the mechanism, which is what the dialog warns about; it does not promise to
 * throw away the photograph they were tracing against, and a file they chose is
 * not this code's to delete. Only a backdrop this shipped is cleared, which is
 * why they live under one folder.
 *
 * Failure is not worth a message to the reader: a missing backdrop costs them a
 * tracing aid rather than their mechanism. It is worth the console, because a
 * row naming an asset that is not there is a mistake in this file.
 */
export async function placeTemplateBackdrop(
  images: BackgroundImageService,
  backdrop: TemplateBackdrop | undefined
): Promise<void> {
  if (!backdrop) {
    if (images.image()?.src.startsWith(BACKDROP_ASSETS)) images.remove();
    return;
  }
  // A card's own picture never displaces one the reader chose. Replacing the
  // mechanism is what the choice dialog warned about; their file was not part
  // of that bargain, and it cannot be got back -- background images are outside
  // both the URL and the history. The reader can clear theirs and reopen the
  // card if they want the backdrop.
  const standing = images.image();
  if (standing && !standing.src.startsWith(BACKDROP_ASSETS)) return;
  try {
    await images.placeInCentimeters(backdrop.src, {
      width: backdrop.width,
      centerX: backdrop.centerX,
      centerY: backdrop.centerY,
      rotationRad: backdrop.rotationRad,
      opacity: backdrop.opacity,
    });
  } catch (error) {
    console.error(`Backdrop ${backdrop.src} could not be placed`, error);
  }
}

/** The picture a card of this name ships, if it ships one. */
export function backdropOfCard(id: string | null): TemplateBackdrop | undefined {
  if (!id) return undefined;
  return TEMPLATE_CARDS.find((card) => card.id === id)?.backdrop;
}
