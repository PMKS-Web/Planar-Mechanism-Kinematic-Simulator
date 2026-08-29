import { Cylinder, cylinderJoints, sealedCylinderStructures } from '../../../model/cylinder';
import { Force } from '../../../model/force';
import { Joint, PrisJoint, RealJoint } from '../../../model/joint';
import { Link, RealLink, SliderBlock } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { LengthUnit } from '../../../model/unit-enums';
import { DxfDocument, DxfEntity, DxfLayer, DxfLine, DxfPoint } from './dxf-model';
import { DxfExportOptions, NEUTRAL_DXF_OPTIONS } from './dxf-options';
import {
  capsule,
  cylinderParts,
  defaultPinDiameter,
  weldMark,
  groundPlate,
  linkBodies,
  linkBodyWidth,
  SlotTravel,
  slotProfile,
} from './link-bodies';
import {
  consolidateWeldedAxes,
  groundAnnotation,
  inputAnnotation,
  SemanticAxis,
} from './semantic-dxf-geometry';

export const DXF_LAYER = {
  links: 'PMKS_LINK_CENTERLINES',
  groundPlate: 'PMKS_GROUND_PLATE',
  groundPoints: 'PMKS_GROUND_POINTS',
  dimensions: 'PMKS_DIMENSIONS',
  paths: 'PMKS_TRACED_PATHS',
  notes: 'PMKS_NOTES',
  joints: 'PMKS_JOINT_CENTERS',
  slots: 'PMKS_SLOTS',
  blocks: 'PMKS_SLIDER_BLOCKS',
  cylinders: 'PMKS_CYLINDERS',
  sleeves: 'PMKS_CYLINDER_SLEEVES',
  rods: 'PMKS_CYLINDER_RODS',
  annotations: 'PMKS_KINEMATIC_ANNOTATIONS',
  labels: 'PMKS_LABELS',
} as const;

/** One joint's coupler curve, already solved, in model units. */
export interface TracedPath {
  jointId: string;
  points: { x: number; y: number }[];
}

export interface SemanticDxfInput {
  joints: Joint[];
  links: Link[];
  forces: Force[];
  lengthUnit: LengthUnit;
  defaultInputClockwise: boolean;
  includeLabels?: boolean;
  includeKinematicAnnotations?: boolean;
  /** The rest of what the CAD Export dialog decides. */
  options?: DxfExportOptions;
  /** Solved by the caller: the builder only ever sees the start pose. */
  tracedPaths?: TracedPath[];
  /** How far each slot's block really travels, measured over the solved cycle. */
  slotTravels?: SlotTravel[];
  /** Joint ids per machine, so each gets a plate of its own rather than one. */
  groundGroups?: string[][];
}

const LAYERS = [
  { name: DXF_LAYER.links, color: 7 },
  { name: DXF_LAYER.groundPlate, color: 9 },
  { name: DXF_LAYER.groundPoints, color: 5 },
  { name: DXF_LAYER.dimensions, color: 8 },
  { name: DXF_LAYER.paths, color: 4 },
  { name: DXF_LAYER.notes, color: 7 },
  { name: DXF_LAYER.joints, color: 2 },
  { name: DXF_LAYER.slots, color: 4 },
  { name: DXF_LAYER.blocks, color: 4 },
  { name: DXF_LAYER.cylinders, color: 6 },
  { name: DXF_LAYER.sleeves, color: 6 },
  { name: DXF_LAYER.rods, color: 6 },
  { name: DXF_LAYER.annotations, color: 3 },
  { name: DXF_LAYER.labels, color: 7 },
];

