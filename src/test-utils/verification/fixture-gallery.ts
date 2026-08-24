import { MechanismFixture, BuiltMechanism, buildMechanism } from './fixture';
import {
  fourBarDrivenAtFixture,
  sliderCrankTracerFixture,
  stephensonIiiEx2Fixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  twoFourBarsFixture,
  wattIFixture,
} from './fixtures';
import {
  cylinderBoomFixture,
  cylinderSkinFixture,
  gripperFixture,
  pinchingGripperFixture,
  ellipticalCrankFixture,
  ellipticalTrammelFixture,
  invertedSliderCrankFixture,
  loadedInvertedSliderCrankFixture,
  scotchYokeFixture,
  scotchYokeGuidedAtFarEndFixture,
  scotchYokeWithTracerFixture,
  motionGenGripperFixture,
  pivotingGripperFixture,
  chebyshevStraightLineFixture,
  radialEngineFixture,
  windshieldWiperFixture,
  slottedCouplerFixture,
  squareRodSliderCrankFixture,
  WHITWORTH_CRANK,
  WHITWORTH_OFFSET,
} from './slot-fixtures';
import {
  jibCraneFixture,
  offsetLoadFourBarFixture,
  punchPressFixture,
  toggleClampFixture,
} from './force-fixtures';
import {
  excavatorBucketFixture,
  jansenLegFixture,
  oscillatingFanFixture,
  pedalingLegFixture,
  pumpjackFixture,
  scissorLiftFixture,
  shaperQuickReturnFixture,
  togglePressFixture,
} from './library-fixtures';
import {
  flywheelSliderCrankFixture,
  craneWithTwoLoadsFixture,
  threeMachinesFixture,
} from './feature-fixtures';
import { peaucellierFixture, pantographFixture, doubleButterflyFixture } from './classic-fixtures';
import {
  dragLinkFixture,
  bellCrankFixture,
  linearActuatorRockerFixture,
} from './workshop-fixtures';
import {
  walkingPairFixture,
  straightLinePairFixture,
  pumpingFieldFixture,
} from './ensemble-fixtures';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { ColorService } from '../../app/services/color.service';
import { urlGeneratorFor } from '../url-encoding';
import { Link, RealLink } from '../../app/model/link';
import { MODEL_SCALE } from '../../app/model/render-scale';

/**
 * Every mechanism the verification suite asserts on, as something a reviewer
 * can open.
 *
 * A fixture is a TypeScript object; the app only speaks URLs. Encoding one into
 * the other means anybody reviewing a solver change can load the exact linkage a
 * failing test is about, instead of reading coordinates out of a spec file and
 * rebuilding it by hand.
 */
/**
 * The drawing scale a published mechanism opens at.
 *
 * 0.7, matching the app's own default: pins and bar widths large enough to grab
 * without the parts crowding the linkage they belong to. A template that opened
 * at a different scale from a fresh grid meant the first joint a user added
 * arrived a visibly different size from the ones already there.
 */
const DEFAULT_OBJECT_SCALE = 0.7 * MODEL_SCALE;

/**
 * Lift a fixture-built mechanism from user units into the internal model
 * world (render-scale.ts).
 *
 * Fixtures stay in the user's units because the solver specs assert MATLAB
 * numbers against them directly. Encoding, though, happens at the codec
 * boundary, where coordinates are internal and divide by MODEL_SCALE on the
 * way out — so the copy built for a URL scales up first, and the published
 * payload carries exactly the numbers it always has.
 */
function scaleBuiltToModelUnits(built: BuiltMechanism): void {
  built.joints.forEach((joint) => {
    joint.x *= MODEL_SCALE;
    joint.y *= MODEL_SCALE;
  });
  const scaleLink = (link: Link): void => {
    if (!(link instanceof RealLink)) return;
    link.CoM.x *= MODEL_SCALE;
    link.CoM.y *= MODEL_SCALE;
    link.subset.forEach(scaleLink);
  };
  built.links.forEach(scaleLink);
  built.forces.forEach((force) => {
    force.startCoord.x *= MODEL_SCALE;
    force.startCoord.y *= MODEL_SCALE;
    force.endCoord.x *= MODEL_SCALE;
    force.endCoord.y *= MODEL_SCALE;
  });
}

