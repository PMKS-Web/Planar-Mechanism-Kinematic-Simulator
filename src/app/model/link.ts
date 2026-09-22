import { Joint, PrisJoint, RealJoint } from './joint';
import { uniformBodyOf } from './uniform-body';
import { Coord } from './coord';
import { Force } from './force';
import { degToRad, determineSlope, getAngle, getDistance, radToDeg } from './utils';
import hull from 'hull.js';
import { SettingsService } from '../services/settings.service';
import { Arc, Line } from './line';
import { buildCompoundPath, transformRigidCoord, transformRigidPath } from './compound-link-path';
import { outlineSweepFlag, withoutCollinearVertices } from './outline-winding';
import { barHalfWidth } from './joint-marks';

export enum Shape {
  line = 'line',
  bar = 'bar',
  eTriangle = 'eTriangle',
  rTriangle = 'rTriangle',
  rectangle = 'rectangle',
  square = 'square',
  circle = 'circle',
  cShape = 'cShape',
  tShape = 'tShape',
  lShape = 'lShape',
  horizontalLine = 'horizontalLine',
  verticalLine = 'verticalLine',
  slantedLineForward = 'slantedLineForward',
  slantedLineBackward = 'slantedLineBackward',
  beanShape = 'beanShape',
  infinityShape = 'infinityShape',
  eightShape = 'eightShape',
  customShape = 'customShape',
}

/**
 * What a hand-placed center of mass is held against. See RealLink.comAnchor.
 */
export type ComAnchor = 'centroid' | 'grid' | { joint: string };

export interface Bound {
  b1: Coord;
  b2: Coord;
  b3: Coord;
  b4: Coord;
  arrow: Coord;
}

export class Link {
  private _id: string;
  private _name: string = ''; //The name of the link
  private _mass: number;
  private _joints: Joint[];
  private _forces: Force[] = [];
  private _showHighlight: boolean = false;
  fixedLocations = [{ id: 'com', label: 'com' }];
  fixedLocation = {
    fixedPoint: 'com',
  };

  constructor(id: string, joints: Joint[], mass?: number) {
    this._id = id;
    this._joints = joints;
    // Nothing weighs anything until someone says so. A link that arrives with
    // a mass of 1 g invites a force analysis to be run on a number nobody
    // chose, and reports it as though it meant something.
    this._mass = mass !== undefined ? mass : 0;
    joints.forEach((j) => {
      this.fixedLocations.push({ id: j.id, label: j.id });
    });
  }

  get showHighlight(): boolean {
    return this._showHighlight;
  }

  set showHighlight(value: boolean) {
    this._showHighlight = value;
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

  get mass(): number {
    return this._mass;
  }

  set mass(value: number) {
    this._mass = value;
  }

  get joints(): Joint[] {
    return this._joints;
  }

  set joints(value: Joint[]) {
    this._joints = value;
  }

  get forces(): Force[] {
    return this._forces;
  }

  set forces(value: Force[]) {
    this._forces = value;
  }
}

/** Which of a bar's two numbers an edit may not change, if either. */
export type LinkHold = 'length' | 'angle' | undefined;

export class RealLink extends Link {
  private _fill: string = 'Set Later';
  /**
   * Bumped by every recolor of any link. A recolor moves nothing and needs
   * no solving, so it bumps none of the mechanism's revisions -- and the
   * canvas caches its skins and marks on those. Keyed on this as well, they
   * repaint on the recolor rather than on the next drag or play.
   */
  static paintRevision = 0;
  // private _shape: Shape; //Shape is the shape of the link
  // private _bound: Bound; //The rectengualr area the link is encompassed by
  private _d: string = ''; //SVG path
  // private _mass: number;

  private _massMoI: number; //The value passed in from the linakge table
  private _CoM: Coord; //Same passed in from the linkage table
  private _CoM_d1: string = ''; //
  private _CoM_d2: string = '';
  private _CoM_d3: string = '';
  private _CoM_d4: string = '';

  private _length: number = 0;
  private _angle: number = 0;
  private _subset: Link[] = []; // this is not connectedLinks but links that make up this link
  private _isVisualGeometryCurrent = false;

  /** Display copies use their own width; document geometry retains its authored size. */
  private get artworkScale(): number {
    return this.drawingScaleOverride ?? SettingsService.objectScale;
  }

  /**
   * The link this one's artwork is a rigid move of, until someone asks for it.
   *
   * A sweep builds every link at every one of its ~360 samples, and only the
   * sample being drawn is ever looked at. Carrying the path across at
   * construction meant tokenizing and reformatting every outline several
   * hundred times per pointer move, which was two thirds of what a drag cost.
   * So the copy waits: `d`, `externalLines` and `initialExternalLines` realize
   * it on first read, and the source is a solved sample's own clone, which
   * nothing changes afterwards.
   */
  /**
   * The artwork this link is a copy of, taken the moment it was made.
   *
   * A snapshot, not the source link: the source is the editable link, and by
   * the time a solved sample's outline is first read -- the first frame of a
   * seek -- the display has already moved that link's joints to the new pose
   * and written the previous frame's path over its `d`. Read live, the rigid
   * move from "where the source stood" to "where this sample stands" was the
   * identity, and every link body was drawn one frame behind its pins: a lag
   * of a degree during playback, and a whole jump after a seek, where the
   * bodies stayed at the start pose while the pins went to two seconds in.
   */
  private visualSource?: {
    d: string;
    externalLines: Line[];
    initialExternalLines: Line[];
    from: { x: number; y: number };
    to: { x: number; y: number };
  };
  private _externalLines: Line[] = [];
  private _initialExternalLines: Line[] = [];
  /** The four center-of-mass quadrant paths are built when first read, too. */
  private comDsStale = true;

  get externalLines(): Line[] {
    this.realizeVisualGeometry();
    return this._externalLines;
  }

