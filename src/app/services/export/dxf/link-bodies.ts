import { PrisJoint } from '../../../model/joint';
import { Link, RealLink, SliderBlock } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { SettingsService } from '../../settings.service';
import { DxfEntity, DxfPoint, DxfPolyline, DxfVertex } from './dxf-model';

/**
 * The parts, rather than the picture of them.
 *
 * A centerline cannot be extruded. What a student needs in order to get from
 * this export to a moving assembly is one closed outline per link with its pin
 * holes already cut, on its own layer -- then the CAD flow is: insert, one
 * sketch per layer, extrude each, drop revolute joints on the holes. The
 * geometry is not new; it is the same rounded body the canvas has always drawn,
 * asked for in a form something other than an SVG path can read.
 */

/**
 * A cross at a joint that is welded rather than pinned.
 *
 * The canvas draws exactly this mark, and the drawing needs it for the same
 * reason: a welded joint and a pinned one look identical once they are both
 * just a point on a part, and they are opposite things. One turns and one is
 * solid. A weld gets no hole -- drilling one would invite a bearing into a
 * place that must never move.
 */
export function weldMark(at: DxfPoint, reach: number, layer: string): DxfEntity[] {
  return [
    { type: 'LINE', layer, start: { x: at.x - reach, y: at.y }, end: { x: at.x + reach, y: at.y } },
    { type: 'LINE', layer, start: { x: at.x, y: at.y - reach }, end: { x: at.x, y: at.y + reach } },
  ];
}

/** A quarter circle, as a polyline vertex wants it: `tan(90deg / 4)`. */
const QUARTER = Math.tan(Math.PI / 8);

/**
 * How much of a bar's width its pin hole takes, when nobody has said.
 *
 * Half, which leaves a quarter of the width as material either side of the
 * hole. Any more and the end of the link is a ring rather than a lug.
 */
const PIN_SHARE = 0.5;

/** How wide the drawn link bodies are, in model units. */
export function linkBodyWidth(): number {
  // The same number the outline's corner radius is built from -- the bodies are
  // drawn as a bar of this width with a semicircular cap at each end.
  return (SettingsService.objectScale / 4) * 2;
}

/**
 * The hole to cut when the reader has not chosen one.
 *
 * Derived from the drawing rather than fixed, because a fixed number cannot be
 * right: the bodies are whatever width the canvas is drawing them at, and a
 * default of 0.6 next to a 0.13-wide bar is a hole with no part left around it.
 * Rounded to two figures so the field shows a number somebody could have typed.
 *
 * `unitScale` converts model units to the export's, which is what makes this
 * answer the same physical hole whichever unit the file is written in.
 */
export function defaultPinDiameter(unitScale: number): number {
  const across = linkBodyWidth() * PIN_SHARE * unitScale;
  return across > 0 ? Number(across.toPrecision(2)) : 0;
}

export interface LinkBodyInput {
  links: Link[];
  /** Model -> export units, and the origin shift, already folded together. */
  point: (at: { x: number; y: number }) => DxfPoint;
  /** How far one centimeter reaches in the export's units. */
  scale: number;
  /** Radius of the hole cut at every pin, or zero for no hole. */
  pinRadius: number;
  /** `PMKS_LINK_AB` for a link, or the shared layer when they are not split. */
  layerFor: (link: RealLink) => string;
  /**
   * Links that are drawn as something else and must not get a generic body.
   *
   * A sealed cylinder's barrel and rod are exported as a sleeve and a rod with
   * a bore between them; drawing the plain link outline as well put two
   * overlapping parts on top of each other and made the whole assembly
   * unreadable.
   */
  drawnElsewhere?: ReadonlySet<string>;
}

/**
 * One closed loop per link body, plus a hole at each of its pins.
 *
 * Links whose outline has collapsed -- every joint landed on one point -- are
 * returned as `missing`, so the caller can fall back to the centerline for
 * those rather than dropping them out of the drawing entirely.
 */
