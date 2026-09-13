import { nativeEditableBar } from '../../../test-utils/verification/native-geometry-fixture';
import { bodyBarHoldPair } from './body-bar-hold';
import { editBodyMarks } from './body-edit-marks';

it('holds the displayed bar endpoints when incidental attachments are enumerated first', () => {
  const f = nativeEditableBar();
  const document = { ...f.document, attachments: [...f.document.attachments].reverse() };
  expect(bodyBarHoldPair(document, f.body.id)).toEqual({ from: f.a, to: f.b });
});
it('length and angle holds can be enabled and removed independently', () => {
  const f = nativeEditableBar();
  let document = f.document;
  const toggle = (dimension: 'length' | 'angle', enabled: boolean) => {
    const result = editBodyMarks(document, {
      kind: 'hold',
      bodyId: f.body.id,
      from: f.a,
      to: f.b,
      dimension,
      enabled,
    });
    if (!result.ok) throw new Error(result.message);
    document = result.document;
  };
  toggle('length', true);
  toggle('angle', true);
  expect(document.holds[0]).toMatchObject({ length: 10, angle: 0 });
  toggle('length', false);
  expect(document.holds[0].length).toBeUndefined();
  expect(document.holds[0].angle).toBe(0);
  toggle('angle', false);
  expect(document.holds).toHaveLength(0);
});