  set externalLines(value: Line[]) {
    this._externalLines = value;
  }

  get initialExternalLines(): Line[] {
    this.realizeVisualGeometry();
    return this._initialExternalLines;
  }

  set initialExternalLines(value: Line[]) {
    this._initialExternalLines = value;
  }

  /**
   * The closed rings a compound outline is made of, kept alongside the path.
   *
   * `externalLines` flattens every ring into one list, which is all the canvas
   * needs -- but a reader who wants to *extrude* this has to know where one
   * loop ends and the next begins, or two separate bodies arrive joined by a
   * line that is not part of either.
   */
  private compoundRings: number[][][] = [];

  //For debugging:
  public unqiqueRandomID: string =
    Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  // TODO: Have an optional argument of forces

  public static debugDesiredJointsIDs: unknown;
  public lastSelectedSublink: Link | null = null;
  /**
   * The one value of this bar an edit may not change: its length or its angle
   * from the grid's x axis. One or the other, never both -- a bar holding both
   * can only translate, which is what a Lock on its joints already means, so
   * asking for the second moves the hold rather than adding to it.
   *
   * A hold is not a Lock: the joints stay free to move, on the arc or the line
   * the held value leaves them. It is meaningful on a two-joint bar only, and
   * the URL refuses to carry one on anything else.
   */
  public hold: LinkHold = undefined;
  /**
   * Whether the author chose this link's moment of inertia / center of mass,
   * or left them to follow the geometry (a uniform body over the joints,
   * re-derived at every update). Custom values hold still; auto values move
   * with the mechanism. Old URLs decode as custom-everything, which preserves
   * exactly what they have always meant.
   */
  public moiIsCustom = false;
  public comIsCustom = false;
  /**
   * Draw this link as the disc it sweeps rather than as a bar between its
   * joints — the crank of an engine, drawn the way an engine draws it.
   *
   * A drawing choice and nothing more. Mass properties keep coming from the
   * joint skeleton (see uniform-body.ts), so a link's moment of inertia does
   * not change because someone changed its picture; the Edit panel says so
   * where the numbers are, rather than leaving the difference to be guessed.
   *
   * Only a link with exactly one ground pin can honor it, because the disc
   * is centered on the pin the link turns about and a link with no such pin
   * has no center to offer. `canBeCircular` is that question; the flag is
   * simply ignored while the answer is no, so a link that loses its ground
   * comes back as a bar and returns to a disc if it is grounded again.
   */
  public isCircle = false;

  /**
   * Whether the outline currently held in `d` is a disc.
   *
   * `isCircle` is what was asked for; this is what was drawn. They part company
   * whenever the link stops or starts qualifying — a ground removed, a ground
   * put back — and since a path is only rebuilt when something asks it to, the
   * difference between the two is exactly the signal that it needs rebuilding.
   */
  public drawnAsDisc = false;
  /**
   * Whether a cylinder's skin stands in for this bar, so a compound holding it
   * must not draw it as a plain bar.
   *
   * A leaf cannot work this out for itself. After a weld its joints list only
   * the compound root in `links`, and the one object that knows the pairing is
   * the sealed `PrisJoint` — its `carrier` is the root and its two slot joints
   * are the barrel's — which is reachable from the rod's pin and from nowhere
   * else. A compound welded at a *barrel* mount does not contain that pin, so
   * the structural test below finds the rod and never the barrel, and the
   * barrel came out painted in the bracket's color with a seam partway along
   * the part. Set by whoever resolves the sealed structures, which is the one
   * place the answer exists.
   */
  public drawnByACylinderSkin = false;
  /**
   * The silhouette this bar contributes to the body that has swallowed it.
   *
   * A welded member is part of its body (decision S16), so the body's union
   * takes the skin's real profile — the barrel's, wide and round at the mount;
   * the rod's, from behind the head to its end joint — in place of the thin bar
   * its two joints describe. `buildCompoundPath` then fillets the join and
   * returns one continuous outline, which is what makes a welded mount read the
   * way any other welded body does.
   *
   * Told to the bar for the same reason the flag above is, and by the same
   * pass: nothing reachable from a compound knows the shape. Empty for a bar no
   * skin draws, which is every bar but two per cylinder.
   */
  public skinSilhouette: string | undefined = undefined;
  /**
   * This cylinder rod is painted in its own `fill` rather than its barrel's.
   *
   * A rod starts out drawn in the barrel's color, because a cylinder placed in
   * one gesture is one part until someone says otherwise — and because every
   * drawing already in circulation stores a rod fill the skin has never drawn.
   * Painting those from their own record would have recolored every shared link
   * and every library card at once; the flag is what separates "the rod's
   * stored color" from "the rod was asked to wear it".
   *
   * Set by `paintCylinderMember` and by nothing else, which is also where the
   * rule that changing the barrel does not drag the rod along lives. Meaningful
   * on a rod alone: any other link's fill is already its own, and the flag is
   * simply never read.
   *
   * Behind an accessor for the same reason `fill` is: turning it on changes
   * what the canvas draws, and the skin is cached on `paintRevision`. Giving a
   * rod the color it was already storing changes no fill at all, so without
   * this the one case where the *flag* is the whole of the change repainted
   * nothing.
   */
  private _ownColor = false;
  /**
   * A hand-placed center of mass, held against the link's own frame: along
   * and across the unit direction joints[0]→joints[1], measured from the
   * uniform-body centroid. "Stored against the centroid" is what lets a
   * placed point ride the link through drags, rotations and deformations —
   * a world coordinate goes stale the moment the mechanism moves. The URL
   * still carries the global coordinate; this is re-captured at decode.
   */
  public comOffset?: { along: number; across: number; frame: [string, string] };