/** Convert the editable t=0 model into a fabrication-neutral kinematic sketch. */
export function buildSemanticDxf(input: SemanticDxfInput): DxfDocument {
  const choices = { ...NEUTRAL_DXF_OPTIONS, ...(input.options ?? {}) };
  // Model units -> centimetres -> whatever the export is in. Without the last
  // step the geometry stays in centimetres while `$INSUNITS` says metres, and
  // CAD receives a mechanism a hundred times too big under a label that looks
  // right. `symbolScale` -- one centimetre's worth of the export unit, which is
  // what every glyph and text height is sized in -- always assumed the drawing
  // had been converted.
  const symbolScale = centimetersIn(input.lengthUnit);
  const unitScale = symbolScale / MODEL_SCALE;
  // Resolved once, here, so the drawing, the notes and the dialog all quote the
  // same hole. Unset means "whatever fits the parts", which cannot be a
  // constant: the bodies are whatever width the canvas is drawing them at.
  const pinDiameter = choices.pinDiameter ?? defaultPinDiameter(unitScale);
  // Everything is shifted by one offset, computed once. A linkage drawn a metre
  // from the model origin imports a metre from the part origin otherwise, which
  // is a fight every time somebody builds from one of these.
  const shift = originShift(input, choices, unitScale);
  const point = (joint: { x: number; y: number }): DxfPoint => ({
    x: joint.x * unitScale - shift.x,
    y: joint.y * unitScale - shift.y,
  });
  const cylinders = sealedCylinderStructures(input.joints);
  const cylinderInterior = new Set(
    cylinders.flatMap((cylinder) =>
      cylinderJoints(cylinder)
        .slice(1, 4)
        .map((joint) => joint.id)
    )
  );
  const cylinderBodies = new Set(
    cylinders.flatMap((cylinder) => [cylinder.barrel.id, cylinder.rod.id, cylinder.block.id])
  );
  const entities: DxfEntity[] = [];

  const axes = semanticAxes(input.links, cylinderBodies, point);
  const welded = new Set(
    input.joints
      .filter((joint): joint is RealJoint => joint instanceof RealJoint && joint.isWelded)
      .map((joint) => joint.id)
  );
  const pinRadius = choices.jointCircles === 'holes' ? pinDiameter / 2 : 0;
  // Outlines instead of centrelines, when the reader is building rather than
  // tracing. A link that has no outline to give -- every joint collapsed onto
  // one point -- keeps its centreline, so it does not silently vanish.
  const drawnAsBody = new Set<string>();
  let bodyLoops = 0;
  let collapsedBodies = 0;
  if (choices.linkBodies === 'outlines') {
    const bodies = linkBodies({
      links: input.links,
      point,
      scale: symbolScale,
      pinRadius,
      layerFor: (link) => (choices.perLinkLayers ? layerNameFor(link.id) : DXF_LAYER.links),
      drawnElsewhere: cylinderBodies,
    });
    entities.push(...bodies.entities);
    bodyLoops = bodies.entities.filter((entity) => entity.type === 'POLYLINE').length;
    collapsedBodies = bodies.missing.length;
    const collapsed = new Set(bodies.missing.map((link) => link.id));
    input.links.forEach((link) => {
      if (!(link instanceof RealLink) || collapsed.has(link.id)) return;
      // The leaves as well as the compound. A welded body is drawn once, whole,
      // but the centreline axes are still counted per leaf -- so `CDE` was
      // suppressed while `CD` and `DE` came through and were handed layers of
      // their own, and the file offered two PMKS_LINK_* layers holding a bare
      // line each. A reader taking one sketch per layer got two with nothing in
      // them to extrude.
      leavesOf(link).forEach((leaf) => drawnAsBody.add(leaf.id));
      drawnAsBody.add(link.id);
    });
  }
  entities.push(
    ...consolidateWeldedAxes(axes, welded)
      .filter((axis) => !drawnAsBody.has(axis.key))
      .map((axis): DxfLine => ({
        type: 'LINE',
        layer: DXF_LAYER.links,
        start: axis.start,
        end: axis.end,
      }))
  );

  cylinders
    .slice()
    .sort((a, b) => cylinderKey(a).localeCompare(cylinderKey(b)))
    .forEach((cylinder) => {
      const start = point(cylinder.barrelFar);
      const end = point(cylinder.rodFar);
      if (choices.linkBodies === 'outlines') {
        // The sleeve and the rod, rather than a line between the two mounts.
        // That line is neither of the parts and cannot be extruded, which left
        // every cylinder in the drawing as the one thing a reader could not
        // build.
        entities.push(
          ...cylinderParts(
            {
              barrelFar: start,
              barrelNear: point(cylinder.barrelNear),
              pin: point(cylinder.pin),
              rodFar: end,
            },
            (linkBodyWidth() * unitScale) / 2,
            pinRadius,
            DXF_LAYER.sleeves,
            DXF_LAYER.rods
          )
        );
      } else {
        entities.push({ type: 'LINE', layer: DXF_LAYER.cylinders, start, end });
        // The barrel drawn as a body, so a cylinder is not one more bar. Which
        // half is the sleeve and which is the rod is the whole point of it, and
        // a plain line between two mounts says neither.
        entities.push(
          capsule(start, point(cylinder.barrelNear), 0.12 * symbolScale, DXF_LAYER.cylinders)
        );
      }
      if (input.includeKinematicAnnotations !== false && cylinder.slider.input) {
        const clockwise =
          cylinder.slider.driveSpeed === 0
            ? input.defaultInputClockwise
            : cylinder.slider.driveSpeed < 0;
        entities.push(
          ...inputAnnotation(
            {
              x: (start.x + end.x) / 2,
              y: (start.y + end.y) / 2,
              slotAngle: Math.atan2(end.y - start.y, end.x - start.x),
            },
            clockwise,
            symbolScale,
            DXF_LAYER.annotations
          )
        );
      }
    });

  const blockPins = sliderBlockPinIds(input.links);
  input.joints
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((joint) => {
      if (cylinderInterior.has(joint.id)) return;
      if (joint instanceof PrisJoint) {
        if (choices.linkBodies === 'outlines') {
          // On the layer of the part the slot is cut *into*, not a slots layer
          // of its own. "One sketch per layer, extrude each" turns a lone
          // capsule into a solid shaped like the slot; sharing the carrier's
          // layer makes it an inner loop of that part, which is a hole.
          entities.push(
            ...slotProfile(
              joint,
              (input.slotTravels ?? []).find((travel) => travel.jointId === joint.id),
              point,
              symbolScale,
              pinRadius,
              slotCarrierLayer(joint, input.links, choices, DXF_LAYER.groundPlate),
              DXF_LAYER.blocks,
              // A slot cut into a link has to leave material in a body the
              // canvas draws as a thin bar. One cut into the ground plate has
              // a whole plate around it and needs no such restraint.
              joint.isFloating ? linkBodyWidth() * unitScale : Infinity
            )
          );
        } else {
          entities.push(slotAxis(joint, point, symbolScale));
          // The block, so a sliding pair is not one more line among lines. The
          // canvas draws a rectangle on the slot; this is the same rectangle,
          // and it is the only thing separating "slides along here" from
          // "another bar happens to lie here".
          entities.push(...blockMark(joint, point, symbolScale, DXF_LAYER.slots));
        }
      }
      const pairedPin = blockPins.has(joint.id) && !(joint instanceof PrisJoint);
      if (!pairedPin && (!(joint instanceof RealJoint) || !joint.isWelded)) {
        // A circle and nothing else. A bare POINT is what sketch importers
        // either drop or turn into stray sketch points that have to be cleaned
        // out one at a time, and a circle already gives them a centre to snap
        // and mate to. The reader chooses what the circle *is* -- nothing, a
        // centre mark, or the hole they will cut.
        // A hole already cut into every body it belongs to is not cut again on
        // a shared layer: two circles on one centre is one to delete in CAD.
        const radius =
          choices.jointCircles === 'holes'
            ? drawnAsBody.size > 0
              ? 0
              : pinRadius
            : choices.jointCircles === 'marks'
              ? 0.08 * symbolScale
              : 0;
        if (radius > 0) {
          entities.push({
            type: 'CIRCLE',
            layer: DXF_LAYER.joints,
            center: point(joint),
            radius,
          });
        }
        if (choices.includeGroundPoints && joint instanceof RealJoint && joint.ground) {
          // Which points do not move. A triangle rather than a cross, because
          // the cross means *welded* -- and a mark that means two opposite
          // things is worse than no mark. This is the same triangle the canvas
          // hatches under a grounded joint.
          const at = point(joint);
          const arm = 0.18 * symbolScale;
          entities.push({
            type: 'POLYLINE',
            layer: DXF_LAYER.groundPoints,
            closed: true,
            points: [
              { x: at.x, y: at.y },
              { x: at.x - arm, y: at.y - arm * 1.4 },
              { x: at.x + arm, y: at.y - arm * 1.4 },
            ],
          });
        }
      }
      // The same cross the bodies get, and the same one the canvas draws. A
      // welded joint has no circle here -- correctly, it is not a bearing --
      // but nothing said so, and a reader could not tell a rigid corner from a
      // missing one.
      if (joint instanceof RealJoint && joint.isWelded && !cylinderInterior.has(joint.id)) {
        entities.push(...weldMark(point(joint), 0.1 * symbolScale, DXF_LAYER.joints));
      }
      if (input.includeKinematicAnnotations !== false && joint instanceof RealJoint) {
        const at = point(joint);
        if (joint.ground)
          entities.push(...groundAnnotation(at, symbolScale, DXF_LAYER.annotations));
        if (joint.input) {
          const clockwise =
            joint.driveSpeed === 0 ? input.defaultInputClockwise : joint.driveSpeed < 0;
          entities.push(
            ...inputAnnotation(
              { ...at, slotAngle: joint instanceof PrisJoint ? joint.slotAngle : undefined },
              clockwise,
              symbolScale,
              DXF_LAYER.annotations
            )
          );
        }
      }
      if (input.includeLabels && !(joint instanceof PrisJoint)) {
        const at = point(joint);
        entities.push({
          type: 'TEXT',
          layer: DXF_LAYER.labels,
          at: { x: at.x + 0.12 * symbolScale, y: at.y + 0.12 * symbolScale },
          height: 0.22 * symbolScale,
          text: joint.name,
        });
      }
    });

  addLabels(input, axes, cylinders, point, symbolScale, entities);

  if (choices.includeTracedPaths) {
    (input.tracedPaths ?? [])
      .filter((path) => path.points.length >= 2)
      .forEach((path) =>
        entities.push({
          type: 'POLYLINE',
          layer: DXF_LAYER.paths,
          points: path.points.map(point),
          closed: false,
        })
      );
  }
  if (choices.includeSlotTravel) {
    entities.push(...slotTravelPoints(input.joints, point, symbolScale));
  }
  if (choices.includeGroundPlate) {
    // One plate per machine. A drawing can hold several mechanisms side by
    // side, and a single box round every fixed pin in all of them is a plate
    // the size of the whole drawing, lying across the parts it is meant to sit
    // under. Which pins belong together is a question the partitioner already
    // answers.
    const machines =
      input.groundGroups && input.groundGroups.length > 0
        ? input.groundGroups
        : [input.joints.map((joint) => joint.id)];
    machines.forEach((ids) => {
      const mine = new Set(ids);
      addGroundPlate(
        input.joints.filter((joint) => mine.has(joint.id)),
        input,
        point,
        symbolScale,
        pinRadius,
        entities
      );
    });
  }

  if (choices.includeDimensions) {
    addDimensions(axes, choices, input.lengthUnit, symbolScale, entities);
  }
  if (choices.includeNotes) {
    addNotes(
      input,
      {
        ...choices,
        pinDiameter,
        bodyCount: bodyLoops,
        centrelineCount: collapsedBodies,
      },
      axes,
      symbolScale,
      entities
    );
  }

  // A layer per link, which is the one that changes the reader's day: Fusion
  // makes a sketch per layer and SolidWorks imports them selectively, so this
  // is what lets them get one part per link without separating anything by
  // hand. The shared centreline layer stays defined either way -- everything
  // that is not a link body still lives on it.
  const layers: DxfLayer[] = [...LAYERS];
  if (choices.perLinkLayers) {
    const axisKeyAt = new Map<string, string>();
    axes.forEach((axis) => axisKeyAt.set(edgeKey(axis.start, axis.end), axis.key));
    entities.forEach((entity) => {
      if (entity.type !== 'LINE' || entity.layer !== DXF_LAYER.links) return;
      const key = axisKeyAt.get(edgeKey(entity.start, entity.end));
      if (key) entity.layer = layerNameFor(key);
    });
    // Declared from what is actually drawn, not from the centreline axes. The
    // bodies come from a different list -- a cylinder's barrel and rod are two
    // parts to build and one line to draw, so they have layers no axis names,
    // and the file described a drawing it did not contain.
    new Set(entities.map((entity) => entity.layer)).forEach((name) => {
      if (name.startsWith('PMKS_LINK_') && !layers.some((layer) => layer.name === name)) {
        layers.push({ name, color: 7 });
      }
    });
  }

  return { layers, entities };
}