/**
 * Take the mass and inertia off a built copy, blocks and welded members
 * included.
 *
 * Every body, not only the bars: the solver hangs a slider block's weight from
 * gravity too, so a drawing whose only massive part is a block is still a
 * loaded one.
 */
function stripMass(built: BuiltMechanism): void {
  const strip = (link: Link): void => {
    link.mass = 0;
    if (link instanceof RealLink) {
      link.massMoI = 0;
      link.subset.forEach(strip);
    }
  };
  built.links.forEach(strip);
}

export interface GalleryEntry {
  name: string;
  /** What this mechanism is for — one line, as it appears in the published table. */
  purpose: string;
  /** Where it is asserted, so the link and the assertions stay findable together. */
  spec: string;
  /** True when the mechanism uses a slot cut into a moving link. */
  floatingSlot: boolean;
  /** True when a rider is welded rigid to its block — a Slide (§2.1). */
  slide?: boolean;
  /**
   * How large the app should draw pins and bar widths, in model units.
   *
   * Omitted means the default a fresh app uses, which suits the mechanisms
   * built at single-digit sizes — nearly all of them. Set it where the
   * mechanism is built at a much larger scale, or it draws as hairlines.
   */
  objectScale?: number;
  /**
   * How fast this mechanism opens running, when the shared default is wrong for
   * it. A stroke of a few centimetres crossed at the default 5 cm/s is over
   * before it can be watched, and a demonstration of a straight line is worth
   * nothing at a speed nobody can follow.
   */
  speed?: PublishedSpeed;
  fixture: MechanismFixture;
}

/**
 * Whether a published mechanism carries the masses its fixture gives it.
 *
 * `buildMechanism` hands every link a mass and a moment of inertia of 1 unless
 * the fixture says otherwise, gravity is on by default, and weight counts as a
 * load — so a mechanism published as built reports itself ready for force
 * analysis whatever it is about. That hands a student who opened a plain
 * kinematics example a force problem nobody set, which is why the library
 * publishes massless unless the mechanism *is* about force (see
 * `FORCE_STUDY_TEMPLATES` in template-fixtures.ts).
 *
 * Zeroing happens on the built copy, on the way into the URL, and never on the
 * fixture: several of these mechanisms are also what the MATLAB force specs
 * assert reactions against, and taking their mass away in place would destroy
 * the thing those specs verify.
 */
export type PublishedMasses = 'as-built' | 'zeroed';

/** Whichever of the two input speeds a mechanism actually uses. */
export interface PublishedSpeed {
  /** Turns per minute, for a mechanism driven at a pin. */
  rpm?: number;
  /** User length units per second, for one driven along a slot. */
  unitsPerSecond?: number;
}

/**
 * The pace a published mechanism opens at: one cycle in five to eight seconds
 * of wall-clock time at 1x. Fast enough to see the whole of, slow enough to
 * follow one part round it.
 *
 * A cycle takes 60/RPM seconds when the input turns right round, so a linkage
 * whose crank does that runs at this number and lands on six seconds. The two
 * other kinds do not, and each is written out where it appears with the cycle
 * time it lands on, because the arithmetic is not visible from the number: an
 * input that only *rocks* covers a fraction of a revolution per cycle and
 * needs fewer RPM to fill the same seconds, and one driven along a slot is
 * quoted in length per second and has to be set against its own stroke.
 */
const LIBRARY_RPM = 10;

