import { BodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { BodyId, newRecordId, WORLD } from './body-id';
import { compose } from './body-frame';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { createBodySolveFrame } from './body-solve-frame';
import { groupForceLoads } from './body-force-loads';
import { memberForceLoads } from './member-force-loads';
import { recoverMemberReactions } from './member-reactions';
import { solveBodyEfforts } from './body-efforts';
import {
  nativeFourBarWithUnloadedWeld,
  nativeWeldedLoadedRod,
} from '../../../test-utils/verification/native-force-fixtures';
import { compileWeldFrames } from './weld-frames';
import { captureLoadScope } from './load-provenance';
import { BodyMotion } from './body-rates';

const ZERO = { x: 0, y: 0 };
const STILL: BodyMotion = {
  velocity: { vx: 0, vy: 0, omega: 0 },
  acceleration: { ax: 0, ay: 0, alpha: 0 },
};
function setup(
  document: BodyDocument,
  body: BodyId,
  supportPolicy: 'unique' | 'evenest' = 'unique'
) {
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const system = compiled.system;
  const admitted = system.partitions.length
    ? admitBodyPartition(system, system.partitions[0])
    : undefined;
  if (admitted && !admitted.ok) throw new Error(admitted.reason);
  const fixed = createBodySolveFrame(
    {
      key: 'fixed',
      unknowns: [],
      boundary: [WORLD],
      rows: [],
      drivers: [],
      limits: [],
      materialIds: [],
    },
    new Map([...system.groups].map(([id, group]) => [id, group.pose]))
  );
  const frame = admitted?.ok ? admitted.frame : fixed;
  const poses = admitted?.ok ? admitted.poses : fixed.initialPoses;
  const groupId = system.groupOf.get(body)!;
  const loads = groupForceLoads(document, system, frame, poses, 'static', ZERO);
  if (!loads.ok) throw new Error(loads.reason);
  const external = solveBodyEfforts(frame.partition, poses, loads.required, supportPolicy);
  const members = memberForceLoads(document, system, frame, poses, groupId, 'static', ZERO);
  const recover = () =>
    recoverMemberReactions(document, system, frame, poses, groupId, members, external);
  return { system, frame, poses, groupId, loads, external, members, recover };
}

describe('native internal reaction availability', () => {
  it('leaves a redundant weld cycle indeterminate while recovering a bridge to a loaded leaf', () => {
    const fixture = nativeWeldedLoadedRod(),
      f = new BodyFactory(fixture.document);
    const c = f.body(
      'cycle member',
      compose({ ...ZERO, angle: fixture.angle }, { x: -0.5, y: 1.2, angle: -0.2 }),
      [ZERO, { x: 1, y: 0 }]
    );
    const leaf = f.body(
      'loaded leaf',
      compose({ ...ZERO, angle: fixture.angle }, { x: 3, y: 4, angle: 0.1 }),
      [ZERO, { x: 1, y: 0 }]
    );
    const weld = (a: BodyId, b: BodyId) =>
      f.joint('weld', f.attachment(a, ZERO), f.attachment(b, ZERO));
    const bc = weld(fixture.bracket, c),
      ca = weld(c, fixture.body),
      bridge = weld(c, leaf);
    const source: BodyDocument = {
      ...f.document,
      forces: [
        {
          id: newRecordId<'force'>(),
          bodyId: leaf,
          point: ZERO,
          vector: { x: 1, y: -2 },
          couple: 4,
          frame: 'world',
          label: 'leaf load',
        },
      ],
    };
    for (const reverse of [false, true]) {
      const document = reverse
        ? {
            ...source,
            bodies: [...source.bodies].reverse(),
            joints: [...source.joints].reverse(),
            attachments: [...source.attachments].reverse(),
          }
        : source;
      const result = setup(document, fixture.body).recover();
      if (!result.ok) throw new Error(result.reason);
      for (const edge of [fixture.weld, bc, ca])
        expect(result.joints.get(edge.id)).toEqual({ ok: false, reason: 'indeterminate' });
      const answer = result.joints.get(bridge.id)!;
      if (!answer.ok) throw new Error(answer.reason);
      expect(answer.b.force.x).toBeCloseTo(-1, 10);
      expect(answer.b.force.y).toBeCloseTo(2, 10);
      expect(answer.b.moment).toBeCloseTo(-4, 10);
    }
  });

  it('recovers fixed-frame welds and keeps an internal redundant pin in the equilibrium system', () => {
    const f = new BodyFactory();
    const a = f.body('frame bracket', { ...ZERO, angle: 0 }, [ZERO, { x: 1, y: 0 }]);
    const b = f.body('frame extension', { x: 2, y: 1, angle: 0.4 }, [ZERO, { x: 1, y: 0 }]);
    const ground = f.joint('weld', f.attachment(WORLD, ZERO), f.attachment(a, ZERO));
    const weld = f.joint('weld', f.attachment(a, ZERO), f.attachment(b, ZERO));
    const load = {
      id: newRecordId<'force'>(),
      bodyId: b,
      point: ZERO,
      vector: { x: 4, y: -2 },
      couple: 3,
      frame: 'world' as const,
      label: 'fixed load',
    };
    const unique = setup({ ...f.document, forces: [load] }, a).recover();
    if (!unique.ok) throw new Error(unique.reason);
    const branch = unique.joints.get(weld.id)!;
    if (!branch.ok) throw new Error(branch.reason);
    expect(branch.b.force.x).toBeCloseTo(-4, 10);
    expect(branch.b.force.y).toBeCloseTo(2, 10);
    expect(branch.b.moment).toBeCloseTo(-3, 10);
    const pin = f.joint('revolute', f.attachment(a, { x: 2, y: 1 }), f.attachment(b, ZERO));
    const document = { ...f.document, forces: [load] };
    const sample = setup(document, a);
    const redundant = sample.recover();
    if (!redundant.ok) throw new Error(redundant.reason);
    expect(redundant.joints.get(weld.id)).toEqual({ ok: false, reason: 'indeterminate' });
    expect(redundant.joints.get(pin.id)).toEqual({ ok: false, reason: 'indeterminate' });
    const support = redundant.joints.get(ground.id)!;
    if (!support.ok) throw new Error(support.reason);
    expect(support.b.force.x).toBeCloseTo(-4, 10);
    expect(support.b.force.y).toBeCloseTo(2, 10);
    expect(support.b.moment).toBeCloseTo(5, 10);
    const withFixedRows = createBodySolveFrame(
      { ...sample.frame.partition, rows: sample.system.fixedRows },
      new Map([...sample.system.groups].map(([id, group]) => [id, group.pose]))
    );
    const external = solveBodyEfforts(
      withFixedRows.partition,
      withFixedRows.initialPoses,
      new Map()
    );
    expect(
      recoverMemberReactions(
        document,
        sample.system,
        withFixedRows,
        withFixedRows.initialPoses,
        sample.groupId,
        sample.members,
        external
      )
    ).toEqual(redundant);
  });

  it('distinguishes a zero internal load after external cancellation from an unbalanced one', () => {
    const fixture = nativeFourBarWithUnloadedWeld(),
      document = fixture.document;
    const f = setup(document, fixture.body);
    const result = f.recover();
    if (!result.ok) throw new Error(result.reason);
    const weld = result.joints.get(fixture.weld.id)!;
    if (!weld.ok) throw new Error(weld.reason);
    expect(weld.b.force.x).toBeCloseTo(0, 12);
    expect(weld.b.force.y).toBeCloseTo(0, 12);
    expect(weld.b.moment).toBeCloseTo(0, 12);
    if (!f.members.ok) throw new Error(f.members.reason);
    const members = new Map(f.members.members),
      original = members.get(fixture.bracket)!;
    members.set(fixture.bracket, {
      ...original,
      required: {
        ...original.required,
        force: { ...original.required.force, x: original.required.force.x + 1e-10 },
      },
    });
    expect(
      recoverMemberReactions(
        document,
        f.system,
        f.frame,
        f.poses,
        f.groupId,
        { ok: true, members },
        f.external
      )
    ).toEqual({ ok: false, reason: 'unbalanced' });
    expect(
      recoverMemberReactions(document, f.system, f.frame, f.poses, f.groupId, f.members, {
        ok: false,
        reason: 'unbalanced',
      })
    ).toEqual({ ok: false, reason: 'external-reaction' });
    expect(f.recover().ok).toBe(true);
  });

  it('labels member reactions as conditional on an explicitly chosen external support split', () => {
    const fixture = nativeWeldedLoadedRod();
    const f = new BodyFactory(fixture.document);
    f.joint('revolute', f.attachment(WORLD, ZERO), f.attachment(fixture.body, ZERO));
    expect(setup(f.document, fixture.body).recover()).toEqual({
      ok: false,
      reason: 'external-reaction',
    });
    const selected = setup(f.document, fixture.body, 'evenest').recover();
    if (!selected.ok) throw new Error(selected.reason);
    const weld = selected.joints.get(fixture.weld.id)!;
    if (!weld.ok) throw new Error(weld.reason);
    expect(weld.basis).toBe('evenest');
    expect(weld.b.force.x).toBeCloseTo(0, 10);
    expect(weld.b.force.y).toBeCloseTo(10, 10);
    const xOfTipMinusOrigin = Math.cos(fixture.angle) + Math.sin(fixture.angle);
    expect(weld.b.moment).toBeCloseTo(10 * xOfTipMinusOrigin - 3, 10);
  });

  it('applies a single grounded material’s aggregate override without a distribution refusal', () => {
    const f = new BodyFactory();
    const body = f.body('fixed bar', { x: 2, y: 1, angle: 0 }, [ZERO, { x: 1, y: 0 }]);
    f.joint('weld', f.attachment(WORLD, ZERO), f.attachment(body, ZERO));
    const document: BodyDocument = {
      ...f.document,
      groups: [
        {
          members: [WORLD, body],
          frameBody: body,
          mass: { mass: 4, center: { point: { x: 0.5, y: 0.2 }, editAnchor: 'body' } },
        },
      ],
    };
    const sample = setup(document, body);
    const loads = memberForceLoads(
      document,
      sample.system,
      sample.frame,
      sample.poses,
      sample.groupId,
      'static',
      { x: 0, y: -10 }
    );
    if (!loads.ok) throw new Error(loads.reason);
    expect(loads.members.size).toBe(1);
    expect(loads.members.get(body)!.required.force.y).toBeCloseTo(40, 10);
    expect(loads.members.get(body)!.required.moment).toBeCloseTo(100, 10);
  });

  it('preserves external group loads while refusing ambiguous material mass or imported load ownership', () => {
    const fixture = nativeWeldedLoadedRod();
    const base = setup(fixture.document, fixture.body);
    const override: BodyDocument = {
      ...fixture.document,
      groups: [
        {
          members: [fixture.body, fixture.bracket],
          frameBody: fixture.body,
          mass: { mass: 7, inertia: 3 },
        },
      ],
    };
    const f = setup(override, fixture.body);
    const rates = {
      ok: true as const,
      motions: new Map([
        [f.groupId, STILL],
        [WORLD, STILL],
      ]),
    };
    expect(
      memberForceLoads(override, f.system, f.frame, f.poses, f.groupId, 'dynamic', ZERO, rates)
    ).toEqual({ ok: false, reason: 'aggregate-properties' });
    expect(
      memberForceLoads(override, f.system, f.frame, f.poses, f.groupId, 'static', { x: 0, y: -9.8 })
    ).toEqual({ ok: false, reason: 'aggregate-properties' });
    expect(f.members.ok).toBe(true);
    const inertiaOnly: BodyDocument = {
      ...override,
      groups: override.groups.map((item) => ({ ...item, mass: { inertia: 3 } })),
    };
    const g = setup(inertiaOnly, fixture.body);
    expect(
      memberForceLoads(inertiaOnly, g.system, g.frame, g.poses, g.groupId, 'static', {
        x: 0,
        y: -9.8,
      }).ok
    ).toBe(true);
    expect(
      memberForceLoads(override, f.system, f.frame, f.poses, f.groupId, 'dynamic', ZERO, {
        ok: false,
        reason: 'rank',
      })
    ).toEqual({ ok: false, reason: 'missing-rates' });
    const group = groupForceLoads(override, f.system, f.frame, f.poses, 'dynamic', ZERO, rates);
    expect(group.ok).toBe(true);
    const frames = compileWeldFrames(fixture.document);
    if (!frames.ok) throw new Error(frames.code);
    const legacyGroupScope = captureLoadScope(frames.groupOf.get(fixture.body)!, fixture.bracket, [
      fixture.body,
      fixture.bracket,
    ]);
    const imported = {
      ...fixture.document,
      forces: fixture.document.forces.map((load) => ({ ...load, legacyGroupScope })),
    };
    const importedCase = setup(imported, fixture.body);
    expect(importedCase.members).toEqual({ ok: false, reason: 'load-owner' });
    expect(importedCase.loads.required.get(importedCase.groupId)!.force.x).toBeCloseTo(
      base.loads.required.get(base.groupId)!.force.x,
      12
    );
    expect(importedCase.loads.required.get(importedCase.groupId)!.moment).toBeCloseTo(
      base.loads.required.get(base.groupId)!.moment,
      12
    );
    expect(importedCase.recover()).toEqual({ ok: false, reason: 'load-owner' });
  });
});
