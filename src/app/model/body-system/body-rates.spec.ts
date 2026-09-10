import { BodyId, newRecordId } from './body-id';
import { BodyConstraintRow, CompiledBodyPartition, ConstraintPair } from './compiled-body-system';
import { BodyMotion, solveBodyRates } from './body-rates';
import { bodyPointRates, numericalGroupRates, worldGroupRates } from './body-point-rates';
import { add, subtract, rotate, scale, perpendicular } from './body-frame';
import { createBodySolveFrame } from './body-solve-frame';

const a = 'moving-carrier' as BodyId,
  b = 'rider' as BodyId;

function movingPair(kind: 'revolute' | 'prismatic') {
  const driverId = newRecordId<'driver'>(),
    jointId = newRecordId<'joint'>();
  const poseA = { x: 2, y: -1, angle: 0.4 },
    angleB = 0.6;
  const pair: ConstraintPair = {
    groupA: a,
    groupB: b,
    anchorA: { x: 0.3, y: -0.4 },
    anchorB: { x: -0.2, y: 0.6 },
    axisA: 0.3,
    memberAngleA: 0,
    memberAngleB: 0,
  };
  const row = (kind: BodyConstraintRow['kind'], zero = 0): BodyConstraintRow => ({
    key: kind,
    jointId,
    pair,
    kind,
    zero,
  });
  const isSlide = kind === 'prismatic';
  const command = {
    value: isSlide ? 1.2 : 0.2,
    velocity: isSlide ? -0.8 : 0.5,
    acceleration: isSlide ? 0.4 : 0.6,
  };
  const motionA: BodyMotion = {
    velocity: { vx: 1.3, vy: -0.4, omega: 0.9 },
    acceleration: { ax: 0.7, ay: -1.1, alpha: -0.3 },
  };
  const omegaB = motionA.velocity.omega + (isSlide ? 0 : command.velocity);
  const alphaB = motionA.acceleration.alpha + (isSlide ? 0 : command.acceleration);
  const ra = rotate(pair.anchorA, poseA.angle),
    rb = rotate(pair.anchorB, angleB);
  const u = rotate({ x: 1, y: 0 }, poseA.angle + pair.axisA),
    n = perpendicular(u);
  const travel = isSlide ? command.value : 0,
    speed = isSlide ? command.velocity : 0,
    acceleration = isSlide ? command.acceleration : 0;
  const poseB = { ...subtract(add(add(poseA, ra), scale(u, travel)), rb), angle: angleB };
  const w = motionA.velocity.omega,
    alpha = motionA.acceleration.alpha;
  // Differentiate rB = rA + RA*a + s*u - RB*b directly, including rotating-guide transport.
  const velocity = subtract(
    add(
      add({ x: motionA.velocity.vx, y: motionA.velocity.vy }, scale(perpendicular(ra), w)),
      add(scale(u, speed), scale(n, travel * w))
    ),
    scale(perpendicular(rb), omegaB)
  );
  const accel = add(
    subtract(
      add(
        add(
          { x: motionA.acceleration.ax, y: motionA.acceleration.ay },
          scale(perpendicular(ra), alpha)
        ),
        add(scale(u, acceleration - travel * w * w), scale(n, 2 * speed * w + travel * alpha))
      ),
      scale(ra, w * w)
    ),
    subtract(scale(rb, omegaB * omegaB), scale(perpendicular(rb), alphaB))
  );
  const expected: BodyMotion = {
    velocity: { vx: velocity.x, vy: velocity.y, omega: omegaB },
    acceleration: { ax: accel.x, ay: accel.y, alpha: alphaB },
  };
  const driven = { ...row(isSlide ? 'travel' : 'angle'), commandId: driverId };
  const partition: CompiledBodyPartition = {
    key: 'moving pair',
    unknowns: [b],
    boundary: [a],
    materialIds: [b],
    rows: [
      ...(isSlide
        ? [row('lateral'), row('angle', 0.2)]
        : [row('coincidence-x'), row('coincidence-y')]),
      driven,
    ],
    drivers: [{ id: driverId, row: driven, initial: command.value, speed: command.velocity }],
    limits: [],
  };
  return {
    partition,
    poses: new Map([
      [a, poseA],
      [b, poseB],
    ]),
    commands: new Map([[driverId, command]]),
    boundary: new Map([[a, motionA]]),
    expected,
  };
}

function expectMotion(actual: BodyMotion, expected: BodyMotion) {
  for (const key of ['vx', 'vy', 'omega'] as const)
    expect(actual.velocity[key]).toBeCloseTo(expected.velocity[key], 10);
  for (const key of ['ax', 'ay', 'alpha'] as const)
    expect(actual.acceleration[key]).toBeCloseTo(expected.acceleration[key], 10);
}

