import { nativeRotatingCylinder } from '../../../test-utils/verification/native-rotating-cylinder-fixture';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { bodyAnchorTurns } from './body-anchor-turns';
import { bodyAnchorMaterialPoses } from './body-anchor-material-poses';
import { bodyRowValue } from './body-constraint-rows';
import { executeNativeEdit } from '../../../test-utils/verification/native-lifecycle-fixtures';

describe('native anchor integer turns', () => {
  it('carries a floating P carrier, welded bracket, barrel and rod through one coherent turn', () => {
    for (const carrierFirst of [false, true]) {
      const f = nativeRotatingCylinder(carrierFirst),
        compiled = compileBodyDocument(f.document);
      if (!compiled.ok) throw new Error('Expected compiled ram');
      const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
      if (!admitted.ok) throw new Error(admitted.reason);
      const part = admitted.frame.partition,
        moving = new Set(part.unknowns);
      // Newly inserted cylinder members have no old angle to wrap independently.
      const source = executeNativeEdit(f.document, [
        { kind: 'delete', targets: [{ kind: 'assembly', id: f.assembly.id }] },
      ]);
      const advanced = new Map(
        [...admitted.poses].map(
          ([id, pose]) =>
            [id, { ...pose, angle: pose.angle + (moving.has(id) ? 2 * Math.PI : 0) }] as const
        )
      );
      const restored = bodyAnchorTurns(
        compiled.system,
        admitted.frame,
        source,
        advanced,
        2 * Math.PI,
        0,
        1
      )!;
      const material = bodyAnchorMaterialPoses(compiled.system, admitted.frame, restored, 1);
      const hand = f.hand(0, 0, 0);
      for (const [id, pose] of material) {
        expect(pose.x).toBeCloseTo(hand.get(id)!.point.x, 9);
        expect(pose.y).toBeCloseTo(hand.get(id)!.point.y, 9);
        expect(pose.angle).toBeCloseTo(hand.get(id)!.angle.value, 9);
      }
      for (const row of part.rows)
        expect(bodyRowValue(row, restored, new Map([[f.driver.id, 0]]))).toBeCloseTo(0, 9);
    }
  });
});
