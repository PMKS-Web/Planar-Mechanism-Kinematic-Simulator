import { jointCoordinate } from '../../app/model/body-system/joint-coordinate';
import { createBodyCylinder } from '../../app/model/body-system/cylinder-factory';
import { WORLD, newRecordId } from '../../app/model/body-system/body-id';
import { emptyBodyDocument } from '../../app/model/body-system/body-document';
import { BodyFactory } from '../../app/model/body-system/body-factory';
import { BodyDocument } from '../../app/model/body-system/body-document';
import { nativeEditableFourBar } from './native-geometry-fixture';
import { nativeTwinCranksOnPinnedFrame } from './native-fixed-frame-fixtures';
import { nativeAxialCarriage } from './native-cylinder-fixtures';
import { nativeRotatingCylinder } from './native-rotating-cylinder-fixture';
import { nativeObliqueCylinder } from './native-oblique-cylinder-fixture';
import { nativeTranslatingCylinder } from './native-translating-cylinder-fixture';
import { nativeWeldedCylinder } from './native-welded-cylinder-fixture';

export function nativeMultiwayPin() {
  const f = new BodyFactory();
  const members = [0, 0.8, 1.8].map((angle, i) =>
    f.body(
      `Link ${i + 1}`,
      { x: 0, y: 0, angle },
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
      0.25
    )
  );
  const junction = f.junction(members, { x: 0, y: 0 });
  return { document: f.document, members, junction };
}

/** A driven rod meets a slot on a grounded line or a freely rotating carrier. */
export function nativeCylinderMountSlot(floating: boolean) {
  const cylinder = createBodyCylinder(
    emptyBodyDocument(),
    { x: 0, y: 0, angle: 0 },
    { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
    0.4
  );
  const f = new BodyFactory(cylinder.document),
    assembly = cylinder.assembly;
  f.joint('weld', f.attachment(WORLD, { x: 0, y: 0 }), assembly.barrelMount);
  let carrier = WORLD,
    angle = 0,
    point = { x: 0, y: 0 };
  if (floating) {
    angle = Math.atan2(1, 0.4);
    carrier = f.body(
      'Slotted carrier',
      { x: 3, y: -1, angle },
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      0.35
    );
    point = { x: 0, y: 0 };
    f.joint('revolute', f.attachment(WORLD, { x: 3, y: -1 }), f.attachment(carrier, point));
    f.attachment(carrier, { x: 1, y: 0.5 }, 'Carrier witness');
  }
  const slot = f.joint('pin-in-slot', f.attachment(carrier, point), assembly.rodMount, angle);
  return {
    ...f.document,
    joints: f.document.joints.map((j) =>
      j.id === slot.id
        ? {
            ...j,
            guideDisplay: { bodyId: carrier, frame: j.frameA, from: 0, to: floating ? 2 : 5 },
          }
        : j
    ),
    drivers: [
      {
        id: newRecordId<'driver'>(),
        coordinate: { jointId: assembly.internalJoint, coordinate: 'travel' as const },
        profile: { kind: 'constant-speed' as const, initial: 0.4, speed: 0.2 },
      },
    ],
  };
}

/** The same carrier can be operated by the ram instead of its crank. */
export function nativeRamDrivenCarrier() {
  const f = nativeRotatingCylinder(),
    d = f.document;
  const joint = d.joints.find((j) => j.id === f.assembly.internalJoint)!;
  const initial = jointCoordinate(
    joint,
    'travel',
    new Map(d.bodies.map((b) => [b.id, b.pose])),
    new Map(d.attachments.map((a) => [a.id, a]))
  );
  return {
    ...d,
    drivers: [
      {
        ...f.driver,
        coordinate: { jointId: joint.id, coordinate: 'travel' as const },
        profile: { kind: 'constant-speed' as const, initial, speed: 0.2 },
      },
    ],
  };
}

/** Native URLs are separate until S6: opening a development fixture cannot switch the public editor. */
export const NATIVE_EDITOR_FIXTURES: readonly {
  key: string;
  name: string;
  create: () => BodyDocument;
}[] = [
  { key: 'four-bar', name: 'Four-bar', create: () => nativeEditableFourBar().document },
  { key: 'rotating-p-drive', name: 'Ram-driven rotating carrier', create: nativeRamDrivenCarrier },
  {
    key: 'mount-slot-grounded',
    name: 'Cylinder mount in a grounded slot',
    create: () => nativeCylinderMountSlot(false),
  },
  {
    key: 'mount-slot-floating',
    name: 'Cylinder mount in a rotating slot',
    create: () => nativeCylinderMountSlot(true),
  },
  { key: 'axial', name: 'Axial cylinder carriage', create: () => nativeAxialCarriage().document },
  {
    key: 'welded-axial',
    name: 'Welded axial carriage',
    create: () => nativeAxialCarriage('weld').document,
  },
  {
    key: 'rotating',
    name: 'Cylinder on a rotating carrier',
    create: () => nativeRotatingCylinder().document,
  },
  {
    key: 'oblique',
    name: 'Oblique guide intersection',
    create: () => nativeObliqueCylinder().document,
  },
  {
    key: 'translating',
    name: 'Cylinder on a translating bracket',
    create: () => nativeTranslatingCylinder().document,
  },
  { key: 'welded', name: 'Welded cylinder bracket', create: () => nativeWeldedCylinder().document },
  {
    key: 'two-clocks',
    name: 'Two independent cranks',
    create: () => nativeTwinCranksOnPinnedFrame().document,
  },
  { key: 'multiway', name: 'Three links at one pin', create: () => nativeMultiwayPin().document },
];
