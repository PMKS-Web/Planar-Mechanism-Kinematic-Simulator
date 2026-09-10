import { BodyId, newRecordId } from './body-id';
import { BodyConstraintRow, BodyRowKind, ConstraintPair } from './compiled-body-system';
import { bodyRowGradient, bodyRowValue } from './body-constraint-rows';
import { compose, Pose } from './body-frame';

const A = 'row-A' as BodyId,
  B = 'row-B' as BodyId;
const kinds: BodyRowKind[] = ['coincidence-x', 'coincidence-y', 'lateral', 'angle', 'travel'];
function row(kind: BodyRowKind): BodyConstraintRow {
  const pair: ConstraintPair = {
    groupA: A,
    groupB: B,
    anchorA: { x: 0.4, y: -0.7 },
    anchorB: { x: -1.3, y: 0.2 },
    axisA: 0.6,
    memberAngleA: -0.2,
    memberAngleB: 0.8,
  };
  return { key: kind, jointId: newRecordId<'joint'>(), kind, pair, zero: 0.37 };
}
function poses(): Map<BodyId, Pose> {
  return new Map([
    [A, { x: 1.2, y: -0.4, angle: 0.9 }],
    [B, { x: -0.3, y: 2.5, angle: -0.8 }],
  ]);
}

describe('native physical constraint rows', () => {
  for (const kind of kinds) {
    it(`differentiates every ${kind} column at unequal, oblique material frames`, () => {
      const constraint = row(kind);
      for (const angle of [-1.7, 0.9, 8 * Math.PI + 0.3]) {
        const sample = poses();
        sample.set(A, { ...sample.get(A)!, angle });
        const gradient = bodyRowGradient(constraint, sample);
        for (const id of [A, B])
          for (const [column, axis] of (['x', 'y', 'angle'] as const).entries()) {
            const delta = 1e-5;
            const plus = new Map(sample),
              minus = new Map(sample);
            const pose = sample.get(id)!;
            plus.set(id, { ...pose, [axis]: pose[axis] + delta });
            minus.set(id, { ...pose, [axis]: pose[axis] - delta });
            const numerical =
              (bodyRowValue(constraint, plus) - bodyRowValue(constraint, minus)) / (2 * delta);
            expect(gradient.get(id)![column]).toBeCloseTo(numerical, 7);
          }
      }
    });
  }

  it('has a linear command partial of minus one for both native drive coordinates', () => {
    for (const kind of ['angle', 'travel'] as const) {
      const commandId = newRecordId<'driver'>();
      const constraint = { ...row(kind), commandId };
      const sample = poses();
      const values = [-2, 0.3, 10].map((value) =>
        bodyRowValue(constraint, sample, new Map([[commandId, value]]))
      );
      expect(values[1] - values[0]).toBeCloseTo(-2.3, 12);
      expect(values[2] - values[1]).toBeCloseTo(-9.7, 12);
      expect(bodyRowGradient(constraint, sample)).toEqual(bodyRowGradient(row(kind), sample));
      expect(() => bodyRowValue(constraint, sample)).toThrow('Missing finite command');
    }
  });

  it('preserves scalar residuals under a rigid world-frame change and keeps angular turns', () => {
    for (const kind of ['lateral', 'travel', 'angle'] as const) {
      const constraint = row(kind);
      const sample = poses();
      const moved = new Map(
        [...sample].map(([id, pose]) => [id, compose({ x: 100, y: -300, angle: 1.6 }, pose)])
      );
      expect(bodyRowValue(constraint, moved)).toBeCloseTo(bodyRowValue(constraint, sample), 11);
    }
    const sample = poses(),
      turned = new Map(sample);
    turned.set(B, { ...sample.get(B)!, angle: sample.get(B)!.angle + 6 * Math.PI });
    expect(bodyRowValue(row('angle'), turned) - bodyRowValue(row('angle'), sample)).toBeCloseTo(
      6 * Math.PI,
      11
    );
  });

  it('sums both member derivative blocks for an internal relationship without dropping its residual', () => {
    const constraint = row('angle');
    const internal = { ...constraint, pair: { ...constraint.pair, groupB: A } };
    expect(bodyRowGradient(internal, poses()).get(A)).toEqual([0, 0, 0]);
    expect(bodyRowValue(internal, poses())).toBeCloseTo(0.8 - -0.2 - 0.37, 12);
  });
});
