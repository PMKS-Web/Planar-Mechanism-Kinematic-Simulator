import { PrisJoint } from '../../../model/joint';
import { Link, RealLink, SliderBlock } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { SettingsService } from '../../settings.service';
import { DxfEntity, DxfPoint, DxfVertex } from './dxf-model';

/**
 * The parts, rather than the picture of them.
 *
 * A centreline cannot be extruded. What a student needs in order to get from
 * this export to a moving assembly is one closed outline per link with its pin
 * holes already cut, on its own layer -- then the CAD flow is: insert, one
 * sketch per layer, extrude each, drop revolute joints on the holes. The
 * geometry is not new; it is the same rounded body the canvas has always drawn,
 * asked for in a form something other than an SVG path can read.
 */

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
  /** How far one centimetre reaches in the export's units. */
  scale: number;
  /** Radius of the hole cut at every pin, or zero for no hole. */
  pinRadius: number;
  /** `PMKS_LINK_AB` for a link, or the shared layer when they are not split. */
  layerFor: (link: RealLink) => string;
}

/**
 * One closed loop per link body, plus a hole at each of its pins.
 *
 * Links whose outline has collapsed -- every joint landed on one point -- are
 * returned as `missing`, so the caller can fall back to the centreline for
 * those rather than dropping them out of the drawing entirely.
 */
export function linkBodies(input: LinkBodyInput): {
  entities: DxfEntity[];
  missing: RealLink[];
} {
  const entities: DxfEntity[] = [];
  const missing: RealLink[] = [];
  bodyLinks(input.links).forEach((link) => {
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
    if (input.pinRadius > 0) {
      link.joints
        .filter((joint) => !(joint instanceof PrisJoint))
        .forEach((joint) =>
          entities.push({
            type: 'CIRCLE',
            layer,
            center: input.point(joint),
            radius: input.pinRadius,
          })
        );
    }
  });
  return { entities, missing };
}

/**
 * A slot the block can actually slide in, rather than a line implying one.
 *
 * The travel plus a pin's width at each end, closed with a half circle -- the
 * shape somebody would machine. Without it the sliding pair is only implied,
 * and a reader modelling from this has to invent the slot themselves and hope
 * they invent the same one the mechanism was solved with.
 */
export function slotProfile(
  joint: PrisJoint,
  travel: SlotTravel | undefined,
  point: (at: { x: number; y: number }) => DxfPoint,
  scale: number,
  pinRadius: number,
  slotLayer: string,
  blockLayer: string
): DxfEntity[] {
  const ends = travel ?? nominalTravel(joint);
  const from = point(ends.from);
  const to = point(ends.to);
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  if (span === 0) return [];
  const half = Math.max(pinRadius, 0.06 * scale);
  const along = { x: (to.x - from.x) / span, y: (to.y - from.y) / span };
  const across = { x: -along.y * half, y: along.x * half };
  // Down one side, round the end, back the other side, round the other end.
  // The run is clockwise -- the left-hand side first -- so an end cap that
  // bulges outward is a negative bulge. Positive turns them inward and the
  // slot comes out as two facing brackets rather than a shape.
  return [
    {
      type: 'POLYLINE',
      layer: slotLayer,
      closed: true,
      points: [
        { x: from.x + across.x, y: from.y + across.y },
        { x: to.x + across.x, y: to.y + across.y, bulge: -1 },
        { x: to.x - across.x, y: to.y - across.y },
        { x: from.x - across.x, y: from.y - across.y, bulge: -1 },
      ],
    },
    // Something to put in the slot. The canvas draws no block outline of its
    // own, so this one is nominal: square to the slot, as wide as it is, and
    // centred where the block sits at the start pose. It is a part a reader can
    // extrude and mate, which an empty slot is not.
    ...blockProfile(point(joint), along, half, blockLayer),
  ];
}

/** A square block on the slot, twice as long as the slot is wide. */
function blockProfile(at: DxfPoint, along: DxfPoint, half: number, layer: string): DxfEntity[] {
  const reach = half * 2;
  const long = { x: along.x * reach, y: along.y * reach };
  const wide = { x: -along.y * reach, y: along.x * reach };
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
 * start pose. One centimetre either way is a placeholder, and the caller should
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
