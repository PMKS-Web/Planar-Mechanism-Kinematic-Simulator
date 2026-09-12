import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analysisConstraints,
  analysisForces,
  analysisPoint,
  analysisState,
} from '../../model/analysis-equations';
import { AnalysisExportModel } from '../../model/analysis-export';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { buildMechanismFixture } from '../../../tests/fixtures/mechanism-fixtures';
import { FIXTURE_GALLERY, fixturePayload } from '../../../test-utils/verification/fixture-gallery';
import { analysisExportModel } from './matlab-model';
import { equationPlan, matlabIdentifiers } from './matlab/equation-plan';
import { forceBalance } from './matlab/force-equations';
import { matlabPackage } from './matlab/package';
import { utf8, zipStore } from './zip';

function fixture(name: string) {
  if (name === 'M1') return buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']).mechanism;
  const entry = FIXTURE_GALLERY.find((e) => e.name === name)!;
  return buildMechanismFixture(fixturePayload(entry.fixture, entry.objectScale, entry.speed))
    .mechanism;
}

/** Evaluate only the rendered scalar balance vocabulary, not MATLAB or arbitrary user text. */
function scalar(expression: string, values: Record<string, number | number[]>) {
  const tokens = expression.match(
    /\d+(?:\.\d*)?(?:e[+-]?\d+)?|[a-zA-Z]\w*(?:\([12]\))?|[+*/()-]/gi
  )!;
  const code = tokens
    .map((token) => {
      if (!/^[a-zA-Z]/.test(token)) return token;
      const [, key, index] = token.match(/^(\w+)(?:\(([12])\))?$/)!;
      expect(Object.hasOwn(values, key)).toBe(true);
      const value = index ? (values[key] as number[])[+index - 1] : values[key];
      expect(typeof value).toBe('number');
      return `(${value})`;
    })
    .join(' ');
  return Function(`"use strict"; return (${code});`)() as number;
}

function allChannels(m: AnalysisExportModel) {
  for (const [index, joint] of m.joints.entries()) {
    for (const [quantity, unit] of [
      ['jointPosition', 'm'],
      ['jointVelocity', 'm/s'],
      ['jointAcceleration', 'm/s^2'],
    ] as const)
      for (const component of [0, 1, 2] as const)
        m.channels.push({
          label: `${joint.name} ${quantity} ${['X', 'Y', 'Magnitude'][component]}`,
          quantity,
          unit,
          index,
          body: -1,
          component,
          period: 0,
        });
  }
  for (const [index, body] of m.bodies.entries()) {
    if (body.dof === 3)
      for (const [quantity, unit] of [
        ['angle', 'rad'],
        ['omega', 'rad/s'],
        ['alpha', 'rad/s^2'],
      ] as const)
        m.channels.push({
          label: `${body.name} ${quantity}`,
          quantity,
          unit,
          index,
          body: -1,
          component: 0,
          period: quantity === 'angle' ? 2 * Math.PI : 0,
        });
    for (const [quantity, unit] of [
      ['bodyPosition', 'm'],
      ['bodyVelocity', 'm/s'],
      ['bodyAcceleration', 'm/s^2'],
    ] as const)
      for (const component of [0, 1] as const)
        m.channels.push({
          label: `${body.name} CoM ${quantity} ${['X', 'Y'][component]}`,
          quantity,
          unit,
          index,
          body: -1,
          component,
          period: 0,
        });
  }
  if (m.settings.forceMode !== 'none') {
    const seen = new Set<string>();
    for (const c of m.constraints)
      for (const body of [c.positive.body, c.negative.body]) {
        const key = `${c.joint}:${body}`;
        if (body < 0 || seen.has(key)) continue;
        seen.add(key);
        for (const component of [0, 1, 2] as const)
          m.channels.push({
            label: `${m.joints[c.joint].name} on ${m.bodies[body].name} ${['X', 'Y', 'Magnitude'][component]}`,
            quantity: 'reaction',
            unit: 'N',
            index: c.joint,
            body,
            component,
            period: 0,
          });
      }
    m.channels.push({
      label: 'Driver torque',
      quantity: 'torque',
      unit: 'N*m',
      index: -1,
      body: -1,
      component: 0,
      period: 0,
    });
  }
}