export const FIXTURE_GALLERY: GalleryEntry[] = [
  {
    name: 'Punch press',
    purpose:
      'A load on the ram: the crank torque spikes where the rod comes into line with the slide',
    spec: 'force-templates.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: punchPressFixture(),
  },
  {
    name: 'Derrick crane',
    purpose: 'A weight far out on a boom held close in: the link carries several times the load',
    spec: 'force-templates.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: jibCraneFixture(),
  },
  {
    name: 'Toggle clamp',
    purpose:
      'Where mechanical advantage comes from: the clamping force runs away as the links line up',
    spec: 'force-templates.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: toggleClampFixture(),
  },
  {
    name: 'Rocker with an offset load',
    purpose: 'A load off the line of its link is a moment — the term a free-body sketch leaves out',
    spec: 'force-templates.spec.ts',
    floatingSlot: false,
    // Non-Grashof, so the input binds and comes back: 309 degrees of command
    // per cycle rather than 360, and 16 RPM is what puts that at 6.4 s.
    speed: { rpm: 16 },
    fixture: offsetLoadFourBarFixture(),
  },
  {
    name: 'Hydraulic cylinder',
    purpose: 'Cylinder skin (§2.7): a rod welded to a block sliding in a barrel, all on one line',
    spec: 'cylinder.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: cylinderSkinFixture(),
  },
  {
    name: 'Cylinder-driven boom',
    purpose: 'Gate 5: the cylinder is the drive, and the boom follows the law of cosines',
    spec: 'driven-cylinder.spec.ts',
    floatingSlot: true,
    slide: true,
    // A hand's pace. The shared default of 5 cm/s runs this ram end to end in
    // well under a second, which shows a boom that jumps rather than one that
    // lifts. 5.43 cm of travel per raise-and-lower, so this is 5.4 s.
    speed: { unitsPerSecond: 1 },
    fixture: cylinderBoomFixture(),
  },
  {
    name: 'Cylinder-driven gripper',
    purpose: '§2.7a: no chain of dyads solves this — the plate and both arms settle together',
    spec: 'gripper.spec.ts, anchored-bar-mobility.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: gripperFixture(),
  },
  {
    name: 'Gripper the cylinder closes',
    purpose: 'Counter-rotating jaw levers: extending the cylinder pinches them shut',
    spec: 'pinching-gripper.spec.ts',
    floatingSlot: true,
    slide: true,
    // A stroke of 1.47 cm, out and back, so 0.25 cm/s closes and opens the
    // jaws in 5.9 s. At the shared default of 5 cm/s it is over in a third of
    // a second.
    speed: { unitsPerSecond: 0.25 },
    fixture: pinchingGripperFixture(),
  },
  {
    name: 'Backhoe bucket',
    purpose: 'A driven ram feeding an ordinary four-bar: bell crank, link, and the bucket curls',
    spec: 'excavator-bucket.spec.ts',
    floatingSlot: true,
    slide: true,
    // 7.42 cm of ram travel per curl-and-open, so 1.2 cm/s takes 6.2 s.
    speed: { unitsPerSecond: 1.2 },
    fixture: excavatorBucketFixture(),
  },
  {
    name: 'Toggle press',
    purpose:
      'A ram closing a toggle onto a block: travel traded for force as it approaches straight',
    spec: 'toggle-press.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: togglePressFixture(),
  },
  {
    name: 'Scissor lift',
    purpose:
      'Ram, supporting block and a slot in the moving platform — all three parts, three jobs',
    spec: 'scissor-lift.spec.ts',
    floatingSlot: true,
    slide: true,
    // 7.61 cm of ram travel per lift-and-lower. A big machine is worth
    // watching at the slow end of the window, so 1 cm/s and 7.6 s.
    speed: { unitsPerSecond: 1 },
    fixture: scissorLiftFixture(),
  },
  {
    name: "Shaper's quick-return drive",
    purpose: 'A floating slot handing off to a grounded one: the ram cuts slow and returns fast',
    spec: 'shaper-quick-return.spec.ts',
    floatingSlot: true,
    slide: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: shaperQuickReturnFixture(),
  },
  {
    name: 'Slider-crank whose rod comes square to the guide',
    purpose: 'The slot tangent to the rod circle: the two roots meet and trade places',
    spec: 'square-rod-tangency.spec.ts',
    floatingSlot: false,
    fixture: squareRodSliderCrankFixture(),
  },
  {
    name: 'MotionGen gripper',
    purpose:
      "A second engine's mechanism, rebuilt: over-constrained, so PMKS+ reports DOF 0 and refuses it",
    spec: 'motiongen-gripper.spec.ts',
    floatingSlot: false,
    slide: false,
    fixture: motionGenGripperFixture(),
  },
  {
    name: 'Gripper with the redundancy removed',
    purpose: 'The same gripper, jaws pivoting instead of railed: DOF 1, and it runs',
    spec: 'pivoting-gripper.spec.ts',
    floatingSlot: false,
    slide: false,
    fixture: pivotingGripperFixture(),
  },
  {
    name: 'Radial engine, five cylinders',
    purpose: 'Five sliders on one crank pin; piston stroke is exactly twice the throw',
    spec: 'radial-engine.spec.ts',
    floatingSlot: false,
    slide: false,
    // Five pistons to follow at once, so the slow end of the window: 7.5 s.
    speed: { rpm: 8 },
    fixture: radialEngineFixture(),
  },
  {
    name: 'Chebyshev straight-line linkage',
    purpose: 'Approximate straight-line generation: the coupler midpoint runs flat along the top',
    spec: 'chebyshev-straight-line.spec.ts',
    floatingSlot: false,
    slide: false,
    // Slow, because the point of it is a straight line and a line is something
    // to be watched being drawn. The crank rocks through 129 degrees rather
    // than turning, so a cycle is a third of a revolution of command and 3 RPM
    // puts it at 7.2 s — the slow end of the window, deliberately.
    speed: { rpm: 3 },
    fixture: chebyshevStraightLineFixture(),
  },
  {
    name: 'Windshield wiper',
    purpose: 'Crank-rocker: continuous rotation into a bounded sweep, against the closed form',
    spec: 'windshield-wiper.spec.ts',
    floatingSlot: false,
    slide: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: windshieldWiperFixture(),
  },
  {
    name: 'Jansen leg',
    purpose: "One leg of a Strandbeest: eight bars on Jansen's holy numbers, and the foot walks",
    spec: 'jansen-leg.spec.ts',
    floatingSlot: false,
    slide: false,
    // Jansen's holy numbers run to 65 units where the rest of the gallery is
    // single-digit, and pin radius and bar width are absolute rather than
    // relative to the linkage. At the default the leg draws as hairlines with
    // no visible pins. Scaling the drawing rather than the fixture keeps the
    // published numbers exactly as Jansen quotes them.
    // Kept at ten times the default rather than at a number of its own, so it
    // moves with it: this is "much bigger than usual because the linkage is",
    // not an absolute size anybody measured.
    objectScale: 10 * DEFAULT_OBJECT_SCALE,
    // Eight bars, and the foot is the only one worth following. The slow end
    // of the window: 7.5 s a stride.
    speed: { rpm: 8 },
    fixture: jansenLegFixture(),
  },
  {
    name: 'Elliptical crank',
    purpose: 'A six-bar no dyad reaches: the coupler and its guided end have to be solved together',
    spec: 'elliptical-crank.spec.ts',
    floatingSlot: false,
    slide: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: ellipticalCrankFixture(),
  },
  {
    name: 'Inverted slider-crank',
    purpose: 'Inverse slot direction: position, velocity and acceleration against closed form',
    spec: 'inverted-slider-crank.spec.ts, slot-kinematics.spec.ts',
    floatingSlot: true,
    fixture: invertedSliderCrankFixture(),
  },
  {
    name: 'Whitworth proportions',
    purpose: 'Crank longer than the ground offset, so the lever turns instead of rocking',
    spec: 'slot-kinematics.spec.ts',
    floatingSlot: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: invertedSliderCrankFixture(WHITWORTH_OFFSET, WHITWORTH_CRANK),
  },
  {
    name: 'Inverted slider-crank with a load',
    purpose: 'Reactions equal and opposite across the slot, and normal to it',
    spec: 'slot-forces.spec.ts',
    floatingSlot: true,
    fixture: loadedInvertedSliderCrankFixture(),
  },
  {
    name: 'Four-bar with a slotted coupler',
    purpose: 'Forward slot direction: the only case where the carrier is solved first',
    spec: 'slotted-coupler.spec.ts',
    floatingSlot: true,
    fixture: slottedCouplerFixture(),
  },
  {
    name: 'Scotch yoke',
    purpose: 'Slide: a welded assembly translating on its guide, x = r cos theta',
    spec: 'scotch-yoke.spec.ts, scotch-yoke-kinematics.spec.ts',
    floatingSlot: true,
    slide: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: scotchYokeFixture(),
  },
  {
    name: 'Scotch yoke with a tracer',
    purpose: 'The slot measured from a joint on it, not from whichever member came first',
    spec: 'scotch-yoke.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: scotchYokeWithTracerFixture(),
  },
  {
    name: 'Scotch yoke guided at the far end',
    purpose: 'Same motion, but the loop reaches the welded rider along a link edge',
    spec: 'scotch-yoke-kinematics.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: scotchYokeGuidedAtFarEndFixture(),
  },
  {
    name: 'Elliptical trammel',
    purpose: 'Mobility for a linkage held only by its guides — no pin touches ground',
    spec: 'slot-mobility.spec.ts',
    floatingSlot: false,
    fixture: ellipticalTrammelFixture(),
  },
  {
    name: 'Four-bar driven at its coupler-rocker pin',
    purpose: 'Gate 6: a floating pin as the input \u2014 same coupler curve as driving the crank',
    spec: 'driven-floating-pin.spec.ts',
    floatingSlot: false,
    fixture: fourBarDrivenAtFixture('C'),
  },
  {
    name: 'Leg on a bicycle crank',
    purpose: 'A driven knee, carried by the thigh: one leg can only rock the crank half a turn',
    spec: 'pedaling-leg.spec.ts',
    floatingSlot: false,
    // The knee sweeps 132 degrees and comes back, so a cycle is a third of a
    // revolution of command: 4 RPM puts it at 5.5 s.
    speed: { rpm: 4 },
    fixture: pedalingLegFixture(),
  },
  {
    name: 'Oscillating fan',
    purpose:
      'The motor rides the head it sweeps: the driven pin turns right round, the head does not',
    spec: 'oscillating-fan.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: oscillatingFanFixture(),
  },
  {
    name: 'Walking-beam pumping unit',
    purpose: 'Driven where the pitman meets the beam, and the output is a straight-line stroke',
    spec: 'pumpjack.spec.ts',
    floatingSlot: false,
    // 120 degrees of command per nod, out and back, so 3 RPM is 6.7 s.
    speed: { rpm: 3 },
    fixture: pumpjackFixture(),
  },
  {
    name: 'TeachingLab four-bar',
    purpose: 'MATLAB-verified positions, velocities, accelerations and forces',
    spec: 'teaching-lab-four-bar.spec.ts',
    floatingSlot: false,
    fixture: teachingLabFourBarFixture(),
  },
  {
    name: 'TeachingLab four-bar, locked except the crank',
    purpose: 'Lock marks ride the URL: only the crank end drags, the rest is pinned black',
    spec: 'url-locking.spec.ts',
    floatingSlot: false,
    fixture: {
      ...teachingLabFourBarFixture(),
      locks: { links: ['BCFG', 'CDEI'] },
    },
  },
  {
    name: 'TeachingLab slider-crank',
    purpose: 'The grounded-guide path this phase had to leave byte-identical',
    spec: 'teaching-lab-slider-crank.spec.ts',
    floatingSlot: false,
    fixture: teachingLabSliderCrankFixture(),
  },
  {
    name: 'Slider-crank with a tracer',
    purpose: 'A tracer point on the coupler of a grounded slider',
    spec: 'slider-crank-tracer.spec.ts',
    floatingSlot: false,
    fixture: sliderCrankTracerFixture(),
  },
  {
    name: 'Stephenson III',
    purpose: 'Six-bar, MATLAB-verified',
    spec: 'stephenson-iii-ex2.spec.ts',
    floatingSlot: false,
    fixture: stephensonIiiEx2Fixture(),
  },
  {
    name: 'Watt I',
    purpose: 'Six-bar, MATLAB-verified',
    spec: 'watt-i.spec.ts',
    floatingSlot: false,
    fixture: wattIFixture(),
  },
  {
    name: 'Two four-bars',
    purpose: 'One drawing, two machines: each solves as its own 1-DoF M1 and M2',
    spec: 'two-mechanisms.spec.ts',
    floatingSlot: false,
    fixture: twoFourBarsFixture(),
  },
  {
    name: 'Engine with a flywheel',
    purpose:
      "The library's one circular link: a crank drawn as the disc it sweeps, driving a piston",
    spec: 'flywheel-slider-crank.spec.ts',
    floatingSlot: false,
    fixture: flywheelSliderCrankFixture(),
  },
  {
    name: 'Crane carrying two loads',
    purpose:
      'Global against local: the hook stays vertical while the rope pull swings with the jib',
    spec: 'crane-two-loads.spec.ts',
    floatingSlot: false,
    fixture: craneWithTwoLoadsFixture(),
  },
  {
    name: 'Three machines, three drives',
    purpose: 'M1, M2 and M3 in one drawing, each at its own speed and direction on its own row',
    spec: 'three-machines.spec.ts',
    floatingSlot: false,
    fixture: threeMachinesFixture(),
  },
  {
    name: 'Peaucellier-Lipkin linkage',
    purpose:
      'Exact straight-line generation: the rhombus inverts a circle through O into a ruled line',
    spec: 'peaucellier.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: peaucellierFixture(),
  },
  {
    name: 'Pantograph',
    purpose: "Pen and tracer in line with the pivot, so one draws the other's curve at half size",
    spec: 'pantograph.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: pantographFixture(),
  },
  {
    name: 'Double butterfly linkage',
    purpose: 'The eight-bar with no four-bar loop in it: six joints that only solve together',
    spec: 'double-butterfly.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: doubleButterflyFixture(),
  },
  {
    name: 'Drag link',
    purpose:
      'The four-bar whose output crank goes round too: move the shortest bar to the frame and the rocker stops rocking',
    spec: 'drag-link.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: dragLinkFixture(),
  },
  {
    name: 'Bell crank',
    purpose:
      'Two bars welded at a right angle: a push one way comes out of the far side pointing another',
    spec: 'bell-crank.spec.ts',
    floatingSlot: false,
    speed: { rpm: LIBRARY_RPM },
    fixture: bellCrankFixture(),
  },
  {
    // The mobility fixture above it is deliberately undriven — its whole point
    // is what the count says about a linkage held only by its guides. A reader
    // opening it from the library wants to watch the ellipse, so the published
    // one drives a slide and carries the tracer that draws it.
    name: 'Elliptical trammel, driven',
    purpose:
      'No pin touches ground: two blocks on crossed guides swing the bar through a true ellipse',
    spec: 'slot-mobility.spec.ts',
    floatingSlot: false,
    speed: { unitsPerSecond: 1.2 },
    fixture: ellipticalTrammelFixture(true, 1),
  },
  {
    name: 'Screw jack',
    purpose: 'A plain guided ram, no cylinder skin: the drive is a length per second, not an rpm',
    spec: 'linear-actuator-rocker.spec.ts',
    floatingSlot: false,
    speed: { unitsPerSecond: 2.2 },
    fixture: linearActuatorRockerFixture(1),
  },
  {
    name: 'Walking pair',
    purpose: 'Two Jansen legs half a cycle apart: one foot planted while the other swings',
    spec: 'ensembles.spec.ts',
    floatingSlot: false,
    objectScale: 7 * MODEL_SCALE,
    fixture: walkingPairFixture(),
  },
  {
    name: 'Approximate and exact',
    purpose: "Chebyshev's line bows and Peaucellier's does not — visible only side by side",
    spec: 'ensembles.spec.ts',
    floatingSlot: false,
    fixture: straightLinePairFixture(),
  },
  {
    name: 'Pumping field',
    purpose: 'Three beams on three clocks, drifting out of step the way a real field does',
    spec: 'ensembles.spec.ts',
    floatingSlot: false,
    fixture: pumpingFieldFixture(),
  },
];

