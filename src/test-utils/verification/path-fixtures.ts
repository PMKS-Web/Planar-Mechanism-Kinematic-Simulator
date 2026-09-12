import { FourBarParameters } from '../../app/model/synthesis/path-types';
import { fourBarPose } from '../../app/model/synthesis/four-bar';
import { MechanismFixture } from './fixture';
import type { GalleryEntry } from './fixture-gallery';

/** Dimensions in user units; callers may transform these before constructing a target. */
export function pathFourBarParameters(partial = false): FourBarParameters {
  return {
    A: { x: 0, y: 0 },
    D: { x: 4, y: 0 },
    crank: partial ? 2.5 : 1,
    coupler: partial ? 2.7 : 3,
    rocker: partial ? 2.2 : 2.5,
    u: 1.3,
    v: 0.8,
    theta0: partial ? 0.8 : 0.4,
    sweep: partial ? 0.7 : 2 * Math.PI,
    assembly: 1,
    direction: 'counterclockwise',
  };
}

export function pathFourBarFixture(partial = false): MechanismFixture {
  const p = pathFourBarParameters(partial),
    pose = fourBarPose(p, p.theta0);
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
    inputAngVel: 1,
  };
}

export const PATH_SYNTHESIS_GALLERY: GalleryEntry[] = [
  {
    name: 'Path synthesis reference four-bar',
    purpose: 'A full-cycle coupler trajectory used to verify numerical path synthesis',
    spec: 'path-engine.spec.ts',
    floatingSlot: false,
    speed: { rpm: 10 },
    fixture: pathFourBarFixture(),
  },
  {
    name: 'Path synthesis partial-sweep four-bar',
    purpose: 'A non-Grashof linkage with a feasible finite input sweep',
    spec: 'path-engine.spec.ts',
    floatingSlot: false,
    speed: { rpm: 10 },
    fixture: pathFourBarFixture(true),
  },
];
