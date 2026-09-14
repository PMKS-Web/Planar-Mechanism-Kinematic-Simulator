import { reverseJoint } from './reverse-joint';
import { BodyFactory } from './body-factory';
import { WORLD } from './body-id';
import { nativeCylinderMountSlot } from '../../../test-utils/verification/native-editor-fixtures';
import { nativeMaterialSkin } from './body-cylinder-skin';
import { bodyJointMarks } from './body-joint-marks';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { nativeMultiwayPin } from '../../../test-utils/verification/native-editor-fixtures';
import { nativeCommand } from './body-joint-interaction';
import { BodyDocumentAuthority } from './body-document-authority';
import { EditState } from '../edit-permission';

const state: EditState = {
  mode: 'edit',
  playing: false,
  atStart: true,
  sharedStepZero: true,
  solveDeferred: false,
  empty: false,
  runnable: true,
};
it.each([0, 0.63, 2.4])('keeps the cylinder head on its moving rod at heading %s', (heading) => {
  const f = nativeAxialCarriage('revolute', heading);
  const mark = bodyJointMarks(f.document).find((m) => m.key === f.assembly.internalJoint)!;
  expect(mark.kind).toBe('prismatic');
  expect(mark.point.x).toBeCloseTo(f.origin.x + 1.4 * Math.cos(heading), 12);
  expect(mark.point.y).toBeCloseTo(f.origin.y + 1.4 * Math.sin(heading), 12);
  expect(mark.rider).toEqual(mark.point);
  expect(mark.target).toEqual({ kind: 'assembly', id: f.assembly.id });
});
it('draws one pin and an explicit two-member weld without absorbing the third member', () => {
  const f = nativeMultiwayPin(),
    authority = new BodyDocumentAuthority(f.document);
  expect(bodyJointMarks(f.document).filter((m) => m.kind === 'revolute')).toHaveLength(1);
  expect(
    authority.commit(
      nativeCommand({ kind: 'joint-kind', jointId: f.junction.joints[0], jointKind: 'weld' }),
      state
    ).ok
  ).toBe(true);
  const marks = bodyJointMarks(authority.document);
  expect(marks.filter((m) => m.kind === 'weld')).toHaveLength(1);
  expect(marks.filter((m) => m.kind === 'revolute')).toHaveLength(1);
  expect(authority.document.bodies).toEqual(f.document.bodies);
});
it('renders a cylinder bore independently of its connected bracket', () => {
  const f = nativeAxialCarriage('weld');
  const barrel = f.document.bodies.find((b) => b.id === f.assembly.barrel)!;
  if (barrel.kind !== 'material') throw new Error('Missing barrel');
  const before = nativeMaterialSkin(f.document, barrel);
  const withoutBracket = {
    ...f.document,
    bodies: f.document.bodies.filter((b) => b.id !== f.carriage),
  };
  expect(nativeMaterialSkin(withoutBracket, barrel)).toBe(before);
});

it('keeps a grounded slot support on its guide when the cylinder-end pin travels', () => {
  const f = { document: nativeCylinderMountSlot(false) };
  const slot = f.document.joints.find((j) => j.kind === 'pin-in-slot')!;
  const before = bodyJointMarks(f.document).find((m) => m.key === slot.id)!;
  const moved = {
    ...f.document,
    bodies: f.document.bodies.map((b) =>
      b.id === slot.bodyB ? { ...b, pose: { ...b.pose, x: b.pose.x + 0.3 } } : b
    ),
  };
  const after = bodyJointMarks(moved).find((m) => m.key === slot.id)!;
  expect(after.groundPoint).toEqual(before.groundPoint);
  expect(after.point.x).toBeCloseTo(before.point.x + 0.3, 12);
});

it.each([0, 0.63])(
  'keeps external P artwork and drag direction invariant under equation reversal at %s',
  (heading) => {
    const f = new BodyFactory();
    const member = f.body(
      'Carriage',
      { x: 2 * Math.cos(heading), y: 2 * Math.sin(heading), angle: heading },
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      0.2
    );
    const a = f.attachment(WORLD, { x: 0, y: 0 }),
      b = f.attachment(member, { x: 0, y: 0 });
    const j = f.joint('prismatic', a, b, heading);
    const mark = bodyJointMarks(f.document)[0];
    const reversed = bodyJointMarks({ ...f.document, joints: [reverseJoint(j)] })[0];
    expect(reversed.point).toEqual(mark.point);
    expect(reversed.rider).toEqual(mark.rider);
    expect(reversed.groundPoint).toEqual(mark.groundPoint);
    expect(reversed.guide).toEqual(mark.guide);
    expect(reversed.coordinateAxis!.x).toBeCloseTo(-mark.coordinateAxis!.x, 12);
    expect(reversed.coordinateAxis!.y).toBeCloseTo(-mark.coordinateAxis!.y, 12);
    expect(mark.guide).toHaveLength(2);
    expect(
      mark.guide![1].x * Math.cos(heading) + mark.guide![1].y * Math.sin(heading)
    ).toBeGreaterThan(2);
  }
);