/**
 * The layer of the part a slot is cut into.
 *
 * A floating slot is cut into the link carrying its two slot joints; a grounded
 * one is cut into the ground plate. Either way it has to share the layer with
 * the body it perforates, or an importer builds it as a part instead of
 * removing it from one.
 */
function slotCarrierLayer(
  joint: PrisJoint,
  links: Link[],
  choices: { perLinkLayers: boolean; includeGroundPlate: boolean },
  groundLayer: string
): string {
  if (joint.isFloating && joint.slotJointA && joint.slotJointB) {
    const carrier = links.find(
      (link): link is RealLink =>
        link instanceof RealLink &&
        link.joints.some((one) => one.id === joint.slotJointA!.id) &&
        link.joints.some((one) => one.id === joint.slotJointB!.id)
    );
    if (carrier) return choices.perLinkLayers ? layerNameFor(carrier.id) : DXF_LAYER.links;
  }
  // A grounded slot with no plate to cut it into has nowhere better to go than
  // the slots layer -- and the reader has said they do not want a base part.
  return choices.includeGroundPlate ? groundLayer : DXF_LAYER.slots;
}

/** `PMKS_LINK_AB`, from a link id, with anything unusual in it made safe. */
function layerNameFor(linkId: string): string {
  return `PMKS_LINK_${linkId.replace(/[^A-Za-z0-9_]+/g, '_').toUpperCase()}`;
}

