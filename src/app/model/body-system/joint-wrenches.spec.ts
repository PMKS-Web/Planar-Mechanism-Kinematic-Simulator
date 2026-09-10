import { BodyId, newRecordId } from './body-id';
import { BodyConstraintRow, CompiledBodyPartition, ConstraintPair } from './compiled-body-system';
import {
  rowWrenches,
  addWrenches,
  transportWrench,
  wrenchPower,
  Wrench,
  ZERO_WRENCH,
} from './joint-wrenches';
import { solveBodyEfforts } from './body-efforts';
import { add, rotate, scale, perpendicular } from './body-frame';

const a = 'carrier' as BodyId,
  b = 'rider' as BodyId;
function slide(angle: number, travel: number) {
  const u = rotate({ x: 1, y: 0 }, angle);
  const poses = new Map([
    [a, { x: 0, y: 0, angle }],
    [b, { ...scale(u, travel), angle: angle + 0.2 }],
  ]);
  const pair: ConstraintPair = {
    groupA: a,
    groupB: b,
    anchorA: { x: 0, y: 0 },
    anchorB: { x: 0, y: 0 },
    axisA: 0,
    memberAngleA: 0,
    memberAngleB: 0,
  };
  const jointId = newRecordId<'joint'>(),
    commandId = newRecordId<'driver'>();
  const row = (kind: BodyConstraintRow['kind']): BodyConstraintRow => ({
    key: kind,
    jointId,
    kind,
    pair,
    zero: 0,
  });
  const rows = [row('lateral'), { ...row('angle'), zero: 0.2 }, { ...row('travel'), commandId }];
  const partition: CompiledBodyPartition = {
    key: 'slide',
    unknowns: [b],
    boundary: [a],
    materialIds: [b],
    rows,
    drivers: [{ id: commandId, row: rows[2], initial: travel, speed: 1 }],
    limits: [],
  };
  return { u, n: perpendicular(u), poses, rows, partition };
}