  /**
   * What a hand-placed center of mass is held against while the mechanism is
   * being edited.
   *
   *   'centroid'  the link itself — the point rides every drag, turn and
   *               deformation, which is `comOffset` above;
   *   'grid'      the drawing — the point keeps its world coordinate, so moving
   *               the link out from under it leaves it where it was put;
   *   {joint}     one pin — the point follows that pin's position and nothing
   *               else, so turning the link about it does not move it.
   *
   * Editing only. Once the mechanism runs, the center of mass is a point of the
   * body and rides it like any other: the solved timesteps carry it rigidly
   * (Mechanism.transportPoint), which is what makes it a center of mass at all
   * rather than a mark on the page that inertia would be wrong about.
   */
  public comAnchor: ComAnchor = 'centroid';

  /**
   * Where the point sits relative to whatever `comAnchor` names, in world axes.
   * Unused by the centroid anchor, which has `comOffset` to express the same
   * thing in the link's own frame — the difference between the two is the whole
   * point, so they cannot share one representation.
   */
  public comAnchorOffset?: { dx: number; dy: number };

  /** The fixed point a non-centroid anchor measures from, if it still exists. */
  private anchorPoint(): Coord | undefined {
    // Read once into a local: inside the callback below, `this.comAnchor` is a
    // mutable property again and narrowing does not reach it.
    const anchor = this.comAnchor;
    if (anchor === 'grid') return new Coord(0, 0);
    if (anchor === 'centroid') return undefined;
    const pin = this.joints.find((joint) => joint.id === anchor.joint);
    return pin ? new Coord(pin.x, pin.y) : undefined;
  }

  /**
   * The link's own frame: origin at the uniform centroid, x̂ along the two
   * *named* joints — the farthest pair at capture time, so the axis is never
   * degenerate by accident and never silently reinterpreted when the joints
   * array reorders. `ok` is false when a named joint has left the link, which
   * tells the caller to rebase rather than trust a different pair.
   */
  private comFrame(pair?: [string, string]): {
    origin: Coord;
    ux: number;
    uy: number;
    pair: [string, string];
    ok: boolean;
  } {
    const origin = uniformBodyOf(this.joints).centroid;
    let a = pair ? this.joints.find((joint) => joint.id === pair[0]) : undefined;
    let b = pair ? this.joints.find((joint) => joint.id === pair[1]) : undefined;
    const named = !!(a && b);
    if (!named) {
      // The farthest pair: the most stable axis the link has.
      let longest = -1;
      for (let i = 0; i < this.joints.length; i++) {
        for (let j = i + 1; j < this.joints.length; j++) {
          const span =
            (this.joints[i].x - this.joints[j].x) ** 2 + (this.joints[i].y - this.joints[j].y) ** 2;
          if (span > longest) {
            longest = span;
            a = this.joints[i];
            b = this.joints[j];
          }
        }
      }
    }
    const span = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    if (!a || !b || !(span > 1e-9)) {
      return { origin, ux: 1, uy: 0, pair: [a?.id ?? '', b?.id ?? ''], ok: named };
    }
    return {
      origin,
      ux: (b.x - a.x) / span,
      uy: (b.y - a.y) / span,
      pair: [a.id, b.id],
      ok: !pair || named,
    };
  }

  /** Place the center of mass by hand: flags it custom and captures the offset. */
  placeCustomCoM(point: { x: number; y: number }): void {
    this.comIsCustom = true;
    this._CoM = new Coord(point.x, point.y);
    this.captureComOffset();
    this.updateCoMDs();
  }

  /** Re-read the local offset from wherever the CoM currently is. */
  captureComOffset(): void {
    // Both are captured every time, whichever anchor is in force: switching
    // anchor in the panel must not need the point re-placed, and the anchor a
    // link is not currently using is the one it will be using next.
    const frame = this.comFrame();
    const dx = this._CoM.x - frame.origin.x;
    const dy = this._CoM.y - frame.origin.y;
    this.comOffset = {
      along: dx * frame.ux + dy * frame.uy,
      across: -dx * frame.uy + dy * frame.ux,
      frame: frame.pair,
    };
    const anchor = this.anchorPoint();
    this.comAnchorOffset = anchor
      ? { dx: this._CoM.x - anchor.x, dy: this._CoM.y - anchor.y }
      : undefined;
  }

  /** Where the captured offset lands in today's geometry. */
  customCoMFromOffset(): Coord | undefined {
    if (this.comAnchor !== 'centroid') {
      const anchor = this.anchorPoint();
      if (anchor && this.comAnchorOffset) {
        return new Coord(anchor.x + this.comAnchorOffset.dx, anchor.y + this.comAnchorOffset.dy);
      }
      // The pin this was held against has left the link. Keep the point where
      // it is and hand it back to the link, which is the one anchor every link
      // always has -- rather than let it snap to a pin that is not there.
      this.comAnchor = 'centroid';
      this.captureComOffset();
      return new Coord(this._CoM.x, this._CoM.y);
    }
    if (!this.comOffset) return undefined;
    const frame = this.comFrame(this.comOffset.frame);
    if (!frame.ok) {
      // A frame joint left the link (deleted, merged away). The point itself
      // is still where it was, so rebase: keep the CoM, re-anchor the offset
      // to the pair the link has now, rather than silently reading the old
      // numbers against a different axis.
      this.captureComOffset();
      return new Coord(this._CoM.x, this._CoM.y);
    }
    return new Coord(
      frame.origin.x + this.comOffset.along * frame.ux - this.comOffset.across * frame.uy,
      frame.origin.y + this.comOffset.along * frame.uy + this.comOffset.across * frame.ux
    );
  }