/**
 * Encode a fixture into the query string the app decodes on load.
 *
 * Two pieces of global state are pinned first and put back afterwards: the link
 * colour cursor, and the object scale. Both are process-wide, so without this a
 * payload depends on what every earlier spec happened to do — the table would
 * differ between a full suite run and a single-file one, and the drift check
 * would fail for reasons with nothing to do with the mechanisms.
 *
 * `objectScale` is how large the app draws pins and bar widths, in model units;
 * it is a display setting rather than geometry, and the default is what a fresh
 * app uses. A mechanism whose bars are tens of units long needs a larger one or
 * it renders as hairlines — see the Jansen leg in template-fixtures.ts.
 */
export function fixturePayload(
  fixture: MechanismFixture,
  objectScale: number = DEFAULT_OBJECT_SCALE,
  speed: PublishedSpeed = {},
  masses: PublishedMasses = 'as-built'
): string {
  const previousColors = ColorService.instance;
  const previousScale = SettingsService.objectScale;
  new ColorService();
  SettingsService._objectScale.next(objectScale);
  try {
    const built = buildMechanism(fixture);
    scaleBuiltToModelUnits(built);
    if (masses === 'zeroed') stripMass(built);
    // The speeds ride the URL as settings rather than as anything on a joint,
    // so they are set on the service the encoder is about to read. A fresh one
    // per call, so nothing here leaks into the next mechanism's payload.
    const settings = new SettingsService();
    if (speed.rpm !== undefined) settings.inputSpeed.next(speed.rpm);
    if (speed.unitsPerSecond !== undefined) settings.linearInputSpeed.next(speed.unitsPerSecond);
    return urlGeneratorFor(
      {
        joints: built.joints,
        links: built.links,
        forces: built.forces,
        mechanismTimeStep: 0,
      } as unknown as MechanismService,
      settings
    ).generateUrlQuery();
  } finally {
    ColorService.instance = previousColors;
    SettingsService._objectScale.next(previousScale);
  }
}

