import { CylinderAssembly } from './assembly-record';
import { BodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { localToWorld, Pose } from './body-frame';
import { newRecordId } from './body-id';

export interface CylinderDimensions {
  readonly barrelLength: number;
  readonly rodLength: number;
  readonly bore: number;
  readonly rodDiameter: number;
  readonly stroke: number;
}

/** Travel is internal P displacement; symbol scale and outer attachment locations do not define it. */
export function createBodyCylinder(
  document: BodyDocument,
  pose: Pose,
  dimensions: CylinderDimensions,
  travel = 0,
  label = 'Cylinder'
): { readonly document: BodyDocument; readonly assembly: CylinderAssembly } {
  const { barrelLength, rodLength, bore, rodDiameter, stroke } = dimensions;
  if (
    !Object.values(dimensions).every((v) => Number.isFinite(v) && v > 0) ||
    rodDiameter >= bore ||
    rodLength > barrelLength ||
    stroke >= rodLength ||
    !Number.isFinite(travel) ||
    travel < 0 ||
    travel > stroke
  )
    throw new Error('Invalid cylinder dimensions or travel');
  const f = new BodyFactory(document);
  const barrel = f.body(
    'Barrel',
    pose,
    [
      { x: 0, y: 0 },
      { x: barrelLength, y: 0 },
    ],
    bore
  );
  const offset = barrelLength - rodLength;
  const rodPose = { ...localToWorld(pose, { x: offset + travel, y: 0 }), angle: pose.angle };
  const rod = f.body(
    'Rod',
    rodPose,
    [
      { x: 0, y: 0 },
      { x: rodLength, y: 0 },
    ],
    rodDiameter
  );
  const barrelMount = f.attachment(barrel, { x: 0, y: 0 });
  const rodMount = f.attachment(rod, { x: rodLength, y: 0 });
  const internal = f.joint(
    'prismatic',
    f.attachment(barrel, { x: offset, y: 0 }),
    f.attachment(rod, { x: 0, y: 0 }),
    pose.angle
  );
  const limit = {
    id: newRecordId<'limit'>(),
    coordinate: { jointId: internal.id, coordinate: 'travel' as const },
    lower: 0,
    upper: stroke,
  };
  const assembly: CylinderAssembly = {
    id: newRecordId<'assembly'>(),
    kind: 'cylinder',
    label,
    barrel,
    rod,
    barrelMount,
    rodMount,
    internalJoint: internal.id,
    strokeLimit: limit.id,
    dimensions: { barrelLength, rodLength, bore, rodDiameter },
  };
  return {
    document: {
      ...f.document,
      joints: f.document.joints.map((joint) =>
        joint.id === internal.id
          ? {
              ...joint,
              travelZero: 0,
              guideDisplay: { bodyId: barrel, frame: joint.frameA, station: rodLength },
            }
          : joint
      ),
      assemblies: [...document.assemblies, assembly],
      limits: [...document.limits, limit],
    },
    assembly,
  };
}
