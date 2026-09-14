import { BodyFactory } from './body-factory';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyDocument, emptyBodyDocument } from './body-document';
import { createNativeMember } from './body-joint-interaction';
import { createNativeCylinder } from './body-cylinder-creation';
import { bodyCompoundMarks } from './body-compound-marks';
import { bodyJointMarks } from './body-joint-marks';
import { nativeMaterialSkin } from './body-cylinder-skin';
import { rebaseBody } from './rebase-body';
import { localToWorld, add, rotate } from './body-frame';
import { validateBodyDocument } from './body-validation';
import { transformRigidPath } from '../compound-link-path';
import { cylinderCreationLayout } from '../cylinder';
import { PART_COLORS } from '../joint-colors';
import { EditState } from '../edit-permission';

const state: EditState = {
  mode: 'edit',
  playing: false,
  atStart: true,
  sharedStepZero: true,
  solveDeferred: false,
  empty: true,
  runnable: false,
};
it('creates named, massless links in the public palette sequence', () => {
  const authority = new BodyDocumentAuthority(emptyBodyDocument());
  for (let i = 0; i < 3; i++)
    expect(
      authority.commit(
        createNativeMember(authority.document, 'link', { x: 0, y: i }, { x: 2, y: i }),
        state
      ).ok
    ).toBe(true);
  const bodies = authority.document.bodies.filter((body) => body.kind === 'material');
  expect(bodies.map((body) => body.presentation.fill)).toEqual(PART_COLORS.slice(0, 3));
  expect(bodies.map((body) => body.label)).toEqual(['AB', 'CD', 'EF']);
  expect(bodies.map((body) => body.mass.mass)).toEqual(
    bodies.map(() => ({ mode: 'explicit', value: 0 }))
  );
});
it.each([0, 0.7])('creates a ram with the public overlap and rod head at heading %s', (angle) => {
  const before = emptyBodyDocument(),
    from = { x: 1, y: -2 },
    to = add(from, rotate({ x: 4, y: 0 }, angle));
  const result = createNativeCylinder(before, from, to),
    layout = cylinderCreationLayout(from, to, before.settings.objectScale);
  expect(validateBodyDocument(result.document)).toEqual([]);
  expect(result.assembly.dimensions.barrelLength).toBeCloseTo(layout.barrelLength, 12);
  expect(result.assembly.dimensions.rodLength).toBeCloseTo(layout.rodLength, 12);
  const mount = result.document.attachments.find((point) => point.id === result.assembly.rodMount)!;
  const body = result.document.bodies.find((body) => body.id === mount.bodyId)!;
  const end = localToWorld(body.pose, mount.point);
  expect(end.x).toBeCloseTo(to.x, 12);
  expect(end.y).toBeCloseTo(to.y, 12);
  const mark = bodyJointMarks(result.document).find(
    (mark) => mark.key === result.assembly.internalJoint
  )!;
  expect(mark.point.x).toBeCloseTo(layout.pin.x, 12);
  expect(mark.point.y).toBeCloseTo(layout.pin.y, 12);
  const authority = new BodyDocumentAuthority(before);
  expect(authority.commit(createNativeMember(before, 'cylinder', from, to), state).ok).toBe(true);
});
it('keeps both ram skins and its moving head invariant when material frames change', () => {
  const made = createNativeCylinder(emptyBodyDocument(), { x: 1, y: 2 }, { x: 4, y: 6 });
  const before = made.document,
    after = rebaseBody(
      rebaseBody(before, made.assembly.barrel, { x: 0.7, y: -0.8, angle: 0.6 }),
      made.assembly.rod,
      { x: -0.2, y: 0.3, angle: -0.8 }
    );
  for (const id of [made.assembly.barrel, made.assembly.rod]) {
    const worldPath = (document: BodyDocument) => {
      const body = document.bodies.find((body) => body.id === id)!;
      if (body.kind !== 'material') throw new Error('Missing material');
      return transformRigidPath(
        nativeMaterialSkin(document, body),
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        body.pose,
        localToWorld(body.pose, { x: 1, y: 0 })
      );
    };
    const numbers = (path: string) => path.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)!.map(Number);
    numbers(worldPath(before)).forEach((value, index) =>
      expect(numbers(worldPath(after))[index]).toBeCloseTo(value, 7)
    );
  }
  const at = (document: BodyDocument) =>
    bodyJointMarks(document).find((mark) => mark.key === made.assembly.internalJoint)!.point;
  expect(at(after).x).toBeCloseTo(at(before).x, 12);
  expect(at(after).y).toBeCloseTo(at(before).y, 12);
});
it('paints one stable welded contour without hiding or reassigning its material', () => {
  const f = new BodyFactory(),
    a = f.body('AB', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]),
    b = f.body('BC', { x: 2, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 0, y: 2 },
    ]);
  f.joint('weld', f.attachment(a, { x: 2, y: 0 }), f.attachment(b, { x: 0, y: 0 }));
  const before = f.document,
    marks = bodyCompoundMarks(before);
  expect(marks).toHaveLength(1);
  expect(marks[0].members).toHaveLength(2);
  expect(marks[0].path).not.toContain('NaN');
  expect(bodyCompoundMarks({ ...before, bodies: [...before.bodies].reverse() })).toEqual(marks);
  expect(before.bodies.filter((body) => body.kind === 'material')).toHaveLength(2);
});
