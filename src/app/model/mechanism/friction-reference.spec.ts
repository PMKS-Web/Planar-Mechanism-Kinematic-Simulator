import { RealJoint } from '../joint';
import { Coord } from '../coord';
import { RealLink } from '../link';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import { frictionSliderCrankFixture } from '../../../test-utils/verification/friction-fixtures';
import { ForceSolver } from './force-solver';

const csv = readFileSync('src/test-data/friction/reference.csv', 'utf8').trim().split(/\r?\n/);
const headers = csv.shift()!.split(',');
type ReferenceRow = Record<
  | 'angle'
  | 'omega'
  | 'load'
  | 'mu_pin'
  | 'x_b'
  | 'y_b'
  | 'x_c'
  | 'radius'
  | 'velocity'
  | 'rod_omega'
  | 'normal'
  | 'friction'
  | 'static_limit'
  | 'bearing_load'
  | 'bearing_torque'
  | 'input_effort'
  | 'power',
  number
>;
const rows = csv.map((line) => {
  const cells = line.split(',');
  return Object.fromEntries(
    headers.slice(1).map((key, i) => [key, Number(cells[i + 1])])
  ) as ReferenceRow;
});

describe('independent PMKS_Verification friction reference', () => {
  it('matches the vendored reference checksum and provenance', () => {
    const metadata = JSON.parse(readFileSync('src/test-data/friction/provenance.json', 'utf8'));
    expect(
      createHash('sha256')
        .update(readFileSync('src/test-data/friction/reference.csv', 'utf8').replace(/\r\n/g, '\n'))
        .digest('hex')
    ).toBe(metadata.sha256);
    expect(metadata.rows).toBe(rows.length);
  });
  it('has every expected direction, load sign, bearing mode and angle', () => {
    expect(rows.length).toBe(560);
    expect(new Set(rows.map((r) => [r.angle, r.omega, r.load, r.mu_pin].join(','))).size).toBe(560);
  });
  for (const unit of ['m', 'cm']) {
    for (const omega of [-1, 1]) {
      for (const load of [-100, 100]) {
        for (const pin of [0, 0.12]) {
          it(`matches 70 poses in ${unit}, speed ${omega}, load ${load}, bearing ${pin}`, () => {
            const built = buildMechanism(frictionSliderCrankFixture());
            const scale = unit === 'm' ? 1 : 100;
            for (const row of rows.filter(
              (r) => r.omega === omega && r.load === load && r.mu_pin === pin
            )) {
              for (const joint of built.joints) {
                if (joint.id === 'B') {
                  joint.x = row.x_b * scale;
                  joint.y = row.y_b * scale;
                }
                if (joint.id === 'C' || joint.id === 'D') {
                  joint.x = row.x_c * scale;
                  joint.y = 0;
                }
                if (joint.id === 'A')
                  (joint as RealJoint).friction = {
                    staticCoefficient: pin ? 0.2 : 0,
                    kineticCoefficient: pin,
                    radius: row.radius * scale,
                  };
              }
              for (const link of built.links)
                if (link instanceof RealLink) {
                  link.CoM = new Coord(
                    link.joints.reduce((s, j) => s + j.x, 0) / 2,
                    link.joints.reduce((s, j) => s + j.y, 0) / 2
                  );
                }
              const applied = built.forces[0];
              applied.startCoord = new Coord(row.x_c * scale, 0);
              applied.angleRad = load > 0 ? -Math.PI / 2 : Math.PI / 2;
              const frame = ForceSolver.analyzeFrame(
                built.joints,
                built.links,
                'static',
                false,
                unit,
                0,
                undefined,
                false,
                {
                  jointVelocities: new Map([['D', [row.velocity * scale, 0]]]),
                  angularVelocities: new Map([
                    ['AB', omega],
                    ['BC', row.rod_omega],
                  ]),
                }
              );
              expect(frame.status, `angle ${row.angle}`).toBe('ok');
              const guide = frame.friction!.get('D')!;
              expect(guide.normalLoad).toBeCloseTo(row.normal, 7);
              expect(guide.effort).toBeCloseTo(row.friction, 7);
              expect(guide.staticLimit).toBeCloseTo(row.static_limit, 7);
              const bearing = frame.friction!.get('A');
              if (pin) expect(bearing!.normalLoad).toBeCloseTo(row.bearing_load, 7);
              expect(bearing?.effort ?? 0).toBeCloseTo(row.bearing_torque, 7);
              expect(frame.inputEffort!.valueSI).toBeCloseTo(row.input_effort, 7);
              expect(frame.additionalFrictionEffort!.valueSI).toBeCloseTo(row.input_effort, 7);
              expect(guide.effort * row.velocity + (bearing?.effort ?? 0) * omega).toBeCloseTo(
                row.power,
                7
              );
            }
          });
        }
      }
    }
  }
});
