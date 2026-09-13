import { nativeLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { bodyAnchorClock } from './body-anchor-recovery';
import { nativeRotaryCarriage } from '../../../test-utils/verification/native-rotary-carriage-fixture';
import { BodyDocumentAuthority } from './body-document-authority';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';

describe('native re-anchored clock selection', () => {
  it('does not publish a nonlooping window through a passive gap even when both endpoints are feasible', () => {
    for (const radius of [0.8, 1]) {
      const f = nativeRotaryCarriage(),
        authority = new BodyDocumentAuthority(f.document);
      const result = authority.commit(
        {
          id: 'radius',
          operations: [
            {
              kind: 'move-point',
              attachmentId: f.tip,
              target: { x: radius * Math.cos(0.4), y: radius * Math.sin(0.4) },
            },
          ],
        },
        NATIVE_EDIT_CONTEXT.state
      );
      if (!result.ok) throw new Error(result.message);
      const document = authority.document,
        compiled = compileBodyDocument(document);
      if (!compiled.ok) throw new Error('Expected compiled carriage');
      const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
      if (!admitted.ok) throw new Error(admitted.reason);
      const displayed = {
        ...document,
        bodies: document.bodies.map((body) =>
          body.id === f.crank
            ? { ...body, pose: { ...body.pose, angle: 2.8 } }
            : body.id === f.carriage
              ? { ...body, pose: { ...body.pose, y: radius * Math.sin(2.8) } }
              : body
        ),
      };
      const clock = bodyAnchorClock(admitted, compiled.system, displayed, 2.4, 1, 1, 'window');
      if (radius === 1) expect(clock).toBeUndefined();
      else expect(clock!.time).toBeCloseTo(2.4, 10);
    }
  });
  it('returns the matching unwrapped material frames when a negative cycle names the pose on another turn', () => {
    const f = nativeLoadedRod();
    const document = {
      ...f.document,
      drivers: [{ ...f.driver, profile: { ...f.driver.profile, speed: -3 } }],
    };
    const compiled = compileBodyDocument(document);
    if (!compiled.ok) throw new Error('Expected compiled rod');
    const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
    if (!admitted.ok) throw new Error(admitted.reason);
    const displayed = {
      ...document,
      bodies: document.bodies.map((body) =>
        body.id === f.body ? { ...body, pose: { ...body.pose, angle: 1 } } : body
      ),
    };
    const clock = bodyAnchorClock(admitted, compiled.system, displayed, 0.6, -1, 1, 'cycle');
    expect(clock).toBeDefined();
    expect(clock!.command).toBeCloseTo(0.6 - 2 * Math.PI, 11);
    expect(clock!.time).toBeCloseTo((2 * Math.PI - 0.6) / 3, 11);
    expect(clock!.direction).toBe(-1);
    expect(clock!.poses!.get(f.body)!.angle).toBeCloseTo(1 - 2 * Math.PI, 11);
    expect(clock!.poses!.get(f.body)!.angle - f.angle).toBeCloseTo(clock!.command, 11);
  });
});