describe('native physical constraint wrenches', () => {
  it('transports a separated P reaction to a common moment reference and preserves virtual power', () => {
    for (const angle of [0, 0.7, -1.1])
      for (const travel of [-3, 0, 2]) {
        const f = slide(angle, travel),
          efforts = [5, -2, 7];
        let wa = ZERO_WRENCH,
          wb = ZERO_WRENCH;
        f.rows.forEach((row, i) => {
          const pair = rowWrenches(row, f.poses, efforts[i]);
          wa = addWrenches(wa, pair.a);
          wb = addWrenches(wb, pair.b);
        });
        expect(wa.moment).toBeCloseTo(-5 * travel + 2, 12);
        expect(wb.moment).toBeCloseTo(-2, 12);
        const common = addWrenches(wa, transportWrench(wb, f.poses.get(b)!));
        expect(common.force.x).toBeCloseTo(0, 12);
        expect(common.force.y).toBeCloseTo(0, 12);
        expect(common.moment).toBeCloseTo(0, 12);
        const originVelocity = { x: 0.2, y: -0.1 },
          omega = 0.8,
          speed = -0.4;
        const riderVelocity = add(
          originVelocity,
          add(scale(f.n, omega * travel), scale(f.u, speed))
        );
        const power =
          wrenchPower(wa, { vx: originVelocity.x, vy: originVelocity.y, omega }) +
          wrenchPower(wb, { vx: riderVelocity.x, vy: riderVelocity.y, omega });
        expect(power).toBeCloseTo(efforts[2] * speed, 12);
      }
  });

  it('recovers physical force and torque multipliers after numerical row/column scaling', () => {
    for (const size of [1e-8, 1, 1e8]) {
      const f = slide(0.6, 3 * size);
      const force = add(scale(f.u, 7), scale(f.n, -4));
      const result = solveBodyEfforts(
        f.partition,
        f.poses,
        new Map([[b, { force, moment: 2 * size }]])
      );
      if (!result.ok) throw new Error(result.reason);
      expect(result.nullity).toBe(0);
      for (const [key, value] of [
        ['lateral', -4],
        ['travel', 7],
        ['angle', 2 * size],
      ] as const) {
        const effort = result.efforts.get(key)!;
        if (!effort.ok) throw new Error('Unexpected indeterminate effort');
        expect(effort.value / (key === 'angle' ? size : 1)).toBeCloseTo(
          value / (key === 'angle' ? size : 1),
          9
        );
      }
    }
  });

  it('does not present a pivot-basis split as unique, while retaining an identifiable driver effort', () => {
    const f = slide(0.4, 2);
    const duplicate = { ...f.rows[0], key: 'second support', jointId: newRecordId<'joint'>() };
    const required = new Map([[b, { force: add(scale(f.u, 3), scale(f.n, 5)), moment: 2 }]]);
    for (const rows of [[...f.rows, duplicate], [duplicate, ...f.rows].reverse()]) {
      const result = solveBodyEfforts({ ...f.partition, rows }, f.poses, required);
      if (!result.ok) throw new Error(result.reason);
      expect(result.nullity).toBe(1);
      expect(result.efforts.get('lateral')).toEqual({ ok: false, reason: 'indeterminate' });
      expect(result.efforts.get('second support')).toEqual({ ok: false, reason: 'indeterminate' });
      const drive = result.efforts.get('travel')!;
      if (!drive.ok) throw new Error('Drive effort must remain identifiable');
      expect(drive.value).toBeCloseTo(3, 10);
    }
  });

  it('labels the evenest support split and keeps it unchanged by row order and geometry scale', () => {
    for (const size of [1e-8, 1, 1e8]) {
      const f = slide(0.4, 2 * size);
      const duplicate = { ...f.rows[0], key: 'second support', jointId: newRecordId<'joint'>() };
      const required = new Map([
        [b, { force: add(scale(f.u, 3), scale(f.n, 10)), moment: 2 * size }],
      ]);
      for (const rows of [[...f.rows, duplicate], [duplicate, ...f.rows].reverse()]) {
        const result = solveBodyEfforts({ ...f.partition, rows }, f.poses, required, 'evenest');
        if (!result.ok) throw new Error(result.reason);
        expect(result.sharedSupport).toBe(true);
        for (const [key, expected] of [
          ['lateral', 5],
          ['second support', 5],
          ['travel', 3],
          ['angle', 2 * size],
        ] as const) {
          const effort = result.efforts.get(key)!;
          if (!effort.ok) throw new Error('Expected a stated split');
          expect(effort.basis).toBe('evenest');
          expect(effort.value / (key === 'angle' ? size : 1)).toBeCloseTo(
            expected / (key === 'angle' ? size : 1),
            9
          );
        }
      }
    }
  });

  it('refuses a load along an unsupported motion even when the load is tiny', () => {
    const f = slide(0.4, 2);
    const slot = { ...f.partition, rows: [f.rows[0]], drivers: [] };
    for (const magnitude of [1, 1e-12]) {
      const load: Wrench = { force: scale(f.u, magnitude), moment: 0 };
      for (const policy of ['unique', 'evenest'] as const)
        expect(solveBodyEfforts(slot, f.poses, new Map([[b, load]]), policy)).toEqual({
          ok: false,
          reason: 'unbalanced',
        });
    }
  });

  it('does not turn a condensed internal reaction into zero under the shared-support policy', () => {
    const f = slide(0.4, 2);
    const internal = {
      ...f.rows[1],
      key: 'internal',
      pair: { ...f.rows[1].pair, groupA: b, groupB: b },
    };
    const result = solveBodyEfforts(
      { ...f.partition, rows: [...f.rows, internal] },
      f.poses,
      new Map([[b, { force: scale(f.u, 3), moment: 2 }]]),
      'evenest'
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.efforts.get('internal')).toEqual({ ok: false, reason: 'indeterminate' });
    const drive = result.efforts.get('travel')!;
    if (!drive.ok) throw new Error('Drive effort is external');
    expect(drive.value).toBeCloseTo(3, 10);
  });

  it('retains both physical sides when condensation gives them the same group id', () => {
    const f = slide(0, 0);
    const row = { ...f.rows[0], pair: { ...f.rows[0].pair, groupB: a } };
    const pair = rowWrenches(row, f.poses, 4);
    expect(pair.a.force.y).toBe(-4);
    expect(pair.b.force.y).toBe(4);
  });
});
