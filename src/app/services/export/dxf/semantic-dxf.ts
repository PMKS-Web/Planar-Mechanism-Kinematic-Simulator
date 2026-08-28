import { Cylinder, cylinderJoints, sealedCylinderStructures } from '../../../model/cylinder';
import { Force } from '../../../model/force';
import { Joint, PrisJoint, RealJoint } from '../../../model/joint';
import { Link, RealLink, SliderBlock } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { LengthUnit } from '../../../model/unit-enums';
import { DxfDocument, DxfEntity, DxfLayer, DxfLine, DxfPoint } from './dxf-model';
import { DxfExportOptions, NEUTRAL_DXF_OPTIONS } from './dxf-options';
import {
  consolidateWeldedAxes,
  extentTicks,
  forceEntities,
  groundAnnotation,
  inputAnnotation,
  SemanticAxis,
} from './semantic-dxf-geometry';

export const DXF_LAYER = {
  links: 'PMKS_LINK_CENTERLINES',
  groundPoints: 'PMKS_GROUND_POINTS',
  dimensions: 'PMKS_DIMENSIONS',
  paths: 'PMKS_TRACED_PATHS',
  notes: 'PMKS_NOTES',
  joints: 'PMKS_JOINT_CENTERS',
  slots: 'PMKS_SLOTS',
  cylinders: 'PMKS_CYLINDERS',
  annotations: 'PMKS_KINEMATIC_ANNOTATIONS',
  labels: 'PMKS_LABELS',
  forces: 'PMKS_FORCES',
  construction: 'PMKS_CONSTRUCTION',
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
  includeForces?: boolean;
  includeConstruction?: boolean;
  /** The rest of what the CAD Export dialog decides. */
  options?: DxfExportOptions;
  /** Solved by the caller: the builder only ever sees the start pose. */
  tracedPaths?: TracedPath[];
}

