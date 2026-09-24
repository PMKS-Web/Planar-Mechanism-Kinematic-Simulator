import {
  hydraulicCrossheadFixture,
  offsetMountHatchFixture,
  reciprocatingSawFixture,
  slottedToolDriveFixture,
} from './part2-library-fixtures';
import { MechanismFixture } from './fixture';
import {
  fourBarDrivenAtFixture,
  sliderCrankTracerFixture,
  stephensonIiiEx2Fixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  nearlyNonGrashofFixture,
  heldCrankFourBarFixture,
  twoFourBarsFixture,
  equalSidedFourBarFixture,
  redundantParallelCrankFixture,
  wideSwingRockerFixture,
  wattIFixture,
} from './fixtures';
import {
  cylinderBoomFixture,
  cylinderSkinFixture,
  gripperFixture,
  parallelGripperFixture,
  pinchingGripperFixture,
  slideGripperFixture,
  ellipticalCrankFixture,
  ellipticalTrammelFixture,
  invertedSliderCrankFixture,
  loadedInvertedSliderCrankFixture,
  guidedRodOnALinkFixture,
  offsetPivotLeverFixture,
  offsetPivotLeverWeldedRodFixture,
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
  landingGearFixture,
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
  coupledDriveWheelsFixture,
  craneWithTwoLoadsFixture,
  threeMachinesFixture,
} from './feature-fixtures';
import { peaucellierFixture, pantographFixture, doubleButterflyFixture } from './classic-fixtures';
import { fourBarInversionsFixture, sliderCrankInversionsFixture } from './inversion-fixtures';
import {
  dragLinkFixture,
  bellCrankFixture,
  linearActuatorRockerFixture,
  loaderBucketFixture,
} from './workshop-fixtures';
import {
  walkingPairFixture,
  straightLinePairFixture,
  pumpingFieldFixture,
} from './ensemble-fixtures';
import {
  cylinderOnASlotFixture,
  drivenFrozenCylinderBodyFixture,
  frozenCylinderCouplerFixture,
} from './frozen-cylinder-fixtures';
import { ActiveObjService } from '../../app/services/active-obj.service';
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
 * Encoding a fixture, re-exported.
 *
 * `fixture-payload.ts` is the other half of this file: everything about
 * turning a fixture into a URL moved there when the table below grew past
 * what one file should hold. The names are re-exported rather than relocated
 * so that the two dozen specs importing `fixturePayload` from the gallery --
 * which is where anyone looks for it -- keep working.
 */