  constructor(
    id: string,
    joints: Joint[],
    mass?: number,
    massMoI?: number,
    CoM?: Coord,
    subSet?: Link[],
    visualSource?: RealLink,
    private readonly drawingScaleOverride?: number
  ) {
    super(id, joints, mass);

    // Zero, like the mass above it: a link that arrives with a moment of
    // inertia of 1 resists angular acceleration in every dynamic analysis of a
    // drawing whose author never chose a number — and it made "massless links
    // are skipped by inertia" a lie. URLs carry each link's stored value, so
    // only freshly drawn links land here.
    this._massMoI = massMoI !== undefined ? massMoI : 0;
    this._fill = '#555555'; //Set later

    if (subSet === undefined || subSet.length === 0) {
    } else {
      this.subset = subSet;
    }
    this._CoM = CoM !== undefined ? CoM : RealLink.determineCenterOfMass(joints);
    // Before the path is built, because being drawn as a disc is what decides
    // what that path is. `visualSource` is the link this one is a copy of, so
    // every solved timestep inherits the choice without each cloning site
    // having to remember it.
    if (visualSource !== undefined) {
      this.isCircle = visualSource.isCircle;
    }
    if (
      this.drawingScaleOverride === undefined &&
      visualSource?.isVisualGeometryCurrent &&
      visualSource.joints.length >= 2 &&
      this.joints.length >= 2
    ) {
      const [from, to] = visualSource.joints;
      this.visualSource = {
        d: visualSource.d,
        externalLines: visualSource.externalLines,
        initialExternalLines: visualSource.initialExternalLines,
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
      };
    } else {
      this._d = this.getPathString();
    }
    this._isVisualGeometryCurrent = true;
    // TODO: When you insert a joint onto a link, be sure to utilize this function call
    this.updateCoMDs();
    this.updateLengthAndAngle();
  }

  public reComputeDPath() {
    this.visualSource = undefined;
    this._d = this.getPathString();
    this._isVisualGeometryCurrent = true;
    this.updateCoMDs();
    this.updateLengthAndAngle();
  }

  /** Carry the deferred artwork across now, once. */
  private realizeVisualGeometry(): void {
    const source = this.visualSource;
    if (!source) return;
    this.visualSource = undefined;
    const [targetStart, targetEnd] = this.joints;
    const sourceStart = source.from;
    const sourceEnd = source.to;
    this._d = transformRigidPath(source.d, sourceStart, sourceEnd, targetStart, targetEnd);
    this.externalLines = this.transformVisualLines(
      source.externalLines,
      sourceStart,
      sourceEnd,
      targetStart,
      targetEnd
    );
    this.initialExternalLines = this.transformVisualLines(
      source.initialExternalLines,
      sourceStart,
      sourceEnd,
      targetStart,
      targetEnd
    );
  }

  private transformVisualLines(
    lines: Line[],
    sourceStart: { x: number; y: number },
    sourceEnd: { x: number; y: number },
    targetStart: { x: number; y: number },
    targetEnd: { x: number; y: number }
  ): Line[] {
    const transformed = lines.map((line) => {
      const start = transformRigidCoord(
        line.startPosition,
        sourceStart,
        sourceEnd,
        targetStart,
        targetEnd
      );
      const end = transformRigidCoord(
        line.endPosition,
        sourceStart,
        sourceEnd,
        targetStart,
        targetEnd
      );
      let copy: Line;
      if (line instanceof Arc) {
        const center = transformRigidCoord(
          line.center,
          sourceStart,
          sourceEnd,
          targetStart,
          targetEnd
        );
        copy = new Arc(new Coord(...start), new Coord(...end), new Coord(...center));
      } else {
        copy = new Line(new Coord(...start), new Coord(...end));
      }
      copy.color = line.color;
      copy.parentLink = this;
      return copy;
    });
    transformed.forEach((line, index) => {
      line.next = transformed[(index + 1) % transformed.length];
    });
    return transformed;
  }

  updateLengthAndAngle() {
    this._length = getDistance(this.joints[0], this.joints[1]);
    this._angle = getAngle(this.joints[0], this.joints[1]);
  }

  /**
   * The outlines this body's own picture is built from.
   *
   * A sealed cylinder's barrel or rod welded into this compound is part of the
   * body (decision S16), and it contributes the shape the skin draws rather
   * than the bar its two joints describe: the union then fillets the join and
   * hands back one continuous outline, the same as for any two welded links.
   *
   * `fused` false is the answer for a reader who wants the *parts* rather than
   * the picture — the DXF, where a cylinder is already exported as its own
   * symbol on its own layer. There the member is left out entirely, which is
   * what this whole method did before the silhouettes existed.
   *
   * `drawnByACylinderSkin` is the whole answer to "does a skin draw this bar"
   * when somebody has resolved the structures and said so. The structural test
   * beside it is the fallback for a link built without a service to ask -- it
   * recognizes a rod by the sealed sliding joint it hangs on, and there is no
   * equivalent for a barrel, whose two joints are the mount and the buried near
   * end, which is why the flag exists.
   *
   * It used to reach that joint the long way round, through the block a rod's
   * pin shared with the slider. The pin and the slider are one joint now
   * (Stage 1 of `docs/joint-type-and-cylinder-plan.md`), so the rod simply
   * holds it.
   *
   * The seal has to still *have* a bore for any of that to be true. A sealed
   * slider whose slot has been taken away draws no skin at all — nothing
   * resolves it as a cylinder — so a rod recognized by the flag alone was left
   * out of the body and drawn by nobody: weld a ram's two mounts into one body
   * and the rod simply disappeared, leaving the head block hanging off the end
   * of the barrel with a gap where the rod had been.
   */
  private leafOutlines(fused: boolean): string[] {
    const isSealedRodLeaf = (leaf: RealLink) =>
      leaf.joints.length === 2 &&
      leaf.joints.some((joint) => joint instanceof PrisJoint && joint.isSealed && joint.isFloating);
    const drawnElsewhere = (leaf: RealLink) => leaf.drawnByACylinderSkin || isSealedRodLeaf(leaf);
    const contributed = (leaf: RealLink) => (fused ? leaf.skinSilhouette : undefined);
    return this.subset
      .filter(
        (link): link is RealLink =>
          link instanceof RealLink &&
          !(this.subset.length > 1 && drawnElsewhere(link) && !contributed(link))
      )
      .map((link) => contributed(link) ?? link.d);
  }

