import { nativeAxialCylinderExample } from '../../../test-utils/verification/native-axial-cylinder-example';
import { nativeObliqueCylinder } from '../../../test-utils/verification/native-oblique-cylinder-fixture';
import { nativeTranslatingCylinder } from '../../../test-utils/verification/native-translating-cylinder-fixture';
import { nativeRotatingCylinder } from '../../../test-utils/verification/native-rotating-cylinder-fixture';
import { nativeWeldedCylinder } from '../../../test-utils/verification/native-welded-cylinder-fixture';
import { checkNativeCylinderExample } from '../../../test-utils/verification/check-native-cylinder-example';

describe('native cylinder worked examples', () => {
  it('drives an axial carriage on a fixed guide with pinned and welded rod mounts', () => {
    for (const connection of ['revolute', 'weld'] as const)
      for (const reverse of [false, true])
        checkNativeCylinderExample(
          nativeAxialCylinderExample(connection, reverse ? -1.1 : 0.4),
          reverse
        );
  });
  it('keeps both signed roots of an oblique guide, including near tangency and reversed guide labels', () => {
    for (const branch of [1, -1] as const)
      for (const reverse of [false, true])
        checkNativeCylinderExample(nativeObliqueCylinder(2, branch, reverse, reverse), reverse);
    checkNativeCylinderExample(nativeObliqueCylinder(3.2), true);
  });
  it('translates the welded bracket while its passive rod eye remains fixed', () => {
    for (const reverse of [false, true])
      checkNativeCylinderExample(nativeTranslatingCylinder(reverse, reverse), reverse);
  });
  it('carries the barrel along a rotating guide with off-axis boundary and witness points', () => {
    for (const reverse of [false, true])
      checkNativeCylinderExample(nativeRotatingCylinder(reverse), reverse);
  });
  it('welds a bracket to the rod while leaving the third body at their coincident pin free to turn', () => {
    for (const reverse of [false, true])
      checkNativeCylinderExample(nativeWeldedCylinder(reverse), reverse);
  });
});