const LAYERS = [
  { name: DXF_LAYER.links, color: 7 },
  { name: DXF_LAYER.groundPoints, color: 5 },
  { name: DXF_LAYER.dimensions, color: 8 },
  { name: DXF_LAYER.paths, color: 4 },
  { name: DXF_LAYER.notes, color: 7 },
  { name: DXF_LAYER.joints, color: 2 },
  { name: DXF_LAYER.slots, color: 4 },
  { name: DXF_LAYER.cylinders, color: 6 },
  { name: DXF_LAYER.annotations, color: 3 },
  { name: DXF_LAYER.labels, color: 7 },
  { name: DXF_LAYER.forces, color: 1 },
  { name: DXF_LAYER.construction, color: 8 },
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
  entities.push(
    ...consolidateWeldedAxes(axes, welded).map((axis): DxfLine => ({
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
      entities.push({
        type: 'LINE',
        layer: DXF_LAYER.cylinders,
        start,
        end,
      });
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
        const axis = slotAxis(joint, point, symbolScale);
        entities.push(axis);
        if (input.includeConstruction !== false) {
          entities.push(...extentTicks(axis, symbolScale, DXF_LAYER.construction));
        }
      }
      const pairedPin = blockPins.has(joint.id) && !(joint instanceof PrisJoint);
      if (!pairedPin && (!(joint instanceof RealJoint) || !joint.isWelded)) {
        // The point is the useful half either way: SolidWorks and Fusion snap
        // and mate to sketch points, so it is drawn whatever the circle is
        // doing. The circle is the part a reader chooses -- nothing, the old
        // 0.08 mark that has to be deleted in CAD, or the hole they will cut.
        entities.push({ type: 'POINT', layer: DXF_LAYER.joints, at: point(joint) });
        const radius =
          choices.jointCircles === 'holes'
            ? (choices.pinDiameter || NEUTRAL_DXF_OPTIONS.pinDiameter) / 2
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
          // What a CAD user needs is which points do not move. The ground
          // *symbol* is a drawing convention; this is the fact behind it.
          entities.push({ type: 'POINT', layer: DXF_LAYER.groundPoints, at: point(joint) });
        }
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

  if (input.includeForces !== false) {
    input.forces
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((force) => {
        const startCoord = {
          x: force.startCoord.x * unitScale,
          y: force.startCoord.y * unitScale,
        };
        entities.push(
          ...forceEntities(
            {
              startCoord,
              endCoord: { x: force.endCoord.x * unitScale, y: force.endCoord.y * unitScale },
            },
            symbolScale,
            DXF_LAYER.forces
          )
        );
        if (input.includeLabels) {
          entities.push({
            type: 'TEXT',
            layer: DXF_LAYER.labels,
            at: {
              x: startCoord.x + 0.12 * symbolScale,
              y: startCoord.y + 0.12 * symbolScale,
            },
            height: 0.22 * symbolScale,
            text: force.name,
          });
        }
      });
  }
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
  if (choices.includeSlotTravel) entities.push(...slotTravelPoints(input.joints, point));

  if (choices.includeDimensions) {
    addDimensions(axes, choices, input.lengthUnit, symbolScale, entities);
  }
  if (choices.includeNotes) {
    addNotes(input, choices, axes, symbolScale, entities);
  }

  // A layer per link, which is the one that changes the reader's day: Fusion
  // makes a sketch per layer and SolidWorks imports them selectively, so this
  // is what lets them get one part per link without separating anything by
  // hand. The shared centreline layer stays defined either way -- everything
  // that is not a link body still lives on it.
  const layers: DxfLayer[] = [...LAYERS];
  if (choices.perLinkLayers) {
    const perLink = new Map<string, string>();
    axes.forEach((axis) => perLink.set(axis.key, layerNameFor(axis.key)));
    perLink.forEach((name) => {
      if (!layers.some((layer) => layer.name === name)) layers.push({ name, color: 7 });
    });
    const axisKeyAt = new Map<string, string>();
    axes.forEach((axis) => axisKeyAt.set(edgeKey(axis.start, axis.end), axis.key));
    entities.forEach((entity) => {
      if (entity.type !== 'LINE' || entity.layer !== DXF_LAYER.links) return;
      const key = axisKeyAt.get(edgeKey(entity.start, entity.end));
      if (key) entity.layer = layerNameFor(key);
    });
  }

  return { layers, entities };
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

/** Both ends of every slot, so its stroke can be modelled rather than guessed. */
function slotTravelPoints(
  joints: Joint[],
  point: (value: { x: number; y: number }) => DxfPoint
): DxfEntity[] {
  return joints
    .filter((joint): joint is PrisJoint => joint instanceof PrisJoint)
    .filter((joint) => joint.isFloating && joint.slotJointA && joint.slotJointB)
    .flatMap((joint): DxfEntity[] => [
      { type: 'POINT', layer: DXF_LAYER.slots, at: point(joint.slotJointA!) },
      { type: 'POINT', layer: DXF_LAYER.slots, at: point(joint.slotJointB!) },
    ]);
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
  choices: { origin: string; jointCircles: string; pinDiameter: number },
  axes: SemanticAxis[],
  scale: number,
  entities: DxfEntity[]
): void {
  const lines = [
    'PMKS+ CAD export - kinematic centerlines from the start pose',
    `Units: ${unitWord(input.lengthUnit)}`,
    `Origin: ${choices.origin === 'model' ? 'as drawn' : 'moved to ' + choices.origin}`,
    choices.jointCircles === 'holes'
      ? `Joint circles are pin holes, ${choices.pinDiameter} ${unitWord(input.lengthUnit)} diameter`
      : 'Joint circles are centre marks, not hole diameters',
    `${axes.length} centreline${axes.length === 1 ? '' : 's'}`,
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
    .flatMap((link) =>
      link.joints.slice(1).map((joint) => ({
        start: point(link.joints[0]),
        end: point(joint),
        startId: link.joints[0].id,
        endId: joint.id,
        key: link.id,
        label: link.name,
      }))
    );
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
