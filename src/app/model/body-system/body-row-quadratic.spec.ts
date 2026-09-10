import { BodyId, newRecordId } from './body-id';
import { Pose } from './body-frame';
import { BodyConstraintRow, BodyRowKind } from './compiled-body-system';
import { bodyRowGradient, bodyRowValue } from './body-constraint-rows';
import { bodyRowQuadratic } from './body-row-quadratic';

const a = 'curve-a' as BodyId,
  b = 'curve-b' as BodyId;

describe('native analytic quadratic terms', () => {
  for (const kind of [
    'coincidence-x',
    'coincidence-y',
    'lateral',
    'angle',
    'travel',
  ] as BodyRowKind[]) {
    it(`matches an independent curved path for ${kind}, including boundary and command acceleration`, () => {
      const commandId = newRecordId<'driver'>();
      const row: BodyConstraintRow = {
        key: kind,
        jointId: newRecordId<'joint'>(),
        kind,
        zero: -0.8,
        ...(kind === 'travel' || kind === 'angle' ? { commandId } : {}),
        pair: {
          groupA: a,
          groupB: b,
          anchorA: { x: 0.3, y: -1.7 },
          anchorB: { x: -0.6, y: 0.4 },
          axisA: 0.8,
          memberAngleA: 0.7,
          memberAngleB: -0.2,
        },
      };
      const initial = new Map<BodyId, Pose>([
        [a, { x: -0.2, y: 1.3, angle: 0.7 }],
        [b, { x: 2.8, y: -0.7, angle: -0.4 }],
      ]);
      const velocity = new Map([
        [a, { vx: 1.4, vy: -2.1, omega: 0.9 }],
        [b, { vx: -0.8, vy: 1.9, omega: -1.3 }],
      ]);
      const acceleration = new Map([
        [a, { x: -1.8, y: 0.4, angle: 1.7 }],
        [b, { x: 0.6, y: -2.3, angle: -0.8 }],
      ]);
      const valueAt = (t: number) => {
        const poses = new Map(
          [...initial].map(([id, pose]) => {
            const v = velocity.get(id)!,
              acc = acceleration.get(id)!;
            return [
              id,
              {
                x: pose.x + v.vx * t + 0.5 * acc.x * t * t,
                y: pose.y + v.vy * t + 0.5 * acc.y * t * t,
                angle: pose.angle + v.omega * t + 0.5 * acc.angle * t * t,
              },
            ];
          })
        );
        return bodyRowValue(row, poses, new Map([[commandId, 0.2 - 3 * t + 0.5 * 2.7 * t * t]]));
      };
      let expected = bodyRowQuadratic(row, initial, velocity);
      for (const [id, gradient] of bodyRowGradient(row, initial)) {
        const acc = acceleration.get(id)!;
        expected += gradient[0] * acc.x + gradient[1] * acc.y + gradient[2] * acc.angle;
      }
      if (row.commandId) expected -= 2.7;
      for (const h of [3e-4, 1e-4]) {
        const numerical = (valueAt(h) - 2 * valueAt(0) + valueAt(-h)) / (h * h);
        expect(numerical).toBeCloseTo(expected, 4);
      }
    });
  }
});
