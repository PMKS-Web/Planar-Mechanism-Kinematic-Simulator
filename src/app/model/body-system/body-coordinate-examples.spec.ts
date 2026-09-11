import { nativeObliqueCylinder } from '../../../test-utils/verification/native-oblique-cylinder-fixture';
import { nativeTranslatingCylinder } from '../../../test-utils/verification/native-translating-cylinder-fixture';
import { nativeRotatingCylinder } from '../../../test-utils/verification/native-rotating-cylinder-fixture';
import { nativeWeldedCylinder } from '../../../test-utils/verification/native-welded-cylinder-fixture';
import {
  insertNativeFixture,
  NATIVE_EDIT_CONTEXT,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import { NativeCylinderExample } from '../../../test-utils/verification/native-cylinder-example';
import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyUnits, SI_UNITS, unitFactors } from './body-units';
import { reverseJoint } from './reverse-joint';
import { localToWorld } from './body-frame';

function check(f: NativeCylinderExample) {
  const source = insertNativeFixture(f.document),
    a = new BodyDocumentAuthority(source);
  for (const target of f.commands) {
    const result = a.commit(
      {
        id: `example-${a.revision}`,
        operations: [{ kind: 'move-coordinate', coordinate: f.driver.coordinate, target }],
      },
      NATIVE_EDIT_CONTEXT.state
    );
    if (!result.ok) throw new Error(JSON.stringify({ target, result }));
    const expected = f.hand(target, 0, 0);
    for (const [id, hand] of expected) {
      const actual = a.document.bodies.find((body) => body.id === id)!;
      expect(actual.pose.x).toBeCloseTo(hand.point.x, 9);
      expect(actual.pose.y).toBeCloseTo(hand.point.y, 9);
      expect(actual.pose.angle).toBeCloseTo(hand.angle.value, 9);
      const { pose: original, ...record } = source.bodies.find((body) => body.id === id)!;
      const { pose, ...changed } = actual;
      expect(changed).toEqual(record);
    }
    const witness = a.document.attachments.find((point) => point.id === f.witness)!;
    const owner = a.document.bodies.find((body) => body.id === witness.bodyId)!;
    const hand = expected.get(owner.id)!;
    const p = localToWorld(owner.pose, witness.point);
    expect(p.x).toBeCloseTo(
      hand.point.x +
        witness.point.x * Math.cos(hand.angle.value) -
        witness.point.y * Math.sin(hand.angle.value),
      9
    );
    expect(p.y).toBeCloseTo(
      hand.point.y +
        witness.point.x * Math.sin(hand.angle.value) +
        witness.point.y * Math.cos(hand.angle.value),
      9
    );
    expect(a.document.attachments).toEqual(source.attachments);
    expect(a.document.joints).toEqual(source.joints);
    expect(a.document.assemblies).toEqual(source.assemblies);
  }
}

describe('native coordinate edits on the worked cylinder examples', () => {
  it('keeps both oblique intersection branches and directed guide choices under construction permutations', () => {
    for (const branch of [1, -1] as const)
      for (const reverse of [false, true])
        for (const early of [false, true]) check(nativeObliqueCylinder(2, branch, reverse, early));
  });
  it('moves the translating bracket while its passive ram keeps its far eye fixed', () => {
    for (const reverse of [false, true])
      for (const early of [false, true]) check(nativeTranslatingCylinder(reverse, early));
  });
  it('carries the floating P block, welded barrel and witness as the grounded carrier turns', () => {
    for (const early of [false, true]) check(nativeRotatingCylinder(early));
  });
  it('keeps the third pinned boom independent of the selected rod/bracket weld', () => {
    for (const early of [false, true]) check(nativeWeldedCylinder(early));
  });
  it('treats travel in document units and respects reversed P order with WORLD on side B', () => {
    const units: BodyUnits[] = [
      SI_UNITS,
      { length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' },
      { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' },
    ];
    for (const unit of units)
      for (const reverse of [false, true]) {
        const f = nativeLinearCarriage(0.3, unit),
          length = unitFactors(unit).length;
        const a = new BodyDocumentAuthority({
          ...f.document,
          joints: reverse ? [reverseJoint(f.guide)] : f.document.joints,
          drivers: reverse
            ? [{ ...f.driver, profile: { ...f.driver.profile, speed: -f.driver.profile.speed } }]
            : f.document.drivers,
        });
        const result = a.commit(
          {
            id: 'ordered-guide',
            operations: [
              {
                kind: 'move-coordinate',
                coordinate: f.driver.coordinate,
                target: (reverse ? -0.6 : 0.6) / length,
              },
            ],
          },
          NATIVE_EDIT_CONTEXT.state
        );
        if (!result.ok) throw new Error(JSON.stringify(result));
        const pose = a.document.bodies.find((body) => body.id === f.body)!.pose;
        expect(pose.x * length).toBeCloseTo(2 + 0.6 * Math.cos(0.4), 10);
        expect(pose.y * length).toBeCloseTo(-1 + 0.6 * Math.sin(0.4), 10);
        expect(pose.angle).toBeCloseTo(0.4, 12);
      }
  });
});
