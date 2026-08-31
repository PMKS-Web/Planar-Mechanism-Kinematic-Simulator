// joint.ts must be imported before coord.ts/link.ts/force.ts: those modules
// form an import cycle that only initializes cleanly when entered here.
import { Joint, PrisJoint, RevJoint } from '../../app/model/joint';
import { Coord } from '../../app/model/coord';
import { Force } from '../../app/model/force';
import { Link, SliderBlock, RealLink } from '../../app/model/link';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { ColorService } from '../../app/services/color.service';
import { SettingsService } from '../../app/services/settings.service';
import { MODEL_SCALE } from '../../app/model/render-scale';

/**
 * Declarative description of a linkage that mirrors the MATLAB models in
 * PMKS-Web/PMKS_Verification, built directly out of model objects (bypassing
 * MechanismService, which rounds user-entered coordinates to 3 decimals).
 */
export interface MechanismFixture {
  /** Joint ids must be the single letters the dataset uses, in creation order. */
  joints: {
    id: string;
    x: number;
    y: number;
    ground?: boolean;
    input?: boolean;
    /**
     * Draw this joint's path. Off everywhere by default, as it is in the app:
     * a mechanism that traces every joint at once hides itself behind the
     * thicket. Set it where the path *is* the mechanism — the straight line a
     * straight-line linkage draws, the ellipse an elliptical crank draws.
     */
    trace?: boolean;
    /**
     * What this drive is commanded at: rpm for a pin, user length units per
     * second for a slider, signed for direction. Zero — the default, and what
     * every URL written before drives had speeds of their own says — means
     * "follow the document default".
     *
     * Per joint rather than per fixture because a drawing can hold several
     * machines, and the whole point of the multi-machine feature is that they
     * need not turn at the same rate or the same way.
     */
    driveSpeed?: number;
  }[];
  /**
   * `joints` is the concatenated joint letters (also the link id). List links
   * in the MATLAB free-body-chain order (input crank first): each shared
   * joint's first link then matches the MATLAB reaction-force sign convention.
   * `com` defaults to the mean of the link's joints, which is both PMKS+'s
   * geometric center and the MATLAB Utils.determineCoM default.
   */
  links: FixtureLink[];
  /** Grounds joint `at` into a slider along `angleRad` via a piston link. */
  slider?: SliderSpec;
  /** Several slots at once — an elliptical trammel needs two. */
  sliders?: SliderSpec[];
  /**
   * Joint ids to flag welded. On a slider's pin this makes a Slide (§2.1): the
   * rider becomes rigid with the block instead of free to turn in it.
   */
  welds?: string[];
  /**
   * Prismatic joint ids to leave dangling: a block with no carrier and no
   * ground (§4.1). Applied last, so the slot is built and then taken away —
   * which is how it actually arises, rather than a state assembled by hand.
   */
  detach?: string[];
  /** A single load. Kept because most fixtures carry exactly one. */
  load?: FixtureLoad;
  /**
   * Several loads at once — a crane carrying a hook load and a rope pull needs
   * two, and telling a global load from a local one takes at least two to
   * compare. Appended after `load`, so the ids stay F1, F2, ... in the order
   * written and a fixture that only ever had one encodes exactly as before.
   */
  loads?: FixtureLoad[];
  /**
   * Objects that open with a Lock mark: joint letters and link ids. This is
   * how a published teaching mechanism pins everything except the one handle
   * a class is meant to drag — the marks ride the URL like every other state.
   */
  locks?: { joints?: string[]; links?: string[] };
  /** Input speed in rad/s, using the v1 manifest's exact rpm*pi/30 conversion. */
  inputAngVel: number;
  gravity?: boolean;
}

/** A constant force applied at a point of `onLink`, in newtons. */
export interface FixtureLoad {
  onLink: string;
  /** Where it acts, in the start pose. The point rides the link from there. */
  at: [number, number];
  /** The load itself, as components; its length is the magnitude. */
  vector: [number, number];
  /**
   * Whether the direction is held in the link's own frame rather than the
   * world's. A local load turns with the body it acts on — a rope pulling
   * along a jib, a cutting force following a tool — while a global one keeps
   * pointing the same way whatever the mechanism does, which is what weight
   * does. Global by default, as it is in the app.
   */
  local?: boolean;
}

export interface SliderSpec {
  at: string;
  prisId: string;
  /** World angle of a grounded guide. Ignored when `on` is given. */
  angleRad?: number;
  pistonMass?: number;
  /**
   * Cuts the slot into a moving link instead of into the world: the line
   * through carrier joints `a` and `b` (§2.4).
   */
  on?: { carrier: string; a: string; b: string };
  /**
   * Marks the slider as the sealed heart of an atomic cylinder. Requires a
   * floating slot (`on`) and a weld at the pin, which is what the resolver
   * demands of a cylinder; the flag rides the URL, so a sealed fixture opens
   * skinned.
   */
  sealed?: boolean;
  /**
   * Drives the mechanism from this prismatic joint (§5.1). The flag has to go
   * on the slider rather than on a fixture joint: a driven cylinder's commanded
   * quantity is how far the block has traveled along its slot, and no RevJoint
   * in the fixture list owns that.
   */
  input?: boolean;
  /** As on a fixture joint: user length units per second, signed, 0 = default. */
  driveSpeed?: number;
}

