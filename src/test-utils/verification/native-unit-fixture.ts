import { nativeWeldedLoadedRod } from './native-force-fixtures';
import { BodyFactory } from '../../app/model/body-system/body-factory';
import { BodyDocument } from '../../app/model/body-system/body-document';
import { newRecordId } from '../../app/model/body-system/body-id';
import { captureLoadScope } from '../../app/model/body-system/load-provenance';
import { compileWeldFrames } from '../../app/model/body-system/weld-frames';

/** A welded load scope and two area-based materials exercise different dimensional conventions in one document. */
export function nativeUnitFixture() {
  const f = nativeWeldedLoadedRod(),
    factory = new BodyFactory(f.document);
  const rod = f.document.bodies.find((body) => body.id === f.body)!;
  const bracket = f.document.bodies.find((body) => body.id === f.bracket)!;
  if (
    rod.kind !== 'material' ||
    rod.geometry.kind !== 'bar' ||
    bracket.kind !== 'material' ||
    bracket.geometry.kind !== 'bar'
  )
    throw new Error('Expected bars');
  const bracketVertices = bracket.geometry.vertices;
  const tip = factory.vertexAttachment(f.body, rod.geometry.vertices[1].id);
  const disk = factory.body('Density disk', { x: 20, y: 3, angle: 0.2 }, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  const triangle = factory.body('Density triangle', { x: 25, y: -2, angle: -0.3 }, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  const compiled = compileWeldFrames(factory.document);
  if (!compiled.ok) throw new Error(compiled.code);
  const document: BodyDocument = {
    ...factory.document,
    limits: [{ id: newRecordId<'limit'>(), coordinate: f.driver.coordinate, lower: -1, upper: 2 }],
    settings: {
      ...factory.document.settings,
      forceUnit: 'kgf',
      objectScale: 0.8,
      defaultDrive: { angular: -2, linear: 0.3 },
    },
    bodies: factory.document.bodies.map((body) =>
      body.kind === 'world'
        ? body
        : body.id === disk
          ? {
              ...body,
              geometry: { kind: 'circle', center: { x: 0.5, y: -0.2 }, radius: 2 },
              mass: { ...body.mass, mass: { mode: 'density', value: 4 } },
            }
          : body.id === triangle
            ? {
                ...body,
                geometry: {
                  kind: 'polygon',
                  vertices: [
                    { id: newRecordId<'vertex'>(), x: 0, y: 0 },
                    { id: newRecordId<'vertex'>(), x: 3, y: 0 },
                    { id: newRecordId<'vertex'>(), x: 0, y: 2 },
                  ],
                },
                mass: { ...body.mass, mass: { mode: 'density', value: 2 } },
              }
            : body.id === f.bracket
              ? {
                  ...body,
                  locked: true,
                  mass: {
                    ...body.mass,
                    inertia: { mode: 'explicit', value: 5 },
                    center: {
                      mode: 'explicit',
                      point: { x: 0.3, y: 0.2 },
                      editAnchor: { attachmentId: f.weld.frameB.attachmentId },
                      editAxis: [bracketVertices[0].id, bracketVertices[1].id],
                    },
                  },
                }
              : body
    ),
    groups: [
      {
        members: [f.body, f.bracket],
        frameBody: f.body,
        label: 'Unit bracket',
        mass: {
          mass: 7,
          inertia: 8,
          center: { point: { x: 0.6, y: 0.2 }, editAnchor: { attachmentId: tip } },
        },
      },
    ],
    forces: factory.document.forces.map((load) => ({
      ...load,
      locked: true,
      presentation: { color: '#456789', length: 1.2, zeroAngle: 0.7 },
      legacyGroupScope: captureLoadScope(compiled.groupOf.get(f.bracket)!, f.bracket, [
        f.body,
        f.bracket,
      ]),
    })),
    holds: [
      {
        bodyId: f.body,
        from: f.document.joints[0].frameB.attachmentId,
        to: tip,
        length: 2,
        angle: 0.4,
      },
    ],
    locks: [tip],
    synthesis: {
      stage: 'working',
      length: 2,
      reference: 'center',
      endsOnly: false,
      allowDefect: false,
      constrain: true,
      poses: [{ x: 1, y: 2, angle: 0.3 }],
      region: { x: -1, y: -2, width: 6, height: 5 },
      generated: {
        bodies: [f.body, f.bracket],
        joints: [f.weld.id],
        attachments: [{ id: tip, at: { x: 2 * Math.cos(0.4), y: 2 * Math.sin(0.4) } }],
        partial: false,
      },
    },
    view: {
      camera: { center: { x: 2, y: -1 }, span: 10 },
      backdrop: {
        asset: 'assets/backdrops/backhoe-arm.svg',
        label: 'Arm',
        center: { x: 3, y: 4 },
        width: 8,
        angle: 0.2,
        opacity: 0.5,
      },
    },
  };
  return { ...f, document, tip, disk, triangle };
}