export {
  DEFAULT_OBJECT_SCALE,
  fixturePayload,
  type PublishedLoading,
  type PublishedMasses,
  type PublishedSpeed,
} from './fixture-payload';
import { DEFAULT_OBJECT_SCALE, fixturePayload, type PublishedSpeed } from './fixture-payload';

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
   * it. A stroke of a few centimeters crossed at the default 5 cm/s is over
   * before it can be watched, and a demonstration of a straight line is worth
   * nothing at a speed nobody can follow.
   */
  speed?: PublishedSpeed;
  fixture: MechanismFixture;
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
    name: 'Hydraulic crosshead',
    purpose: 'Welded frame and rod platen translate as rigid bodies',
    spec: 'part2-library.spec.ts',
    floatingSlot: true,
    speed: { unitsPerSecond: 1 },
    fixture: hydraulicCrossheadFixture(),
  },
  {
    name: 'Offset-mount hatch',
    purpose: 'Offset brackets welded to both cylinder ends drive a hinged hatch',
    spec: 'part2-library.spec.ts',
    floatingSlot: true,
    speed: { unitsPerSecond: 0.6 },
    fixture: offsetMountHatchFixture(),
  },
  {
    name: 'Reciprocating saw',
    purpose: 'Cutting resistance and carriage weight in a Scotch-yoke drive',
    spec: 'part2-library.spec.ts',
    floatingSlot: true,
    speed: { rpm: 10 },
    fixture: reciprocatingSawFixture(),
  },
  {
    name: 'Slotted tool drive',
    purpose: 'Local tool-normal force and global hanging load acting through a slotted coupler',
    spec: 'part2-library.spec.ts',
    floatingSlot: true,
    speed: { rpm: 10 },
    fixture: slottedToolDriveFixture(),
  },
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
    name: 'Aircraft landing gear',
    purpose:
      'Two machines, one clock: a ram a side swings each leg out of the belly and stands the aircraft on it',
    spec: 'landing-gear.spec.ts',
    floatingSlot: true,
    slide: true,
    // Slow enough to watch a leg swing rather than snap. The rams are short and
    // the default 5 cm/s puts the gear down in under a second.
    speed: { unitsPerSecond: 0.35 },
    fixture: landingGearFixture(),
  },
  {
    name: 'Cylinder-driven gripper',
    purpose: '§2.7a: no chain of dyads solves this — the plate and both arms settle together',
    spec: 'gripper.spec.ts, anchored-bar-mobility.spec.ts',
    floatingSlot: true,
    slide: true,
    // 0.74 cm of ram travel, out and back, so 0.25 cm/s opens and closes the
    // jaws in about six seconds — the pace the rest of the library opens at.
    // At the shared default of 5 cm/s the whole stroke is over in a third of
    // a second, which is not a mechanism anybody can watch.
    speed: { unitsPerSecond: 0.25 },
    fixture: gripperFixture(),
  },
  {
    name: 'Parallel gripper',
    purpose: 'Two jaws on parallelograms, closed by one ram: they stay parallel and meet flat',
    spec: 'parallel-gripper.spec.ts',
    floatingSlot: false,
    fixture: parallelGripperFixture(),
  },
  {
    name: 'Gripper on rails',
    purpose:
      'A carriage on the ram, two vertical rails, and a jaw each side hung from the carriage by two equal links whose far pins ride the rails: the jaws stay level and meet flat',
    spec: 'slide-gripper.spec.ts',
    floatingSlot: true,
    slide: true,
    // 1.07 cm of carriage travel closes the jaws from a hand's width to touching;
    // 0.4 cm/s opens and closes them in 5.4 s.
    speed: { unitsPerSecond: 0.4 },
    fixture: slideGripperFixture(),
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
    name: 'Slotted lever pinned off its slot',
    purpose:
      'The carrier swings about a third pin of its own, not a slot joint: position against closed form, rates against finite differences',
    spec: 'offset-pivot-lever.spec.ts',
    floatingSlot: true,
    fixture: offsetPivotLeverFixture(),
  },
  {
    name: 'Guided rod pushed by a link',
    purpose:
      'A welded assembly located by a link onto it, rather than by a slot or by a member already placed',
    spec: 'guided-rod-on-a-link.spec.ts',
    floatingSlot: false,
    slide: true,
    fixture: guidedRodOnALinkFixture(),
  },
  {
    name: 'Slotted lever with a rod that cannot tilt',
    purpose:
      'The rod welded to its block: the slanted slot counts as slanted, so the geometry reports nothing can move',
    spec: 'offset-pivot-lever.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: offsetPivotLeverWeldedRodFixture(),
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
    name: 'Crank on the edge of Grashof',
    purpose: 'One drag from being a rocker: where a posed edit can put the start pose out of reach',
    spec: 'posed-editing.spec.ts',
    floatingSlot: false,
    fixture: nearlyNonGrashofFixture(),
  },
  {
    name: 'Four-bar with four equal sides',
    purpose:
      'Folds flat twice a turn: a change point, where a solver can come back on the other branch',
    spec: 'fold-through-straight.spec.ts',
    floatingSlot: false,
    fixture: equalSidedFourBarFixture(),
  },
  {
    name: 'Parallelogram with a third parallel crank',
    purpose:
      'Gruebler counts it as rigid and it turns: the third crank repeats what the first two said',
    spec: 'redundant-parallel-crank.spec.ts',
    floatingSlot: false,
    fixture: redundantParallelCrankFixture(),
  },
  {
    name: 'Rocker that swings more than a turn',
    purpose:
      'Not home after one revolution and stopped in the next: a rocker, not a crank with a seam',
    spec: 'wide-swing-rocker.spec.ts',
    floatingSlot: false,
    fixture: wideSwingRockerFixture(),
  },
  {
    name: 'Crank holding its length',
    purpose:
      'A bar with a hold on it: drag B and it rides the arc about A, with the chip and the guide drawn',
    spec: 'grid-utils.holds.spec.ts',
    floatingSlot: false,
    fixture: heldCrankFourBarFixture(),
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
    name: 'Locomotive drive wheels',
    purpose:
      'Three discs in one machine, coupled by a rod: each wheel drawn round its own axle, turning',
    spec: 'link-skeleton.spec.ts',
    floatingSlot: false,
    fixture: coupledDriveWheelsFixture(),
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
    name: 'Loader bucket',
    purpose: 'Four bars welded into a scoop: a bucket is a shape, and a shape is what a weld makes',
    spec: 'loader-bucket.spec.ts',
    floatingSlot: false,
    speed: { rpm: 10 },
    fixture: loaderBucketFixture(),
  },
  {
    name: 'Four-bar inversions',
    purpose:
      'One chain, each of its four links held still in turn — four machines out of four bars',
    spec: 'inversions.spec.ts',
    floatingSlot: false,
    fixture: fourBarInversionsFixture(),
  },
  {
    name: 'Slider-crank inversions',
    purpose: 'The same for a chain with a slider: engine, quick-return, oscillating cylinder, pump',
    spec: 'inversions.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: sliderCrankInversionsFixture(),
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
  {
    name: 'Driven body with a frozen cylinder',
    purpose:
      'A cylinder welded into one body at both ends is a fixed part of it, and the body still turns',
    spec: 'cylinder-frozen-body.spec.ts',
    floatingSlot: true,
    slide: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: drivenFrozenCylinderBodyFixture(),
  },
  {
    name: 'Four-bar on a frozen cylinder',
    purpose: 'The same frozen cylinder as a coupler: it runs like the ternary link it is',
    spec: 'cylinder-frozen-body.spec.ts',
    floatingSlot: true,
    slide: true,
    speed: { rpm: LIBRARY_RPM },
    fixture: frozenCylinderCouplerFixture(),
  },
  {
    name: 'Cylinder riding a slot',
    purpose:
      'Saved a hair off its own slot line, and it has to reopen running — the rounding a URL leaves',
    spec: 'url-round-trip-solves.spec.ts',
    floatingSlot: true,
    slide: true,
    // Length per second along the slot; the stroke is short, so this is the
    // pace the drawing was shared at rather than the shared default.
    speed: { unitsPerSecond: 0.2 },
    fixture: cylinderOnASlotFixture(),
  },
];

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
    `Links point at \`${baseUrl}\`.`,
    '',
    '**Every row that holds a slider needs a build with Stage 1 of the joint-type plan in it.**',
    'A slider is one prismatic joint carrying its own mass, and that mass is a token on the end',
    'of the joint record. There is no version gate for it: an older build stops reading a joint',
    'record after `driveSpeed` with no arity check, the digest still matches, so it drops the',
    'mass and opens a grounded slider with a bar hanging off it and no block. That is a wrong',
    'drawing rather than a refusal, which is the one failure mode these links exist to avoid —',
    'so until Stage 1 ships to production, regenerate against a deploy preview before quoting',
    'one of these.',
    '',
    'A mechanism marked "floating slot" is the case that *is* gated: on a release that predates',
    'Phase 2 the three extra URL tokens are refused rather than silently ignored, which is',
    'deliberate (§2.4a). A mechanism marked "Slide" decodes wherever a slider decodes at all,',
    'and only *solves* on a build that includes Phase 3. For a pull request, regenerate against',
    'its deploy preview:',
    '',
    '```bash',
    // Deliberately a placeholder rather than a real preview number: pinning one
    // PR's preview here means every later regeneration re-emits a dead link.
    'PMKS_FIXTURE_BASE_URL=https://deploy-preview-NNN--pmksnew.netlify.app npm run fixture-urls',
    '```',
    '',
    '| Mechanism | What it is for | Floating slot | Slide | Asserted in |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}
