import { Injectable } from '@angular/core';
import { Joint, PrisJoint, RealJoint } from '../model/joint';
import { Link, RealLink } from '../model/link';
import { Cylinder, cylinderOfBarIn, cylindersIn } from '../model/cylinder';
import {
  barrelFillOf,
  CylinderRole,
  cylinderSkinFrame,
  fillShownOn,
  rodFillOf,
} from '../model/cylinder-skin';
import { paintedByACylinder } from '../model/cylinder-fusion';
import { linkArtwork } from '../model/link-artwork';
import {
  cylinderPaintOrder,
  FusingPlate,
  memberIsFused,
  PaintStep,
} from '../model/cylinder-paint-order';
import {
  barrelPath,
  blockPath,
  cylinderArrowPaths,
  cylinderBlockPath,
  collinearGuides,
  MARK,
  orientedCapsulePath,
  GuideBand,
  railGeometry,
  Segment,
  rodBodyPath,
  cylinderContourPath,
  slideMarkPath,
  slotHalfLength,
  schematicDriveHeads,
  straightArrowPaths,
} from '../model/joint-marks';
import { buildCompoundPath, mergedChannels, transformRigidPath } from '../model/compound-link-path';

/**
 * Which way the drive on `joint` is running, asked per joint rather than told
 * once for the drawing.
 *
 * A drawing holds several machines, each with its own driven joint and its own
 * signed speed, so one boolean for the whole canvas drew every arrow the way
 * whichever machine was edited last happens to turn.
 */
export type DriveForward = (joint: RealJoint) => boolean;

export interface WeldPlate {
  /**
   * The rider's own paint, redrawn over the black block so a Slide reads as one
   * body with it. Visual only: `fill` is the link's color, never a function of
   * it, so a random palette can never break the cue (§2.8 rule 4).
   */
  fill: string;
  /**
   * Rider and block fused into one outline, with the rider's channels cut back
   * out of it. Deliberately a single path: the rider used to be approximated by
   * a capsule, laid over the block, and patched at the two internal angles with
   * separate fillet wedges — four shapes at three different widths, every seam
   * between them visible through the plate's own alpha. A Boolean union has no
   * seams to show, and it draws the rider's real outline rather than a stand-in
   * for it, so a welded slider is the same body it was before it was welded.
   */
  path: string;
  /**
   * The fused body alone, and the channels cut from it, kept apart so a caller
   * can merge one more hole in before subtracting. The drag preview needs this:
   * appended to `path` after the fact it lands on top of a committed channel,
   * the overlap is wound twice, and the even-odd fill paints the slot back in.
   */
  outline: string;
  cuts: string[];
  /** The links this plate stands in for, so it can be selected like one. */
  links: Link[];
}

/**
 * A Slide's plate offered to the layering question, carrying the mark that
 * draws it — because a plate a cylinder pass paints is drawn in the slot's own
 * frame, which is not the frame of the skin it is painted inside.
 */
export interface PlatedSlide extends FusingPlate {
  mark: SliderMark;
  plate: WeldPlate;
}

/** One link pinned to a block, ready to draw in the block's own frame. */
export interface RiderDraw {
  link: Link;
  fill: string;
  path: string;
  /** Same split as `WeldPlate`, for the same preview-merging reason. */
  outline: string;
  cuts: string[];
}

/** One slider assembly, ready to draw, in the slot's own frame. */
export interface SliderMark {
  id: string;
  /**
   * The sliding joint this mark draws.
   *
   * The block is a far bigger target than the joint marker at its center, so
   * the canvas lets a drag start on the block and hands the gesture to this --
   * the same grab, at the same point. It was the coincident *pin* beside the
   * slider until Stage 1 of `docs/joint-type-and-cylinder-plan.md` made the two
   * one joint.
   */
  joint: PrisJoint;
  x: number;
  y: number;
  /** Slot direction in degrees, already corrected for the canvas y-flip. */
  rotation: number;
  block: string;
  welded: boolean;
  driven: boolean;
  plate?: WeldPlate;
  /** Links pinned to this block, redrawn above it. Empty when it is welded. */
  riders: RiderDraw[];
  arrows: { line: Segment; head: string; emphasised: boolean }[];
  /** Schematic's compact drive cue, in place of `arrows`. */
  schematicArrows: { head: string; emphasised: boolean }[];
  /**
   * A grounded guide, carrying its own frame.
   *
   * Deliberately not drawn in the block's frame like everything else here: the
   * guide is fixed in the world and the block slides along it, so anchoring the
   * rails to the block makes the track travel with the thing that is supposed to
   * be moving through it. Only visible once the mechanism is playing.
   */
  rails?: {
    rails: Segment[];
    /** Where this guide passes through another one, drawn broken (§2.8). */
    dashedRails: Segment[];
    ticks: Segment[];
    x: number;
    y: number;
    rotation: number;
  };
  /** A slider with a block but no carrier and no ground: invalid, drawn red. */
  dangling: boolean;
}

