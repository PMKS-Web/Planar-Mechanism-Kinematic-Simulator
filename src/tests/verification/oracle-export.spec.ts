// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { LengthUnit } from '../../app/model/unit-enums';
import { siUnitFactors } from '../../app/model/unit-conversions';
import { decodeDrawing } from '../../test-utils/machine-facts/drawing';
import {
  exportPartition,
  OraclePin,
  OracleProblem,
  OracleSlider,
} from '../../test-utils/oracle/export-problem';
import { siFactors } from '../../test-utils/oracle/si-units';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { fixturePayload, PublishedSpeed } from '../../test-utils/verification/fixture-payload';
import {
  scotchYokeFixture,
  invertedSliderCrankFixture,
} from '../../test-utils/verification/slot-fixtures';

// The exporter's equivalence rules, one at a time (docs/numerical-oracle-plan.md
// § Equivalence rules). Each builds a small drawing, encodes and decodes it the
// way a published case is, and reads what the oracle is told.

function exported(
  fixture: MechanismFixture,
  speed: PublishedSpeed = {},
  unit?: LengthUnit
): OracleProblem {
  const { target, settings } = decodeDrawing(fixturePayload(fixture, undefined, speed));
  if (unit !== undefined) settings.lengthUnit.next(unit);
  const [partition] = partitionMechanisms(target.joints, target.links, target.forces).mechanisms;
  return exportPartition('spec', 'spec', partition, settings);
}

const pin = (problem: OracleProblem, id: string): OraclePin =>
  problem.joints.find((joint) => joint.id === id) as OraclePin;
const slider = (problem: OracleProblem, id: string): OracleSlider =>
  problem.joints.find((joint) => joint.id === id) as OracleSlider;
const close = (actual: number[], expected: number[]): void =>
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 12));

function fourBar(extra: Partial<MechanismFixture> = {}): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 2 },
      { id: 'C', x: 5, y: 3 },
      { id: 'D', x: 6, y: 0, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 5, moi: 2 },
      { joints: 'BC', mass: 8, moi: 3, com: [2.5, 3] },
      { joints: 'CD', mass: 4, moi: 1 },
    ],
    inputAngVel: 1,
    ...extra,
  };
}

