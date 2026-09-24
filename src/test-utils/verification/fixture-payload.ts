import { MechanismFixture, BuiltMechanism, buildMechanism } from './fixture';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { ColorService } from '../../app/services/color.service';
import { urlGeneratorFor } from '../url-encoding';
import { Link, RealLink } from '../../app/model/link';
import { PrisJoint } from '../../app/model/joint';
import { MODEL_SCALE } from '../../app/model/render-scale';

/**
 * The linear input speed every published payload was written at before the
 * app's default fell from five units a second to one.
 */
const PUBLISHED_LINEAR_SPEED = 5;

/**
 * Turning a fixture into the query string the app opens it from.
 *
 * A fixture is a TypeScript object and the app only speaks URLs, so every
 * verification mechanism the project publishes -- the gallery table, the
 * library templates, the drawings a browser suite loads -- comes through here.
 * It was the other half of `fixture-gallery.ts` until that file reached its
 * `max-lines` cap with two more mechanisms to publish: encoding a fixture and
 * listing which fixtures are published are two jobs, and this is the first.
 * `fixture-gallery.ts` re-exports every name below, so nothing that imported
 * one from there had to move.
 */
/**
 * The drawing scale a published mechanism opens at.
 *
 * 0.7, matching the app's own default: pins and bar widths large enough to grab
 * without the parts crowding the linkage they belong to. A template that opened
 * at a different scale from a fresh grid meant the first joint a user added
 * arrived a visibly different size from the ones already there.
 */