export interface FixtureLink {
  joints: string;
  mass?: number;
  moi?: number;
  com?: [number, number];
  name?: string;
  fill?: string;
  subset?: FixtureLink[];
  /**
   * Draw this link as the disc it sweeps rather than as a bar — a flywheel on
   * a crankshaft, drawn the way an engine draws it (`RealLink.isCircle`).
   *
   * A drawing choice only: mass properties still come from the joint skeleton.
   * Only a link with exactly one revolute ground pin and no subset can honor
   * it, because the disc is centered on the pin the link turns about, and the
   * app simply ignores the flag on a link that does not qualify. A fixture is
   * authored once and read as an example, so here the same request throws
   * instead — a template that silently opened as a bar would teach the wrong
   * thing about the feature it exists to show.
   */
  circle?: boolean;
}

export interface BuiltMechanism {
  mechanism: Mechanism;
  joints: Joint[];
  links: Link[];
  forces: Force[];
  fixture: MechanismFixture;
}

/**
 * The drawing scale a fixture is solved at unless its caller says otherwise.
 *
 * It has to be *some* fixed value rather than whatever the process happens to
 * be holding. `SettingsService.objectScale` is a process-wide static, and the
 * solver measures real things against it — a cylinder's stroke, and now the
 * ends of a slot. Vitest runs spec files unisolated, so left ambient it is
 * whichever file last set it, and the same mechanism solves differently from
 * run to run. That is what the intermittent cylinder failures were.
 */
const SOLVING_OBJECT_SCALE = 1 * MODEL_SCALE;

export function buildMechanism(
  fixture: MechanismFixture,
  sampling: 'adaptive' | 'degree' = 'degree'
): BuiltMechanism {
  const previousScale = SettingsService.objectScale;
  SettingsService._objectScale.next(SOLVING_OBJECT_SCALE);
  try {
    return buildMechanismNow(fixture, sampling);
  } finally {
    SettingsService._objectScale.next(previousScale);
  }
}

