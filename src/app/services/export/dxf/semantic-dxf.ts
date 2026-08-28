import { Cylinder, cylinderJoints, sealedCylinderStructures } from '../../../model/cylinder';
import { Force } from '../../../model/force';
import { Joint, PrisJoint, RealJoint } from '../../../model/joint';
import { Link, RealLink, SliderBlock } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { LengthUnit } from '../../../model/unit-enums';
import { DxfDocument, DxfEntity, DxfLine, DxfPoint, DxfUnits } from './dxf-model';
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
  joints: 'PMKS_JOINT_CENTERS',
  slots: 'PMKS_SLOTS',
  cylinders: 'PMKS_CYLINDERS',
  annotations: 'PMKS_KINEMATIC_ANNOTATIONS',
  labels: 'PMKS_LABELS',
  forces: 'PMKS_FORCES',
  construction: 'PMKS_CONSTRUCTION',
} as const;

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
}

const LAYERS = [
  { name: DXF_LAYER.links, color: 7 },
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
  const unitScale = 1 / MODEL_SCALE;
  const symbolScale = centimetersIn(input.lengthUnit);
  const point = (joint: { x: number; y: number }): DxfPoint => ({
    x: joint.x * unitScale,
    y: joint.y * unitScale,
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
        entities.push({ type: 'POINT', layer: DXF_LAYER.joints, at: point(joint) });
        entities.push({
          type: 'CIRCLE',
          layer: DXF_LAYER.joints,
          center: point(joint),
          radius: 0.08 * symbolScale,
        });
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
  return { units: dxfUnits(input.lengthUnit), layers: LAYERS, entities };
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

function centimetersIn(unit: LengthUnit): number {
  if (unit === LengthUnit.INCH) return 1 / 2.54;
  if (unit === LengthUnit.METER) return 0.01;
  return 1;
}

function dxfUnits(unit: LengthUnit): DxfUnits {
  if (unit === LengthUnit.INCH) return 'in';
  if (unit === LengthUnit.METER) return 'm';
  return 'cm';
}
