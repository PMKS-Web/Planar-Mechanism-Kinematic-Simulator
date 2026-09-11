import { createBodyEditModel } from './body-edit-model';
import { pointEditRows } from './body-point-rows';
import { compileWeldFrames } from './weld-frames';
import { BodyDocument } from './body-document';
import { AttachmentId, newRecordId } from './body-id';
import { nativeThreeCylinders } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { nativeEditableBar } from '../../../test-utils/verification/native-geometry-fixture';
import { BodyFactory } from './body-factory';

function check(document: BodyDocument, target: AttachmentId) {
  const welds = compileWeldFrames(document);
  if (!welds.ok) throw new Error('Expected weld frames');
  const model = createBodyEditModel(document, target, welds.groups, welds.groupOf);
  const values = Array.from({ length: model.width }, (_, i) => Math.sin(i + 1) * 0.07);
  const rows = pointEditRows(model, values, model.origin);
  expect(rows.length).toBeGreaterThan(2);
  for (let column = 0; column < values.length; column++) {
    const plus = [...values],
      minus = [...values],
      h = 1e-6;
    plus[column] += h;
    minus[column] -= h;
    const a = pointEditRows(model, plus, model.origin),
      b = pointEditRows(model, minus, model.origin);
    rows.forEach((row, i) =>
      expect(row.gradient[column]).toBeCloseTo((a[i].value - b[i].value) / (2 * h), 7)
    );
  }
  return model;
}
describe('native mixed geometry/pose edit Jacobians', () => {
  it('differentiates oblique cylinder R/P constraints and a travel drive including moving guide direction', () => {
    const f = nativeThreeCylinders();
    check(
      {
        ...f.document,
        drivers: [
          {
            id: newRecordId<'driver'>(),
            coordinate: { jointId: f.cylinders[0].internalJoint, coordinate: 'travel' },
            profile: { kind: 'constant-speed', initial: 0.4, speed: 1 },
          },
        ],
      },
      f.cylinders[0].barrelMount
    );
  });
  it('differentiates held length and direction against changing local endpoints', () => {
    const f = nativeEditableBar();
    const model = check(
      {
        ...f.document,
        // Unbound held points can change locally; holding a bar's actual ends makes it rigid.
        attachments: f.document.attachments.map(({ vertexId, ...point }) => point),
        holds: [{ bodyId: f.body.id, from: f.a, to: f.b, length: 10, angle: 0 }],
      },
      f.b
    );
    expect(model.width).toBe(4);
    expect(model.angularColumns).toEqual([]);
  });
  it('differentiates a pin-in-slot with variable guide geometry and a rotating rider', () => {
    const f = new BodyFactory();
    const carrier = f.body('Carrier', { x: 0, y: 0, angle: 0.4 }, [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    const rider = f.body('Rider', { x: 0, y: 0, angle: 0.9 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const a = f.attachment(carrier, { x: 0, y: 0 }),
      b = f.attachment(rider, { x: 0, y: 0 });
    f.joint('pin-in-slot', a, b, 0.4);
    check(f.document, a);
  });
});