export function linkBodies(input: LinkBodyInput): {
  entities: DxfEntity[];
  missing: RealLink[];
} {
  const entities: DxfEntity[] = [];
  const missing: RealLink[] = [];
  bodyLinks(input.links).forEach((link) => {
    if (input.drawnElsewhere?.has(link.id)) return;
    const layer = input.layerFor(link);
    const loops = link.outlineLoops();
    if (loops.length === 0) {
      missing.push(link);
      return;
    }
    loops.forEach((loop) =>
      entities.push({
        type: 'POLYLINE',
        layer,
        closed: true,
        points: loop.map((vertex): DxfVertex => {
          const at = input.point(vertex);
          return vertex.bulge ? { ...at, bulge: vertex.bulge } : at;
        }),
      })
    );
    // The holes belong to the part, not to a shared joint layer: a face with
    // its holes already in it extrudes into a finished body in one step, and a
    // joint two links share needs the same hole cut in each of them.
    link.joints
      .filter((joint) => !(joint instanceof PrisJoint))
      .forEach((joint) => {
        const at = input.point(joint);
        // A welded joint is not a bearing. It gets the cross the canvas draws
        // there instead of a hole, so a reader can see which corners of this
        // part turn and which are solid -- and does not drill the ones that
        // are solid.
        if (isWelded(joint)) {
          entities.push(...weldMark(at, input.scale * 0.1, layer));
          return;
        }
        if (input.pinRadius > 0) {
          entities.push({ type: 'CIRCLE', layer, center: at, radius: input.pinRadius });
        }
      });
  });
  return { entities, missing };
}

/**
 * A slot the block can actually slide in, rather than a line implying one.
 *
 * The travel plus a pin's width at each end, closed with a half circle -- the
 * shape somebody would machine. Without it the sliding pair is only implied,
 * and a reader modeling from this has to invent the slot themselves and hope
 * they invent the same one the mechanism was solved with.
 */
export function slotProfile(
  joint: PrisJoint,
  travel: SlotTravel | undefined,
  point: (at: { x: number; y: number }) => DxfPoint,
  scale: number,
  pinRadius: number,
  slotLayer: string,
  blockLayer: string,
  /** How wide the part being cut is, so the slot leaves material in it. */
  carrierWidth = Infinity
): DxfEntity[] {
  // A measured travel is the block's path *through the world*, which is the
  // slot only when the slot is bolted to the world. A slot cut into a moving
  // link has a frame of its own: the carrier swings while the block slides, so
  // the world path is some curve across the drawing that says nothing about
  // which way the slot points. Scotch Yoke's slot is vertical and its pin's
  // world excursion is horizontal -- taking the measurement there turned the
  // slot through ninety degrees and laid it outside the yoke entirely.
  const ends = joint.isFloating ? nominalTravel(joint) : (travel ?? nominalTravel(joint));
  const from = point(ends.from);
  const to = point(ends.to);
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  if (span === 0) return [];
  // Narrow enough to leave material either side of it. A slot cut into a link
  // the canvas draws as a thin schematic bar is otherwise the whole bar, and
  // the part extrudes to nothing -- the same gap between a drawing and a part
  // that the pin diameter has. Half the carrier's width, as the pins are.
  const half = Math.min(Math.max(pinRadius, 0.06 * scale), carrierWidth / 4);
  if (!(half > 0)) return [];
  const along = { x: (to.x - from.x) / span, y: (to.y - from.y) / span };
  const across = { x: -along.y * half, y: along.x * half };
  return [
    capsule(from, to, half, slotLayer),
    // Something to put in the slot. The canvas draws no block outline of its
    // own, so this one is nominal: square to the slot, as wide as it is, and
    // centered where the block sits at the start pose. It is a part a reader can
    // extrude and mate, which an empty slot is not.
    ...blockProfile(point(joint), along, half, pinRadius, blockLayer),
  ];
}

/**
 * A rounded bar from one point to the other: down one side, round the end,
 * back, round the other.
 *
 * The run is clockwise -- the left-hand side first -- so an end cap that bulges
 * outward is a *negative* bulge. Positive turns them inward and the shape comes
 * out as two facing brackets rather than a body.
 */
export function capsule(from: DxfPoint, to: DxfPoint, half: number, layer: string): DxfPolyline {
  const span = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const across = { x: (-(to.y - from.y) / span) * half, y: ((to.x - from.x) / span) * half };
  return {
    type: 'POLYLINE',
    layer,
    closed: true,
    points: [
      { x: from.x + across.x, y: from.y + across.y },
      { x: to.x + across.x, y: to.y + across.y, bulge: -1 },
      { x: to.x - across.x, y: to.y - across.y },
      { x: from.x - across.x, y: from.y - across.y, bulge: -1 },
    ],
  };
}

