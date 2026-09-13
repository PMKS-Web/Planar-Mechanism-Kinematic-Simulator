import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { buildMechanismFixture } from '../../../tests/fixtures/mechanism-fixtures';
import { FIXTURE_GALLERY, fixturePayload } from '../../../test-utils/verification/fixture-gallery';
import { analysisExportModel } from './matlab-model';
import { matlabPackage } from './matlab/package';
import { equationPlan } from './matlab/equation-plan';
import { VALIDATION_TOLERANCES } from './matlab/runtime-validation';
import { mechanismSvg } from './mechanism-svg';

/** Generated MATLAB contracts, not a claim that MATLAB executed these files. */
describe('MATLAB runtime validation package contracts', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  for (const mode of ['none', 'static', 'dynamic'] as const) {
    it(`validates the actual ${mode} equations and keeps comparison optional`, () => {
      const mechanism = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']).mechanism;
      const m = analysisExportModel(mechanism, mode);
      const files = matlabPackage(m);
      const validator = files['validate_pmks_package.m'];
      const check = files['+pmks/validate_results.m'];
      expect(validator).toContain('results = run_pmks_analysis(false,false)');
      expect(validator.indexOf('run_pmks_analysis(')).toBeLessThan(
        validator.indexOf("exist(reference,'file')")
      );
      expect(validator).toContain('report = pmks.validate_results(results)');
      expect(files['run_pmks_analysis.m']).toContain('time = pmks.time_grid(m)');
      for (const equation of [
        'position_equations(m,q,v,angle)',
        'velocity_equations(m,q,angle,omega)',
        'acceleration_equations(m,q,v,angle,alpha)',
      ])
        expect(check).toContain(equation);
      expect(check).toContain('Jv*v-b_velocity');
      expect(check).toContain('Ja*a-b_acceleration');
      if (mode === 'none') {
        expect(files['solve_forces.m']).toBeUndefined();
        expect(files['force_equations.m']).toBeUndefined();
        expect(check).not.toMatch(/force_equations|r\.lambda|report\.force/);
      } else {
        expect(check).toContain('[A_force,b_force] = force_equations(m,q,a,J)');
        expect(check).toContain('A_force*r.lambda(:,k)-b_force');
        for (const row of equationPlan(m).forceRows) {
          const field = `${equationPlan(m).bodies[row.body]}.${['Fx', 'Fy', 'moment'][row.axis]}`;
          expect(check).toContain(
            `report.force.byBody.${field} = pmks.residual_metrics(F(${row.coordinate + 1},:)`
          );
        }
      }
      expect(files['pmks_reference.csv']).toBeUndefined();
      expect(files['measurements.csv']).toBeUndefined();
      expect(files['compare_measurements.m']).toBeUndefined();
      expect(files['mechanism.svg']).toBeUndefined();
      expect(files['ANALYSIS_README.md']).not.toContain('](mechanism.svg)');
      const withOptions = matlabPackage(m, true, 'Time,Value1\n0,0');
      expect(withOptions['measurements.csv']).toBe('Time,Value\n');
      expect(withOptions['compare_measurements.m']).toBeTruthy();
      expect(withOptions['pmks_reference.csv']).toBe('Time,Value1\n0,0');
      for (const [name, text] of Object.entries(files)) expect(withOptions[name]).toBe(text);
      expect(files).toEqual(matlabPackage(structuredClone(m)));
    });
  }

  it('emits explicit failure and warning policies, frame diagnostics and a shareable report', () => {
    const files = matlabPackage(
      analysisExportModel(buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']).mechanism, 'dynamic')
    );
    const check = files['+pmks/validate_results.m'],
      entry = files['validate_pmks_package.m'];
    expect(check).toContain('for k = find(kinematic_valid)');
    expect(check).toContain('report.frames.failed = count-report.frames.solved');
    expect(check).toContain('report.frames.firstFailedTime = r.time(first)');
    expect(check).toContain('sum(isnan(raw(:)))');
    expect(check).toContain('sum(isinf(raw(:)))');
    expect(check).toContain("report.coreStatus = 'WARN';");
    expect(check).toContain('Near-singular solved configuration');
    expect(check).toContain('Partial completion:');
    expect(check).toContain('report.frames.solved==0 || report.frames.equationFailures>0');
    expect(check).toContain('|| bad_residual');
    expect(check).toContain("report.coreStatus = 'FAIL';");
    expect(entry).toContain('catch failure');
    expect(entry).toContain('failure.identifier');
    expect(entry).toContain('Could not save validation report:');
    expect(entry).toContain('known PMKS canvas-scale/mass-property issue');
    expect(entry).toContain("report.pmks.status = 'WARN'");
    expect(entry).toContain("if nargin < 2, report_file = ''; end");
    expect(files['+pmks/validation_text.m']).toContain("['CORE STATUS: ' r.coreStatus]");
    expect(files['+pmks/residual_metrics.m']).toContain('absolute+relative*scale(valid)');
    expect(VALIDATION_TOLERANCES).toEqual({
      absolute: 1e-8,
      relative: 1e-8,
      nearSingular: 1e-8,
      comparisonPosition: 1e-6,
      comparisonOther: 1e-4,
    });
    for (const name of ['ANALYSIS_README.md', 'README.txt', 'mechanism_data.m']) {
      expect(files[name]).toContain('3 cm');
      expect(files[name]).toContain('0.03 m');
    }
    expect(files['README.txt']).toContain(
      "validate_pmks_package(true,'pmks_validation_report.txt')"
    );
  });

  it('packages an escaped initial-state drawing through the existing renderer', () => {
    const mechanism = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']).mechanism;
    mechanism.joints[0][0].name = 'A<&';
    mechanism.links[0][0].name = 'AB<&';
    const draw = () =>
      mechanismSvg(mechanism.joints[0], mechanism.links[0], 960, 640, { engineering: true });
    const svg = draw();
    expect(svg).toContain('A&lt;&amp;');
    expect(svg).toContain('AB&lt;&amp;');
    expect(svg).toContain('rotary driver');
    expect(svg).toContain('L '); // Ground triangles.
    const m = analysisExportModel(mechanism);
    const files = matlabPackage(m, false, undefined, svg);
    expect(files['mechanism.svg']).toBe(svg);
    expect(files['ANALYSIS_README.md']).toContain('](mechanism.svg)');
    const later = mechanism.joints[1][1];
    later.x += 100; // A playback pose must never determine the exported initial image.
    expect(draw()).toBe(svg);
    expect(mechanismSvg(mechanism.joints[0], mechanism.links[0], 330, 230)).not.toContain(
      'rotary driver'
    );
  });

  it('labels the slider body and omits an invented slider moment equation', () => {
    const entry = FIXTURE_GALLERY.find((e) => e.name === 'TeachingLab slider-crank')!;
    const mechanism = buildMechanismFixture(
      fixturePayload(entry.fixture, entry.objectScale, entry.speed)
    ).mechanism;
    const m = analysisExportModel(mechanism, 'dynamic');
    const p = equationPlan(m),
      sliderIndex = m.bodies.findIndex((b) => b.dof === 2);
    expect(sliderIndex).toBeGreaterThanOrEqual(0);
    const files = matlabPackage(m);
    expect(files['+pmks/validate_results.m']).toContain(`byBody.${p.bodies[sliderIndex]}.Fx`);
    expect(files['+pmks/validate_results.m']).not.toContain(
      `byBody.${p.bodies[sliderIndex]}.moment`
    );
    const svg = mechanismSvg(mechanism.joints[0], mechanism.links[0], 960, 640, {
      engineering: true,
    });
    expect(svg).toContain('fixed guide');
    expect(svg).toContain('M -38 -14 H 38');
    expect(svg).toContain(`>${m.bodies[sliderIndex].name}</text>`);
  });
});
