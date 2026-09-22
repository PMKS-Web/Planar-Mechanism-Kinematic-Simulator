// Type-only: a runtime import here closes the joint -> link -> joint module
// cycle, which breaks class initialization when a test entry point loads the
// model modules in a different order than the app does.
import type { Link } from './link';
import { Coord } from './coord';

export class Joint extends Coord {
  private _id: string;
  private _name: string = '';
  private _showHighlight: boolean = false; //?

  constructor(id: string, x: number, y: number) {
    super(x, y);
    this._id = id;
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get name(): string {
    if (this._name === '') {
      return this.id;
    }
    return this._name;
  }

  set name(value: string) {
    this._name = value;
  }

  /**
   * Which color family this one joint is drawn in -- see JOINT_FAMILIES --
   * or '' for the amber every joint shares.
   *
   * Per joint rather than per drawing because the point of it is to tell one
   * pin apart from the fifteen around it: the coupler point being traced, the
   * joint a force is about, the one a reader is being asked to look at. A
   * family rather than a fill because a joint is drawn resting, pointed at and
   * picked, and those three only read as one object if they come from one set.
   */
  public colorFamily: string = '';

  get showHighlight(): boolean {
    return this._showHighlight;
  }

  set showHighlight(value: boolean) {
    this._showHighlight = value;
  }
}

export class RealJoint extends Joint {
  // TODO: Does the r only need to be on RevJoints?
  private _r: number = 0.15; //This seems like the SVG scale factor
  private _input: boolean;
  private _ground: boolean;
  private _links: Link[];
  private _connectedJoints: Joint[];
  public showCurve: boolean;
  public isWelded: boolean = false;
  /**
   * Locked in place while editing: no drag, direct or carried, may move this
   * joint. An editing constraint only — the solvers never read it, so a locked
   * coupler still animates. Ground is the simulation-time cousin; the two are
   * deliberately independent axes.
   */
  public locked: boolean = false;
  /**
   * How fast this joint drives its own mechanism, signed for direction, in the
   * units its kind of drive is measured in: rpm for a pin, length per second
   * for a slider.
   *
   * Lives on the joint because a drawing can hold several mechanisms and each
   * is driven at its own speed. The driven joint is the natural place to keep
   * it -- one per mechanism, already saved, and it is where the panel has
   * always shown the setting anyway.
   *
   * Zero means "follow the document-wide default", which is what every joint
   * loaded from a URL written before this existed says.
   */
  public driveSpeed: number = 0;

  constructor(
    id: string,
    x: number,
    y: number,
    input: boolean = false,
    ground: boolean = false,
    links: Link[] = [],
    connectedJoints: Joint[] = []
  ) {
    super(id, x, y);
    this._input = input;
    this._ground = ground;
    this._links = links;
    this._connectedJoints = connectedJoints;
    // Off, and turned on per joint in Visual Settings. Every joint tracing by
    // default draws every path at once, which on anything past a four-bar is a
    // thicket the mechanism itself has to be picked out of — and the one path
    // worth looking at is worth choosing.
    this.showCurve = false;
  }

  //R is radius of the joint
  get r(): number {
    return this._r;
  }

  set r(value: number) {
    this._r = value;
  }

  get ground(): boolean {
    return this._ground;
  }

  set ground(value: boolean) {
    this._ground = value;
  }

  get links(): Link[] {
    return this._links;
  }

  set links(value: Link[]) {
    this._links = value;
  }

  get connectedJoints(): Joint[] {
    return this._connectedJoints;
  }

  set connectedJoints(value: Joint[]) {
    this._connectedJoints = value;
  }

  get input(): boolean {
    return this._input;
  }

  set input(value: boolean) {
    this._input = value;
  }

  /**
   * Whether a weld could be made here.
   *
   * A slider at this joint used to disqualify it. It no longer does: welding a
   * joint that carries a block is how a Slide is made (§2.1), and the block is
   * bound by the flag rather than by joining a compound.
   *
   * `isWelded` is part of the test because nothing else rules out welding an
   * already-welded joint. An ordinary compound weld collapses the links here
   * into one, so the length test happens to cover it; a Slide keeps two — the
   * rider and its block — and without this the panel would offer Weld and
   * Unweld at the same time.
   *
   * Ground is *not* part of this test, though it used to be.
   *
   * Welding two bars that meet at a grounded pin fuses them into one body that
   * still turns about that pin — a bell crank grounded at its pivot, which is
   * an ordinary machine. And the app already holds that state: weld a free
   * joint and then ground it and you arrive at exactly it, no refusal
   * anywhere. So the rule was not protecting the model from a shape it cannot
   * represent; it was an accident of the order the two edits are done in.
   *
   * It was also invisible. `canToggleWeld` enables the control whenever there
   * are two links to fuse, so Weld sat there offered, was pressed, and refused
   * one layer down without a word.
   */
  canBeWelded(): boolean {
    return (!this.input || this.ground) && !this.isWelded && this.links.length >= 2;
  }

