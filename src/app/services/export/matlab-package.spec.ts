import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnalysisExportModel } from '../../model/analysis-export';
import {
  analysisConstraints,
  analysisForces,
  analysisPoint,
  analysisState,
} from '../../model/analysis-equations';
import { Coord } from '../../model/coord';
import { Force } from '../../model/force';
import { Joint, RealJoint } from '../../model/joint';
import { RealLink, SliderBlock } from '../../model/link';
import { ForceSolver } from '../../model/mechanism/force-solver';
import { KinematicsSolver } from '../../model/mechanism/kinematic-solver';
import { MODEL_SCALE } from '../../model/render-scale';
import { siUnitFactors } from '../../model/unit-conversions';
import { FIXTURE_GALLERY, fixturePayload } from '../../../test-utils/verification/fixture-gallery';
import { buildMechanismFixture } from '../../../tests/fixtures/mechanism-fixtures';
import { analysisExportModel, matlabReferenceFrames } from './matlab-model';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { matlabPackage, mechanismData } from './matlab/package';

function fixture(name: string) {
  if (name === 'Basic four-bar') return buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
  const entry = FIXTURE_GALLERY.find((e) => e.name === name)!;
  return buildMechanismFixture(fixturePayload(entry.fixture, entry.objectScale, entry.speed));
}
const error = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));

/** PMKS force equations on physical user-unit geometry, removing only the canvas magnification. */
function physicalFrame(joints: Joint[], links: (RealLink | SliderBlock)[]) {
  const js = joints.map((j) => {
    const clone = Object.assign(Object.create(Object.getPrototypeOf(j)), j) as Joint;
    clone.x = j.x / MODEL_SCALE;
    clone.y = j.y / MODEL_SCALE;
    return clone;
  });
  const ls = links.map((l) => {
    const points = l.joints.map((j) => js.find((p) => p.id === j.id)!);
    if (!(l instanceof RealLink)) return new SliderBlock(l.id, points, l.mass);
    const b = new RealLink(
      l.id,
      points,
      l.mass,
      l.massMoI,
      new Coord(l.CoM.x / MODEL_SCALE, l.CoM.y / MODEL_SCALE)
    );
    b.forces = l.forces.map(
      (f) =>
        new Force(
          f.id,
          b,
          new Coord(f.startCoord.x / MODEL_SCALE, f.startCoord.y / MODEL_SCALE),
          new Coord(f.endCoord.x / MODEL_SCALE, f.endCoord.y / MODEL_SCALE),
          f.local,
          true,
          f.mag
        )
    );
    return b;
  });
  return { joints: js, links: ls };
}