/**
 * The cream bar a slider whose riders cannot turn wears in place of a pin's
 * circle, ready for the joint layer to draw above the block.
 */
export interface SlideMarkDraw {
  /** The bar itself, in the slot's own frame. */
  path: string;
  /** The same bar pulled inside its own edge, for the selection ring. */
  ring: string;
  /** The transform that lays both along the slot. */
  frame: string;
}

/**
 * A channel window. `path` is in the carrier's own drawing frame so it can be
 * appended to the carrier's path data and subtracted by its even-odd fill --
 * which also makes the carrier's existing stroke trace the new edge in the
 * carrier's own color, exactly as §2.8 rule 7 asks, with nothing added.
 */
export interface Channel {
  carrierId: string;
  path: string;
}

/** One sealed cylinder, drawn as the part rather than as a block in a channel. */
export interface CylinderMark {
  id: string;
  /**
   * S — the sliding seal, which the black block draws.
   *
   * It was `pin`, from the years when the seal and the pin the rod hangs on
   * were two coincident joints. It is the joint a reader selects now: the block
   * is its marker and its hitbox, exactly as an ordinary slider's block is.
   */
  seal: PrisJoint;
  /** The resolved assembly, for selection, menus and drags. */
  cylinder: Cylinder;
  /**
   * The two member bars, each of which a click on its own skin selects
   * (decision S12).
   *
   * One `body` before: both halves of the part selected the barrel, because the
   * panel behind them was the one Edit Cylinder panel. Each member has its own
   * panel now, so each has to be reachable.
   */
  barrelLink: Link;
  rodLink: RealLink;
  x: number;
  y: number;
  rotation: number;
  /** The links whose ordinary drawing this skin stands in for. */
  barrelId: string;
  rodId: string;
  barrel: string;
  barrelFill: string;
  rod: string;
  rodFill: string;
  block: string;
  /**
   * Half the piston head's length along the axis, which the block above is
   * drawn at. Handed out because the seal's own mark has to sit inside it: a
   * ram too short for a full-size head shrinks the head, and a mark drawn at
   * full size on a shrunken head fills it corner to corner.
   */
  headAlongHalf: number;
  /** The exact silhouette, for the selection stroke. */
  contour: string;
  /**
   * Schematic draws the part as the two bodies that slide on each other: a line
   * from mount A to the seal, and one from the seal to mount B.
   */
  barrelLine: string;
  rodLine: string;
  driven: boolean;
  arrows: { line: Segment; head: string; emphasised: boolean }[];
  schematicArrows: { head: string; emphasised: boolean }[];
  /** Schematic's driver: an ordinary slider block at the seal, drawn black. */
  driveBlock: string;
}

/**
 * Turns the mechanism into the marks of §2.8.
 *
 * Everything is emitted in the slot's local frame with the joint at the origin
 * and the slot along +x, so the template applies one transform per assembly and
 * the CSS transitions inside it compose against the slot rather than against
 * the world. It also means no path here contains a rotated coordinate, which is
 * what keeps the arithmetic checkable.
 */
@Injectable({ providedIn: 'root' })
export class SliderMarkService {
  /**
   * The transform that puts a group into the slot's frame: local +x along the
   * slot, local +y along its normal, origin on the joint.
   *
   * Plainly a rotation, and it has to be. It was written as `rotate(-theta)
   * scale(1 -1)` to "undo" the y-flip on the holder above -- but the holder's
   * flip is what turns model coordinates into screen ones, and everything
   * inside it is already in model coordinates. The extra flip therefore
   * composed to a *reflection*: local +x landed on model angle -theta and local
   * +y pointed the wrong way entirely.
   *
   * Every mark in the set is symmetric about both axes -- block, channel,
   * rails, arrows -- so a mirror was invisible in all of them. The weld plate
   * and its fillets are the only asymmetric geometry here, and they were drawn
   * pointing away from the rider they belong to: on a Scotch yoke the plate ran
   * three units below joint C when its rider runs three units above it.
   */
  frame(mark: { x: number; y: number; rotation: number }): string {
    return `translate(${mark.x} ${mark.y}) rotate(${mark.rotation})`;
  }

