import { BodyFactory } from './body-factory';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { nativeRotatingCylinder } from '../../../test-utils/verification/native-rotating-cylinder-fixture';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { bodyMotionPoses, bodyMotionBounds } from './body-motion-marks';
import { selectSimulationView } from './simulation-view';
import { simulationBodyPose } from './simulation-body-readers';
import { unitFactors } from './body-units';

it.each([nativeAxialCarriage, nativeRotatingCylinder])(
  'motion framing uses the same material transforms as displayed samples',
  (fixture) => {
    const document = fixture().document;
    const result = buildSimulationSnapshot(document, 0, {
      mode: 'static',
      gravity: { x: 0, y: 0 },
    });
    if (!result.ok) throw new Error('Fixture did not compile');
    const snapshot = result.snapshot;
    const parts = [...snapshot.partitions.values()].filter((p) => p.ok);
    expect(parts.length).toBeGreaterThan(0);
    const factors = unitFactors(document.units);
    for (const body of document.bodies) {
      if (body.kind !== 'material') continue;
      const poses = bodyMotionPoses(snapshot, body.id);
      expect(poses.length).toBeGreaterThan(0);
      for (const i of new Set([0, Math.floor((poses.length - 1) / 2), poses.length - 1])) {
        const view = selectSimulationView(snapshot, {
          revision: 0,
          indices: new Map(parts.map((p) => [p.key, i])),
        });
        if (!view.ok) throw new Error('Missing view');
        const actual = simulationBodyPose(view.value, body.id);
        if (!actual.ok) throw new Error('Missing body');
        expect(poses[i].x * factors.length).toBeCloseTo(actual.value.x, 10);
        expect(poses[i].y * factors.length).toBeCloseTo(actual.value.y, 10);
        expect(poses[i].angle).toBeCloseTo(actual.value.angle, 10);
      }
    }
    expect(bodyMotionBounds(document, snapshot)).toHaveLength(2);
  }
);

it('leaves marker padding to the shared viewport instead of applying it twice', () => {
  const factory = new BodyFactory();
  factory.body(
    'AB',
    { x: 2, y: 3, angle: 0 },
    [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ],
    0.8
  );
  expect(bodyMotionBounds(factory.document)).toEqual([
    { x: 2, y: 3 },
    { x: 6, y: 3 },
  ]);
});