describe('independent MATLAB analysis package equations', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  for (const name of [
    'Basic four-bar',
    'TeachingLab four-bar',
    'TeachingLab slider-crank',
    'Stephenson III',
  ]) {
    it(`independently solves ${name}, including rates and SI force equilibrium`, () => {
      const { mechanism } = fixture(name);
      const m = analysisExportModel(mechanism, 'dynamic', name);
      const length = siUnitFactors(mechanism.unit).distanceToM;
      let q = m.initial;
      const worst = {
        position: 0,
        velocity: 0,
        acceleration: 0,
        omega: 0,
        alpha: 0,
        force: 0,
        torque: 0,
      };
      let checked = 0;
      let forcePeak = 0,
        torquePeak = 0;
      const states: number[][] = [];
      for (let k = 0; k < mechanism.timeNum.length; k++) {
        const state = analysisState(m, q, mechanism.timeNum[k]);
        q = state.q;
        states.push(q);
        const lambda = analysisForces(m, q, state.a, state.J);
        KinematicsSolver.resetVariables();
        KinematicsSolver.requiredLoops = mechanism.requiredLoops;
        KinematicsSolver.determineKinematics(
          mechanism.joints[k],
          mechanism.links[k],
          mechanism.inputAngularVelocities[k]
        );
        // At an ideal drive reversal, compare only states on the same side of the velocity jump.
        if (
          k + 1 < mechanism.timeNum.length &&
          mechanism.inputAngularVelocities[k] !== mechanism.inputAngularVelocities[k + 1]
        )
          continue;
        m.joints.forEach((joint) => {
          const actual = mechanism.joints[k].find((j) => j.id === joint.id)!;
          const point = analysisPoint(m, q, state.v, joint.point);
          for (let d = 0; d < 2; d++) {
            worst.position = Math.max(
              worst.position,
              error(point.p[d], ((d === 0 ? actual.x : actual.y) / MODEL_SCALE) * length)
            );
            const v = KinematicsSolver.jointVelMap.get(joint.id)?.[d];
            const a = KinematicsSolver.jointAccMap.get(joint.id)?.[d];
            if (v !== undefined && Number.isFinite(v))
              worst.velocity = Math.max(
                worst.velocity,
                error(
                  point.D[d].reduce((s, x, i) => s + x * state.v[i], 0),
                  (v / MODEL_SCALE) * length
                )
              );
            if (a !== undefined && Number.isFinite(a))
              worst.acceleration = Math.max(
                worst.acceleration,
                error(
                  point.D[d].reduce((s, x, i) => s + x * state.a[i], 0) + point.curvature[d],
                  (a / MODEL_SCALE) * length
                )
              );
          }
        });
        m.bodies
          .filter((b) => b.dof === 3)
          .forEach((b) => {
            worst.omega = Math.max(
              worst.omega,
              error(state.v[b.offset + 2], KinematicsSolver.linkAngVelMap.get(b.id)!)
            );
            worst.alpha = Math.max(
              worst.alpha,
              error(state.a[b.offset + 2], KinematicsSolver.linkAngAccMap.get(b.id)!)
            );
          });
        const frame = physicalFrame(
          mechanism.joints[k],
          mechanism.links[k] as (RealLink | SliderBlock)[]
        );
        const kin: NonNullable<Parameters<typeof ForceSolver.analyzeFrame>[6]> = {
          linkAccelerations: new Map(),
          linkAngularAccelerations: new Map(),
          pistonAccelerations: new Map(),
        };
        m.bodies.forEach((b) => {
          const map = b.dof === 3 ? kin.linkAccelerations : kin.pistonAccelerations;
          // PMKS rates, not the independent rates, drive the reference equations.
          const rates =
            b.dof === 3
              ? KinematicsSolver.linkAccMap.get(b.id)
              : KinematicsSolver.jointAccMap.get(b.joints[0]);
          map.set(b.id, [(rates?.[0] ?? 0) / MODEL_SCALE, (rates?.[1] ?? 0) / MODEL_SCALE]);
          kin.linkAngularAccelerations.set(b.id, KinematicsSolver.linkAngAccMap.get(b.id) ?? 0);
        });
        const forces = ForceSolver.analyzeFrame(
          frame.joints,
          frame.links,
          'dynamic',
          mechanism.gravity,
          mechanism.unit,
          mechanism.timeNum[k],
          kin
        );
        expect(forces.status).toBe('ok');
        const reactions = new Map<string, number[]>();
        m.constraints.forEach((c, i) => {
          for (const [body, sign] of [
            [c.positive.body, 1],
            [c.negative.body, -1],
          ]) {
            if (body < 0) continue;
            const key = m.joints[c.joint].id + '|' + m.bodies[body].id;
            const value = reactions.get(key) ?? [0, 0];
            value[0] += sign * c.normal[0] * lambda[i];
            value[1] += sign * c.normal[1] * lambda[i];
            reactions.set(key, value);
          }
        });
        for (const [joint, byBody] of forces.jointReactionsByLink)
          for (const [body, values] of byBody) {
            const independent = reactions.get(joint + '|' + body)!;
            worst.force = Math.max(
              worst.force,
              ...values.map((v, d) => Math.abs(independent[d] - v))
            );
            forcePeak = Math.max(forcePeak, ...values.map(Math.abs));
          }
        worst.torque = Math.max(
          worst.torque,
          Math.abs(lambda.at(-1)! - forces.inputEffort!.valueSI)
        );
        torquePeak = Math.max(torquePeak, Math.abs(forces.inputEffort!.valueSI));
        checked++;
      }
      const normalizedForce = worst.force / Math.max(1, forcePeak),
        normalizedTorque = worst.torque / Math.max(1, torquePeak);
      console.info('MATLAB equation contract', name, checked, worst, {
        normalizedForce,
        normalizedTorque,
      });
      expect(checked).toBeGreaterThan(30);
      expect(worst.position).toBeLessThan(1e-6);
      // Near a fold, PMKS's finite position tolerance is amplified by the Jacobian.
      for (const value of [worst.velocity, worst.acceleration, worst.omega, worst.alpha])
        expect(value).toBeLessThan(1e-4);
      // Normalize forces by the cycle peak: relative error at a zero crossing is undefined.
      expect(normalizedForce).toBeLessThan(1e-4);
      expect(normalizedTorque).toBeLessThan(1e-4);
      if (process.env['PMKS_WRITE_MATLAB']) {
        const folder = join('artifacts', 'matlab-package-validation', name.replace(/\W+/g, '_'));
        mkdirSync(folder, { recursive: true });
        m.channels = [
          {
            label: 'Joint B X',
            quantity: 'jointPosition',
            index: m.joints.findIndex((j) => j.id === 'B'),
            body: -1,
            component: 0,
            unit: 'm',
            period: 0,
          },
        ];
        for (const [file, text] of Object.entries(matlabPackage(m))) {
          const path = join(folder, file);
          mkdirSync(join(path, '..'), { recursive: true });
          writeFileSync(path, text);
        }
        writeFileSync(
          join(folder, 'equation-validation.json'),
          JSON.stringify({ checked, worst, normalizedForce, normalizedTorque }, null, 2)
        );
      }
    });
  }

  it('has an analytic Jacobian consistent with finite differences and preserves a tracer', () => {
    const m = analysisExportModel(fixture('TeachingLab four-bar').mechanism);
    expect(m.joints.some((j) => j.tracer)).toBe(true);
    const { J } = analysisConstraints(
      m,
      m.initial,
      m.initial.map(() => 0),
      0
    );
    for (let i = 0; i < m.initial.length; i++) {
      const plus = [...m.initial],
        minus = [...m.initial];
      plus[i] += 1e-7;
      minus[i] -= 1e-7;
      const c1 = analysisConstraints(
        m,
        plus,
        m.initial.map(() => 0),
        0
      ).c;
      const c2 = analysisConstraints(
        m,
        minus,
        m.initial.map(() => 0),
        0
      ).c;
      J.forEach((row, k) => expect(Math.abs(row[i] - (c1[k] - c2[k]) / 2e-7)).toBeLessThan(1e-7));
    }
  });

  it('generates deterministic files, safe names and a solution with no reference data', () => {
    const m = analysisExportModel(fixture('TeachingLab four-bar').mechanism);
    m.name = "Student's mechanism";
    m.bodies[0].name = "A's crank\nend";
    const first = matlabPackage(m, false),
      second = matlabPackage(structuredClone(m), false);
    expect(first).toEqual(second);
    expect(first['pmks_reference.csv']).toBeUndefined();
    expect(first['compare_measurements.m']).toBeUndefined();
    expect(first['mechanism_data.m']).toContain("'A''s crank end'");
    for (const file of ['solve_position.m', 'solve_velocity.m', 'solve_acceleration.m']) {
      expect(first[file]).toBeTruthy();
      expect(first[file]).not.toContain('reference');
      expect(first[file]).not.toMatch(/\b(syms|fsolve|lsqnonlin)\b/);
    }
    expect(first['run_pmks_analysis.m'].indexOf('solve_position')).toBeLessThan(
      first['run_pmks_analysis.m'].indexOf('compare_pmks')
    );
    expect(first['mechanism_data.m']).not.toContain('reference =');
    expect(first['solve_forces.m']).toBeUndefined();
    expect(first['force_equations.m']).toBeUndefined();
    expect(first['run_pmks_analysis.m']).not.toContain('solve_forces(');
    expect(first['named_results.m']).not.toContain('r.reactions');
    expect(matlabPackage(m, true, 'Time,Value1\n0,1')['pmks_reference.csv']).toContain(
      'Time,Value1'
    );
    const clone: AnalysisExportModel = structuredClone(m);
    clone.loads = [];
    expect(mechanismData(clone)).toContain('m.loads = struct([])');
  });

  it('refuses unsupported slides before writing a package', () => {
    expect(() => analysisExportModel(fixture('Hydraulic cylinder').mechanism)).toThrow();
  });

  it('preserves reversed rotary travel and orders verification samples by elapsed time', () => {
    const mechanism = fixture('Basic four-bar').mechanism.withReversedDrive()!;
    const model = analysisExportModel(mechanism);
    const frames = matlabReferenceFrames(mechanism);
    expect(model.driver.segments).toHaveLength(1);
    expect(frames).toHaveLength(mechanism.timeNum.length);
    let q = model.initial;
    for (const [k, frame] of frames.entries()) {
      if (k) expect(frame.time).toBeGreaterThan(frames[k - 1].time);
      const state = analysisState(model, q, frame.time);
      q = state.q;
      model.joints.forEach((joint) => {
        const actual = mechanism.joints[frame.index].find((j) => j.id === joint.id)!;
        const point = analysisPoint(model, q, state.v, joint.point);
        const length = siUnitFactors(mechanism.unit).distanceToM / MODEL_SCALE;
        expect(
          Math.hypot(point.p[0] - actual.x * length, point.p[1] - actual.y * length)
        ).toBeLessThan(1e-6);
      });
    }
    expect(() =>
      analysisExportModel(fixture('Stephenson III').mechanism.withReversedDrive()!)
    ).toThrow(/Reversed playback/);
  });

  it('matches static equilibrium under local and world loads, and distinguishes the PMKS dynamic display-scale discrepancy', () => {
    const { mechanism } = fixture('Basic four-bar');
    const m = analysisExportModel(mechanism, 'dynamic');
    const units = siUnitFactors(mechanism.unit);
    // Define engineering properties explicitly in every PMKS frame, not prototype defaults.
    mechanism.links.forEach((links) =>
      links.forEach((b) => {
        b.mass = 0.2 / units.massToKg;
        if (b instanceof RealLink) b.massMoI = 0.0001 / units.inertiaToKgM2;
      })
    );
    const model = analysisExportModel(mechanism, 'dynamic');
    let state = analysisState(model, model.initial, 0);
    for (let k = 1; k <= 30; k++) state = analysisState(model, state.q, mechanism.timeNum[k]);
    const physical = analysisForces(model, state.q, state.a, state.J);
    const raw = mechanism.getForceAnalysis('dynamic').frames[30];
    expect(raw.status).toBe('ok');
    const displayedTorque = raw.inputEffort!.valueSI / MODEL_SCALE;
    const discrepancy = Math.abs(physical.at(-1)! - displayedTorque);
    expect(discrepancy).toBeGreaterThan(1e-6);
    console.info('Dynamic SI versus PMKS display torque', {
      independent: physical.at(-1),
      pmksDisplay: displayedTorque,
      discrepancy,
    });
    if (process.env['PMKS_WRITE_MATLAB']) {
      const directory = join(process.env['PMKS_WRITE_MATLAB'], 'dynamic-scale-discrepancy');
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, 'report.json'),
        JSON.stringify(
          {
            time: mechanism.timeNum[30],
            independentTorqueNm: physical.at(-1),
            pmksDisplayedTorqueNm: displayedTorque,
            absoluteDifferenceNm: discrepancy,
            bodyMassKg: 0.2,
            bodyInertiaKgM2: 0.0001,
          },
          null,
          2
        )
      );
    }
    // Check statics and load transformations at a later pose against PMKS free-body assembly.
    const frame = physicalFrame(
      mechanism.joints[30],
      mechanism.links[30] as (RealLink | SliderBlock)[]
    );
    for (const local of [false, true]) {
      const original = mechanism.links[0][1] as RealLink;
      original.forces = [
        new Force(
          'test_load',
          original,
          new Coord(original.CoM.x + 20, original.CoM.y - 10),
          new Coord(original.CoM.x + 25, original.CoM.y + 2),
          local,
          true,
          3
        ),
      ];
      const loaded = analysisExportModel(mechanism, 'static');
      const b = loaded.bodies[1],
        load = loaded.loads[0],
        phi = state.q[b.offset + 2];
      const c = Math.cos(phi),
        s = Math.sin(phi),
        r = [c * load.point[0] - s * load.point[1], s * load.point[0] + c * load.point[1]];
      const f = local
        ? [c * load.force[0] - s * load.force[1], s * load.force[0] + c * load.force[1]]
        : load.force;
      const body = frame.links[1] as RealLink;
      const start = new Coord(
        (state.q[b.offset] + r[0]) / units.distanceToM,
        (state.q[b.offset + 1] + r[1]) / units.distanceToM
      );
      body.forces = [
        new Force(
          'test_load',
          body,
          start,
          new Coord(start.x + f[0], start.y + f[1]),
          false,
          true,
          Math.hypot(...f) / units.forceToN
        ),
      ];
      const reference = ForceSolver.analyzeFrame(
        frame.joints,
        frame.links,
        'static',
        mechanism.gravity,
        mechanism.unit
      );
      expect(reference.status).toBe('ok');
      const lambda = analysisForces(loaded, state.q, state.a, state.J);
      expect(Math.abs(lambda.at(-1)! - reference.inputEffort!.valueSI)).toBeLessThan(1e-7);
    }
    expect(m.driver.segments[0][2]).not.toBe(0);
  });
});