/**
 * The published table.
 *
 * `baseUrl` is a parameter because a floating-slot payload only decodes on a
 * build that has Phase 2 in it — pointed at a release that predates this work,
 * those links fail validation rather than opening anything.
 */
export function galleryMarkdown(baseUrl: string): string {
  const rows = FIXTURE_GALLERY.map((entry) => {
    const link = `${baseUrl}/?${fixturePayload(entry.fixture, entry.objectScale, entry.speed)}`;
    const slot = entry.floatingSlot ? 'yes' : '—';
    const slide = entry.slide ? 'yes' : '—';
    return `| [${entry.name}](${link}) | ${entry.purpose} | ${slot} | ${slide} | \`${entry.spec}\` |`;
  });
  return [
    '<!-- Generated by src/tests/verification/fixture-gallery.spec.ts. Run `npm run fixture-urls` to refresh. -->',
    '',
    '# Verification mechanisms, as links',
    '',
    'Every mechanism the verification suite asserts on, encoded into a URL so a',
    'reviewer can open the exact mechanism a test is about instead of rebuilding it',
    'from coordinates in a spec file.',
    '',
    `Links point at \`${baseUrl}\`. **A mechanism marked "floating slot" only decodes on a`,
    'build that includes Phase 2** — on an older release the three extra URL tokens',
    'are refused rather than silently ignored, which is deliberate (§2.4a). A',
    'mechanism marked "Slide" decodes anywhere, because its weld is an existing',
    'flag — but it only *solves* on a build that includes Phase 3. For a pull',
    'request, regenerate against its deploy preview:',
    '',
    '```bash',
    // Deliberately a placeholder rather than a real preview number: pinning one
    // PR's preview here means every later regeneration re-emits a dead link.
    'PMKS_FIXTURE_BASE_URL=https://deploy-preview-NNN--pmksprod.netlify.app npm run fixture-urls',
    '```',
    '',
    '| Mechanism | What it is for | Floating slot | Slide | Asserted in |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}