function edgeKey(start: DxfPoint, end: DxfPoint): string {
  const at = (point: DxfPoint) => `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
  return `${at(start)}|${at(end)}`;
}

/**
 * Where the drawing's chosen origin currently sits, in export units.
 *
 * Subtracted from every point, so the answer is the offset rather than the
 * point. `model` keeps the coordinates the mechanism was drawn in.
 */
function originShift(
  input: SemanticDxfInput,
  choices: { origin: string; originJointId?: string },
  unitScale: number
): DxfPoint {
  const at = (joint: { x: number; y: number }) => ({
    x: joint.x * unitScale,
    y: joint.y * unitScale,
  });
  if (choices.origin === 'center') {
    const xs = input.joints.map((joint) => joint.x);
    const ys = input.joints.map((joint) => joint.y);
    if (!xs.length) return { x: 0, y: 0 };
    return at({
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    });
  }
  if (choices.origin === 'joint') {
    const chosen = input.joints.find((joint) => joint.id === choices.originJointId);
    if (chosen) return at(chosen);
  }
  if (choices.origin === 'ground' || choices.origin === 'joint') {
    const grounded = input.joints.find((joint) => joint instanceof RealJoint && joint.ground);
    if (grounded) return at(grounded);
  }
  return { x: 0, y: 0 };
}

/** The plate under one machine's fixed pins, reaching round any slot it holds. */
function addGroundPlate(
  mine: Joint[],
  input: SemanticDxfInput,
  point: (value: { x: number; y: number }) => DxfPoint,
  scale: number,
  pinRadius: number,
  entities: DxfEntity[]
): void {
  const fixed = mine.filter((joint) => joint instanceof RealJoint && joint.ground);
  if (fixed.length === 0) return;
  // A grounded slot is cut *into* this plate, so the plate has to reach the
  // whole stroke -- otherwise the slot runs off the end of the part holding it,
  // which is a drawing nobody can build from.
  const carried = mine
    .filter((joint): joint is PrisJoint => joint instanceof PrisJoint && !joint.isFloating)
    .flatMap((joint) => {
      const travel = (input.slotTravels ?? []).find((one) => one.jointId === joint.id);
      return travel ? [travel.from, travel.to] : [];
    });
  entities.push(
    ...groundPlate([...fixed, ...carried], point, scale, pinRadius, DXF_LAYER.groundPlate, fixed)
  );
}

/** The rectangle a slider block is, drawn square to its own slot. */
function blockMark(
  joint: PrisJoint,
  point: (value: { x: number; y: number }) => DxfPoint,
  scale: number,
  layer: string
): DxfEntity[] {
  const at = point(joint);
  const angle = joint.slotAngle;
  const along = { x: Math.cos(angle) * 0.22 * scale, y: Math.sin(angle) * 0.22 * scale };
  const across = { x: -Math.sin(angle) * 0.12 * scale, y: Math.cos(angle) * 0.12 * scale };
  const corner = (a: number, b: number) => ({
    x: at.x + along.x * a + across.x * b,
    y: at.y + along.y * a + across.y * b,
  });
  return [
    {
      type: 'POLYLINE',
      layer,
      closed: true,
      points: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
    },
  ];
}

/**
 * Both ends of every slot, so its stroke can be modelled rather than guessed.
 *
 * Small circles rather than bare points, for the same reason the joints are:
 * an importer keeps a circle and gives the reader a centre to snap to.
 */
function slotTravelPoints(
  joints: Joint[],
  point: (value: { x: number; y: number }) => DxfPoint,
  scale: number
): DxfEntity[] {
  return joints
    .filter((joint): joint is PrisJoint => joint instanceof PrisJoint)
    .filter((joint) => joint.isFloating && joint.slotJointA && joint.slotJointB)
    .flatMap((joint): DxfEntity[] =>
      [joint.slotJointA!, joint.slotJointB!].map((end) => ({
        type: 'CIRCLE',
        layer: DXF_LAYER.slots,
        center: point(end),
        radius: 0.06 * scale,
      }))
    );
}

/**
 * A length on every link, drawn as lines and a number.
 *
 * Not as a `DIMENSION` entity: that would be worth the machinery it needs -- an
 * anonymous block apiece, a DIMSTYLE table, a whole second entity shape -- only
 * if an importer turned it into something a reader could drive the model from,
 * and Fusion and Onshape do not. They land it as dumb lines and text at best.
 * So it is dumb lines and text on purpose, and every reader sees the same thing.
 */
function addDimensions(
  axes: SemanticAxis[],
  choices: { dimensionStyle: string },
  unit: LengthUnit,
  scale: number,
  entities: DxfEntity[]
): void {
  const measured = axes.filter(
    (axis, index) => axes.findIndex((candidate) => candidate.key === axis.key) === index
  );
  if (!measured.length) return;
  if (choices.dimensionStyle === 'table') {
    measured.forEach((axis, index) =>
      entities.push({
        type: 'TEXT',
        layer: DXF_LAYER.dimensions,
        at: { x: 0, y: -(index + 1) * 0.4 * scale },
        height: 0.22 * scale,
        text: `${axis.label}  ${lengthOf(axis).toFixed(3)} ${unitWord(unit)}`,
      })
    );
    return;
  }
  // The middle of everything being measured, so each dimension can be pushed
  // away from it. Offsetting them all to the same hand puts them inside the
  // linkage, crossing each other and the links they belong to.
  const heart = {
    x: measured.reduce((sum, axis) => sum + (axis.start.x + axis.end.x) / 2, 0) / measured.length,
    y: measured.reduce((sum, axis) => sum + (axis.start.y + axis.end.y) / 2, 0) / measured.length,
  };
  measured.forEach((axis) => {
    const midX = (axis.start.x + axis.end.x) / 2;
    const midY = (axis.start.y + axis.end.y) / 2;
    const span = lengthOf(axis);
    if (span === 0) return;
    // Square to what is being measured, not straight down: a fixed drop in Y
    // is no offset at all for a vertical link, and lays the dimension line
    // along the very centreline it is dimensioning.
    const offset = 0.5 * scale;
    const normal = {
      x: (axis.end.y - axis.start.y) / span,
      y: -(axis.end.x - axis.start.x) / span,
    };
    const outward = normal.x * (midX - heart.x) + normal.y * (midY - heart.y) < 0 ? -1 : 1;
    const across = { x: normal.x * outward, y: normal.y * outward };
    entities.push(
      ...dimensionPicture(
        {
          from: axis.start,
          to: axis.end,
          at: { x: midX + across.x * offset, y: midY + across.y * offset },
          text: `${span.toFixed(3)} ${unitWord(unit)}`,
        },
        scale
      )
    );
  });
}

/** The lines and text a dimension is made of. */
function dimensionPicture(
  dimension: { from: DxfPoint; to: DxfPoint; at: DxfPoint; text: string },
  scale: number
): DxfEntity[] {
  const { from, to, at, text } = dimension;
  const layer = DXF_LAYER.dimensions;
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  if (span === 0) return [];
  // Along the measured direction, and square to it.
  const along = { x: (to.x - from.x) / span, y: (to.y - from.y) / span };
  const across = { x: -along.y, y: along.x };
  // How far off the measured line the dimension line sits, signed.
  const drop = (at.x - from.x) * across.x + (at.y - from.y) * across.y;
  const offsetBy = (point: DxfPoint, by: number): DxfPoint => ({
    x: point.x + across.x * by,
    y: point.y + across.y * by,
  });
  const startEnd = offsetBy(from, drop);
  const finishEnd = offsetBy(to, drop);
  const gap = 0.06 * scale;
  const overshoot = 0.1 * scale;
  const tick = 0.08 * scale;
  const line = (a: DxfPoint, b: DxfPoint): DxfEntity => ({ type: 'LINE', layer, start: a, end: b });
  // A slash where the dimension line meets each extension line: an arrowhead
  // is a solid, and a solid is the one thing this writer does not emit.
  const slash = (point: DxfPoint): DxfEntity =>
    line(
      { x: point.x - (along.x + across.x) * tick, y: point.y - (along.y + across.y) * tick },
      { x: point.x + (along.x + across.x) * tick, y: point.y + (along.y + across.y) * tick }
    );
  return [
    line(offsetBy(from, Math.sign(drop) * gap), offsetBy(startEnd, Math.sign(drop) * overshoot)),
    line(offsetBy(to, Math.sign(drop) * gap), offsetBy(finishEnd, Math.sign(drop) * overshoot)),
    line(startEnd, finishEnd),
    slash(startEnd),
    slash(finishEnd),
    {
      type: 'TEXT',
      layer,
      // Clear of the dimension line rather than sitting on it.
      at: offsetBy({ x: at.x - along.x * span * 0.2, y: at.y - along.y * span * 0.2 }, gap),
      height: 0.22 * scale,
      text,
      angleDeg: (Math.atan2(along.y, along.x) * 180) / Math.PI,
    },
  ];
}

function lengthOf(axis: SemanticAxis): number {
  return Math.hypot(axis.end.x - axis.start.x, axis.end.y - axis.start.y);
}

/** What the file is, in the file, for whoever opens it a year from now. */
function addNotes(
  input: SemanticDxfInput,
  choices: {
    origin: string;
    jointCircles: string;
    pinDiameter: number;
    linkBodies: string;
    bodyCount: number;
    centrelineCount: number;
  },
  axes: SemanticAxis[],
  scale: number,
  entities: DxfEntity[]
): void {
  const outlines = choices.linkBodies === 'outlines';
  const lines = [
    `PMKS+ CAD export - ${outlines ? 'part outlines' : 'kinematic centerlines'} from the start pose`,
    // R12 has no header field for units, so this and the file's name are where
    // the answer lives -- and the import dialog will ask.
    `Units: ${unitWord(input.lengthUnit)}`,
    `Origin: ${choices.origin === 'model' ? 'as drawn' : 'moved to ' + choices.origin}`,
    choices.jointCircles === 'holes'
      ? `Joint circles are pin holes, ${choices.pinDiameter} ${unitWord(input.lengthUnit)} diameter`
      : 'Joint circles are centre marks, not hole diameters',
    // Counted rather than promised: a link whose joints have collapsed onto one
    // point has no outline to give and keeps its centreline, and a note saying
    // every link is a closed outline would be wrong about exactly the link a
    // reader is about to go looking for.
    outlines
      ? `${choices.bodyCount} closed outline${choices.bodyCount === 1 ? '' : 's'}` +
        (choices.centrelineCount > 0
          ? `, and ${choices.centrelineCount} link${choices.centrelineCount === 1 ? '' : 's'} with no outline to give, left as centrelines`
          : ', one per link')
      : `${axes.length} centreline${axes.length === 1 ? '' : 's'}`,
  ];
  lines.forEach((text, index) =>
    entities.push({
      type: 'TEXT',
      layer: DXF_LAYER.notes,
      at: { x: 0, y: -(index + 1) * 0.35 * scale - 3 * scale },
      height: 0.2 * scale,
      text,
    })
  );
}

function unitWord(unit: LengthUnit): string {
  if (unit === LengthUnit.INCH) return 'in';
  if (unit === LengthUnit.METER) return 'm';
  return 'cm';
}

function semanticAxes(
  links: Link[],
  excluded: Set<string>,
  point: (value: { x: number; y: number }) => DxfPoint
): SemanticAxis[] {
  return links
    .flatMap(leavesOf)
    .filter((link): link is RealLink => link instanceof RealLink && !excluded.has(link.id))
    .filter((link) => link.joints.length >= 2)
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((link) => {
      // The closed shape of the link, not a star out of whichever joint
      // happens to be first. A three-joint link is a triangle and a four-joint
      // link is a quadrilateral -- drawn from joint[0] to each of the others,
      // a triangle came out as two lines meeting at a point and a quadrilateral
      // as a fan, which is neither the part nor anything a reader recognises.
      const ring = outlineOrder(link.joints);
      const edges = ring.length === 2 ? [[ring[0], ring[1]]] : closedRing(ring);
      return edges.map(([from, to]) => ({
        start: point(from),
        end: point(to),
        startId: from.id,
        endId: to.id,
        key: link.id,
        label: link.name,
      }));
    });
}

/**
 * A link's joints in the order its outline runs through them.
 *
 * By angle about their own centre, which is the hull order for the convex
 * shapes a link body always is -- and the order the canvas draws them in.
 */
function outlineOrder(joints: readonly Joint[]): Joint[] {
  if (joints.length < 3) return [...joints];
  const middle = {
    x: joints.reduce((sum, joint) => sum + joint.x, 0) / joints.length,
    y: joints.reduce((sum, joint) => sum + joint.y, 0) / joints.length,
  };
  return [...joints].sort(
    (a, b) =>
      Math.atan2(a.y - middle.y, a.x - middle.x) - Math.atan2(b.y - middle.y, b.x - middle.x)
  );
}

/** Every edge of a closed ring, last joint back round to the first. */
function closedRing(ring: Joint[]): [Joint, Joint][] {
  return ring.map((joint, index): [Joint, Joint] => [joint, ring[(index + 1) % ring.length]]);
}

function leavesOf(link: Link): Link[] {
  return link instanceof SliderBlock
    ? []
    : link instanceof RealLink && link.subset.length > 0
      ? link.subset.flatMap(leavesOf)
      : [link];
}

function slotAxis(
  joint: PrisJoint,
  point: (value: { x: number; y: number }) => DxfPoint,
  scale: number
): DxfLine {
  if (joint.isFloating && joint.slotJointA && joint.slotJointB) {
    return {
      type: 'LINE',
      layer: DXF_LAYER.slots,
      start: point(joint.slotJointA),
      end: point(joint.slotJointB),
    };
  }
  const center = point(joint);
  const dx = Math.cos(joint.slotAngle) * scale;
  const dy = Math.sin(joint.slotAngle) * scale;
  return {
    type: 'LINE',
    layer: DXF_LAYER.slots,
    start: { x: center.x - dx, y: center.y - dy },
    end: { x: center.x + dx, y: center.y + dy },
  };
}

function sliderBlockPinIds(links: Link[]): Set<string> {
  return new Set(
    links
      .filter((link): link is SliderBlock => link instanceof SliderBlock)
      .flatMap((block) =>
        block.joints.filter((joint) => !(joint instanceof PrisJoint)).map((joint) => joint.id)
      )
  );
}

function addLabels(
  input: SemanticDxfInput,
  axes: SemanticAxis[],
  cylinders: Cylinder[],
  point: (value: { x: number; y: number }) => DxfPoint,
  scale: number,
  entities: DxfEntity[]
): void {
  if (!input.includeLabels) return;
  axes
    .filter((axis, index) => axes.findIndex((candidate) => candidate.key === axis.key) === index)
    .forEach((axis) =>
      entities.push({
        type: 'TEXT',
        layer: DXF_LAYER.labels,
        at: { x: (axis.start.x + axis.end.x) / 2, y: (axis.start.y + axis.end.y) / 2 },
        height: 0.22 * scale,
        text: axis.label,
      })
    );
  cylinders.forEach((cylinder) => {
    const a = point(cylinder.barrelFar);
    const b = point(cylinder.rodFar);
    entities.push({
      type: 'TEXT',
      layer: DXF_LAYER.labels,
      at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      height: 0.22 * scale,
      text: `Cylinder ${cylinder.barrelFar.name}${cylinder.rodFar.name}`,
    });
  });
}

function cylinderKey(cylinder: Cylinder): string {
  return `${cylinder.barrelFar.id}|${cylinder.rodFar.id}`;
}

/** One centimetre, expressed in `unit`. The whole drawing is sized in these. */
export function centimetersIn(unit: LengthUnit): number {
  if (unit === LengthUnit.INCH) return 1 / 2.54;
  if (unit === LengthUnit.METER) return 0.01;
  return 1;
}