function buildMechanismNow(
  fixture: MechanismFixture,
  sampling: 'adaptive' | 'degree' = 'degree'
): BuiltMechanism {
  // ColorService registers itself as a static singleton that RealLink depends
  // on; SettingsService.objectScale is used when forces render their SVG.
  if (!ColorService.instance) {
    new ColorService();
  }
  new SettingsService();

  const jointById = new Map<string, RevJoint>();
  const joints: Joint[] = fixture.joints.map((spec) => {
    const joint = new RevJoint(spec.id, spec.x, spec.y, !!spec.input, !!spec.ground);
    joint.showCurve = !!spec.trace;
    joint.driveSpeed = spec.driveSpeed ?? 0;
    jointById.set(spec.id, joint);
    return joint;
  });

  const restoreFixtureLinkState = (spec: FixtureLink, link: RealLink): void => {
    link.mass = spec.mass ?? 1;
    link.massMoI = spec.moi ?? 1;
    link.name = spec.name ?? link.id;
    link.fill = spec.fill ?? link.fill;
    if (spec.com) {
      link.CoM = new Coord(spec.com[0], spec.com[1]);
    }
    if (spec.circle) {
      if (!link.canBeCircular()) {
        throw new Error(
          `Link ${link.id} cannot be drawn as a disc: a circular link needs exactly one ` +
            'revolute ground pin to be centered on, and no subset.'
        );
      }
      link.isCircle = true;
      // The outline is the drawing, and nothing else here would rebuild it —
      // the same call the Edit panel's Drawn as a Disc toggle makes.
      link.reComputeDPath();
    }
    spec.subset?.forEach((memberSpec, index) => {
      restoreFixtureLinkState(memberSpec, link.subset[index] as RealLink);
    });
  };

  const buildFixtureLink = (spec: FixtureLink): RealLink => {
    const linkJoints = [...spec.joints].map((id) => jointById.get(id)!);
    const com = spec.com ? new Coord(spec.com[0], spec.com[1]) : undefined;
    const subset = spec.subset?.map(buildFixtureLink);
    const link = new RealLink(spec.joints, linkJoints, spec.mass ?? 1, spec.moi ?? 1, com, subset);
    // A fixture's numbers are chosen, MATLAB-parity data — never re-derived.
    // Custom keeps the published URLs byte-identical too.
    link.moiIsCustom = true;
    link.comIsCustom = true;
    link.fill = spec.fill ?? ColorService.instance.getNextLinkColor();
    restoreFixtureLinkState(spec, link);
    return link;
  };

  const links: Link[] = fixture.links.map((spec) => {
    const link = buildFixtureLink(spec);
    const linkJoints = link.joints as RevJoint[];
    linkJoints.forEach((j) => {
      j.links.push(link);
      linkJoints.forEach((other) => {
        if (other.id !== j.id && !j.connectedJoints.some((cj) => cj.id === other.id)) {
          j.connectedJoints.push(other);
        }
      });
    });
    return link;
  });

  const sliderSpecs = [...(fixture.slider ? [fixture.slider] : []), ...(fixture.sliders ?? [])];
  sliderSpecs.forEach((spec) => {
    const revJoint = jointById.get(spec.at)!;
    // A floating slot is not grounded; that pair of states is exclusive (§2.4a).
    const prisJoint = new PrisJoint(spec.prisId, revJoint.x, revJoint.y, !!spec.input, !spec.on);
    prisJoint.isSealed = spec.sealed ?? false;
    prisJoint.driveSpeed = spec.driveSpeed ?? 0;
    if (spec.on) {
      const carrier = links.find((link) => link.id === spec.on!.carrier)!;
      prisJoint.slideOn(carrier, jointById.get(spec.on.a)!, jointById.get(spec.on.b)!);
    } else {
      prisJoint.angle_rad = spec.angleRad ?? 0;
    }
    prisJoint.connectedJoints.push(revJoint);
    revJoint.connectedJoints.push(prisJoint);
    const piston = new SliderBlock(
      revJoint.id + prisJoint.id,
      [revJoint, prisJoint],
      spec.pistonMass
    );
    prisJoint.links.push(piston);
    revJoint.links.push(piston);
    joints.push(prisJoint);
    links.push(piston);
  });

  // After the sliders, so a welded pin already has its block: that pairing is
  // what makes the flag mean "Slide" rather than "compound".
  fixture.welds?.forEach((id) => {
    jointById.get(id)!.isWelded = true;
  });

  // Found in `joints` rather than `jointById`: a slider's PrisJoint is created
  // by the slider loop above, so it never enters the map the fixture's own
  // joint list built.
  fixture.detach?.forEach((id) => {
    (joints.find((joint) => joint.id === id) as PrisJoint).detach();
  });

  // In `joints`, not `jointById`, for the same reason detach looks there: a
  // slider's own PrisJoint can carry a mark too.
  fixture.locks?.joints?.forEach((id) => {
    (joints.find((joint) => joint.id === id) as RevJoint).locked = true;
  });
  // A link entry is the shortcut it is everywhere: marks land on its joints.
  fixture.locks?.links?.forEach((id) => {
    links
      .find((link) => link.id === id)!
      .joints.forEach((joint) => {
        if (joint instanceof RevJoint) joint.locked = true;
      });
  });

  const forces: Force[] = [];
  // The lone `load` first, so a fixture that has only ever had one still gets
  // F1 and encodes byte for byte as before.
  const loads = [...(fixture.load ? [fixture.load] : []), ...(fixture.loads ?? [])];
  loads.forEach((load, index) => {
    const link = links.find((l) => l.id === load.onLink) as RealLink;
    const [fx, fy] = load.vector;
    const mag = Math.hypot(fx, fy);
    const start = new Coord(load.at[0], load.at[1]);
    const end = new Coord(start.x + fx / mag, start.y + fy / mag);
    // The application point always rides the link. `local` decides the other
    // half: false keeps the direction fixed in the global frame, like the
    // MATLAB LoadForce and like weight; true turns it with the body.
    const force = new Force('F' + (index + 1), link, start, end, !!load.local, true, mag);
    link.forces.push(force);
    forces.push(force);
  });

  const mechanism = new Mechanism(
    joints,
    links,
    forces,
    [],
    fixture.gravity ?? false,
    'm',
    fixture.inputAngVel,
    // The MATLAB tables are stated one row per degree of crank and compared
    // one to one, so this harness defaults to the grid they are stated on;
    // the specs that exercise adaptive sampling ask for it by name.
    sampling
  );
  return { mechanism, joints, links, forces, fixture };
}

/**
 * Build a fixture at a given drawing scale, leaving the shared static as found.
 *
 * `SettingsService.objectScale` is process-wide, and a cylinder's stroke and a
 * slot's ends are both measured against it — so a spec that needs a particular
 * scale has to pin one. Pinning it and walking away is what made this suite
 * order-dependent: Vitest runs files unisolated, so whichever spec set it last
 * decided what every concurrent file saw, and the failures moved around the
 * cylinder specs from run to run.
 *
 * Set, build, put back. The built mechanism has already captured what it needed
 * from the scale by the time this returns.
 */
export function buildMechanismAtScale(
  fixture: MechanismFixture,
  objectScale: number
): BuiltMechanism {
  const previous = SettingsService.objectScale;
  SettingsService._objectScale.next(objectScale);
  try {
    return buildMechanismNow(fixture);
  } finally {
    SettingsService._objectScale.next(previous);
  }
}