  // A fused body used to be painted *inside* a cylinder's own group and needed
  // that frame undone, because its outline is already in the drawing's own
  // coordinates. It is a paint step of its own now (decision S24), a sibling of
  // the cylinder groups rather than a child of one, so there is no frame on it
  // to undo and `unframe` is gone.

  /**
   * Everything the skin layer paints, in order, held for as long as the marks
   * are.
   *
   * Both lists are asked, because both can hold a member: a bracket welded to a
   * mount, and the weld plate of a Slide the member's end joint is (decision
   * S18). The marks are rebuilt per pose and this answer is a function of them,
   * so it is cached on the identity of the two lists rather than recomputed for
   * each of the several template bindings that ask it per change-detection pass.
   */
  paintOrder(
    marks: readonly CylinderMark[],
    sliders: readonly SliderMark[] = []
  ): PaintStep<CylinderMark, PlatedSlide>[] {
    if (this.paintCache?.marks !== marks || this.paintCache.sliders !== sliders) {
      const plates = sliders.flatMap((mark): PlatedSlide[] =>
        mark.plate ? [{ id: mark.id, links: mark.plate.links, mark, plate: mark.plate }] : []
      );
      this.paintCache = { marks, sliders, steps: cylinderPaintOrder(marks, plates) };
    }
    return this.paintCache.steps;
  }

  private paintCache?: {
    marks: readonly CylinderMark[];
    sliders: readonly SliderMark[];
    steps: PaintStep<CylinderMark, PlatedSlide>[];
  };

  /** Whether anything bigger stands in for this member, whichever step paints it. */
  memberIsFused(
    mark: CylinderMark,
    role: CylinderRole,
    marks: readonly CylinderMark[],
    sliders: readonly SliderMark[]
  ): boolean {
    return memberIsFused(this.paintOrder(marks, sliders), mark, role);
  }

  /**
   * Whether a cylinder step paints this Slide's plate, so the slider layer must
   * not paint it a second time one layer down.
   */
  plateIsPainted(
    mark: SliderMark,
    marks: readonly CylinderMark[],
    sliders: readonly SliderMark[]
  ): boolean {
    return this.paintOrder(marks, sliders).some((step) => step.fused?.plate?.id === mark.id);
  }

  /** One member of a skin, as the drawing asks for it: what to hit, and what that selects. */
  memberOf(mark: CylinderMark, role: CylinderRole): { path: string; link: Link } {
    return role === 'barrel'
      ? { path: mark.barrel, link: mark.barrelLink }
      : { path: mark.rod, link: mark.rodLink };
  }

  /**
   * The mark a slider whose riders cannot turn wears -- the Joint Type
   * "Prismatic", floating or grounded, and every cylinder's seal S -- or
   * nothing at all for one that can turn. A pin-in-slot slider keeps its
   * circle, so the mark's shape answers "can this rotate?" and its orientation
   * says what it slides along.
   *
   * Both are read off the mark the black block under it is drawn from rather
   * than measured a second time. The two can then never disagree about where
   * the slot points, and the bar turns with the block through a drop preview,
   * where the block's frame is swung to the slot it is about to enter and the
   * joint has not moved yet.
   *
   * Its size comes from that block too. An ordinary slider's is always the full
   * §2.8 block; a cylinder's piston head shrinks with a barrel too short to
   * hold one, and the bar shrinks with it rather than filling the black it is
   * supposed to be a mark *on*.
   */
  slideMarkFor(
    joint: Joint,
    marks: readonly SliderMark[],
    cylinders: readonly CylinderMark[],
    size: { r: number; ring: number }
  ): SlideMarkDraw | undefined {
    if (!(joint instanceof PrisJoint) || joint.rotates) return undefined;
    const sealed = cylinders.find((mark) => mark.seal.id === joint.id);
    const host = sealed ? sealed.headAlongHalf : MARK.blockAlongHalf * size.r;
    const rotation = sealed?.rotation ?? marks.find((mark) => mark.id === joint.id)?.rotation ?? 0;
    return {
      path: slideMarkPath(size.r, host),
      ring: slideMarkPath(size.r, host, size.ring / 2),
      frame: this.frame({ x: 0, y: 0, rotation }),
    };
  }