/**
 * The two parts a sealed cylinder is actually made of.
 *
 * A cylinder used to export as a single centerline between its two mounts,
 * which is neither of its parts and cannot be extruded. It is an actuator: a
 * sleeve pinned at one end, a rod pinned at the other, sliding inside it. The
 * model already knows where all four of those points are, so where the parts
 * *reach* is read from the mechanism rather than invented. How thick they are
 * is invented, because the canvas draws a cylinder as a line -- those widths
 * are nominal and proportional to the link bodies, as the slider block is.
 */
export function cylinderParts(
  at: { barrelFar: DxfPoint; barrelNear: DxfPoint; pin: DxfPoint; rodFar: DxfPoint },
  bodyHalf: number,
  pinRadius: number,
  sleeveLayer: string,
  rodLayer: string
): DxfEntity[] {
  if (!(bodyHalf > 0)) return [];
  // Stepped rather than two bars of a similar width lying on each other, which
  // is what made a cylinder unreadable: nothing said which piece was the body,
  // which was the moving part, or what slid inside what. Sleeve, bore, piston
  // and rod each sit a clear step inside the last.
  const sleeveHalf = bodyHalf * 2.2;
  const boreHalf = bodyHalf * 1.4;
  const pistonHalf = bodyHalf * 1.25;
  const rodHalf = bodyHalf * 0.55;
  const hole = (center: DxfPoint, layer: string, limit: number): DxfEntity[] =>
    pinRadius > 0
      ? [{ type: 'CIRCLE', layer, center: center, radius: Math.min(pinRadius, limit) }]
      : [];
  // How far the piston sits from the mouth, so the head has somewhere to be.
  const span = Math.hypot(at.barrelNear.x - at.barrelFar.x, at.barrelNear.y - at.barrelFar.y) || 1;
  const along = {
    x: (at.barrelNear.x - at.barrelFar.x) / span,
    y: (at.barrelNear.y - at.barrelFar.y) / span,
  };
  const headBack = {
    x: at.pin.x - along.x * pistonHalf,
    y: at.pin.y - along.y * pistonHalf,
  };
  const headFront = {
    x: at.pin.x + along.x * pistonHalf,
    y: at.pin.y + along.y * pistonHalf,
  };
  return [
    // The sleeve, and the bore through it. An outer loop with an inner one is a
    // tube once extruded, which is what the rod has to slide in.
    capsule(at.barrelFar, at.barrelNear, sleeveHalf, sleeveLayer),
    capsule(at.barrelFar, at.barrelNear, boreHalf, sleeveLayer),
    ...hole(at.barrelFar, sleeveLayer, sleeveHalf * 0.4),
    // The rod, and the piston head on the end of it that the bore holds. The
    // head is what makes the drawing say "this slides in that" rather than
    // "these two happen to overlap".
    capsule(at.pin, at.rodFar, rodHalf, rodLayer),
    capsule(headBack, headFront, pistonHalf, rodLayer),
    ...hole(at.rodFar, rodLayer, rodHalf * 0.6),
  ];
}

/** A square block on the slot, twice as long as the slot is wide. */
function blockProfile(
  at: DxfPoint,
  along: DxfPoint,
  half: number,
  pinRadius: number,
  layer: string
): DxfEntity[] {
  // As wide as the slot it rides in -- `half` is the slot's half width, so
  // reaching `half` either side spans it exactly. Reaching `half * 2` made a
  // block twice the width of its own slot, which is a part that cannot go in.
  const long = { x: along.x * half * 2, y: along.y * half * 2 };
  const wide = { x: -along.y * half, y: along.x * half };
  return [
    {
      type: 'POLYLINE',
      layer,
      closed: true,
      points: [
        { x: at.x - long.x - wide.x, y: at.y - long.y - wide.y },
        { x: at.x + long.x - wide.x, y: at.y + long.y - wide.y },
        { x: at.x + long.x + wide.x, y: at.y + long.y + wide.y },
        { x: at.x - long.x + wide.x, y: at.y - long.y + wide.y },
      ],
    },
    // The pin joining the block to the link it drives. The shared joint layer
    // suppresses its circle because the bodies carry their own holes -- and
    // this body was the one that never got one.
    ...(pinRadius > 0 ? [{ type: 'CIRCLE' as const, layer, center: at, radius: pinRadius }] : []),
  ];
}

