import { nativeObliqueCylinder } from '../../../test-utils/verification/native-oblique-cylinder-fixture';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { initialBodyContinuation, advanceBodyCommand } from './body-continuation';
import { inspectBodyInterval } from './body-interval';
import { buildBodyCycle } from './body-cycle';
import { findBodyFold } from './body-fold';
import { newRecordId, WORLD } from './body-id';
import { BodyDocument } from './body-document';

function setup(document: BodyDocument) {
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
  if (!admitted.ok) throw new Error(admitted.reason);
  return admitted;
}
describe('F2: exact and near-fold sample contacts', () => {
  it('retains the positive fold proof at the requested command but rejects a fold still beyond it', () => {
    const f = nativeObliqueCylinder(3.2),
      a = setup(f.document);
    const advanced = advanceBodyCommand(a, initialBodyContinuation(a), 0.24);
    if (!advanced.ok) throw new Error(advanced.reason);
    const start = advanced.state;
    const find = (target: number) =>
      findBodyFold(a.frame.partition, start.poses, start.tangent, target, a.scale);
    expect(find(0.2)?.command).toBeCloseTo(0.2, 10);
    expect(find(0.201)).toBeUndefined();
  });
  it('reports an on-grid fold as a physical stop and publishes the complete return cycle', () => {
    for (const branch of [1, -1] as const)
      for (const commandStep of [0.1, 0.2]) {
        const fixture = nativeObliqueCylinder(3.2, branch),
          admitted = setup(fixture.document);
        const contact = inspectBodyInterval(admitted, initialBodyContinuation(admitted), 0.2);
        if (!contact.ok) throw new Error(contact.reason);
        expect(contact.stop?.kind).toBe('fold');
        expect(contact.state.command).toBeCloseTo(0.2, 9);
        const cycle = buildBodyCycle(admitted, { commandStep });
        if (!cycle.ok) throw new Error(cycle.reason);
        expect(cycle.kind).toBe('retrace');
        expect(cycle.duration).toBeCloseTo(13, 7);
        expect(cycle.samples.filter((sample) => sample.stop?.kind === 'fold').length).toBe(1);
      }
  });
  it('stops at a passive guide limit just before the fold instead of refusing or crossing it', () => {
    const fixture = nativeObliqueCylinder(3.2);
    const guide = fixture.document.joints.find((j) => j.kind === 'prismatic' && j.bodyA === WORLD)!;
    const gap = 0.0002,
      initialQ = Math.sqrt(3.4 * 3.4 - 3.2 * 3.2);
    const limit = {
      id: newRecordId<'limit'>(),
      coordinate: { jointId: guide.id, coordinate: 'travel' as const },
      lower: -10,
      upper: initialQ - gap,
    };
    const admitted = setup({ ...fixture.document, limits: [...fixture.document.limits, limit] });
    const result = inspectBodyInterval(admitted, initialBodyContinuation(admitted), 0.2);
    if (!result.ok) throw new Error(result.reason);
    expect(result.stop?.kind).toBe('coordinate');
    if (result.stop?.kind === 'coordinate')
      expect(result.stop.contacts.some((c) => c.limitId === limit.id && c.side === 'upper')).toBe(
        true
      );
    expect(result.state.command).toBeCloseTo(Math.hypot(3.2, gap) - 3, 10);
  });
});