  getCompoundPathString(): string {
    // A compound is drawn from the outlines of its parts, never as a disc.
    this.drawnAsDisc = false;
    this.subset.forEach((link) => {
      if (link instanceof RealLink) link.reComputeDPath();
    });
    const geometry = buildCompoundPath(this.leafOutlines(true), barHalfWidth(this.artworkScale));
    this.compoundRings = geometry.rings;
    this.externalLines = geometry.rings.flatMap((ring) =>
      ring.slice(0, -1).map((point, index) => {
        const next = ring[index + 1];
        const line = new Line(new Coord(point[0], point[1]), new Coord(next[0], next[1]));
        line.parentLink = this;
        return line;
      })
    );
    this.initialExternalLines = this.externalLines.map((line) => line.clone());
    return geometry.path;
  }

  getPathString(): string {
    return this.subset.length === 0 ? this.getSimplePathString() : this.getCompoundPathString();
  }

  /**
   * This link's outline as closed loops, in model coordinates.
   *
   * The same shape the canvas draws, said in a way something other than an SVG
   * path can use: a run of vertices per loop, each carrying the bulge of the
   * arc leading to the next one -- zero for a straight edge, the tangent of a
   * quarter of the included angle for a rounded corner. That is exactly what a
   * DXF polyline wants, and it is what turns "a picture of a linkage" into a
   * face somebody can select and extrude.
   *
   * Empty when there is no outline to give: a bar whose joints have collapsed
   * onto one point has no shape, and a caller should fall back to the
   * centerline rather than draw nothing.
   *
   * One body differs from the picture: a compound that has fused a cylinder
   * member into its outline (decision S16) gives the export the body *without*
   * it. This is a parts drawing, and a cylinder is already a part of its own
   * here -- its own barrel and rod on their own layer, drawn as the symbol a
   * reader mates rather than as the silhouette the canvas paints. Handing the
   * bracket's face the barrel as well would lay a second, differently shaped
   * barrel over the first. The rings are rebuilt rather than kept beside the
   * drawn ones, because a second union on every rebuild is a real cost paid for
   * an answer only an export ever reads.
   */
  outlineLoops(): { x: number; y: number; bulge: number }[][] {
    if (this.subset.length > 0) {
      const fusing = this.subset.some(
        (leaf) => leaf instanceof RealLink && leaf.skinSilhouette !== undefined
      );
      const rings: number[][][] = fusing
        ? buildCompoundPath(this.leafOutlines(false), barHalfWidth(this.artworkScale)).rings
        : this.compoundRings;
      return rings
        .filter((ring) => ring.length > 3)
        .map((ring) => ring.slice(0, -1).map((point) => ({ x: point[0], y: point[1], bulge: 0 })));
    }
    if (this.drawnAsDisc) {
      const center = this.groundPivot();
      if (center === undefined) return [];
      const reach = this.joints.reduce(
        (far, joint) => Math.max(far, getDistance(center, joint)),
        0
      );
      const radius = reach + barHalfWidth(this.artworkScale);
      // A circle, as a polyline: two semicircles, which is how DXF says a
      // round closed profile without leaving the one entity type.
      return [
        [
          { x: center.x - radius, y: center.y, bulge: 1 },
          { x: center.x + radius, y: center.y, bulge: 1 },
        ],
      ];
    }
    if (this.externalLines.length < 2) return [];
    // Every corner of an outline bulges outward, so the sign follows the ring's
    // winding rather than the arc's own endpoints. It has to: an end cap is a
    // half circle, and a half circle's start and end angles are the same pair
    // whichever way round it goes.
    const outward = RealLink.ringWinding(this.externalLines);
    return [
      this.externalLines.map((line) => ({
        x: line.startPosition.x,
        y: line.startPosition.y,
        bulge: line instanceof Arc ? outward * Math.abs(RealLink.arcBulge(line)) : 0,
      })),
    ];
  }

  /** +1 when the ring runs counter-clockwise, -1 when it runs the other way. */
  private static ringWinding(ring: Line[]): number {
    const twiceArea = ring.reduce(
      (sum, line) =>
        sum +
        (line.startPosition.x * line.endPosition.y - line.endPosition.x * line.startPosition.y),
      0
    );
    return twiceArea >= 0 ? 1 : -1;
  }

  /** `tan(theta / 4)` for the arc's included angle -- what a DXF vertex wants. */
  private static arcBulge(arc: Arc): number {
    const fromAngle = Math.atan2(
      arc.startPosition.y - arc.center.y,
      arc.startPosition.x - arc.center.x
    );
    const toAngle = Math.atan2(arc.endPosition.y - arc.center.y, arc.endPosition.x - arc.center.x);
    let swept = toAngle - fromAngle;
    while (swept <= -Math.PI) swept += 2 * Math.PI;
    while (swept > Math.PI) swept -= 2 * Math.PI;
    return Math.tan(swept / 4);
  }

  getHullPoints(): number[][] {
    const allJoints = this.joints;

    //Convert joints to simple x, y array
    const points = allJoints.map((j) => [j.x, j.y]);
    return hull(points, Infinity) as number[][];
  }

