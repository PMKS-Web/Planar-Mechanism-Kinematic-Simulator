import { Joint, PrisJoint, RealJoint, RevJoint } from 'src/app/model/joint';
import { MechanismService } from '../mechanism.service';
import { Link, RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';
import { Coord } from 'src/app/model/coord';
import { cylinderAtSeal, cylindersIn } from 'src/app/model/cylinder';
import { GenericTranscoder } from './transcoder-interface';
import { ForceData, JOINT_TYPE, JointData, LINK_TYPE, LinkData } from './transcoder-data';
import { SettingsService } from '../settings.service';
import { AngleUnit, ForceUnit, GlobalUnit, LengthUnit } from 'src/app/model/utils';
import { BoolSetting, DecimalSetting, EnumSetting, IntSetting } from './stored-settings';
import { ActiveObjService } from '../active-obj.service';
import { MODEL_SCALE } from 'src/app/model/render-scale';

/*
 * MechanismBuilder is a class that takes in a decoder and mechanism service and
 * builds a mechanism from the decoder
 */
export class MechanismBuilder {
  mechanism: MechanismService;
  transcoder: GenericTranscoder;

  constructor(
    mechanism: MechanismService,
    transcoder: GenericTranscoder,
    private settings: SettingsService,
    private activeObj: ActiveObjService
  ) {
    this.mechanism = mechanism;
    this.transcoder = transcoder;
  }

  // Find joint by id from decoder
  private getJointByID(joints: Joint[], id: string): Joint | undefined {
    return joints.find((joint) => joint.id === id);
  }

  // Find link by id from decoder
  /**
   * A link by id, the leaves of a compound included.
   *
   * A weld swallows its members, so by the time anything is looked up by name
   * the bar somebody set a hold on is no longer in the top-level list. It is
   * still a bar and still holds what it held.
   */
  private getLinkByID(links: Link[], id: string): Link | undefined {
    const found = links.find((link) => link.id === id);
    if (found) return found;
    for (const link of links) {
      if (!(link instanceof RealLink) || link.subset.length === 0) continue;
      const inside = this.getLinkByID(link.subset, id);
      if (inside) return inside;
    }
    return undefined;
  }

  // Create Joints from JointData. Joint starts off with no links, to be added later
  // URLs carry user-unit coordinates; the internal world is MODEL_SCALE times
  // larger (see render-scale.ts), so every decoded coordinate scales up here.
  private buildJoint(jointData: JointData): Joint {
    let joint;

    if (jointData.type === JOINT_TYPE.PRISMATIC) {
      joint = new PrisJoint(
        jointData.id,
        jointData.x * MODEL_SCALE,
        jointData.y * MODEL_SCALE,
        jointData.isInput,
        jointData.isGrounded
      );
      joint.angle_rad = jointData.angleRadians;
      // The sealed-cylinder bit rides the prismatic pin; undo/redo replays
      // URLs, so this is the line that makes sealing survive an undo.
      joint.isSealed = jointData.isSealed;
      // A Slide says so in the weld bit of its own record. On a URL written
      // while a slider was three objects the bit is on the coincident pin
      // instead and this reads false; `foldLegacySliders` puts it right once
      // the block that pairs the two has been built.
      joint.rotates = !jointData.isWelded;
      joint.mass = jointData.mass;
    } else {
      joint = new RevJoint(
        jointData.id,
        jointData.x * MODEL_SCALE,
        jointData.y * MODEL_SCALE,
        jointData.isInput,
        jointData.isGrounded
      );
    }

    joint.name = jointData.name;
    // Not on a slider: there the same bit is `rotates` above. A slider welds to
    // nothing — its only link was the block, and a weld needs two bodies to
    // fuse — so reading it as a weld here would offer Unweld on a Slide.
    if (!(joint instanceof PrisJoint)) joint.isWelded = jointData.isWelded;
    joint.showCurve = jointData.showCurve;
    joint.driveSpeed = jointData.driveSpeed;
    console.log('build joint', jointData.type);

    return joint;
  }

  // Create Links from LinkData. Joints are passed in to be linked to the link
  // The link starts off with no forces, to be added as forces are created
  private buildLink(linkData: LinkData, joints: Joint[]): Link {
    // For each joint id of the link, find the associated joint object
    let jointsOnLink: Joint[] = linkData.jointIDs.map((jointID) =>
      this.getJointByID(joints, jointID)!
    );

    // For each revolute joint on the link, link it to every other joint
    const realJoints = jointsOnLink.filter((joint) => joint instanceof RealJoint) as RealJoint[];
    for (let joint of realJoints) {
      for (let otherJoint of realJoints) {
        if (joint !== otherJoint) joint.connectedJoints.push(otherJoint);
      }
    }

    let link;
    if (linkData.type === LINK_TYPE.REAL) {
      let CoM: Coord = new Coord(linkData.xCoM * MODEL_SCALE, linkData.yCoM * MODEL_SCALE);
      link = new RealLink(linkData.id, jointsOnLink, linkData.mass, linkData.massMoI, CoM);
      link.moiIsCustom = linkData.moiIsCustom;
      link.comIsCustom = linkData.comIsCustom;
      link.fill = linkData.color;
      // The joints are all built before any link is (they have to be — a link
      // is named by the ones it holds), so the ground pin a disc is centered on
      // is already known here and the outline can be built for real rather
      // than as a bar to be corrected on the next update.
      if (linkData.isCircle) {
        link.isCircle = true;
        link.reComputeDPath();
      }
    } else {
      // A piston record: the zero-length block a pre-Stage-1 slider was built
      // from. It comes back as a plain `Link` rather than a class of its own,
      // because the only thing anything still does with one is read its mass
      // and its two joints on the way to folding it away.
      link = new Link(linkData.id, jointsOnLink, linkData.mass);
    }

    // for all joints in link, connect to link
    //for (let joint of revoluteJoints) joint.links.push(link);

    link.name = linkData.name;

    return link;
  }

  // Create Force from ForceData. Links are passed in to be linked to the force
  // For each force, the link is added to the force, and the force is added to the link
  private buildForce(forceData: ForceData, links: Link[]): Force {
    const link = links.find(
      (candidate) =>
        candidate.id === forceData.linkID ||
        (candidate instanceof RealLink &&
          candidate.subset.some((subset) => subset.id === forceData.linkID))
    );

    let startCoord = new Coord(forceData.startX * MODEL_SCALE, forceData.startY * MODEL_SCALE);
    let endCoord = new Coord(forceData.endX * MODEL_SCALE, forceData.endY * MODEL_SCALE);

    if (!(link instanceof RealLink)) {
      throw new Error('Force can only be applied to RealLink');
    }

    let force = new Force(
      forceData.id,
      link as RealLink,
      startCoord,
      endCoord,
      forceData.isLocal,
      forceData.isFacingOut,
      forceData.magnitude
    );
    force.name = forceData.name;
    // Add force to link
    link.forces.push(force);

    return force;
  }

  /**
   * Point each floating slot at the objects this build just made.
   *
   * The transcoder has already refused any URL whose slot tokens do not resolve
   * (§2.4a), so a lookup that fails here means the two are out of step rather
   * than that the URL was bad — worth failing loudly instead of quietly
   * producing a slider that has forgotten what it slides on.
   */
  private resolveSlots(joints: Joint[], links: Link[]): void {
    this.transcoder.getJoints().forEach((jointData) => {
      if (jointData.carrierID === '') return;
      const joint = this.getJointByID(joints, jointData.id);
      const carrier = this.getLinkByID(links, jointData.carrierID);
      const slotJointA = this.getJointByID(joints, jointData.slotJointAID);
      const slotJointB = this.getJointByID(joints, jointData.slotJointBID);
      if (!(joint instanceof PrisJoint) || !carrier || !slotJointA || !slotJointB) {
        throw new Error('Slot references could not be resolved while building the mechanism');
      }
      joint.slideOn(carrier, slotJointA, slotJointB);
    });
  }

  /**
   * Fold a slider that arrived as three objects into the one joint it is now.
   *
   * Every URL written before Stage 1 of `docs/joint-type-and-cylinder-plan.md`
   * spells a slider as a prismatic joint, a coincident `RevJoint`, and a
   * zero-length `SliderBlock` joining them — the block carrying the mass, the
   * pin carrying the weld that makes it a Slide. One joint carries all of that
   * now, so the block and the pin are read and then folded away.
   *
   * **The pin's id is the one kept.** Link ids are built from their joints'
   * letters, and the pin is the joint the reader has always seen — a slider's
   * own letter is never drawn. Keeping it leaves every link id, force, lock,
   * color and center-of-mass reference pointing at something that still exists,
   * and leaves the canvas lettered exactly as it was.
   *
   * Runs after `resolveSlots`, so a slot binds while the ids it names are still
   * the ones the URL used, and after `filterSubsetLinks`, which pairs link
   * records with links by index and would mis-pair them if a block went first.
   *
   * Returns what each folded slider used to be called, because the rest of the
   * URL still names it that way: a lock, a color or a center-of-mass anchor set
   * on the *prismatic* joint is written as that joint's id, and after the fold
   * nothing answers to it. Handed back rather than repaired here, so each of
   * those lookups falls through one map instead of each learning about sliders.
   */
  private foldLegacySliders(joints: Joint[], links: Link[]): Map<string, string> {
    const withSubsets = (roots: Link[]): Link[] =>
      roots.flatMap((link) =>
        link instanceof RealLink && link.subset.length > 0
          ? [link, ...withSubsets(link.subset)]
          : [link]
      );

    // Named by the records rather than by a class: a piston record is what a
    // legacy slider's block arrives as, and the class it used to become is
    // gone. A bar is excluded as well, so a hand-edited URL that gave one a
    // piston type cannot get it folded away as a block.
    const pistonIds = new Set(
      this.transcoder
        .getLinks()
        .filter((linkData) => linkData.type === LINK_TYPE.PISTON)
        .map((linkData) => linkData.id)
    );
    const blocks = links.filter(
      (link) => pistonIds.has(link.id) && !(link instanceof RealLink) && link.joints.length === 2
    );
    const renamed = new Map<string, string>();
    if (blocks.length === 0) return renamed;

    for (const block of blocks) {
      const slider = block.joints.find((joint): joint is PrisJoint => joint instanceof PrisJoint);
      const pin = block.joints.find((joint) => !(joint instanceof PrisJoint));
      if (!slider || !(pin instanceof RealJoint)) continue;

      slider.mass = block.mass;
      slider.rotates = !pin.isWelded;
      // Both records carry these, and which one holds the live value depends on
      // how old the URL is: making a slider moved the pin's ground and input
      // onto the slot, but a drawing saved before that move kept them on the
      // pin. Either side saying yes is a yes.
      //
      // Through `groundAt`, and only where there is no carrier to lose.
      // `ground` written straight leaves a floating slot both carried and
      // grounded, which is a state `PrisJoint`'s three setters exist to make
      // unreachable and which `validateDecodedSlots` refuses on the way back
      // out -- so the next save of an old drawing threw.
      if (pin.ground && !slider.ground && !slider.isFloating) {
        slider.groundAt(slider.slotAngle);
      }
      slider.input = slider.input || pin.input;
      slider.showCurve = slider.showCurve || pin.showCurve;
      if (slider.driveSpeed === 0) slider.driveSpeed = pin.driveSpeed;
      // The pin's name, always — read before the id changes underneath it.
      // Copying it only when the pin had been renamed left the surviving joint
      // wearing the *prismatic* record's name, so an unnamed slider decoded as
      // "E" while calling itself B. `name` answers with the id when nobody has
      // set one, so an unnamed pin hands over its id and nothing reads oddly.
      slider.name = pin.name;
      renamed.set(slider.id, pin.id);
      slider.id = pin.id;

      for (const link of withSubsets(links)) {
        const at = link.joints.indexOf(pin);
        if (at >= 0) link.joints[at] = slider;
      }

      joints.splice(joints.indexOf(pin), 1);
      links.splice(links.indexOf(block), 1);
    }

    // A slot whose line was drawn through a folded pin now names a joint that
    // has gone. The id it names belongs to the slider that replaced it, so the
    // slot rebinds by id rather than being repaired case by case.
    //
    // Subsets included: a carrier can be welded into a compound, which is why
    // `resolveSlots` runs before `filterSubsetLinks` at all. Handed roots only,
    // `rebindSlot` finds no carrier for such a slot, bails, and leaves both
    // slot joints pointing at the pin object just spliced out of `joints` -- a
    // joint in no array and so never animated, which `slotAngle` then reads as
    // a frozen line.
    const everyLink = withSubsets(links);
    for (const joint of joints) {
      if (joint instanceof PrisJoint && joint.isFloating) joint.rebindSlot(everyLink, joints);
    }
    return renamed;
  }

  /**
   * Put a sealed slot in mount-first order: A the barrel's outer mount, B its
   * inner end (Stage 2 of `docs/joint-type-and-cylinder-plan.md`, decision S1).
   *
   * **The one place the old distance rule survives.** A cylinder's roles used
   * to be worked out by measuring — the barrel joint further from the rod's
   * mount is the mount — every time anything asked, because a URL written
   * before Stage 2 promises nothing about which way round its slot was stored.
   * Creation has always written it mount-first, so this is a no-op for
   * everything the app itself has emitted; it is the reader's job to make the
   * promise true for the rest, once, before anything asks.
   *
   * Idempotent, which matters more here than it looks: undo and redo replay
   * URLs, so this runs again on every step of the history. A swap puts the
   * further joint in A, where the same test then leaves it. Equal distances
   * and a rod that will not resolve are both left exactly as they arrived --
   * there is nothing to learn from measuring either.
   *
   * Runs after `foldLegacySliders`, so the seal is the one joint it is now,
   * and after `addAdjacentLinksForJoints`, which is what lets a cylinder
   * resolve at all.
   */
  private orderSealedSlots(joints: Joint[]): void {
    for (const joint of joints) {
      if (!(joint instanceof PrisJoint) || !joint.isSealed) continue;
      const cylinder = cylinderAtSeal(joint);
      if (!cylinder) continue;
      const a = joint.slotJointA!;
      const b = joint.slotJointB!;
      const from = cylinder.mountB;
      const reach = (end: Joint) => Math.hypot(end.x - from.x, end.y - from.y);
      if (reach(b) > reach(a)) joint.slideOn(joint.carrier!, b, a);
    }
  }

  // For each joint, add links that are adjacent to the joint
  public addSubsetLinks(linkDatas: LinkData[], links: Link[]): void {
    linkDatas.forEach((linkData, index) => {
      let link = links[index];

      // only RealLinks can have subset links
      if (!(link instanceof RealLink)) return;

      // For each subset link id, find and add the associated subset link to root link
      (link as RealLink).subset = [];
      linkData.subsetLinkIDs.forEach((subsetLinkID) => {
        let subsetLink = this.getLinkByID(links, subsetLinkID)!;
        (link as RealLink).subset.push(subsetLink);
      });
    });
  }

  // Remove subset links from links
  public filterSubsetLinks(linkDatas: LinkData[], links: Link[]): Link[] {
    let filteredLinks: Link[] = [];

    // root links have isRoot for corresponding LinkData set to true
    linkDatas.forEach((linkData, index) => {
      let link = links[index];
      if (linkData.isRoot) filteredLinks.push(link);
    });

    return filteredLinks;
  }

  // For each joint, add links that are adjacent to the joint
  public addAdjacentLinksForJoints(): void {
    this.mechanism.joints.forEach((joint) => {
      if (joint instanceof RealJoint) {
        let realJoint = joint as RealJoint;
        realJoint.links = this.mechanism.links.filter((link) => link.joints.includes(realJoint));
        realJoint.connectedJoints = [];
        realJoint.links.forEach((link) => {
          link.joints.forEach((otherJoint) => {
            if (
              otherJoint instanceof RealJoint &&
              otherJoint !== realJoint &&
              !realJoint.connectedJoints.some((candidate) => candidate.id === otherJoint.id)
            ) {
              realJoint.connectedJoints.push(otherJoint);
            }
          });
        });
      }
    });
  }

  public build(updateSettings: boolean = true, restorePlayhead: boolean = true): void {
    // Build Joints from JointData
    let joints: Joint[] = this.transcoder
      .getJoints()
      .map((jointData) => this.buildJoint(jointData));

    // Build Links from LinkData, and linking them to their joints
    let linkDatas: LinkData[] = this.transcoder.getLinks();
    let links: Link[] = linkDatas.map((linkData) => this.buildLink(linkData, joints));

    // Bind floating slots before subset links are filtered away: a carrier
    // that has been welded into a compound is still a link here.
    this.resolveSlots(joints, links);

    // Add subset links to each link
    this.addSubsetLinks(linkDatas, links);

    // Once subsets are added, filter away non-root (subset) links
    links = this.filterSubsetLinks(linkDatas, links);

    // A slider spelled as three objects becomes the one joint it is now, and
    // says what each one used to be called: everything below that names a joint
    // by id reads a URL written before the fold.
    const folded = this.foldLegacySliders(joints, links);
    const jointNamed = (id: string): Joint | undefined =>
      this.getJointByID(joints, id) ??
      (folded.has(id) ? this.getJointByID(joints, folded.get(id)!) : undefined);

    // Build Forces from ForceData, and link them to their links
    let forces: Force[] = this.transcoder
      .getForces()
      .map((forceData) => this.buildForce(forceData, links));

    // Build mechanism
    this.mechanism.joints = joints;
    this.mechanism.links = links;
    this.mechanism.forces = forces;

    this.addAdjacentLinksForJoints();

    // Re-arm the Lock marks. Undo and redo replay URLs, so this line is what
    // makes a lock survive an undo — the same reason the sealed bit is
    // re-applied above. The transcoder has already refused any reference that
    // does not resolve, so a miss here is builder/transcoder skew.
    //
    // 'L' is honored as the shortcut it always was: marks live on joints
    // only, so a link reference marks each of the link's joints. New URLs
    // spell those marks out as 'J' references directly.
    this.transcoder.getLockedIds().forEach((lockedId) => {
      const tag = lockedId.charAt(0);
      const id = lockedId.substring(1);
      if (tag === 'J') {
        const joint = jointNamed(id);
        if (joint instanceof RealJoint) joint.locked = true;
      } else if (tag === 'L') {
        const link =
          this.getLinkByID(links, id) ??
          links
            .filter((candidate): candidate is RealLink => candidate instanceof RealLink)
            .flatMap((candidate) => candidate.subset)
            .find((subset) => subset.id === id);
        link?.joints.forEach((joint) => {
          if (joint instanceof RealJoint) joint.locked = true;
        });
      } else if (tag === 'F') {
        const force = forces.find((candidate) => candidate.id === id);
        if (force) force.locked = true;
      }
    });

    // Re-arm the holds, for the same reason as the locks: a bar that holds its
    // length has to still hold it after an undo. The transcoder has already
    // refused a hold on anything but a two-joint bar.
    this.transcoder.getHolds().forEach((entry) => {
      const link = this.getLinkByID(links, entry.substring(2));
      if (link instanceof RealLink) link.hold = entry.charAt(1) === 'l' ? 'length' : 'angle';
    });

    // Put the chosen colors back. Undo and redo replay URLs, so this is what
    // keeps a colored part colored through one -- the same reason the locks
    // above are re-armed. The transcoder has already refused any reference that
    // does not resolve.
    this.transcoder.getPartColors().forEach((entry: string) => {
      const [id, value] = entry.substring(2).split('~');
      if (entry.charAt(1) === 'J') {
        const joint = jointNamed(id);
        if (joint) joint.colorFamily = value;
      } else {
        const force = forces.find((candidate) => candidate.id === id);
        if (force) force.color = '#' + value;
      }
    });

    // What each hand-placed center of mass is held against. The URL carries
    // where the point is and the anchor says what it is measured from, so the
    // offset between the two is captured here, against the geometry just
    // decoded. Not left to the first update as the centroid anchor's is: that
    // fallback only runs where the point cannot be re-derived, and a
    // non-centroid anchor with no offset yet is instead read as one whose pin
    // has gone -- which quietly put the anchor back to 'centroid' and lost the
    // very thing this section exists to carry.
    this.transcoder.getComAnchors().forEach((entry) => {
      const [reference, jointID] = entry.substring(2).split('~');
      const link = this.getLinkByID(links, reference);
      if (!(link instanceof RealLink)) return;
      link.comAnchor = entry.charAt(1) === 'G' ? 'grid' : { joint: folded.get(jointID) ?? jointID };
      link.captureComOffset();
    });

    // Which barrel joint is the mount is the slot's order, so an old payload
    // has to be put in that order before anything reads a cylinder off it.
    this.orderSealedSlots(joints);

    // A sealed cylinder's parts always follow their own shapes. Nothing that
    // shipped ever let anyone choose their inertia or centers — the values in
    // circulating URLs are fixture defaults — so decoding migrates the parts
    // to auto rather than freezing numbers nobody picked. Masses stay exactly
    // as stored: mass carries no flag and is always somebody's choice. After
    // addAdjacentLinksForJoints, which is what wires the joints to their
    // links; before it, the structure detector sees no cylinders at all.
    for (const sealed of cylindersIn(joints)) {
      for (const part of [sealed.barrel, sealed.rod]) {
        if (part instanceof RealLink) {
          part.moiIsCustom = false;
          part.comIsCustom = false;
        }
      }
    }

    // Nothing is selected in a mechanism that has just been built.
    //
    // The URL used to carry the selection, which made it two things it should
    // never have been: part of what a shared link says, so opening someone
    // else's mechanism selected whatever they happened to have clicked; and
    // part of the undo history, since undo is URL replay. Selecting is not an
    // edit and pressing Undo after one should move the mechanism, not the
    // highlight.
    //
    // The field is still written, always empty, because its position in the
    // format is load-bearing for every URL already shared.
    //
    // Carrying the old selection across by id is no better than the URL was:
    // ids are letters handed out alphabetically, so any template or project
    // holding an A would open with an unrelated A selected -- and a different
    // *kind* of object where the letter had been reused. Where a selection
    // genuinely should survive a decode, it is because this is one mechanism's
    // own history being stepped through, and UrlProcessorService puts it back
    // by id and type under exactly that condition.
    this.activeObj.updateSelectedObj(null);

    if (updateSettings) {
      // Configure mechanism global flags
      const decodedLength = this.transcoder.getEnumSetting(
        EnumSetting.LENGTH_UNIT,
        LengthUnit
      )! as LengthUnit;
      // Length is the authoritative legacy field. Older URLs omitted the
      // global enum, and some four-enum URLs encoded a contradictory global
      // value; normalize the trio before any mechanism is constructed.
      const normalizedGlobal =
        decodedLength === LengthUnit.INCH
          ? GlobalUnit.ENGLISH
          : decodedLength === LengthUnit.METER
            ? GlobalUnit.SI
            : GlobalUnit.METRIC;
      // Read back rather than re-derived, so a link shared in kilograms-force
      // opens in kilograms-force. Everything else is still normalized against
      // the length unit: URLs written before the pick existed carry whatever
      // their era encoded, and English has no unit but lbf.
      const decodedForce = this.transcoder.getEnumSetting(EnumSetting.FORCE_UNIT, ForceUnit);
      const normalizedForce =
        normalizedGlobal === GlobalUnit.ENGLISH
          ? ForceUnit.LBF
          : decodedForce === ForceUnit.KGF
            ? ForceUnit.KGF
            : ForceUnit.NEWTON;
      this.settings.lengthUnit.next(decodedLength);
      this.settings.angleUnit.next(
        // The checksum admits no URL without this enum, so it is always present.
        this.transcoder.getEnumSetting(EnumSetting.ANGLE_UNIT, AngleUnit)!
      );
      this.settings.forceUnit.next(normalizedForce);
      this.settings.globalUnit.next(normalizedGlobal);
      this.settings.isInputCW.next(this.transcoder.getBoolSetting(BoolSetting.IS_INPUT_CW));
      this.settings.inputSpeed.next(this.transcoder.getIntSetting(IntSetting.INPUT_SPEED));
      // Zero means the URL was written before linear speeds had a setting of
      // their own, not that someone asked for a drive that stands still.
      const linearSpeed = this.transcoder.getDecimalSetting(DecimalSetting.LINEAR_INPUT_SPEED);
      if (linearSpeed > 0) {
        this.settings.linearInputSpeed.next(linearSpeed);
      }
      this.settings.animating.next(this.transcoder.getBoolSetting(BoolSetting.ANIMATING));
      this.settings.isShowMajorGrid.next(
        this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_MAJOR_GRID)
      );
      this.settings.isShowMinorGrid.next(
        this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_MINOR_GRID)
      );
      this.settings.isShowID.next(this.transcoder.getBoolSetting(BoolSetting.IS_SHOW_ID));
      // IS_SHOW_COM is deliberately not read any more: it is a display
      // preference, kept on this machine, and nearly every circulating URL
      // carries the old default in that bit (settings.service.ts).
      this.settings.isGravity.next(!this.transcoder.getBoolSetting(BoolSetting.GRAVITY_OFF));
      // The URL stores the user-unit object scale; the internal one is
      // MODEL_SCALE times larger, like every other length.
      SettingsService._objectScale.next(
        this.transcoder.getDecimalSetting(DecimalSetting.SCALE) * MODEL_SCALE
      );
    }

    // Where the playhead stood, which is worth restoring for undo and redo and
    // is not worth restoring for a mechanism that has just arrived.
    //
    // The format stores the start pose and, separately, an *index* into the
    // cycle solved from it (url-generation.service). That index only names the
    // pose its author was looking at while the cycle it counts into is the same
    // cycle -- and samples are spaced by a fixed amount of input travel, so how
    // many there are follows the range of travel the solver finds. Improve the
    // solver and every circulating link keeps its number and loses its place:
    // the six-bar this was found on solves to 53 samples now and 45 under the
    // test harness's defaults, so its stored 31 lands somewhere its author
    // never stood. Worse, a reader arriving part-way through the motion cannot
    // edit at all -- editing is gated on being at the start pose -- and nothing
    // on screen says why.
    //
    // Nobody restores it now. Undo and redo used to, on the grounds that one
    // step of a mechanism's own history is the same cycle -- but the seek that
    // put the drawing on that sample was removed when editing away from the
    // start became legal (the restored geometry is older, with a different
    // cycle), and a step restored with no seek behind it is a transport
    // reading one pose over a drawing showing another. Kept as a parameter so
    // the codec still round-trips the number it carries.
    this.mechanism.mechanismTimeStep = restorePlayhead
      ? this.transcoder.getIntSetting(IntSetting.TIMESTEP)
      : 0;

    // Fix visual bug for forces
    this.mechanism.forces.forEach((force) => force.updateInternalValues());
  }
}
