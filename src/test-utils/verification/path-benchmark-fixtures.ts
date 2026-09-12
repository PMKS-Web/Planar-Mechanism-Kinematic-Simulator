import { FourBarParameters } from '../../app/model/synthesis/path-types';
import { fourBarPose } from '../../app/model/synthesis/four-bar';
import { pathFourBarParameters } from './path-fixtures';
import { MechanismFixture } from './fixture';
import type { GalleryEntry } from './fixture-gallery';

export interface PathBenchmarkFixture {
  id: string;
  description: string;
  categories: string[];
  parameters: FourBarParameters;
  closed: boolean;
  transformOf?: string;
}

export function transformPathParameters(
  p: FourBarParameters,
  scale = 1,
  rotation = 0,
  x = 0,
  y = 0
): FourBarParameters {
  const point = (q: { x: number; y: number }) => ({
    x: x + scale * (q.x * Math.cos(rotation) - q.y * Math.sin(rotation)),
    y: y + scale * (q.x * Math.sin(rotation) + q.y * Math.cos(rotation)),
  });
  return {
    ...p,
    A: point(p.A),
    D: point(p.D),
    crank: p.crank * scale,
    coupler: p.coupler * scale,
    rocker: p.rocker * scale,
    u: p.u * scale,
    v: p.v * scale,
    theta0: p.theta0 + rotation,
  };
}

const base = pathFourBarParameters();
const item = (
  id: string,
  description: string,
  categories: string[],
  changes: Partial<FourBarParameters> = {},
  closed = true
): PathBenchmarkFixture => ({
  id,
  description,
  categories,
  parameters: { ...base, ...changes },
  closed,
});
const originals: PathBenchmarkFixture[] = [
  item('crank-rocker', 'Reference crank-rocker with an offset tracer', [
    'crank-rocker',
    'full',
    'ccw',
  ]),
  item('clockwise', 'The reference linkage traversed clockwise', ['crank-rocker', 'full', 'cw'], {
    direction: 'clockwise',
  }),
  item(
    'other-assembly',
    'Opposite assembly of the reference linkage',
    ['crank-rocker', 'full', 'assembly'],
    { assembly: -1 }
  ),
  item(
    'double-crank',
    'Short ground with two rotating adjacent links',
    ['double-crank', 'short-ground'],
    { D: { x: 1, y: 0 }, crank: 2, coupler: 2.3, rocker: 2, u: 1.1, v: 0.5 }
  ),
  item('long-ground', 'A long ground and short input crank', ['long-ground', 'crank-rocker'], {
    D: { x: 6, y: 0 },
    crank: 0.7,
    coupler: 4.2,
    rocker: 3,
    u: 2.5,
  }),
  item('short-coupler', 'Short coupler compared with the grounded span', ['short-coupler'], {
    crank: 0.6,
    coupler: 1.7,
    rocker: 3.2,
    u: 0.8,
  }),
  item('long-coupler', 'Long coupler with its tracer near the middle', ['long-coupler'], {
    coupler: 5,
    rocker: 3.5,
    u: 2.8,
  }),
  item('tracer-on-bar', 'Tracer almost on the coupler centerline', ['tracer-close'], { v: 0.02 }),
  item('tracer-far', 'Tracer well away from the coupler', ['tracer-far', 'perpendicular-offset'], {
    u: 4.5,
    v: 4,
  }),
  item('beyond-b', 'Tracer extends behind coupler joint B', ['beyond-b'], { u: -1.8, v: 0.6 }),
  item('beyond-c', 'Tracer extends beyond coupler joint C', ['beyond-c'], { u: 4.8, v: 0.3 }),
  item('high-offset', 'Large perpendicular tracer offset', ['perpendicular-offset'], {
    u: 1.5,
    v: 5,
  }),
  item(
    'near-toggle',
    'Small but positive full-sweep toggle clearance',
    ['near-toggle', 'nonuniform-speed'],
    { coupler: 2.8, rocker: 2.23, u: 2.3, v: 1.8 }
  ),
  item(
    'nonuniform-speed',
    'Tracer near the slow end of a crank-rocker coupler',
    ['nonuniform-speed'],
    { u: 2.8, v: 0.15 }
  ),
  item('compact', 'Compact linkage with a large tracer path', ['compact'], {
    D: { x: 2, y: 0 },
    crank: 0.7,
    coupler: 1.8,
    rocker: 1.5,
    u: 1.2,
    v: 1.6,
  }),
  item(
    'large-relative-path',
    'Long bars driving a comparatively small tracer path',
    ['large-relative-path'],
    { D: { x: 8, y: 0 }, crank: 0.35, coupler: 6, rocker: 3, u: 0.1, v: 0.1 }
  ),
  item(
    'open-half',
    'Open half-revolution of a crank-rocker',
    ['partial', 'open', 'ccw'],
    { sweep: Math.PI },
    false
  ),
  item(
    'open-clockwise',
    'Clockwise open trajectory',
    ['partial', 'open', 'cw'],
    { sweep: 2.4, direction: 'clockwise' },
    false
  ),
  item(
    'non-grashof',
    'Finite feasible sweep of a non-Grashof linkage',
    ['non-grashof', 'partial', 'ccw'],
    pathFourBarParameters(true),
    false
  ),
  item(
    'non-grashof-cw',
    'The finite non-Grashof sweep in reverse',
    ['non-grashof', 'partial', 'cw'],
    { ...pathFourBarParameters(true), theta0: 1.5, direction: 'clockwise' },
    false
  ),
];

export const PATH_BENCHMARK_FIXTURES: PathBenchmarkFixture[] = [
  ...originals,
  ...[
    ['translated', 1, 0, 9, -7],
    ['rotated', 1, 1.1, 0, 0],
    ['scaled-small', 0.4, 0, 0, 0],
    ['scaled-large', 3, 0.7, -4, 8],
  ].map(([id, scale, rotation, x, y]) => ({
    id: String(id),
    description: `Reference crank-rocker: ${id}`,
    categories: ['transform'],
    parameters: transformPathParameters(
      base,
      Number(scale),
      Number(rotation),
      Number(x),
      Number(y)
    ),
    closed: true,
    transformOf: 'crank-rocker',
  })),
];

export function benchmarkMechanismFixture(p: FourBarParameters): MechanismFixture {
  const pose = fourBarPose(p, p.theta0);
  if (typeof pose === 'string') throw new Error(pose);
  return {
    joints: [p.A, pose.B, pose.C, p.D, pose.P].map((point, i) => ({
      id: 'ABCDE'[i],
      ...point,
      ground: i === 0 || i === 3,
      input: i === 0,
      trace: i === 4,
    })),
    links: [{ joints: 'AB' }, { joints: 'BCE' }, { joints: 'CD' }],
    inputAngVel: p.direction === 'clockwise' ? -1 : 1,
  };
}

export const PATH_BENCHMARK_GALLERY: GalleryEntry[] = PATH_BENCHMARK_FIXTURES.map((f) => ({
  name: `Path benchmark: ${f.id}`,
  purpose: f.description,
  spec: 'path-benchmark.spec.ts',
  floatingSlot: false,
  speed: { rpm: f.parameters.direction === 'clockwise' ? -10 : 10 },
  fixture: benchmarkMechanismFixture(f.parameters),
}));