export const DEFAULT_OBJECT_SCALE = 0.7 * MODEL_SCALE;

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
 * Take the mass and inertia off a built copy, sliders and welded members
 * included.
 *
 * Every body, not only the bars: the solver hangs a slider's weight from
 * gravity too, so a drawing whose only massive part is a ram is still a loaded
 * one. That weight sits on the *joint* since Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md` -- it used to be a zero-length block
 * link, which is why walking `links` alone was once enough.
 */
/** The parts that carry a weight of their own but are not links: the sliders. */
const weighingJoints = (built: BuiltMechanism): PrisJoint[] =>
  built.joints.filter((joint): joint is PrisJoint => joint instanceof PrisJoint);

function stripMass(built: BuiltMechanism): void {
  const strip = (link: Link): void => {
    link.mass = 0;
    if (link instanceof RealLink) {
      link.massMoI = 0;
      link.subset.forEach(strip);
    }
  };
  built.links.forEach(strip);
  weighingJoints(built).forEach((joint) => (joint.mass = 0));
}

/**
 * Scale a built mechanism's mass and load together.
 *
 * In place on the copy `fixturePayload` has already built, next to `stripMass`
 * and for the same reason: several of these mechanisms are what the MATLAB
 * force specs assert reactions against, and changing the numbers in the fixture
 * itself would destroy the thing those specs verify.
 *
 * Inertia is scaled as well as mass so a link that carries a custom moment
 * keeps it in proportion; a link on the default gets it recomputed from the
 * skeleton at the next rebuild anyway, to the same number.
 */
function scaleLoading(built: BuiltMechanism, by: PublishedLoading): void {
  const heavier = (link: Link): void => {
    link.mass *= by.mass;
    if (link instanceof RealLink) {
      link.massMoI *= by.mass;
      link.subset.forEach(heavier);
    }
  };
  built.links.forEach(heavier);
  // A slider's weight, on the joint rather than on a block link. Left out, the
  // one template whose masses were deliberately scaled so Static and In-motion
  // stop reporting the same number came out with a 6 kg ram beside a 200 kg
  // crank and a 300 kg rod.
  weighingJoints(built).forEach((joint) => (joint.mass *= by.mass));
  built.forces.forEach((force) => (force.mag *= by.load));

  // Then hand the mass properties back to the app wherever the fixture was not
  // actually saying anything: a template opens on the defaults a reader's own
  // drawing would have, and the two that are deliberately different stand out
  // because everything around them is not.
  const keep = new Set(by.keepMoi ?? []);
  built.links.forEach((link) => {
    if (!(link instanceof RealLink) || keep.has(link.id)) return;
    link.moiIsCustom = false;
    link.comIsCustom = false;
  });

  Object.entries(by.offsetCom ?? {}).forEach(([id, where]) => {
    const link = built.links.find((candidate) => candidate.id === id);
    if (!(link instanceof RealLink)) throw new Error(`No link ${id} to move the CoM of`);
    const from = link.joints.find((joint) => joint.id === where.between[0]);
    const to = link.joints.find((joint) => joint.id === where.between[1]);
    if (!from || !to) throw new Error(`Link ${id} does not join ${where.between.join(' and ')}`);
    link.placeCustomCoM({
      x: from.x + (to.x - from.x) * where.at,
      y: from.y + (to.y - from.y) * where.at,
    });
  });
}

/**
 * Paint the built links the colors a template chose for itself.
 *
 * By link id, which is the joint letters, because that is what the color
 * table names and what survives the build. A link the table says nothing about
 * keeps the color the cursor gave it.
 */
function recolor(links: Link[], fills: Map<string, string>): void {
  const paint = (link: Link): void => {
    if (!(link instanceof RealLink)) return;
    const color = fills.get(link.id);
    if (color) link.fill = color;
    link.subset.forEach(paint);
  };
  links.forEach(paint);
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
export type PublishedMasses = 'as-built' | 'zeroed' | PublishedLoading;

/**
 * The mass and the load a force study is published at, scaled from its fixture.
 *
 * Both together, because separately neither means anything. What decides
 * whether a reader can *see* the difference between a static answer and an
 * in-motion one is the size of the inertial term against everything else in the
 * reaction -- and that is a ratio, not a quantity.
 *
 * Measured on the punch press at its published 10 RPM, peak reaction at joint B:
 *
 *   as-built                 399.9 N static   399.9 N in-motion    0%
 *   mass x10                 399.1            399.3                0%
 *   mass x100                391.2            393.0                0.5%
 *   mass x100, load /100       8.0              6.2               23%
 *   mass x500, load /500      43.3             34.1               21%
 *   mass x2000, load /2000   176.3            139.2               21%
 *
 * Mass alone does nothing, because weight is in the static answer too: raising
 * it raises both sides equally. The load is what was hiding the effect -- 400 N
 * applied against links weighing grams, so the reaction was the load and almost
 * nothing else. Once the load stops dominating the split settles at about 21%,
 * which is the mechanism's own inertia-to-weight ratio at that speed and is as
 * far as this can go without turning the crank faster.
 */
export interface PublishedLoading {
  /** Multiplied onto every link's mass, and its inertia with it. */
  mass: number;
  /** Multiplied onto every applied force. */
  load: number;
  /**
   * Link ids that keep the moment of inertia their fixture states.
   *
   * Everything else is published on the app's own default -- derived from the
   * skeleton -- because that is what a reader gets when they draw a bar, and
   * until now the library never showed it. Every fixture link is built custom
   * (see `buildFixtureLink`) so that the MATLAB numbers survive and the URLs
   * stay byte-identical, which is right for a verification fixture and wrong
   * for a teaching example: the Edit panel said "set by you" about a number
   * nobody had set.
   */
  keepMoi?: readonly string[];
  /**
   * Bodies whose mass does not sit at the centroid, and where it does sit.
   *
   * Given as a fraction along two of the body's own joints rather than as a
   * coordinate, so it survives the geometry being edited and says what it
   * means: a connecting rod is heavy at the big end, a boom is heavy at its
   * root. 0.5 is the midpoint of that pair, which for a two-joint bar is the
   * centroid the app would derive anyway.
   */
  offsetCom?: Record<string, { between: [string, string]; at: number }>;
}

/** Whichever of the two input speeds a mechanism actually uses. */
export interface PublishedSpeed {
  /** Turns per minute, for a mechanism driven at a pin. */
  rpm?: number;
  /** User length units per second, for one driven along a slot. */
  unitsPerSecond?: number;
}

/**
 * Encode a fixture into the query string the app decodes on load.
 *
 * Two pieces of global state are pinned first and put back afterwards: the link
 * color cursor, and the object scale. Both are process-wide, so without this a
 * payload depends on what every earlier spec happened to do — the table would
 * differ between a full suite run and a single-file one, and the drift check
 * would fail for reasons with nothing to do with the mechanisms.
 *
 * `objectScale` is how large the app draws pins and bar widths, in model units;
 * it is a display setting rather than geometry, and the default is what a fresh
 * app uses. A mechanism whose bars are tens of units long needs a larger one or
 * it renders as hairlines — see the Jansen leg in template-fixtures.ts.
 *
 * `fills` overrides the color cursor for a drawing whose colors mean
 * something — a library template, where they are chosen from the structure
 * rather than handed out in build order. See template-colors.ts. The gallery
 * links published from here pass none and keep the cursor's own order.
 */
export function fixturePayload(
  fixture: MechanismFixture,
  objectScale: number = DEFAULT_OBJECT_SCALE,
  speed: PublishedSpeed = {},
  masses: PublishedMasses = 'as-built',
  fills?: Map<string, string>
): string {
  const previousColors = ColorService.instance;
  const previousScale = SettingsService.objectScale;
  new ColorService();
  SettingsService._objectScale.next(objectScale);
  try {
    const built = buildMechanism(fixture);
    scaleBuiltToModelUnits(built);
    if (masses === 'zeroed') stripMass(built);
    else if (masses !== 'as-built') scaleLoading(built, masses);
    if (fills) recolor(built.links, fills);
    // The speeds ride the URL as settings rather than as anything on a joint,
    // so they are set on the service the encoder is about to read. A fresh one
    // per call, so nothing here leaks into the next mechanism's payload.
    const settings = new SettingsService();
    if (speed.rpm !== undefined) settings.inputSpeed.next(speed.rpm);
    // The speed the library and the gallery were published at, where a
    // fixture names none. The app's own default fell to one unit a second
    // for new drawings; a published mechanism keeps the payload it was
    // tuned at, byte for byte, until someone retunes it on purpose.
    settings.linearInputSpeed.next(speed.unitsPerSecond ?? PUBLISHED_LINEAR_SPEED);
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