  // whether (x,y) is inside the hull. To calculate this, create a new
  // hull with the point added to allJoints, and determine if the new hull
  // contains the added (x,y) point
  isPointInsideHull(x: number, y: number): boolean {
    let points = this.joints.map((j) => [j.x, j.y]);
    points.push([x, y]);
    const hullPoints = hull(points, Infinity) as number[][];

    let hullContainsPoint = false;
    hullPoints.forEach((point: number[]) => {
      if (point[0] === x && point[1] === y) {
        hullContainsPoint = true;
      }
    });

    return !hullContainsPoint;
  }

  /**
   * The outline of a bar whose joints have all landed on one point, or nothing
   * when they have not.
   *
   * Every edge of such a bar is zero length, so the slope it is offset from is
   * 0/0 and the whole path comes out `M NaN NaN` — which the browser rejects
   * outright, once per frame, and which then propagates into every solved
   * timestep that copies this geometry. It is a state the app can reach: drop a
   * joint exactly on another joint of its own link and the merge is refused,
   * correctly, leaving the two coincident.
   *
   * Drawn as the disc the bar's own end cap already is, so a mechanism that has
   * been dragged into this stays visible and can be dragged back out of it. The
   * link is degenerate either way — this is about not making it unreadable as
   * well.
   */
  private collapsedOutline(points: number[][]): string | undefined {
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (spread > 1e-9) return undefined;
    const radius = barHalfWidth(this.artworkScale);
    const [x, y] = points[0];
    return (
      `M ${x - radius} ${y} A ${radius} ${radius} 0 0 1 ${x + radius} ${y} ` +
      `A ${radius} ${radius} 0 0 1 ${x - radius} ${y} Z `
    );
  }

  /**
   * The pin a circular link turns about, or nothing when it has no single one.
   *
   * Exactly one ground, and a revolute one: two grounds make a frame that does
   * not turn at all, none makes a coupler with no fixed center to draw about,
   * and a prismatic ground anchors a slot rather than a pivot. Each of those
   * would need a different answer to "centered where?", and a disc drawn about
   * a guess is worse than the bar it replaced.
   */
  groundPivot(): Joint | undefined {
    const pivots = this.joints.filter(
      (joint) => joint instanceof RealJoint && joint.ground && !(joint instanceof PrisJoint)
    );
    return pivots.length === 1 ? pivots[0] : undefined;
  }

  /** Whether Draw as a Disc has anything to act on. */
  canBeCircular(): boolean {
    return this.subset.length === 0 && this.groundPivot() !== undefined;
  }

  /**
   * The disc a circular link is drawn as, or nothing when it is not one.
   *
   * Centered on the ground pin, and wide enough to reach the outermost joint's
   * end cap — the same half-width every bar is drawn with — so the disc covers
   * exactly the ground the bar covered and no pin ends up outside its own link.
   */
  private circularOutline(): string | undefined {
    if (!this.isCircle) return undefined;
    const center = this.groundPivot();
    if (center === undefined) return undefined;
    const reach = this.joints.reduce((far, joint) => Math.max(far, getDistance(center, joint)), 0);
    const radius = reach + barHalfWidth(this.artworkScale);
    const { x, y } = center;
    return (
      `M ${x - radius} ${y} A ${radius} ${radius} 0 0 1 ${x + radius} ${y} ` +
      `A ${radius} ${radius} 0 0 1 ${x - radius} ${y} Z `
    );
  }

