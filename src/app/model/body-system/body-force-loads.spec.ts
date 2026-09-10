import { BodyFactory } from './body-factory';
import { compose, rotate, worldToLocal } from './body-frame';
import { nativeLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { solveBodyRates, BodyMotion } from './body-rates';
import { groupForceLoads } from './body-force-loads';
import { solveBodyEfforts } from './body-efforts';
import { WORLD } from './body-id';
import { BodyUnits, SI_UNITS } from './body-units';
import { rebaseBody } from './rebase-body';
import { addWrenches, rowWrenches, wrenchPower, ZERO_WRENCH } from './joint-wrenches';

const STILL: BodyMotion = {
  velocity: { vx: 0, vy: 0, omega: 0 },
  acceleration: { ax: 0, ay: 0, alpha: 0 },
};
const UNITS: BodyUnits[] = [
  SI_UNITS,
  { length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' },
  { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' },
];
const G = 9.80665;

describe('native moving-group Newton–Euler loads', () => {
  it('matches rod torque, support force and power from hand arithmetic in every unit system and local frame', () => {
    for (const units of UNITS)
      for (const forceFrame of ['body', 'world'] as const)
        for (const rebased of [false, true]) {
          const fixture = nativeLoadedRod(units, forceFrame);
          const document = rebased
            ? rebaseBody(fixture.document, fixture.body, { x: 3, y: -2, angle: 0.7 })
            : fixture.document;
          const compiled = compileBodyDocument(document);
          if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
          const system = compiled.system,
            admitted = admitBodyPartition(system, system.partitions[0]);
          if (!admitted.ok)
            throw new Error(
              JSON.stringify({ reason: admitted.reason, units, forceFrame, rebased })
            );
          const rates = solveBodyRates(
            admitted.frame.partition,
            admitted.poses,
            new Map([[fixture.driver.id, { value: 0, velocity: 3, acceleration: -0.5 }]]),
            new Map([[WORLD, STILL]])
          );
          if (!rates.ok) throw new Error(rates.reason);
          for (const mode of ['static', 'dynamic'] as const) {
            const loads = groupForceLoads(
              document,
              system,
              admitted.frame,
              admitted.poses,
              mode,
              { x: 0, y: -G },
              rates
            );
            if (!loads.ok) throw new Error(loads.reason);
            const efforts = solveBodyEfforts(
              admitted.frame.partition,
              admitted.poses,
              loads.required
            );
            if (!efforts.ok) throw new Error(efforts.reason);
            const torque = efforts.efforts.get(`drive:${fixture.driver.id}`)!;
            if (!torque.ok) throw new Error('Indeterminate torque');
            const c = Math.cos(fixture.angle),
              s = Math.sin(fixture.angle);
            const loadMoment = forceFrame === 'world' ? -20 * c : -20;
            const expected = (mode === 'dynamic' ? -(8 / 3) * 0.5 : 0) - loadMoment + 2 * G * c - 3;
            expect(torque.value).toBeCloseTo(expected, 8);
            let resultant = ZERO_WRENCH,
              reactionPower = 0;
            for (const row of admitted.frame.partition.rows) {
              const effort = efforts.efforts.get(row.key)!;
              if (!effort.ok) throw new Error('Indeterminate reaction');
              const pair = rowWrenches(row, admitted.poses, effort.value);
              resultant = addWrenches(resultant, pair.b);
              reactionPower +=
                wrenchPower(pair.a, rates.motions.get(row.pair.groupA)!.velocity) +
                wrenchPower(pair.b, rates.motions.get(row.pair.groupB)!.velocity);
            }
            const fx = forceFrame === 'world' ? 0 : 10 * s,
              fy = forceFrame === 'world' ? -10 : -10 * c;
            expect(resultant.force.x).toBeCloseTo(
              (mode === 'dynamic' ? 2 * (0.5 * s - 9 * c) : 0) - fx,
              8
            );
            expect(resultant.force.y).toBeCloseTo(
              (mode === 'dynamic' ? 2 * (-0.5 * c - 9 * s) : 0) - fy + 2 * G,
              8
            );
            expect(reactionPower).toBeCloseTo(torque.value * 3, 8);
            expect(reactionPower + loads.appliedPower!).toBeCloseTo(mode === 'dynamic' ? -4 : 0, 8);
            expect(loads.kineticEnergyRate).toBeCloseTo(-4, 8);
          }
        }
  });

  it('uses an aggregate override once while carrying a welded member’s force and custom center', () => {
    const fixture = nativeLoadedRod();
    const f = new BodyFactory(fixture.document);
    const bracket = f.body(
      'off-axis bracket',
      compose({ x: 0, y: 0, angle: fixture.angle }, { x: 1, y: 2, angle: 0.3 }),
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.2 },
      ]
    );
    f.joint(
      'weld',
      f.attachment(fixture.body, { x: 0, y: 0 }),
      f.attachment(bracket, { x: 0, y: 0 })
    );
    const source = {
      ...f.document,
      forces: f.document.forces.map((load) => ({
        ...load,
        bodyId: bracket,
        point: worldToLocal({ x: 1, y: 2, angle: 0.3 }, { x: 2, y: 0 }),
      })),
      groups: [
        {
          members: [fixture.body, bracket],
          frameBody: fixture.body,
          mass: {
            mass: 6,
            inertia: 2,
            center: { point: { x: 0.3, y: -0.4 }, editAnchor: 'body' as const },
          },
        },
      ],
    };
    for (const reverse of [false, true])
      for (const rebased of [false, true]) {
        const base = rebased
          ? rebaseBody(source, fixture.body, { x: 3, y: -2, angle: 0.7 })
          : source;
        const document = reverse
          ? {
              ...base,
              bodies: [...base.bodies].reverse(),
              joints: [...base.joints].reverse(),
              attachments: [...base.attachments].reverse(),
              groups: base.groups.map((group) => ({
                ...group,
                members: [...group.members].reverse(),
              })),
            }
          : base;
        const compiled = compileBodyDocument(document);
        if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
        const system = compiled.system,
          admitted = admitBodyPartition(system, system.partitions[0]);
        if (!admitted.ok) throw new Error(admitted.reason);
        const rates = solveBodyRates(
          admitted.frame.partition,
          admitted.poses,
          new Map([[fixture.driver.id, { value: 0, velocity: 3, acceleration: -0.5 }]]),
          new Map([[WORLD, STILL]])
        );
        if (!rates.ok) throw new Error(rates.reason);
        const loads = groupForceLoads(
          document,
          system,
          admitted.frame,
          admitted.poses,
          'dynamic',
          { x: 0, y: -G },
          rates
        );
        if (!loads.ok) throw new Error(loads.reason);
        const efforts = solveBodyEfforts(admitted.frame.partition, admitted.poses, loads.required);
        if (!efforts.ok) throw new Error(efforts.reason);
        const torque = efforts.efforts.get(`drive:${fixture.driver.id}`)!;
        if (!torque.ok) throw new Error('Indeterminate torque');
        const r = rotate({ x: 0.3, y: -0.4 }, fixture.angle);
        const inertiaAtPin = 2 + 6 * 0.25;
        expect(torque.value).toBeCloseTo(
          -0.5 * inertiaAtPin + 20 * Math.cos(fixture.angle) + 6 * G * r.x - 3,
          8
        );
        expect(loads.kineticEnergyRate).toBeCloseTo(-1.5 * inertiaAtPin, 8);
        expect(torque.value * 3 + loads.appliedPower!).toBeCloseTo(-1.5 * inertiaAtPin, 8);
        expect(loads.required.size).toBe(1);
      }
  });

  it('allows static equilibrium without rates and refuses dynamic loads on a missing or refused rate sample', () => {
    const fixture = nativeLoadedRod(),
      compiled = compileBodyDocument(fixture.document);
    if (!compiled.ok) throw new Error('Compilation failed');
    const system = compiled.system,
      admitted = admitBodyPartition(system, system.partitions[0]);
    if (!admitted.ok) throw new Error(admitted.reason);
    const get = (mode: 'static' | 'dynamic') =>
      groupForceLoads(fixture.document, system, admitted.frame, admitted.poses, mode, {
        x: 0,
        y: 0,
      });
    const staticLoads = get('static');
    expect(staticLoads.ok).toBe(true);
    if (staticLoads.ok) expect(staticLoads.appliedPower).toBeUndefined();
    expect(get('dynamic')).toEqual({ ok: false, reason: 'missing-rates' });
    expect(
      groupForceLoads(
        fixture.document,
        system,
        admitted.frame,
        admitted.poses,
        'dynamic',
        { x: 0, y: 0 },
        { ok: false, reason: 'rank' }
      )
    ).toEqual({ ok: false, reason: 'missing-rates' });
    expect(get('static').ok).toBe(true);
  });
});
