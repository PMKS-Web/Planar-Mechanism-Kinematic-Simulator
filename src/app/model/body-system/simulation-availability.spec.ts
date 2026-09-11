import {
  nativeSeparateFoundations,
  nativeTwinCranksOnPinnedFrame,
} from '../../../test-utils/verification/native-fixed-frame-fixtures';
import { nativeWeldedLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import { simulationBodyPose, simulationMaterialCenter } from './simulation-body-readers';
import { simulationGroupCenter, simulationGroupCenterRates } from './simulation-group-readers';
import { simulationJointReaction } from './simulation-force-readers';
import { SimulationValue } from './simulation-values';
import { BodyDocument } from './body-document';
import { WORLD } from './body-id';
import { rotate } from './body-frame';
import { rebaseBody } from './rebase-body';

function value<T>(result: SimulationValue<T>): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
function build(
  document: BodyDocument,
  supportPolicies?: ReadonlyMap<string, 'unique' | 'evenest'>
) {
  const result = buildSimulationSnapshot(document, 7, {
    mode: 'static',
    gravity: { x: 0, y: -9.81 },
    path: { commandStep: 0.2 },
    supportPolicies,
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.snapshot;
}

describe('native snapshot partial availability and aggregate properties', () => {
  it('retains an admission refusal beside a working independent machine and its foundation', () => {
    const fixture = nativeSeparateFoundations(),
      [first, second] = fixture.foundations;
    const document = { ...fixture.document, drivers: [second.driver] };
    const snapshot = build(document),
      firstKey = snapshot.bodyPartition.get(first.crank)!,
      secondKey = snapshot.bodyPartition.get(second.crank)!;
    expect(snapshot.partitions.get(firstKey)).toMatchObject({
      ok: false,
      stage: 'admission',
      reason: 'no-drive',
    });
    const selected = value(
      selectSimulationView(snapshot, { revision: 7, indices: new Map([[secondKey, 1]]) })
    );
    expect(simulationBodyPose(selected, first.crank)).toEqual({ ok: false, reason: 'no-drive' });
    expect(value(simulationBodyPose(selected, second.crank)).angle).toBeCloseTo(
      second.angle - 0.2,
      9
    );
    expect(simulationJointReaction(selected, first.support.id, first.body)).toEqual({
      ok: false,
      reason: 'frame-context',
    });
    expect(simulationJointReaction(selected, second.support.id, second.body).ok).toBe(true);
  });

  it('balances a drawing containing only static material without requiring a fictitious machine clock', () => {
    const fixture = nativeSeparateFoundations(),
      cranks = new Set(fixture.foundations.map((item) => item.crank));
    const document = {
      ...fixture.document,
      bodies: fixture.document.bodies.filter((body) => !cranks.has(body.id)),
      joints: fixture.document.joints.filter(
        (joint) => !cranks.has(joint.bodyA) && !cranks.has(joint.bodyB)
      ),
      attachments: fixture.document.attachments.filter((anchor) => !cranks.has(anchor.bodyId)),
      drivers: [],
      forces: [],
    };
    const snapshot = build(document);
    expect(snapshot.partitions.size).toBe(0);
    const selected = value(selectSimulationView(snapshot, { revision: 7, indices: new Map() }));
    for (const foundation of fixture.foundations) {
      const reaction = value(
        simulationJointReaction(selected, foundation.support.id, foundation.body)
      );
      expect(reaction.basis).toBe('unique');
      expect(reaction.wrench.force.x).toBeCloseTo(0, 10);
      expect(reaction.wrench.force.y).toBeCloseTo(foundation.mass * 9.81, 10);
      expect(reaction.wrench.moment).toBeCloseTo(
        foundation.mass * 9.81 * 0.5 * Math.cos(foundation.pose.angle),
        10
      );
      expect(value(simulationBodyPose(selected, foundation.body))).toEqual(foundation.pose);
    }
    expect(simulationGroupCenter(selected, WORLD)).toEqual({ ok: false, reason: 'world-group' });
  });

  it('honors a fixed component policy override without aliasing the caller map or disguising indeterminate support forces', () => {
    const fixture = nativeTwinCranksOnPinnedFrame(),
      automatic = build(fixture.document);
    const key = [...automatic.fixedSupportPolicies.keys()][0],
      policies = new Map([[key, 'unique' as const]]);
    const snapshot = build(fixture.document, policies);
    policies.clear();
    expect(snapshot.fixedSupportPolicies.get(key)).toBe('unique');
    expect('set' in snapshot.fixedSupportPolicies).toBe(false);
    const selected = value(
      selectSimulationView(snapshot, {
        revision: 7,
        indices: new Map([...snapshot.partitions.keys()].map((id) => [id, 2])),
      })
    );
    expect(simulationJointReaction(selected, fixture.supports[0].id, fixture.frame)).toEqual({
      ok: false,
      reason: 'indeterminate',
    });
    expect(
      buildSimulationSnapshot(fixture.document, 7, {
        mode: 'static',
        gravity: { x: 0, y: 0 },
        supportPolicies: new Map([['not-a-component', 'unique']]),
      })
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reads an overridden aggregate center separately from its members through rebase and enumeration changes', () => {
    const fixture = nativeWeldedLoadedRod(),
      local = { x: 0.3, y: -0.4 };
    const source: BodyDocument = {
      ...fixture.document,
      groups: [
        {
          members: [fixture.body, fixture.bracket],
          frameBody: fixture.body,
          mass: { mass: 6, inertia: 2, center: { point: local, editAnchor: 'body' } },
        },
      ],
    };
    const rebased = rebaseBody(source, fixture.body, { x: 3, y: -2, angle: 0.7 });
    for (const document of [
      source,
      rebased,
      { ...rebased, bodies: [...rebased.bodies].reverse(), joints: [...rebased.joints].reverse() },
    ]) {
      const snapshot = build(document),
        key = snapshot.bodyPartition.get(fixture.body)!,
        part = snapshot.partitions.get(key)!;
      if (!part.ok) throw new Error(part.reason);
      const selected = value(
        selectSimulationView(snapshot, { revision: 7, indices: new Map([[key, 3]]) })
      );
      const theta = fixture.angle + part.inputs[3].sample.command,
        expected = rotate(local, theta);
      const groupId = snapshot.system.groupOf.get(fixture.body)!;
      const center = value(simulationGroupCenter(selected, groupId));
      expect(center.x).toBeCloseTo(expected.x, 10);
      expect(center.y).toBeCloseTo(expected.y, 10);
      const rates = value(simulationGroupCenterRates(selected, groupId));
      expect(rates.velocity.x).toBeCloseTo(-3 * expected.y, 10);
      expect(rates.velocity.y).toBeCloseTo(3 * expected.x, 10);
      expect(rates.acceleration.x).toBeCloseTo(-9 * expected.x, 10);
      expect(rates.acceleration.y).toBeCloseTo(-9 * expected.y, 10);
      const intrinsic = value(simulationMaterialCenter(selected, fixture.body)),
        raw = rotate({ x: 1, y: 0 }, theta);
      expect(intrinsic.x).toBeCloseTo(raw.x, 10);
      expect(intrinsic.y).toBeCloseTo(raw.y, 10);
    }
  });
});