  canBeUnwelded(): boolean {
    //Is is already welded - it can always be unwelded
    return this.isWelded;
  }

  canBeWeldedOrUnwelded() {
    if (this.canBeWelded()) return true;
    return this.canBeUnwelded();
  }
}

// TODO: Verify this but I don't believe there is an ImagJoint...
// export class ImagJoint extends Joint {
//
//   constructor(id: string, x: number, y: number) {
//     super(id, x, y);
//   }
// }

export class RevJoint extends RealJoint {
  constructor(
    id: string,
    x: number,
    y: number,
    input: boolean = false,
    ground: boolean = false,
    links: Link[] = [],
    connectedJoints: Joint[] = []
  ) {
    super(id, x, y, input, ground, links, connectedJoints);
  }
}

export class PrisJoint extends RealJoint {
  private _angle_rad: number = 0;
  private _carrier?: Link;
  private _slotJointA?: Joint;
  private _slotJointB?: Joint;
  /**
   * Whether this slider is the sealed heart of an atomic cylinder.
   *
   * A sealed slider's assembly — barrel, block, welded rod — is one permanent
   * part: no unweld, no slider-off, no dragging the block out of its slot.
   * The bit lives here (not in a view service) because undo/redo replays URL
   * strings, so anything that must survive an undo has to enter the codec, and
   * the prismatic pin is the one object every member of the assembly can be
   * reached from.
   */
  public isSealed: boolean = false;

  /**
   * The mass of the block riding this slot.
   *
   * A slider used to be three objects — this joint, a coincident `RevJoint`,
   * and a zero-length `SliderBlock` joining them — and the mass lived on the
   * block because only a link could carry one. The block is gone (Stage 1 of
   * `docs/joint-type-and-cylinder-plan.md`) and its mass is this, in the unit
   * the panel was showing when it was typed, exactly as a link's is.
   */
  public mass: number = 0;

  /**
   * Whether what is pinned here may turn against the slot.
   *
   * True is Pin-in-slot: the rider pivots on the block while it slides. False
   * is Prismatic — the Slide — where the rider is rigid with the block, so the
   * whole assembly keeps the slot's angle. That is what the weld on the old
   * coincident pin said, and it rides the codec as that same flag bit: a
   * prismatic record's `isWelded` could never mean anything else, because a
   * slider's only link was its block and a weld needs two to fuse.
   */
  public rotates: boolean = true;

  constructor(
    id: string,
    x: number,
    y: number,
    input: boolean = false,
    ground: boolean = false,
    links: Link[] = [],
    connectedJoints: Joint[] = []
  ) {
    super(id, x, y, input, ground, links, connectedJoints);
  }

  get angle_rad(): number {
    return this._angle_rad;
  }

  set angle_rad(value: number) {
    this._angle_rad = value;
  }

  get carrier(): Link | undefined {
    return this._carrier;
  }

  get slotJointA(): Joint | undefined {
    return this._slotJointA;
  }

  get slotJointB(): Joint | undefined {
    return this._slotJointB;
  }

  /**
   * A slot is grounded, floating, or dangling — and the three setters below are
   * the only way to move between them, so a half-built slot (a carrier with one
   * joint, or a carrier that still claims to be grounded) cannot be represented
   * at all rather than being represented and then validated against.
   *
   * Phase 2 allowed only the first two, on the grounds that a slot always has a
   * direction. Phase 4 adds the third because the panel can now turn Slider on
   * for a joint that has no carrier, and a carrier is geometry rather than a
   * boolean — no toggle can invent one. Silently grounding it instead would put
   * the slot somewhere the user did not choose and call it done.
   */
  get isFloating(): boolean {
    return this._carrier !== undefined;
  }

  /**
   * A slider with a block but nothing for it to slide along. Legal to hold,
   * never legal to solve: the mechanism is invalid until a carrier arrives or
   * the slot is grounded, and the canvas says so in red.
   */
  get isDangling(): boolean {
    return this._carrier === undefined && !this.ground;
  }

  /**
   * Take the slot's direction away without taking the slider away.
   *
   * Deliberately explicit, and deliberately not reachable by clearing a field:
   * the invariant that a slot is never accidentally half-built is what makes
   * the other two states trustworthy.
   */
  detach(): void {
    // Keep the direction as a memory rather than as a constraint. A floating
    // slot's angle lives in its two joints, so letting them go without reading
    // them first loses it -- and grounding the slider again would then land on
    // zero, silently rebuilding a different guide than the one it had.
    this._angle_rad = this.slotAngle;
    this._carrier = undefined;
    this._slotJointA = undefined;
    this._slotJointB = undefined;
    this.ground = false;
  }