describe('the oracle exporter', () => {
  it('uses the same unit table as the app, written out on its own', () => {
    for (const unit of ['cm', 'in', 'm'] as const) {
      const app = siUnitFactors(unit);
      const own = siFactors(unit);
      expect(own.meters).toBeCloseTo(app.distanceToM, 15);
      expect(own.kilograms).toBeCloseTo(app.massToKg, 15);
      expect(own.kilogramMetersSquared).toBeCloseTo(app.inertiaToKgM2, 15);
      expect(own.newtons).toBeCloseTo(app.forceToN, 12);
    }
  });

  it('writes lengths, masses, inertias and a custom center of mass in SI', () => {
    const problem = exported(fourBar());
    close(pin(problem, 'B').at, [0.01, 0.02]);
    const coupler = problem.bodies.find((body) => body.id === 'BC')!;
    // A metric drawing stores grams and kg·cm².
    expect(coupler.mass).toBeCloseTo(0.008, 15);
    expect(coupler.inertia).toBeCloseTo(3e-4, 15);
    close(coupler.com, [0.025, 0.03]);
    expect(pin(problem, 'A')).toEqual(
      expect.objectContaining({ grounded: true, bodies: ['AB'], welded: false })
    );
  });

  it('reads an inch drawing in inches, pounds and pound-force', () => {
    const problem = exported(fourBar(), {}, LengthUnit.INCH);
    close(pin(problem, 'B').at, [0.0254, 0.0508]);
    expect(problem.bodies.find((body) => body.id === 'BC')!.mass).toBeCloseTo(8 * 0.45359237, 12);
  });

  it('drives at the joint’s own rpm, or at the document’s, turning clockwise by default', () => {
    const own = exported(
      fourBar({
        joints: fourBar().joints.map((j) => (j.id === 'A' ? { ...j, driveSpeed: 30 } : j)),
      })
    );
    expect(own.driver!.speed).toBeCloseTo(Math.PI, 12);
    const fallback = exported(fourBar(), { rpm: 12 });
    // The document default turns clockwise: negative, as drive-direction.ts says.
    expect(fallback.driver!.speed).toBeCloseTo((-12 * Math.PI) / 30, 12);
    expect(fallback.driver!.bodies).toEqual(['ground', 'AB']);
    expect(fallback.sweep.step).toBeCloseTo(Math.PI / 180, 15);
  });

  it('keeps a global load fixed in the world and turns a local one with its body', () => {
    const problem = exported(
      fourBar({
        loads: [
          { onLink: 'BC', at: [3, 2.5], vector: [3, 4] },
          { onLink: 'CD', at: [5.5, 1.5], vector: [0, -2], local: true },
        ],
      })
    );
    const [global, local] = problem.loads;
    expect(global).toEqual(expect.objectContaining({ body: 'BC', frame: 'global' }));
    close(global.at, [0.03, 0.025]);
    close(global.vector, [3, 4]);
    expect(local).toEqual(expect.objectContaining({ body: 'CD', frame: 'local' }));
    close(local.vector, [0, -2]);
  });

  it('cuts a floating slot into its carrier, along the carrier joints a to b', () => {
    const problem = exported(invertedSliderCrankFixture());
    const slot = slider(problem, 'B');
    expect(slot.guide).toBe('CD');
    expect(slot.riders).toEqual(['AB']);
    expect(slot.rotates).toBe(true);
    const c = pin(problem, 'C').at;
    close(slot.linePoint, c);
    const d = problem.points.find((p) => p.id === 'D')!.at;
    const length = Math.hypot(d[0] - c[0], d[1] - c[1]);
    close(slot.axis, [(d[0] - c[0]) / length, (d[1] - c[1]) / length]);
    expect(problem.unsupported).toContain('floating slot B: slot-end limits');
  });

  it('turns the axis round when the slot is cut b to a, and keeps the line', () => {
    const ab = slider(exported(scotchYokeFixture(false)), 'B');
    const ba = slider(exported(scotchYokeFixture(true)), 'B');
    close(ba.axis, [-ab.axis[0], -ab.axis[1]]);
    // Both line points lie on the same line through the pin.
    const across = (s: OracleSlider): number =>
      (s.at[0] - s.linePoint[0]) * s.axis[1] - (s.at[1] - s.linePoint[1]) * s.axis[0];
    expect(across(ab)).toBeCloseTo(0, 12);
    expect(across(ba)).toBeCloseTo(0, 12);
  });

  it('locks a Slide’s rider against its block, and lets a pin-in-slot turn', () => {
    const yoke = exported(scotchYokeFixture());
    // The weld at C makes the grounded slider at C a Slide.
    expect(slider(yoke, 'C')).toEqual(
      expect.objectContaining({ guide: 'ground', rotates: false, riders: ['CD'] })
    );
    expect(slider(yoke, 'B').rotates).toBe(true);
  });

  it('locks welded bars to each other at a grounded pivot, and not to the ground', () => {
    const welded = exported({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 2, y: 0 },
        { id: 'E', x: 0, y: 2 },
      ],
      links: [{ joints: 'AB' }, { joints: 'AE' }],
      welds: ['A'],
      inputAngVel: 1,
    });
    // One revolute to the ground, and a rotation lock between the two bars:
    // the pair turns about A as one body, which is what the input drives.
    expect(pin(welded, 'A')).toEqual(
      expect.objectContaining({ grounded: true, bodies: ['AB', 'AE'], welded: true })
    );
    expect(welded.driver!.bodies).toEqual(['ground', 'AB']);
  });

  it('makes a welded compound one body, with its members inside it', () => {
    const problem = exported({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 2, y: 0 },
        { id: 'C', x: 3, y: 2 },
      ],
      links: [{ joints: 'ABC', subset: [{ joints: 'AB' }, { joints: 'BC' }] }],
      inputAngVel: 1,
    });
    expect(problem.bodies.map((body) => body.id)).toEqual(['ABC']);
    // B joins two members of one body: no constraint is left to write there.
    expect(problem.joints.map((joint) => joint.id)).toEqual(['A']);
    expect(problem.points.find((p) => p.id === 'B')!.body).toBe('ABC');
  });
});
