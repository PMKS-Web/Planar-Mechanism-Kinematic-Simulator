import {
  nativeFourBar,
  nativeFourBarPoint,
} from '../../../test-utils/verification/native-body-fixtures';
import { newRecordId } from './body-id';
import { compileBodyDocument } from './constraint-compiler';
import { localToWorld } from './body-frame';
import { relaxBodyPosition } from './body-position-solver';

describe('native nonlinear body correction', () => {
  it('matches an independently intersected four-bar with redundant rows and reversed construction arrays', () => {
    const { document, driver, witness, bJoint } = nativeFourBar();
    const redundant = {
      ...document,
      joints: [...document.joints, { ...bJoint, id: newRecordId<'joint'>() }],
    };
    for (const candidate of [
      document,
      redundant,
      {
        ...redundant,
        bodies: [...redundant.bodies].reverse(),
        joints: [...redundant.joints].reverse(),
      },
    ]) {
      const compiled = compileBodyDocument(candidate);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
      const system = compiled.system,
        partition = system.partitions[0];
      const seed = new Map([...system.groups].map(([id, group]) => [id, group.pose]));
      for (const angle of [0.3, 0.7, 1.1]) {
        const result = relaxBodyPosition(partition, seed, new Map([[driver.id, angle - 0.7]]));
        if (!result.ok) throw new Error(result.reason);
        const anchor = system.attachments.get(witness)!;
        const actual = localToWorld(result.poses.get(anchor.groupId)!, anchor.point);
        const expected = nativeFourBarPoint(angle);
        expect(actual.x).toBeCloseTo(expected.x, 8);
        expect(actual.y).toBeCloseTo(expected.y, 8);
      }
    }
  });
});
