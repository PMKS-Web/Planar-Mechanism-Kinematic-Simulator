import { buildMechanism } from '../../../test-utils/verification/fixture';
import { GEAR_PAIR, gearNetworkFixture } from '../../../test-utils/verification/gear-fixtures';
import { compileGearDrive, GearDrive, gearMotionAt } from './gear-drive';
import { GearAssembly } from '../gear';

function compile(fixture = GEAR_PAIR, assembly: GearAssembly = fixture.transmission) {
  const built = buildMechanism({ ...fixture, transmission: undefined });
  return compileGearDrive(assembly, built.joints, built.links);
}
function drive(fixture = GEAR_PAIR): GearDrive {
  const result = compile(fixture);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.drive;
}

describe('fixed-axis gear drive compiler', () => {
  it('reduces a 20/40 pair exactly and includes every shaft in the period', () => {
    const plan = drive();
    expect(plan.bodies[1].ratio).toEqual({ numerator: -1n, denominator: 2n });
    expect(plan.periodTurns).toBe(2);
    expect(Object.isFrozen(plan.bodies)).toBe(true);
  });
  it('preserves nonzero headings, reversed input, velocity and acceleration', () => {
    const plan = drive();
    for (const direction of [-1, 1]) {
      const q = direction * 7 * Math.PI;
      const motion = gearMotionAt(plan, q, direction * 2 * Math.PI, 4)!;
      const output = motion.angles.get('G2')!;
      expect(output.angle).toBeCloseTo(Math.PI / 3 - q / 2, 12);
      expect(output.velocity).toBeCloseTo(-direction * Math.PI, 12);
      expect(output.acceleration).toBe(-2);
      const [x, y] = motion.positions.get('D')!;
      expect(motion.velocity.get('D')![0]).toBeCloseTo(direction * Math.PI * y, 12);
      expect(motion.acceleration.get('D')![0]).toBeCloseTo(2 * y - Math.PI ** 2 * x, 12);
      expect(motion.velocity.get('C')).toEqual([0, 0]);
    }
  });
  it('propagates an idler and retains its two-turn cycle despite unity output ratio', () => {
    const plan = drive(
      gearNetworkFixture(
        [
          { center: [0, 0], teeth: 20 },
          { center: [3, 0], teeth: 40 },
          { center: [6, 0], teeth: 20 },
        ],
        [
          [0, 1],
          [1, 2],
        ]
      )
    );
    expect(plan.bodies.map((body) => body.multiplier)).toEqual([1, -0.5, 1]);
    expect(plan.periodTurns).toBe(2);
  });
  it('propagates branches independently', () => {
    const plan = drive(
      gearNetworkFixture(
        [
          { center: [0, 0], teeth: 20 },
          { center: [3, 0], teeth: 40 },
          { center: [0, 4], teeth: 60 },
        ],
        [
          [0, 1],
          [0, 2],
        ]
      )
    );
    expect(plan.bodies[2].ratio).toEqual({ numerator: -1n, denominator: 3n });
    expect(plan.periodTurns).toBe(6);
  });
  it('accepts a compatible redundant even cycle', () => {
    const plan = drive(
      gearNetworkFixture(
        [
          { center: [0, 0], teeth: 20 },
          { center: [2, 0], teeth: 20 },
          { center: [2, 2], teeth: 20 },
          { center: [0, 2], teeth: 20 },
        ],
        [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
        ]
      )
    );
    expect(plan.bodies.map((body) => body.multiplier)).toEqual([1, -1, 1, -1]);
  });
  it('rejects an odd locking cycle without an epsilon comparison', () => {
    const result = compile(
      gearNetworkFixture(
        [
          { center: [0, 0], teeth: 20 },
          { center: [2, 0], teeth: 20 },
          { center: [1, Math.sqrt(3)], teeth: 20 },
        ],
        [
          [0, 1],
          [1, 2],
          [2, 0],
        ]
      )
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0].code).toBe('locking-cycle');
  });
  it('reduces large safe tooth counts before sampling', () => {
    const plan = drive(
      gearNetworkFixture(
        [
          { center: [0, 0], teeth: 2_000_000_000, module: 1e-9 },
          { center: [3, 0], teeth: 4_000_000_000, module: 1e-9 },
        ],
        [[0, 1]]
      )
    );
    expect(plan.bodies[1].ratio).toEqual({ numerator: -1n, denominator: 2n });
  });
  it('refuses an unreachable dependent rotor', () => {
    const result = compile(GEAR_PAIR, { ...GEAR_PAIR.transmission, meshes: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0].code).toBe('unreachable');
  });
  it('refuses excessive full-cycle work without rounding the ratio', () => {
    const result = compile(
      gearNetworkFixture(
        [
          { center: [0, 0], teeth: 20 },
          { center: [51, 0], teeth: 1000 },
        ],
        [[0, 1]]
      )
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0].code).toBe('work-limit');
  });
  it('returns no motion for nonfinite input state', () => {
    expect(gearMotionAt(drive(), Infinity, 1)).toBeUndefined();
  });
  it('refuses mismatched modules and separated pitch circles at computational precision', () => {
    const a = GEAR_PAIR.transmission;
    const mismatch = compile(GEAR_PAIR, {
      ...a,
      gears: [a.gears[0], { ...a.gears[1], module: 0.2 }],
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok)
      expect(mismatch.diagnostics.some((error) => error.code === 'incompatible-module')).toBe(true);
    const separated = compile(
      gearNetworkFixture(
        [
          { center: [-3.01, 0], teeth: 20 },
          { center: [0, 0], teeth: 40 },
        ],
        [[0, 1]]
      )
    );
    expect(separated.ok).toBe(false);
    if (!separated.ok)
      expect(separated.diagnostics.some((error) => error.code === 'center-distance')).toBe(true);
  });
  it('rejects a moving center even when its reference geometry is otherwise valid', () => {
    const result = compile({
      ...GEAR_PAIR,
      joints: GEAR_PAIR.joints.map((joint) => ({
        ...joint,
        ground: joint.id === 'C' ? false : joint.ground,
      })),
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.diagnostics.some((error) => error.code === 'moving-axis')).toBe(true);
  });
  for (const teeth of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    it(`refuses malformed tooth count ${teeth}`, () => {
      const assembly = GEAR_PAIR.transmission;
      expect(
        compile(GEAR_PAIR, {
          ...assembly,
          gears: [{ ...assembly.gears[0], teeth }, assembly.gears[1]],
        }).ok
      ).toBe(false);
    });
  }
  it('refuses malformed host, reference, module, mesh and duplicate definitions', () => {
    const a = GEAR_PAIR.transmission;
    for (const patch of [
      { module: 0 },
      { module: NaN },
      { hostLinkId: 'missing' },
      { referenceJointId: 'A' },
      { centerJointId: 'B' },
      { id: 'G2' },
    ]) {
      expect(
        compile(GEAR_PAIR, { ...a, gears: [{ ...a.gears[0], ...patch }, a.gears[1]] }).ok
      ).toBe(false);
    }
    for (const patch of [{ gearBId: 'G1' }, { gearBId: 'missing' }]) {
      expect(compile(GEAR_PAIR, { ...a, meshes: [{ ...a.meshes[0], ...patch }] }).ok).toBe(false);
    }
    expect(
      compile(GEAR_PAIR, { ...a, meshes: [a.meshes[0], { ...a.meshes[0], id: 'duplicate' }] }).ok
    ).toBe(false);
    expect(compile(GEAR_PAIR, { ...a, gears: [a.gears[0], { ...a.gears[0], id: 'G2' }] }).ok).toBe(
      false
    );
  });
});