  /** Bind the slot to a joint pair on a carrier link. */
  slideOn(carrier: Link, slotJointA: Joint, slotJointB: Joint): void {
    this._carrier = carrier;
    this._slotJointA = slotJointA;
    this._slotJointB = slotJointB;
    this.ground = false;
  }

  /** Return the slot to a world-fixed direction. */
  groundAt(angle_rad: number): void {
    this._carrier = undefined;
    this._slotJointA = undefined;
    this._slotJointB = undefined;
    this._angle_rad = angle_rad;
    this.ground = true;
  }

  /**
   * The slot's direction in world space, right now.
   *
   * This is the seam the solvers read through. A grounded slot answers with the
   * angle it was given; a floating one measures its own defining joints, so it
   * re-derives per timestep for free and no caller has to know which kind it is
   * holding.
   */
  get slotAngle(): number {
    if (!this._slotJointA || !this._slotJointB) {
      return this._angle_rad;
    }
    return Math.atan2(
      this._slotJointB.y - this._slotJointA.y,
      this._slotJointB.x - this._slotJointA.x
    );
  }

  /**
   * The body the slot is actually cut into: the smallest part of the carrier
   * that still holds both of the slot's ends.
   *
   * A carrier is a *root*, and a root may be a compound — so the bar the reader
   * cut the slot into can be a leaf two levels down. Walking to it is what lets
   * the question below be asked of the bar rather than of everything welded to
   * it. With nothing welded, the walk stops on the carrier and the answer is
   * the carrier, which is how every slot that is not a cylinder's seal is
   * judged, exactly as before.
   *
   * Structural rather than `instanceof RealLink`: a runtime import of `link`
   * here closes the joint → link → joint module cycle (see the file header).
   */
  private get slotHost(): Link {
    let host = this._carrier!;
    const a = this._slotJointA!.id;
    const b = this._slotJointB!.id;
    const holdsBothEnds = (link: Link) =>
      link.joints.some((joint) => joint.id === a) && link.joints.some((joint) => joint.id === b);
    // `seen` because a rebuild caught mid-edit can leave a compound naming
    // itself among its own leaves, and a predicate that never returns is a
    // worse answer than any answer.
    const seen = new Set<Link>([host]);
    for (;;) {
      const inside = ((host as { subset?: Link[] }).subset ?? []).find(
        (leaf) => !seen.has(leaf) && holdsBothEnds(leaf)
      );
      if (!inside) return host;
      seen.add(inside);
      host = inside;
    }
  }

  /**
   * Whether a floating slot still has a defined direction (§2.10 items 4, 6).
   * Two coincident slot joints leave the line undefined — reachable by a
   * Phase 1.2 snap that stops just short of merging.
   *
   * A slot cut into a body that holds the slider itself has no meaning, with
   * one exception, and the exception is a cylinder. **A seal's slot is cut in
   * the barrel, and a barrel never holds the seal** — but weld the cylinder's
   * two end joints into one body and the rod becomes another leaf of the body
   * the barrel is in, so the *root* holds the seal while the bore it names is
   * as real as it ever was. Asked of the root, this answered "malformed", and
   * `reconcileSlots` replied by detaching a bore that cannot be invented back:
   * the part stopped being a cylinder, the URL it then wrote was one the decoder
   * refuses, and a reload, a share or an undo opened an empty grid. Asked of
   * the barrel, the weld is an ordinary rigid statement — the part can never
   * extend, which `cylinder.both-ends-fused` says in words — and unwelding
   * gives back exactly the two bodies that were there. An ordinary slider is
   * judged by its carrier as it always was: its rider welded into its carrier
   * really does leave nothing to slide.
   */
  get isSlotWellFormed(): boolean {
    if (!this._carrier || !this._slotJointA || !this._slotJointB) {
      return false;
    }
    const members = this._carrier.joints;
    const host = this.isSealed ? this.slotHost : this._carrier;
    return (
      this._slotJointA.id !== this._slotJointB.id &&
      members.some((joint) => joint.id === this._slotJointA!.id) &&
      members.some((joint) => joint.id === this._slotJointB!.id) &&
      !host.joints.some((joint) => joint.id === this.id) &&
      Math.hypot(this._slotJointB.x - this._slotJointA.x, this._slotJointB.y - this._slotJointA.y) >
        1e-9
    );
  }

  /** Rebind to equivalent objects from another copy of the mechanism (§2.8a). */
  rebindSlot(links: Link[], joints: Joint[]): void {
    if (!this._carrier || !this._slotJointA || !this._slotJointB) {
      return;
    }
    const carrier = links.find((link) => link.id === this._carrier!.id);
    const a = joints.find((joint) => joint.id === this._slotJointA!.id);
    const b = joints.find((joint) => joint.id === this._slotJointB!.id);
    if (carrier && a && b) {
      this.slideOn(carrier, a, b);
    }
  }
}