  /**
   * The same mark with its frame turned to a different slot angle — the preview
   * a block shows while it is being dropped into a slot it has not entered yet.
   *
   * The block turns to lie along the slot it is about to take; the links pinned
   * to it do not. Their far joints have not moved, and after the drop they will
   * still be exactly where they are now — a slot decides where the block points,
   * not where its riders point. But a rider is drawn *in the block's frame*, so
   * turning the frame and leaving the geometry swung every rider bodily about
   * the pin. Between two slots declared in opposite order that is a half turn,
   * and the rider was drawn pointing away from its own far joint, which sat
   * there on the grid with nothing attached to it.
   *
   * So the geometry is turned back by exactly what the frame turns by, which
   * leaves it where the world says it is. Only the pieces drawn in this frame
   * are touched: the block and its arrows are meant to turn, and a grounded
   * guide's rails carry a frame of their own.
   */
  reframed(mark: SliderMark, rotationDeg: number): SliderMark {
    const delta = ((rotationDeg - mark.rotation) * Math.PI) / 180;
    const back = (path: string) =>
      path === ''
        ? path
        : transformRigidPath(
            path,
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 0 },
            { x: Math.cos(-delta), y: Math.sin(-delta) }
          );
    const turnBack = <T extends { path: string; outline: string; cuts: string[] }>(
      piece: T
    ): T => ({
      ...piece,
      path: back(piece.path),
      outline: back(piece.outline),
      cuts: piece.cuts.map(back),
    });
    return {
      ...mark,
      rotation: rotationDeg,
      riders: mark.riders.map(turnBack),
      plate: mark.plate ? turnBack(mark.plate) : undefined,
    };
  }

  /**
   * `travel` is how far each slider's block runs across the solved timesteps,
   * keyed by joint id. Absent entries fall back to the drawn rail length.
   */
  marks(
    joints: Joint[],
    r: number,
    guides?: Map<string, Guide>,
    driveForward: DriveForward = () => true
  ): SliderMark[] {
    // A link pinned to two different blocks would otherwise be drawn as a rider
    // by both of them, at double its own alpha where they overlap. The first
    // assembly to reach it draws it; the second leaves it alone.
    //
    // Welded blocks are exempt: a rider welded to two blocks makes all three one
    // rigid body, and the plate that draws it has to contain all three. Letting
    // the first assembly claim the rider left the second with nothing to plate,
    // so of two identically welded sliders one came out fused to the link and
    // the other stayed a bare black block.
    const claimed = new Set<string>();
    const bands = this.bands(joints, r, guides);
    // Resolved here, once, because a plate has to be the union of the block
    // with what is *drawn* at the rider — and for a cylinder member that is the
    // skin's silhouette, not the thin bar its two joints describe (S18).
    const cylinders = cylindersIn(joints);
    const marks = joints
      .filter((joint): joint is PrisJoint => joint instanceof PrisJoint)
      .map((slider) =>
        this.markFor(
          slider,
          r,
          guides?.get(slider.id),
          joints,
          claimed,
          driveForward,
          this.crossingsFor(slider.id, bands, r),
          cylinders
        )
      );
    this.fuseSharedPlates(marks, r, joints, cylinders);
    return marks;
  }

  /**
   * One plate per rigid weld group, however many blocks are in it.
   *
   * Two welded blocks on one link are one body: drawing a plate per block would
   * paint the shared link twice at its own alpha, and drawing only the first
   * leaves the second bare. The group's blocks and riders are unioned together
   * once, in the frame of whichever block leads it, and the rest keep their
   * black block underneath with no plate of their own.
   */
  private fuseSharedPlates(
    marks: SliderMark[],
    r: number,
    joints: Joint[],
    cylinders: readonly Cylinder[]
  ): void {
    // A seal is not in any weld group, for the reason `markFor` gives: the skin
    // draws its whole part, and letting it lead a group handed the plate to a
    // mark nothing draws and left the other member of the group bare.
    const welded = marks.filter((mark) => mark.welded && !mark.joint.isSealed);
    const groupOf = new Map<string, SliderMark[]>();
    for (const mark of welded) {
      const riders = this.ridersOn(mark.joint);
      const leader = riders
        .map((rider) => groupOf.get(rider.id))
        .find((group): group is SliderMark[] => group !== undefined);
      const group = leader ?? [];
      group.push(mark);
      for (const rider of riders) groupOf.set(rider.id, group);
    }

    for (const group of new Set(groupOf.values())) {
      if (group.length < 2) continue;
      const [leader, ...rest] = group;
      leader.plate = this.groupPlate(group, r, joints, cylinders);
      for (const member of rest) member.plate = undefined;
    }
  }

  /** The links pinned to a slider, which are what a Slide holds against its slot. */
  private ridersOn(slider: PrisJoint): RealLink[] {
    return slider.links.filter((link): link is RealLink => link instanceof RealLink);
  }

  /**
   * The cylinders to draw. Sealed ⇔ skinned, always: there is no reveal on
   * selection and no per-session preference — a sealed assembly is one part,
   * and a hand-built slide is never skinned at all.
   */
  cylinderMarks(
    joints: Joint[],
    r: number,
    driveForward: DriveForward = () => true
  ): CylinderMark[] {
    return cylindersIn(joints).map((found) => this.cylinderMark(found, r, driveForward));
  }

  /**
   * The channels cut into `carrier`, expressed in the slot's own frame so they
   * can be appended to a path already drawn there.
   *
   * The frame is centered on the pin with +x along the slot, so a model point is
   * carried into it by subtracting the pin and turning by the slot angle.
   */
  private channelsInLocalFrame(
    carrier: Link,
    pin: RealJoint,
    slotAngle: number,
    r: number,
    joints: Joint[]
  ): string[] {
    const cos = Math.cos(slotAngle);
    const sin = Math.sin(slotAngle);
    const cuts: string[] = [];
    for (const joint of joints) {
      if (!(joint instanceof PrisJoint) || !joint.isFloating) continue;
      // A ram's bore is not an ordinary channel, for the reason `channels`
      // gives: the skin draws it, mouth and all. The guard was only there and
      // it only showed once a plate drew the barrel's real silhouette -- the
      // bore then came out as a slot the length of the part, and the barrel as
      // a hollow fork.
      if (joint.isSealed) continue;
      if (!joint.isSlotWellFormed || joint.carrier!.id !== carrier.id) continue;
      const a = joint.slotJointA!;
      const b = joint.slotJointB!;
      const midX = (a.x + b.x) / 2 - pin.x;
      const midY = (a.y + b.y) / 2 - pin.y;
      cuts.push(
        orientedCapsulePath(
          { x: midX * cos + midY * sin, y: -midX * sin + midY * cos },
          joint.slotAngle - slotAngle,
          slotHalfLength(r, Math.hypot(b.x - a.x, b.y - a.y)),
          MARK.channelHalfWidth * r
        )
      );
    }
    return cuts;
  }

  private cylinderMark(found: Cylinder, r: number, driveForward: DriveForward): CylinderMark {
    const { seal } = found;
    // Both ends of the barrel, not just the one behind the piston. The barrel
    // is a rigid bar and the piston runs along it: its anchor is behind, its
    // mouth ahead. Measuring only back to the anchor drew the barrel *to* the
    // piston, so the rigid part visibly changed length every frame.
    //
    // Read from `cylinderSkinFrame` rather than measured here, because a member
    // welded into a bracket hands that bracket's outline the same silhouette
    // (decision S16) and two measurements of one axis can disagree.
    const {
      angleRad: angle,
      anchor,
      mouth,
      reach: rodReach,
      headHalf,
    } = cylinderSkinFrame(found, r);
    const driven = seal.input;
    // The mark's frame runs +x toward the rod; the drive direction is declared
    // along the slot, which may point either way along the same line.
    const leading: 1 | -1 =
      (driveForward(seal) ? 1 : -1) * (Math.cos(seal.slotAngle - angle) >= 0 ? 1 : -1) > 0 ? 1 : -1;
    const along = (joint: Joint): number =>
      (joint.x - seal.x) * Math.cos(angle) + (joint.y - seal.y) * Math.sin(angle);
    return {
      id: seal.id,
      seal,
      cylinder: found,
      // A click on the barrel selects the barrel and a click on the rod selects
      // the rod; the block between them selects the seal.
      barrelLink: found.barrel,
      rodLink: found.rod,
      x: seal.x,
      y: seal.y,
      // +x runs toward the rod, so the barrel is the negative side and the
      // geometry reads the same whichever way round the slot was declared.
      rotation: toDegrees(angle),
      barrelId: found.barrel.id,
      rodId: found.rod.id,
      barrel: barrelPath(r, anchor, mouth),
      barrelFill: barrelFillOf(found),
      rod: rodBodyPath(r, rodReach, headHalf),
      // The barrel's color until the rod was given one of its own (S15), which
      // is a question `cylinder-skin.ts` answers for every painter at once.
      rodFill: rodFillOf(found),
      block: cylinderBlockPath(r, headHalf),
      headAlongHalf: headHalf,
      contour: cylinderContourPath(r, anchor, mouth, rodReach),
      barrelLine: `M ${along(found.mountA)} 0 H 0`,
      rodLine: `M 0 0 H ${along(found.mountB)}`,
      driven,
      arrows: driven ? cylinderArrowPaths(r, headHalf, leading) : [],
      schematicArrows: driven ? schematicDriveHeads(r, leading) : [],
      driveBlock: driven ? blockPath(r) : '',
    };
  }

  channels(joints: Joint[], r: number): Channel[] {
    const found: Channel[] = [];
    for (const joint of joints) {
      if (!(joint instanceof PrisJoint) || !joint.isFloating) continue;
      // A ram's bore is not an ordinary channel. The skin draws it, mouth and
      // all, and while the barrel was the carrier this never mattered: the
      // barrel is skinned, so the link layer suppressed its outline and the
      // channel with it. Weld the barrel mount and the carrier becomes the
      // compound, which is not skinned -- and the bore came out as a filled
      // capsule the length of the barrel, in the bracket's color, laid over
      // the part it is supposed to be inside.
      if (joint.isSealed) continue;
      if (!joint.isSlotWellFormed) continue;
      const a = joint.slotJointA!;
      const b = joint.slotJointB!;
      const carrier = joint.carrier!;
      const separation = Math.hypot(b.x - a.x, b.y - a.y);
      found.push({
        carrierId: carrier.id,
        path: orientedCapsulePath(
          { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          joint.slotAngle,
          slotHalfLength(r, separation),
          MARK.channelHalfWidth * r
        ),
      });
    }
    return found;
  }

  private markFor(
    slider: PrisJoint,
    r: number,
    guide: Guide | undefined,
    joints: Joint[],
    claimed: Set<string>,
    driveForward: DriveForward,
    otherGuides: GuideBand[],
    cylinders: readonly Cylinder[]
  ): SliderMark {
    // Every slider draws a mark. This used to return nothing when the joint had
    // no block beside it or the block had no coincident pin -- two shapes that
    // cannot exist now a slider is one joint, and two ways for a slider to be
    // drawn as nothing at all.
    const angle = slider.slotAngle;
    // A Slide: the riders cannot turn against the slot, so the plate draws them
    // fused to the block. The bit sat on the coincident pin's `isWelded`.
    const welded = !slider.rotates;
    const driven = slider.input;
    // A seal is a piston head inside its own barrel and the skin draws the
    // whole part: it plates nothing and it claims nothing. Claiming was how a
    // rod welded into a bracket lost its plate -- the seal at the other end of
    // the same rod took the body first, and the Slide at the end joint was left
    // with no rider to fuse and nothing but a bare black block (S18).
    const pinned = slider.isSealed
      ? []
      : slider.links.filter(
          (link): link is RealLink => link instanceof RealLink && !claimed.has(link.id)
        );
    // A rider a cylinder skin paints is already above the block, in a layer of
    // its own. Hoisting it into this one as well drew the thin bar its joints
    // describe a second time, inside the part it is the outline of -- the bar
    // that shows through a barrel on a Pin-in-slot. Only a *drawn* rider is
    // claimed, so a plate further down the list still has one to fuse.
    const riders = welded ? pinned : pinned.filter((link) => !paintedByACylinder(cylinders, link));
    riders.forEach((rider) => claimed.add(rider.id));

    return {
      id: slider.id,
      joint: slider,
      x: slider.x,
      y: slider.y,
      rotation: toDegrees(angle),
      block: blockPath(r),
      welded,
      driven,
      plate: welded ? this.plateFor(slider, riders, angle, r, joints, cylinders) : undefined,
      riders: welded ? [] : this.ridersFor(slider, riders, angle, r, joints, cylinders),
      arrows: driven ? straightArrowPaths(r, driveForward(slider) ? 1 : -1) : [],
      schematicArrows: driven ? schematicDriveHeads(r, driveForward(slider) ? 1 : -1) : [],
      rails: slider.ground ? this.railsFor(slider, guide, angle, r, otherGuides) : undefined,
      dangling: !slider.ground && !slider.isFloating,
    };
  }

  private plateFor(
    pin: RealJoint,
    riders: RealLink[],
    slotAngle: number,
    r: number,
    joints: Joint[],
    cylinders: readonly Cylinder[]
  ): WeldPlate | undefined {
    const outlines = riders
      .map((rider) => this.riderOutline(rider, pin, slotAngle, cylinders, r))
      .filter((outline): outline is string => outline !== undefined);
    if (outlines.length === 0) return undefined;

    const fused = buildCompoundPath([...outlines, blockPath(r)], MARK.plateFillet * r);
    // A link can be a slot carrier *and* a welded rider at once -- the Scotch
    // yoke's yoke is both. The plate stands in for that link, so it has to cut
    // the same channels the link itself cuts, or it fills the slot back in and
    // the block appears to ride on a solid bar.
    const cuts = riders.flatMap((rider) =>
      this.channelsInLocalFrame(rider, pin, slotAngle, r, joints)
    );
    return {
      fill: this.plateInk(riders[0], cylinders),
      path: [fused.path, mergedChannels(cuts)].join(' ').trim(),
      outline: fused.path,
      cuts,
      links: riders,
    };
  }

  /**
   * The ink a plate is painted in: the color its rider is *drawn* in.
   *
   * `fillShownOn` rather than the bar's own record, for the reason that
   * function exists — a rod that has made no color choice is drawn in its
   * barrel's, and a welded member in its body's. Reading `fill` straight off
   * the bar painted a fused rod in a palette color that is nowhere else in the
   * drawing. One rule for every painter, not a third one here.
   */
  private plateInk(rider: RealLink, cylinders: readonly Cylinder[]): string {
    return fillShownOn(rider, cylinderOfBarIn(cylinders, rider));
  }

  /**
   * The links pinned to this block, drawn in the block's own frame so they land
   * above it (§2.8 layer 4) instead of behind it.
   *
   * They were left in the link layer, which is layer 2 — under every block on
   * the canvas. A coupler ending at a slider then vanished behind the block for
   * the last bar-width of its length, so it read as passing underneath the
   * block rather than being pinned to it. The joint marker is drawn later still,
   * so the pin stays on top of both.
   */
  private ridersFor(
    pin: RealJoint,
    riders: RealLink[],
    slotAngle: number,
    r: number,
    joints: Joint[],
    cylinders: readonly Cylinder[]
  ): RiderDraw[] {
    return riders.flatMap((rider) => {
      const outline = this.riderOutline(rider, pin, slotAngle, cylinders, r);
      if (!outline) return [];
      const cuts = this.channelsInLocalFrame(rider, pin, slotAngle, r, joints);
      return [
        {
          link: rider,
          fill: this.plateInk(rider, cylinders),
          path: [outline, mergedChannels(cuts)].join(' ').trim(),
          outline,
          cuts,
        },
      ];
    });
  }

  /**
   * Every block and every rider of a weld group, fused into one outline in the
   * leader's frame.
   *
   * Built in world coordinates and carried into that frame at the end, because
   * the members sit at different points on different slot angles and there is
   * no local frame all of them are already in.
   */
  private groupPlate(
    group: SliderMark[],
    r: number,
    joints: Joint[],
    cylinders: readonly Cylinder[]
  ): WeldPlate | undefined {
    const leader = group[0];
    const links = new Map<string, RealLink>();
    const shapes: string[] = [];
    for (const mark of group) {
      const angle = (mark.rotation * Math.PI) / 180;
      shapes.push(this.placed(blockPath(r), mark.joint, angle));
      for (const rider of this.ridersOn(mark.joint)) {
        const outline = linkArtwork(rider, r / 0.15, cylinders);
        if (links.has(rider.id) || !outline) continue;
        links.set(rider.id, rider);
        shapes.push(outline);
      }
    }
    if (links.size === 0) return undefined;

    const fused = buildCompoundPath(shapes, MARK.plateFillet * r);
    const leaderAngle = (leader.rotation * Math.PI) / 180;
    const intoLeader = (path: string) =>
      transformRigidPath(
        path,
        leader.joint,
        { x: leader.joint.x + Math.cos(leaderAngle), y: leader.joint.y + Math.sin(leaderAngle) },
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      );
    const cuts = [...links.values()].flatMap((rider) =>
      this.channelsInLocalFrame(rider, leader.joint, leaderAngle, r, joints)
    );
    const outline = intoLeader(fused.path);
    return {
      fill: this.plateInk([...links.values()][0], cylinders),
      path: [outline, mergedChannels(cuts)].join(' ').trim(),
      outline,
      cuts,
      links: [...links.values()],
    };
  }

  /** A local-frame shape put where a mark sits, in world coordinates. */
  private placed(path: string, at: Joint, angle: number): string {
    return transformRigidPath(path, { x: 0, y: 0 }, { x: 1, y: 0 }, at, {
      x: at.x + Math.cos(angle),
      y: at.y + Math.sin(angle),
    });
  }

  /**
   * A rider's own outline, carried into the slot's frame.
   *
   * The link's real path rather than a capsule fitted to it: a rider can be a
   * ternary body or a welded compound, and a capsule drawn from the pin to its
   * furthest joint is only the same shape when it happens to be a bar.
   *
   * "Its real path" is what is *drawn* there, which for a cylinder member is
   * the skin's silhouette rather than the bar its two joints describe
   * (`drawnOutlineOf`). A plate built from the bar drew a second, thinner
   * barrel inside the barrel, and a second rod beside the rod.
   */
  private riderOutline(
    rider: RealLink,
    pin: RealJoint,
    slotAngle: number,
    cylinders: readonly Cylinder[],
    r: number
  ): string | undefined {
    const outline = linkArtwork(rider, r / 0.15, cylinders);
    if (!outline) return undefined;
    const along = { x: pin.x + Math.cos(slotAngle), y: pin.y + Math.sin(slotAngle) };
    try {
      return transformRigidPath(outline, pin, along, { x: 0, y: 0 }, { x: 1, y: 0 });
    } catch {
      return undefined;
    }
  }

  /**
   * The rails of a grounded guide, in the guide's own world-fixed frame.
   *
   * `guide` carries where the guide sits when the mechanism is at rest and how
   * far along it the block travels; without it -- an invalid linkage has no
   * solved timesteps -- the rails fall back to the block's own position and a
   * fixed length, which is right at t = 0 and is the only frame there is.
   */
  private railsFor(
    slider: PrisJoint,
    guide: Guide | undefined,
    angle: number,
    r: number,
    others: GuideBand[]
  ): SliderMark['rails'] {
    const band = this.bandFor(slider, guide, angle, r);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const place = (point: { x: number; y: number }) => ({
      x: band.x + point.x * cos - point.y * sin,
      y: band.y + point.x * sin + point.y * cos,
    });
    return {
      ...railGeometry(r, band.halfLength, others, place),
      x: band.x,
      y: band.y,
      rotation: toDegrees(angle),
    };
  }

  /**
   * Where a grounded guide sits and how far it runs, in world coordinates.
   *
   * Centered on the middle of the block's travel rather than on its resting
   * point, so the block is inside its own track wherever the cycle takes it.
   */
  private bandFor(
    slider: PrisJoint,
    guide: Guide | undefined,
    angle: number,
    r: number
  ): GuideBand {
    const anchor = guide ?? { x: slider.x, y: slider.y, lo: 0, hi: 0 };
    const pad = MARK.blockAlongHalf * r + MARK.railHalfLengthMin * r * 0.25;
    const halfLength = Math.max(MARK.railHalfLengthMin * r, (anchor.hi - anchor.lo) / 2 + pad);
    const middle = (anchor.lo + anchor.hi) / 2;
    return {
      x: anchor.x + middle * Math.cos(angle),
      y: anchor.y + middle * Math.sin(angle),
      angle,
      halfLength,
      halfWidth: MARK.railOffset * r,
    };
  }

  /**
   * The other guides one guide has to draw around.
   *
   * Two guides on the same line are not two members crossing — they are one
   * line, and breaking either of them for the other draws a dashed gap through
   * a rail that is perfectly continuous. So one of the pair is chosen to hatch
   * the span they share (by id, which is stable and does not depend on the
   * order joints happen to be in) and the other simply stays off it; both draw
   * their rails solid end to end, over each other, as the one line they are.
   */
  private crossingsFor(id: string, bands: Map<string, GuideBand>, r: number): GuideBand[] {
    const own = bands.get(id);
    const slack = MARK.railMergeSlack * r;
    const found: GuideBand[] = [];
    for (const [other, band] of bands) {
      if (other === id) continue;
      if (!own || !collinearGuides(own, band, slack)) found.push(band);
      else if (other < id) found.push({ ...band, coincident: true });
    }
    return found;
  }

  /** Every grounded guide's strip, keyed by its slider, for crossing tests. */
  private bands(joints: Joint[], r: number, guides?: Map<string, Guide>): Map<string, GuideBand> {
    const found = new Map<string, GuideBand>();
    for (const joint of joints) {
      if (!(joint instanceof PrisJoint) || !joint.ground) continue;
      found.set(joint.id, this.bandFor(joint, guides?.get(joint.id), joint.slotAngle, r));
    }
    return found;
  }
}

/**
 * Where a grounded guide sits in the world, and how far along itself its block
 * runs. Measured over the solved timesteps, so it does not move when the block
 * does.
 */
export interface Guide {
  x: number;
  y: number;
  lo: number;
  hi: number;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
