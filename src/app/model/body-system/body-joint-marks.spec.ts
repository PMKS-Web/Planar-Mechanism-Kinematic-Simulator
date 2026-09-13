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
it.each([0, 0.63, 2.4])('keeps a cylinder block at its material mouth at heading %s', (heading) => {
  const f = nativeAxialCarriage('revolute', heading);
  const mark = bodyJointMarks(f.document).find((m) => m.key === f.assembly.internalJoint)!;
  expect(mark.kind).toBe('prismatic');
  expect(mark.point.x).toBeCloseTo(f.origin.x + 3 * Math.cos(heading), 12);
  expect(mark.point.y).toBeCloseTo(f.origin.y + 3 * Math.sin(heading), 12);
  expect(mark.rider).not.toEqual(mark.point);
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