function saveExample(m: AnalysisExportModel, stem: string) {
  if (!process.env['PMKS_WRITE_MATLAB']) return;
  const directory = join(process.env['PMKS_WRITE_MATLAB'], 'readable-equations');
  const files = matlabPackage(m);
  const entries = Object.entries(files).map(([name, text]) => {
    const path = join(directory, stem, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
    return { name: `${stem}/${name}`, data: utf8(text) };
  });
  writeFileSync(join(directory, stem + '.zip'), zipStore(entries));
}

describe('mechanism-specific MATLAB engineering equations', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  for (const name of ['M1', 'TeachingLab four-bar', 'TeachingLab slider-crank', 'Stephenson III']) {
    it(`keeps rendered constraints and signed FBD equations consistent for ${name}`, () => {
      const mechanism = fixture(name),
        m = analysisExportModel(mechanism, 'dynamic', name);
      const p = equationPlan(m),
        files = matlabPackage(m);
      expect(files['solve_position.m']).toContain('position_equations(m,q,zero,angle)');
      expect(files['solve_velocity.m']).toContain('velocity_equations(m,q,angle,omega)');
      expect(files['solve_acceleration.m']).toContain('acceleration_equations(m,q,v,angle,alpha)');
      expect(files['solve_forces.m']).toContain('force_equations(m,q,a,J)');
      expect(files['run_pmks_analysis.m']).toContain('validate_equations(m);');
      expect(files['validate_equations.m']).toContain('pmks.constraints(m,q,v,angle)');
      // Mixed nonzero properties/loads exercise all signs, moment arms and local transforms.
      m.bodies.forEach((body) => {
        body.mass = 0.2;
        body.inertia = body.dof === 3 ? 0.0001 : 0;
      });
      m.loads = [
        { id: 'world', body: 1, point: [0.002, -0.001], force: [2, 3], local: false },
        { id: 'local', body: 0, point: [-0.001, 0.003], force: [-1, 2], local: true },
      ];
      let q = m.initial;
      for (let frame = 0; frame <= 120; frame++) {
        const state = analysisState(m, q, mechanism.timeNum[frame]);
        q = state.q;
        if (frame % 30) continue;
        const angle = q[p.driver.coordinate],
          reference = analysisConstraints(m, q, state.v, angle);
        const points = p.points.map((point) => analysisPoint(m, q, state.v, point.point));
        for (const row of p.rows) {
          const a = points[row.positive],
            b = points[row.negative],
            n = row.constraint.normal;
          const project = (x: number[], y: number[]) => n[0] * (x[0] - y[0]) + n[1] * (x[1] - y[1]);
          expect(project(a.p, b.p)).toBeCloseTo(reference.c[row.index], 12);
          expect(project(a.curvature, b.curvature)).toBeCloseTo(reference.curvature[row.index], 12);
          for (let i = 0; i < q.length; i++)
            expect(
              project(
                a.D.map((d) => d[i]),
                b.D.map((d) => d[i])
              )
            ).toBeCloseTo(reference.J[row.index][i], 12);
          expect(files['position_equations.m']).toContain(
            `J(${row.index + 1},:) = n_${row.name}*(D_${p.points[row.positive].name}-D_${p.points[row.negative].name});`
          );
          for (const file of [
            'position_equations.m',
            'velocity_equations.m',
            'acceleration_equations.m',
            'ANALYSIS_README.md',
          ])
            expect(files[file]).toContain(`Row ${row.index + 1}: ${row.description}.`);
        }
        for (const mode of ['static', 'dynamic'] as const) {
          m.settings.forceMode = mode;
          const lambda = analysisForces(m, q, state.a, state.J);
          const values: Record<string, number | number[]> = {
            gravity: m.gravity,
            T_driver: lambda.at(-1)!,
          };
          p.rows.forEach((row) => {
            values[row.name] = lambda[row.index];
          });
          p.points.forEach((point, i) => {
            if (point.body < 0) return;
            const at = m.bodies[point.body].offset;
            values['r_' + point.name] = [points[i].p[0] - q[at], points[i].p[1] - q[at + 1]];
          });
          m.bodies.forEach((body, i) => {
            const key = p.bodies[i],
              at = body.offset;
            Object.assign(values, {
              ['mass_' + key]: body.mass,
              ['inertia_' + key]: body.inertia,
              ['ax_' + key]: mode === 'dynamic' ? state.a[at] : 0,
              ['ay_' + key]: mode === 'dynamic' ? state.a[at + 1] : 0,
              ['alpha_' + key]: mode === 'dynamic' && body.dof === 3 ? state.a[at + 2] : 0,
              ['applied_Fx_' + key]: 0,
              ['applied_Fy_' + key]: 0,
              ['applied_M_' + key]: 0,
            });
            const phi = body.dof === 3 ? q[at + 2] : 0,
              c = Math.cos(phi),
              s = Math.sin(phi);
            for (const load of m.loads.filter((l) => l.body === i)) {
              const r = [
                c * load.point[0] - s * load.point[1],
                s * load.point[0] + c * load.point[1],
              ];
              const f = load.local
                ? [c * load.force[0] - s * load.force[1], s * load.force[0] + c * load.force[1]]
                : load.force;
              values['applied_Fx_' + key] = (values['applied_Fx_' + key] as number) + f[0];
              values['applied_Fy_' + key] = (values['applied_Fy_' + key] as number) + f[1];
              values['applied_M_' + key] =
                (values['applied_M_' + key] as number) + r[0] * f[1] - r[1] * f[0];
            }
          });
          for (const row of p.forceRows) {
            const text = forceBalance(p, row),
              [left, right] = text.split(' = ');
            const actual = scalar(left, values),
              expected = scalar(right, values);
            expect(Math.abs(actual - expected) / Math.max(1, Math.abs(expected))).toBeLessThan(
              1e-7
            );
            expect(files['force_equations.m']).toContain('% ' + text);
            expect(files['ANALYSIS_README.md']).toContain(text);
            expect(files['force_equations.m']).toContain(
              `A_force(${row.coordinate + 1},:) = J(:,${row.coordinate + 1})';`
            );
          }
        }
      }
    });
  }

  it('uses collision-safe MATLAB fields and exposes named arrays without resampling', () => {
    const labels = [
      'end',
      'item_end',
      '1',
      'A-B',
      'A B',
      'x'.repeat(80),
      'x'.repeat(80),
      '中文',
      '',
    ];
    const names = matlabIdentifiers(labels);
    expect(new Set(names).size).toBe(labels.length);
    for (const name of names) expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,62}$/);
    expect(matlabIdentifiers(labels)).toEqual(names);
    const m = analysisExportModel(fixture('M1'), 'dynamic');
    const files = matlabPackage(m);
    expect(files['velocity_equations.m']).toContain(
      '% v_B_on_AB = [vx_AB; vy_AB] + omega_AB*[-r_B_on_AB(2);r_B_on_AB(1)];'
    );
    expect(files['acceleration_equations.m']).toContain(
      '% a_B_on_AB = [ax_AB; ay_AB] + alpha_AB*[-r_B_on_AB(2);r_B_on_AB(1)] - omega_AB^2*r_B_on_AB;'
    );
    expect(files['named_results.m']).toContain(
      "r.joints.B.position = reshape(r.jointPosition(2,:,:),2,[])';"
    );
    expect(files['named_results.m']).toContain("r.bodies.BC.angularVelocity = r.v(6,:)';");
    expect(files['named_results.m']).toContain(
      "r.reactions.B.BC = reshape(r.reaction(2,2,:,:),2,[])';"
    );
    expect(files['named_results.m']).toContain("r.forceUnknowns.B_on_AB_x = r.lambda(3,:)';");
    expect(files['named_results.m']).not.toContain('solve_');
    expect(files['plot_results.m']).toContain(
      "names = {'Position','Velocity','Acceleration','Force'}"
    );
    expect(files['plot_results.m']).toContain('subplot(rows,columns,u)');
    expect(files['plot_results.m']).not.toContain("figure('Name',c.label)");
  });

  it('writes representative M1 and Stephenson packages and coherent kinematics-only content', () => {
    const original = analysisExportModel(fixture('M1'), 'none', 'M1');
    // Exact geometry and clockwise drive from the inspected pmks_M1_kinematics_analysis.zip.
    expect(original.joints.map((j) => j.initial)).toEqual([
      [-0.03129, -0.020139999999999998],
      [-0.02622, 0.00902],
      [0.03009, 0.020800000000000003],
      [0.03341, -0.01646],
    ]);
    expect(original.driver.segments[0][2]).toBeCloseTo(-Math.PI / 3, 12);
    allChannels(original);
    saveExample(original, 'pmks_M1_kinematics_analysis');
    const files = matlabPackage(original);
    expect(files['solve_forces.m']).toBeUndefined();
    expect(files['force_equations.m']).toBeUndefined();
    for (const file of ['run_pmks_analysis.m', 'named_results.m', 'validate_equations.m'])
      expect(files[file]).not.toContain('force_equations(');
    expect(files['README.txt']).toContain('Objective-C');
    expect(files['ANALYSIS_README.md']).toContain('Ground spacing A to D');
    const dynamic = structuredClone(original);
    dynamic.settings.forceMode = 'dynamic';
    dynamic.channels = [];
    dynamic.bodies.forEach((body) => {
      body.mass = 0.2;
      body.inertia = 0.0001;
    });
    allChannels(dynamic);
    saveExample(dynamic, 'pmks_M1_dynamic_analysis');
    const stephenson = analysisExportModel(fixture('Stephenson III'), 'dynamic', 'Stephenson III');
    allChannels(stephenson);
    saveExample(stephenson, 'pmks_Stephenson_III_analysis');
    const incompatible = structuredClone(original);
    incompatible.channels = dynamic.channels;
    expect(() => matlabPackage(incompatible)).toThrow(/Force result channels/);
    for (const m of [dynamic, stephenson]) {
      const independent = matlabPackage(m),
        verified = matlabPackage(m, true, 'Time,Value1\n0,0');
      for (const [name, text] of Object.entries(independent)) expect(verified[name]).toBe(text);
    }
  });
});