describe('native analytic body rates', () => {
  for (const kind of ['revolute', 'prismatic'] as const)
    it(`${kind}: includes moving-boundary acceleration and a nonuniform command in either numerical frame`, () => {
      const fixture = movingPair(kind);
      const result = solveBodyRates(
        fixture.partition,
        fixture.poses,
        fixture.commands,
        fixture.boundary
      );
      if (!result.ok) throw new Error(result.reason);
      expectMotion(result.motions.get(b)!, fixture.expected);
      expect(result.motions.get(a)).toEqual(fixture.boundary.get(a));
      const frame = createBodySolveFrame(fixture.partition, fixture.poses);
      const converted = numericalGroupRates(
        frame,
        a,
        fixture.poses.get(a)!,
        fixture.boundary.get(a)!
      )!;
      const local = solveBodyRates(
        frame.partition,
        frame.initialPoses,
        fixture.commands,
        new Map([[a, converted]])
      );
      if (!local.ok) throw new Error(local.reason);
      expectMotion(
        worldGroupRates(frame, b, frame.initialPoses.get(b)!, local.motions.get(b)!)!,
        fixture.expected
      );
      expectMotion(
        worldGroupRates(frame, a, frame.initialPoses.get(a)!, local.motions.get(a)!)!,
        fixture.boundary.get(a)!
      );
    });

  it('ignores an unreferenced fast boundary in the arithmetic while returning its prescribed rates', () => {
    const f = movingPair('prismatic');
    const first = solveBodyRates(f.partition, f.poses, f.commands, f.boundary);
    const remote = 'unreferenced' as BodyId;
    const motion: BodyMotion = {
      velocity: { vx: 1e150, vy: -1e150, omega: 1e150 },
      acceleration: { ax: 1e200, ay: -1e200, alpha: 1e200 },
    };
    const second = solveBodyRates(
      { ...f.partition, boundary: [...f.partition.boundary, remote] },
      new Map([...f.poses, [remote, { x: 1e200, y: -1e200, angle: 0 }]]),
      f.commands,
      new Map([...f.boundary, [remote, motion]])
    );
    if (!first.ok || !second.ok) throw new Error('Expected complete rates');
    expect(second.motions.get(b)).toEqual(first.motions.get(b));
    expect(second.motions.get(remote)).toEqual(motion);
  });

  it('returns no motions on rank, inconsistent acceleration commands or missing inputs, then recovers', () => {
    const f = movingPair('prismatic');
    const valid = () => solveBodyRates(f.partition, f.poses, f.commands, f.boundary);
    expect(valid().ok).toBe(true);
    const short = { ...f.partition, rows: f.partition.rows.slice(0, 2) };
    expect(solveBodyRates(short, f.poses, f.commands, f.boundary)).toEqual({
      ok: false,
      reason: 'rank',
    });
    expect(solveBodyRates(f.partition, f.poses, f.commands, new Map())).toEqual({
      ok: false,
      reason: 'invalid',
    });
    const commandId = newRecordId<'driver'>();
    const extra = { ...f.partition.rows[2], key: 'incompatible', commandId };
    const original = [...f.commands.values()][0];
    const commands = new Map([
      ...f.commands,
      [commandId, { ...original, acceleration: original.acceleration + 0.01 }],
    ]);
    expect(
      solveBodyRates(
        { ...f.partition, rows: [...f.partition.rows, extra] },
        f.poses,
        commands,
        f.boundary
      )
    ).toEqual({ ok: false, reason: 'acceleration-inconsistent' });
    expect(valid().ok).toBe(true);
  });

  it('does not hide incompatible tiny rates behind an absolute residual floor', () => {
    const f = movingPair('prismatic');
    const original = [...f.commands][0];
    const extraId = newRecordId<'driver'>();
    const extra = { ...f.partition.rows[2], key: 'tiny conflict', commandId: extraId };
    const partition = { ...f.partition, rows: [...f.partition.rows, extra] };
    const still: BodyMotion = {
      velocity: { vx: 0, vy: 0, omega: 0 },
      acceleration: { ax: 0, ay: 0, alpha: 0 },
    };
    const first = { ...original[1], velocity: 1e-12, acceleration: 1e-12 };
    for (const order of ['velocity', 'acceleration'] as const) {
      const commands = new Map([
        [original[0], first],
        [extraId, { ...first, [order]: 1.01e-12 }],
      ]);
      expect(solveBodyRates(partition, f.poses, commands, new Map([[a, still]]))).toEqual({
        ok: false,
        reason: order === 'velocity' ? 'velocity-inconsistent' : 'acceleration-inconsistent',
      });
    }
  });

  it('carries off-axis material acceleration from the angular rate without inferring a new alpha', () => {
    const motion: BodyMotion = {
      velocity: { vx: 0.4, vy: -0.6, omega: 2 },
      acceleration: { ax: 0.7, ay: 0.8, alpha: -0.3 },
    };
    const point = bodyPointRates({ x: 999, y: -888, angle: Math.PI / 2 }, { x: 2, y: 3 }, motion)!;
    expect(point.velocity.x).toBeCloseTo(-3.6, 12);
    expect(point.velocity.y).toBeCloseTo(-6.6, 12);
    expect(point.acceleration.x).toBeCloseTo(13.3, 12);
    expect(point.acceleration.y).toBeCloseTo(-6.3, 12);
  });
});