  getSimplePathString(): string {
    this.externalLines = [];
    this.drawnAsDisc = false;
    let l = this;
    // Draw link given the desiredJointIDs
    const allJoints = l.joints;

    //Convert joints to simple x, y array
    const points = allJoints.map((j) => [j.x, j.y]);
    const collapsed = this.collapsedOutline(points);
    if (collapsed) {
      this.externalLines = [];
      this.initialExternalLines = [];
      return collapsed;
    }
    // A disc has no edges, so there is nothing for a joint to be attached
    // along and nothing for the edit-hover to measure — the same empty answer
    // the collapsed bar above gives, for the same reason.
    const disc = this.circularOutline();
    if (disc) {
      this.externalLines = [];
      this.initialExternalLines = [];
      this.drawnAsDisc = true;
      return disc;
    }
    const hullPoints = hull(points, Infinity) as number[][]; //Hull points find the convex hull (largest fence)

    // Match resulting x,y points to joints.
    //
    // A list rather than one packed string. The ids used to be concatenated and
    // then read back a character at a time, which quietly required every joint
    // id to be exactly one character -- so the two-letter names a drawing gets
    // past its fifty-second joint, and the numbered names inside a cylinder,
    // both came apart here into characters that name no joint at all.
    let desiredJointsIDs: string[] = [];
    hullPoints.forEach((point: number[]) => {
      const joint = allJoints.find((j) => j.x === point[0] && j.y === point[1]);
      if (joint) desiredJointsIDs.push(joint.id);
    });

    //Cut off the last once since it is the same as the first
    desiredJointsIDs = desiredJointsIDs.slice(0, -1);

    //This is just for debugging display
    // l.debugDesiredJointsIDs = desiredJointsIDs;
    // RealLink.debugDesiredJointsIDs = desiredJointsIDs;

    const jointIDtoIndex = new Map<string, number>();
    allJoints.forEach((j, ind) => {
      jointIDtoIndex.set(j.id, ind);
    });

    let width: number = barHalfWidth(this.artworkScale);
    // A joint sitting on the line between two others is not a corner of the
    // outline, however defensible it is as a hull vertex: the offset edge would
    // arrive, turn through a semicircle it does not need, and leave along the
    // same line, folding the outline back over itself. Even-odd fill then
    // cancels the doubled region and draws it white, which is the thin white
    // sliver that flickers in and out as a joint is dragged past its neighbors.
    desiredJointsIDs = withoutCollinearVertices(desiredJointsIDs, allJoints, jointIDtoIndex, width);
    let d = '';

    // Which way every corner arc bulges follows from the winding of the outline
    // being traced, and nothing else. It used to be guessed from one coordinate
    // of the first corner and then flipped for links with more than three
    // joints, which is not a property of the outline at all: `hull` does not
    // return a consistent winding, so on the hulls where the guess disagreed
    // the arcs took the short way round the *other* circle and drew a concave
    // notch into every corner instead of rounding it.
    const clockWise = outlineSweepFlag(desiredJointsIDs, allJoints, jointIDtoIndex, width);

    let j: number;
    for (let i = 0; i < desiredJointsIDs.length; i++) {
      j = (i + 1) % desiredJointsIDs.length;
      if (desiredJointsIDs.length === 2) {
        const [updatedD, newLines] = determineL(
          d,
          allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!]
        );
        d = updatedD;
        this.externalLines = this.externalLines.concat(newLines);
      } else {
        const k = (i + 2) % desiredJointsIDs.length;
        const [updatedD, newLines] = determineL(
          d,
          allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[k])!]
        );
        d = updatedD;
        this.externalLines = this.externalLines.concat(newLines);
      }
    }

    //Get the final joint
    const finalJoint = allJoints[jointIDtoIndex.get(desiredJointsIDs[j!])!];
    let lastPos = this.externalLines[this.externalLines.length - 1].endPosition;
    let startPos = this.externalLines[0].startPosition;
    lastPos = new Coord(lastPos.x, lastPos.y);
    startPos = new Coord(startPos.x, startPos.y);
    d +=
      ' A ' +
      width.toString() +
      ' ' +
      width.toString() +
      ' 0 0 ' +
      clockWise +
      ' ' +
      startPos.x +
      ' ' +
      startPos.y;

    this.externalLines.push(new Arc(lastPos, startPos, finalJoint));

    if (!RealLink.isClockwise(this.externalLines[0], this.CoM)) {
      this.externalLines.reverse();
      //If the link is not clockwise, reverse the order of the external lines
      for (let i = 0; i < this.externalLines.length; i++) {
        const line = this.externalLines[i];
        //Swap start and end positions
        const temp = line.startPosition;
        line.startPosition = line.endPosition;
        line.endPosition = temp;
        line.resetInitialPosition();
      }
    }

    //Now set the next external line for each line
    this.externalLines.forEach((line, ind) => {
      const nextLine = this.externalLines[(ind + 1) % this.externalLines.length];
      line.next = nextLine;
    });

    this.initialExternalLines = this.externalLines.map((line) => line.clone());

    d += ' Z ';
    return d;

    function determineL(d: string, coord1: Joint, coord2: Joint, coord3?: Joint): [string, Line[]] {
      // find slope between two points
      const m = determineSlope(coord1.x, coord1.y, coord2.x, coord2.y);
      // find normal slope of given slope
      let normal_m: number;
      if (m === 0) {
        normal_m = 99999;
      } else {
        normal_m = -1 / m;
      }

      const normal_angle = Math.atan(normal_m); // in degrees

      // determine the point further away from third point
      let point1: Coord;
      let point2: Coord;

      // TODO: think of better way to create this more universally

      if (coord3 === undefined) {
        if (d === '') {
          [point1, point2] = determinePoint(normal_angle, coord1, coord2, 'neg');
        } else {
          [point1, point2] = determinePoint(normal_angle, coord1, coord2, 'pos');
        }
      } else {
        const [point1a, point1b] = determinePoint(normal_angle, coord1, coord2, 'pos');
        const point1c = new Coord((point1a.x + point1b.x) / 2, (point1a.y + point1b.y) / 2);
        const [point2a, point2b] = determinePoint(normal_angle, coord1, coord2, 'neg');
        const point2c = new Coord((point2a.x + point2b.x) / 2, (point2a.y + point2b.y) / 2);

        if (getDistance(coord3, point1c) > getDistance(coord3, point2c)) {
          [point1, point2] = [point1a, point1b];
        } else {
          [point1, point2] = [point2a, point2b];
        }
      }

      const returnLines: Line[] = [];

      if (d === '') {
        d += 'M ' + point1.x.toString() + ' ' + point1.y.toString();
        d += ' L ' + point2.x.toString() + ' ' + point2.y.toString();
        returnLines.push(new Line(point1, point2));
      } else {
        // The end position is being inserted here
        // Get the last position by splitting the string
        const splitPath = d.split(' ');
        const lastX = splitPath[splitPath.length - 2];
        const lastY = splitPath[splitPath.length - 1];
        const lastPosition = new Coord(Number(lastX), Number(lastY));
        d +=
          ' A ' +
          width.toString() +
          ' ' +
          width.toString() +
          ' 0 0 ' +
          clockWise +
          ' ' +
          point1.x.toString() +
          ' ' +
          point1.y.toString();
        d += ' L ' + point2.x.toString() + ' ' + point2.y.toString();
        //Get the current joint we are arcing around
        const currentJoint = allJoints[jointIDtoIndex.get(coord1.id)!];
        returnLines.push(new Arc(lastPosition, point1, currentJoint));
        returnLines.push(new Line(point1, point2));
      }
      return [d, returnLines];

      function determinePoint(angle: number, c1: Coord, c2: Coord, dir: string) {
        // Maybe it is atan2 that is desired...
        if (dir === 'neg') {
          return [
            new Coord(
              width * Math.cos(angle + Math.PI) + c1.x,
              width * Math.sin(angle + Math.PI) + c1.y
            ),
            new Coord(
              width * Math.cos(angle + Math.PI) + c2.x,
              width * Math.sin(angle + Math.PI) + c2.y
            ),
          ];
        } else {
          return [
            new Coord(width * Math.cos(angle) + c1.x, width * Math.sin(angle) + c1.y),
            new Coord(width * Math.cos(angle) + c2.x, width * Math.sin(angle) + c2.y),
          ];
        }
      }
    }
  }

  static isClockwise(l: Line, center: Coord) {
    const lineStart: Coord = l.startPosition;
    const lineEnd: Coord = l.endPosition;

    const vectorStartToCenter = {
      x: center.x - lineStart.x,
      y: center.y - lineStart.y,
    };

    const vectorEndToCenter = {
      x: center.x - lineEnd.x,
      y: center.y - lineEnd.y,
    };

    const crossProduct =
      vectorStartToCenter.x * vectorEndToCenter.y - vectorStartToCenter.y * vectorEndToCenter.x;

    return crossProduct > 0;
  }

  static determineCenterOfMass(joints: Joint[]) {
    let com_x = 0;
    let com_y = 0;
    // TODO: Logic isn't exactly right but can change this once other logic is fully finished
    joints.forEach((j) => {
      com_x += j.x;
      com_y += j.y;
    });
    return new Coord(com_x / joints.length, com_y / joints.length);
  }

  get d(): string {
    this.realizeVisualGeometry();
    return this._d;
  }

  set d(value: string) {
    this.visualSource = undefined;
    this._d = value;
    this._isVisualGeometryCurrent = true;
  }

  get length(): number {
    return this._length;
  }

  set length(value: number) {
    this._length = value;
  }

  get angleRad(): number {
    return this._angle;
  }

  set angleRad(value: number) {
    this._angle = value;
  }

  get angleDeg(): number {
    return radToDeg(this._angle);
  }

  set angleDeg(value: number) {
    this._angle = degToRad(value);
  }

  get fill(): string {
    return this._fill;
  }

  set fill(value: string) {
    if (value !== this._fill) RealLink.paintRevision++;
    this._fill = value;
  }

  /** Whether a cylinder rod wears its own `fill` rather than its barrel's. */
  get ownColor(): boolean {
    return this._ownColor;
  }

  set ownColor(value: boolean) {
    if (value !== this._ownColor) RealLink.paintRevision++;
    this._ownColor = value;
  }

  get massMoI(): number {
    return this._massMoI;
  }

  set massMoI(value: number) {
    this._massMoI = value;
  }

  get CoM(): Coord {
    return this._CoM;
  }

  set CoM(value: Coord) {
    this._CoM = value;
  }

  get CoM_d1(): string {
    if (this.comDsStale) this.buildCoMDs();
    return this._CoM_d1;
  }

  set CoM_d1(value: string) {
    this._CoM_d1 = value;
  }

  get CoM_d2(): string {
    if (this.comDsStale) this.buildCoMDs();
    return this._CoM_d2;
  }

  set CoM_d2(value: string) {
    this._CoM_d2 = value;
  }

  get CoM_d3(): string {
    if (this.comDsStale) this.buildCoMDs();
    return this._CoM_d3;
  }

  set CoM_d3(value: string) {
    this._CoM_d3 = value;
  }

  get CoM_d4(): string {
    if (this.comDsStale) this.buildCoMDs();
    return this._CoM_d4;
  }

  set CoM_d4(value: string) {
    this._CoM_d4 = value;
  }

  get isWelded(): boolean {
    return this.subset.length >= 1;
  }

  updateCoMDs() {
    this.comDsStale = true;
  }

  private buildCoMDs() {
    this.comDsStale = false;
    //This is such a bad way of doing this. Just import the SVG file from the assets folder and use that instead of constructing the exact same thing every time.
    // Small. The mark says where the center of mass is; at the size it was, on
    // a drawing with several links, it was the loudest thing on the canvas.
    const radius = this.artworkScale * 0.11;
    this._CoM_d1 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      (this.CoM.x - radius) +
      ' ' +
      this.CoM.y +
      ' ' +
      `A ${radius} ${radius} 0 0 0 ` +
      this.CoM.x +
      ' ' +
      (this.CoM.y + radius);
    this._CoM_d2 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y + radius) +
      ' ' +
      `A ${radius} ${radius} 0 0 0` +
      (this.CoM.x + radius) +
      ' ' +
      this.CoM.y;
    this._CoM_d3 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      (this.CoM.x + radius) +
      ' ' +
      this.CoM.y +
      ' ' +
      `A ${radius} ${radius} 0 0 0 ` +
      this.CoM.x +
      ' ' +
      (this.CoM.y - radius);
    this._CoM_d4 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y - radius) +
      ' ' +
      `A ${radius} ${radius} 0 0 0 ` +
      (this.CoM.x - radius) +
      ' ' +
      this.CoM.y;
  }

  get subset(): Link[] {
    return this._subset;
  }

  get isVisualGeometryCurrent(): boolean {
    return this._isVisualGeometryCurrent;
  }

  get isCompound(): boolean {
    return this._subset.length > 0;
  }

  set subset(value: Link[]) {
    this._subset = value;
    this._isVisualGeometryCurrent = false;
  }
}

/**
 * Every body at or under these links, once each: the roots, and the member bars
 * a weld has swallowed into a compound.
 *
 * A compound's leaves are not usually bodies in their own right -- click a
 * welded body and the compound is what gets selected -- but a cylinder's are
 * (decision S13): the barrel's path selects the barrel and the rod's the rod,
 * each with its own panel and its own numbers, welded or not. Anything that
 * answers "which body is this id" or "what are this body's rates" therefore has
 * to look past the top level, and each of those places walking the subsets for
 * itself is how two of them came to disagree.
 */
export function bodiesUnder(links: readonly Link[] | undefined): RealLink[] {
  const found = new Map<string, RealLink>();
  const walk = (link: Link): void => {
    if (!(link instanceof RealLink)) return;
    found.set(link.id, link);
    link.subset.forEach(walk);
  };
  (links ?? []).forEach(walk);
  return [...found.values()];
}

// export class BinaryLink extends RealLink {}

// export class NonBinaryLink extends RealLink {}