/**
 * A plate holding every grounded pin, so the assembly has a base to fix.
 *
 * Without one there is no ground *part*: a student ends up fixing a link that
 * is meant to move, or inventing a base and guessing where its holes go. A
 * rounded rectangle around the grounded joints is not the plate anybody will
 * ship, but it has the holes in exactly the right places, which is the half
 * that is hard to get right by hand.
 */
export function groundPlate(
  covered: readonly { x: number; y: number }[],
  point: (at: { x: number; y: number }) => DxfPoint,
  scale: number,
  pinRadius: number,
  layer: string,
  /** Where the holes go, which is a shorter list than what the plate covers. */
  pins: readonly { x: number; y: number }[] = covered
): DxfEntity[] {
  if (covered.length === 0) return [];
  const at = covered.map(point);
  const margin = Math.max(pinRadius * 2, 0.35 * scale);
  const minX = Math.min(...at.map((p) => p.x)) - margin;
  const maxX = Math.max(...at.map((p) => p.x)) + margin;
  const minY = Math.min(...at.map((p) => p.y)) - margin;
  const maxY = Math.max(...at.map((p) => p.y)) + margin;
  const radius = Math.min(margin, (maxX - minX) / 2, (maxY - minY) / 2);
  return [
    {
      type: 'POLYLINE',
      layer,
      closed: true,
      // Eight vertices: a straight edge, then a quarter turn at each corner.
      points: [
        { x: minX + radius, y: minY },
        { x: maxX - radius, y: minY, bulge: QUARTER },
        { x: maxX, y: minY + radius },
        { x: maxX, y: maxY - radius, bulge: QUARTER },
        { x: maxX - radius, y: maxY },
        { x: minX + radius, y: maxY, bulge: QUARTER },
        { x: minX, y: maxY - radius },
        { x: minX, y: minY + radius, bulge: QUARTER },
      ],
    },
    ...(pinRadius > 0
      ? pins.map((pin): DxfEntity => ({
          type: 'CIRCLE',
          layer,
          center: point(pin),
          radius: pinRadius,
        }))
      : []),
  ];
}

/** How far a slot's block actually travels, measured over the solved cycle. */
export interface SlotTravel {
  jointId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * Both ends of a slot, when nobody has measured the real stroke.
 *
 * A floating slot is defined by the two joints it slides between, so it knows
 * its own extent. A grounded one does not -- its length is whatever the block
 * happens to need, which is a fact about the solved cycle rather than about the
 * start pose. One centimeter either way is a placeholder, and the caller should
 * pass the measured travel instead wherever the mechanism has been solved.
 */
function nominalTravel(joint: PrisJoint): {
  from: { x: number; y: number };
  to: { x: number; y: number };
} {
  if (joint.isFloating && joint.slotJointA && joint.slotJointB) {
    return { from: joint.slotJointA, to: joint.slotJointB };
  }
  const dx = Math.cos(joint.slotAngle) * MODEL_SCALE;
  const dy = Math.sin(joint.slotAngle) * MODEL_SCALE;
  return {
    from: { x: joint.x - dx, y: joint.y - dy },
    to: { x: joint.x + dx, y: joint.y + dy },
  };
}

/** Whether a joint is welded solid rather than free to turn. */
export function isWelded(joint: unknown): boolean {
  return (joint as { isWelded?: boolean }).isWelded === true;
}

/** The links that are bodies in their own right: leaves, and no slider blocks. */
export function bodyLinks(links: readonly Link[]): RealLink[] {
  const found: RealLink[] = [];
  const visit = (link: Link) => {
    if (link instanceof SliderBlock) return;
    if (!(link instanceof RealLink)) return;
    // A welded compound is one part, so it is taken whole rather than as the
    // pieces it was welded from.
    found.push(link);
  };
  links.forEach(visit);
  return found.sort((a, b) => a.id.localeCompare(b.id));
}
