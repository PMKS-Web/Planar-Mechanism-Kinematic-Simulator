import { RealLink } from '../../model/link';
import { MODEL_SCALE } from '../../model/render-scale';
import { buildMechanismFixture } from '../../../tests/fixtures/mechanism-fixtures';
import { FIXTURE_GALLERY, fixturePayload } from '../../../test-utils/verification/fixture-gallery';
import { ExportTable } from './export-table.service';
import {
  matlabGeometry,
  matlabGeometryReason,
  MATLAB_KINEMATICS_FUNCTIONS,
} from './matlab-mechanism';
import {
  matlabMatrix,
  matlabFileName,
  matlabResults,
  matlabString,
  MATLAB_COMPARISON_FUNCTION,
} from './matlab-writer';

function fixture(name: string) {
  const entry = FIXTURE_GALLERY.find((entry) => entry.name === name)!;
  return buildMechanismFixture(fixturePayload(entry.fixture, entry.objectScale, entry.speed));
}

/** Read the actual exported numeric literals, so the test also covers MATLAB's row/column layout. */
function matrix(script: string, name: string): number[][] {
  const literal = script.match(new RegExp(`${name} = \\[([\\s\\S]*?)\\];`))![1];
  return literal
    .trim()
    .split(';')
    .map((row) => row.trim().split(/\s+/).map(Number));
}

describe('MATLAB export', () => {
  it('uses valid, distinct MATLAB script names even when a user types punctuation or a long name', () => {
    expect(matlabFileName('4-bar analysis')).toBe('pmks_4_bar_analysis.m');
    const first = matlabFileName('a'.repeat(100), 'M1');
    const second = matlabFileName('a'.repeat(100), 'M2');
    expect(first.slice(0, -2).length).toBeLessThanOrEqual(63);
    expect(first).not.toBe(second);
  });
  it('escapes names as text and preserves missing samples and full precision', () => {
    expect(matlabString("A's\nload")).toBe("'A''s load'");
    expect(matlabMatrix([[1.23456789012345, NaN, Infinity, -Infinity]])).toContain(
      '1.23456789012345 NaN Inf -Inf'
    );
    const table: ExportTable = {
      name: 'M2',
      suffix: 'M2',
      mechanismIndex: 1,
      times: [0, 0.37],
      heads: ['Time (s)', "A's force (N)"],
      columns: [[1.23456789012345, NaN]],
      plots: [
        {
          title: "A's force",
          head: '',
          unit: 'N',
          columnKey: 'f',
          partKey: 'M2|joint:A',
          mechanismIndex: 1,
          series: [{ name: 'X', values: [1.23456789012345, NaN] }],
        },
      ],
    };
    const script = matlabResults(table, 'https://example.test/?mechanism');
    expect(matrix(script, 'reference')).toEqual([
      [0, 1.23456789012345],
      [0.37, NaN],
    ]);
    expect(script).toContain("labels = {'A''s force (N)'}");
    expect(script).toContain('not independently solved by MATLAB');
    expect(MATLAB_COMPARISON_FUNCTION).not.toContain("'extrap'");
    expect(MATLAB_KINEMATICS_FUNCTIONS).toContain('q = q - J\\c;');
  });

  for (const name of ['TeachingLab four-bar', 'TeachingLab slider-crank']) {
    it(`exports geometry that satisfies every PMKS pose of ${name}`, () => {
      const { mechanism } = fixture(name);
      expect(matlabGeometryReason(mechanism)).toBe('');
      const script = matlabGeometry(mechanism);
      const constraints = matrix(script, 'point_constraints');
      const bodyIds = script
        .match(/body_ids = \{([^}]+)\}/)![1]
        .split(', ')
        .map((name) => name.slice(1, -1));
      const start = bodyIds.map(
        (id) => mechanism.links[0].find((link) => link.id === id) as RealLink
      );
      const angle = (body: RealLink) =>
        Math.atan2(body.joints[1].y - body.joints[0].y, body.joints[1].x - body.joints[0].x);
      let worst = 0;
      for (const frame of mechanism.links) {
        const bodies = bodyIds.map((id) => frame.find((link) => link.id === id) as RealLink);
        const point = ([body, x, y]: number[]) => {
          if (body === 0) return [x, y];
          const phi = angle(bodies[body - 1]) - angle(start[body - 1]);
          return [
            bodies[body - 1].CoM.x / MODEL_SCALE + Math.cos(phi) * x - Math.sin(phi) * y,
            bodies[body - 1].CoM.y / MODEL_SCALE + Math.sin(phi) * x + Math.cos(phi) * y,
          ];
        };
        for (const row of constraints) {
          const a = point(row.slice(0, 3));
          const b = point(row.slice(3, 6));
          worst = Math.max(worst, Math.abs(row[6] * (a[0] - b[0]) + row[7] * (a[1] - b[1])));
        }
      }
      expect(worst).toBeLessThan(1e-6);
      expect(matrix(script, 'initial_q').length).toBe(bodyIds.length * 3);
      expect(matrix(script, 'joint_points').length).toBe(mechanism.joints[0].length);
    });
  }

  it('states the limit for a reversing input instead of exporting a constant-speed solver', () => {
    const { mechanism } = fixture('TeachingLab four-bar');
    mechanism.inputAngularVelocities[2] *= -1;
    expect(matlabGeometryReason(mechanism)).toContain('Reversing');
    expect(matlabGeometry(mechanism)).not.toContain('initial_q =');
  });

  for (const name of ['Stephenson III', 'Watt I']) {
    it(`reports the reversing drive in ${name} without promising a full rotation`, () => {
      const { mechanism } = fixture(name);
      expect(matlabGeometryReason(mechanism)).toContain('Reversing');
      expect(matlabGeometry(mechanism)).not.toContain('initial_q =');
    });
  }
});
