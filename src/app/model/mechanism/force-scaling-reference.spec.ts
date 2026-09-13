import { PrisJoint, RevJoint } from '../joint';
import { Coord } from '../coord';
import { Force } from '../force';
import { RealLink, SliderBlock } from '../link';
import { ColorService } from '../../services/color.service';
import { SettingsService } from '../../services/settings.service';
import { ForceSolver, ForceVector } from './force-solver';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

interface Expected {
  acceleration: ForceVector;
  reaction: ForceVector;
  input: number;
  kinetic_rate: number;
  external_power: number;
}
interface PinCase {
  id: string;
  kind: 'pin';
  mass: number;
  end: ForceVector;
  com: ForceVector;
  inertia: number;
  omega: number;
  alpha: number;
  gravity: boolean;
  loads: { point: ForceVector; force: ForceVector }[];
  expected: Expected;
}
interface SliderCase {
  id: string;
  kind: 'slider';
  mass: number;
  angle: number;
  acceleration: number;
  speed: number;
  gravity: boolean;
  expected: Expected;
}
const source = readFileSync('src/test-data/inertia-scaling/reference.json', 'utf8');
const cases: (PinCase | SliderCase)[] = JSON.parse(source).cases;
// Independent encodings of the SI reference inputs, not the solver's conversion helper.
const systems = [
  { unit: 'm', length: 1, mass: 1, inertia: 1, force: 1 },
  { unit: 'cm', length: 0.01, mass: 0.001, inertia: 0.0001, force: 1 },
  {
    unit: 'in',
    length: 0.0254,
    mass: 0.45359237,
    inertia: 0.45359237 * 0.0254 ** 2,
    force: 4.4482216152605,
  },
];

function solve(c: PinCase | SliderCase, system: (typeof systems)[number], scale: number) {
  new SettingsService();
  if (!ColorService.instance) new ColorService();
  const length = scale / system.length;
  const acceleration = c.expected.acceleration.map((v) => v * length) as ForceVector;
  if (c.kind === 'slider') {
    const pin = new RevJoint('A', 0, 0);
    const guide = new PrisJoint('B', 0, 0, true, true);
    guide.angle_rad = c.angle;
    const block = new SliderBlock('AB', [pin, guide], c.mass / system.mass);
    pin.links = [block];
    guide.links = [block];
    return ForceSolver.analyzeFrame(
      [pin, guide],
      [block],
      'dynamic',
      c.gravity,
      system.unit,
      0,
      {
        linkAccelerations: new Map(),
        linkAngularAccelerations: new Map(),
        pistonAccelerations: new Map([['AB', acceleration]]),
      },
      false,
      scale
    );
  }
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', c.end[0] * length, c.end[1] * length);
  const body = new RealLink(
    'AB',
    [a, b],
    c.mass / system.mass,
    c.inertia / system.inertia,
    new Coord(c.com[0] * length, c.com[1] * length)
  );
  a.links = [body];
  b.links = [body];
  body.forces = c.loads.map((load, index) => {
    const [x, y] = load.point.map((v) => v * length);
    const [fx, fy] = load.force;
    return new Force(
      'F' + index,
      body,
      new Coord(x, y),
      new Coord(x + fx * length, y + fy * length),
      false,
      true,
      Math.hypot(fx, fy) / system.force
    );
  });
  return ForceSolver.analyzeFrame(
    [a, b],
    [body],
    'dynamic',
    c.gravity,
    system.unit,
    0,
    {
      linkAccelerations: new Map([['AB', acceleration]]),
      linkAngularAccelerations: new Map([['AB', c.alpha]]),
      pistonAccelerations: new Map(),
    },
    false,
    scale
  );
}

describe('independent SI inertia references across physical units and drawing scales', () => {
  it('pins provenance and all 27 experimental analytical cases', () => {
    const metadata = JSON.parse(
      readFileSync('src/test-data/inertia-scaling/provenance.json', 'utf8')
    );
    expect(createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex')).toBe(
      metadata.sha256
    );
    expect(cases.length).toBe(metadata.cases);
    expect(metadata.matlabExecuted).toBe(false);
  });
  for (const system of systems) {
    for (const scale of [1, 37, 200]) {
      it(`matches 27 force, moment and power cases in ${system.unit} at coordinate scale ${scale}`, () => {
        for (const c of cases) {
          const frame = solve(c, system, scale);
          expect(frame.status, c.id).toBe('ok');
          const reaction = frame.jointReactions.get(c.kind === 'pin' ? 'A' : 'B')!;
          expect(reaction[0], c.id).toBeCloseTo(c.expected.reaction[0], 10);
          expect(reaction[1], c.id).toBeCloseTo(c.expected.reaction[1], 10);
          expect(frame.inputEffort!.valueSI, c.id).toBeCloseTo(c.expected.input, 10);
          const rate = c.kind === 'pin' ? c.omega : c.speed;
          expect(frame.inputEffort!.valueSI * rate + c.expected.external_power, c.id).toBeCloseTo(
            c.expected.kinetic_rate,
            10
          );
        }
      });
    }
  }
});
