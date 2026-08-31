import '../../app/model/joint';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { RealLink } from '../../app/model/link';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';

function weldedFiveBarFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1, y: 1 },
      { id: 'C', x: 2, y: 0.5 },
      { id: 'D', x: 3, y: 1 },
      { id: 'E', x: 4, y: 0, ground: true },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'BCD', subset: [{ joints: 'BC' }, { joints: 'CD' }] },
      { joints: 'DE' },
    ],
    load: { onLink: 'BCD', at: [2, 0.75], vector: [0, -10] },
    inputAngVel: Math.PI / 6,
  };
}

function normalizeAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

describe('welded five-bar force regression', () => {
  it('simulates and reproduces the compound-link dynamic torque', () => {
    const { mechanism } = buildMechanism(weldedFiveBarFixture());
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.forces.every((forces) => forces.length === 1)).toBe(true);
    expect(
      mechanism.forces.every((forces, timestep) =>
        forces.every(
          (force) => force.link === mechanism.links[timestep].find((link) => link.id === 'BCD')
        )
      )
    ).toBe(true);

    const header = mechanism.forceTitleRow('dynamics')!;
    const torqueColumn = header.indexOf('Torque N*m');
    const rows = mechanism.forceAnalysis('dynamics');
    expect(rows).toHaveLength(mechanism.timeNum.length);
    expect(rows.every((row) => Number.isFinite(Number(row[torqueColumn])))).toBe(true);
    expect(Number(rows[0][torqueColumn])).toBeCloseTo(2.9396, 4);
    expect(Number(rows[1][torqueColumn])).toBeCloseTo(3.0096, 4);
    expect(Number(rows[2][torqueColumn])).toBeCloseTo(3.2182, 4);

    for (const mode of ['static', 'dynamic'] as const) {
      const result = mechanism.getForceAnalysis(mode);
      expect(result.successfulFrames).toBeGreaterThanOrEqual(2);
      result.frames
        .filter((frame) => frame.status === 'ok')
        .forEach((frame) => {
          expect(frame.residual).toBeLessThanOrEqual(1e-8);
          expect(Number.isFinite(frame.inputEffort!.valueSI)).toBe(true);
        });
    }
  });

  it('keeps global direction fixed and rotates local direction with the compound link', () => {
    const globalBuilt = buildMechanism(weldedFiveBarFixture());
    const globalDirection = globalBuilt.mechanism.forces[0][0].angleRad;
    globalBuilt.mechanism.forces.forEach((forces) => {
      expect(forces[0].mag).toBe(10);
      expect(normalizeAngle(forces[0].angleRad - globalDirection)).toBeCloseTo(0, 3);
    });

    const localBuilt = buildMechanism(weldedFiveBarFixture());
    localBuilt.forces[0].setLocal(true);
    const localMechanism = new Mechanism(
      localBuilt.joints,
      localBuilt.links,
      localBuilt.forces,
      [],
      false,
      'm',
      weldedFiveBarFixture().inputAngVel
    );
    const initialLink = localMechanism.links[0].find((link) => link.id === 'BCD') as RealLink;
    const initialRelative = normalizeAngle(
      localMechanism.forces[0][0].angleRad - initialLink.angleRad
    );
    localMechanism.forces.forEach((forces, timestep) => {
      const link = localMechanism.links[timestep].find(
        (candidate) => candidate.id === 'BCD'
      ) as RealLink;
      expect(forces[0].mag).toBe(10);
      expect(normalizeAngle(forces[0].angleRad - link.angleRad - initialRelative)).toBeCloseTo(
        0,
        2
      );
    });
  });

  it('is force-equivalent to the same ternary body without welded subset metadata', () => {
    const welded = buildMechanism(weldedFiveBarFixture()).mechanism;
    const equivalentFixture = weldedFiveBarFixture();
    equivalentFixture.links[1] = { joints: 'BCD' };
    const unsplit = buildMechanism(equivalentFixture).mechanism;

    for (const mode of ['static', 'dynamic'] as const) {
      const weldedResult = welded.getForceAnalysis(mode);
      const unsplitResult = unsplit.getForceAnalysis(mode);
      expect(weldedResult.frames).toHaveLength(unsplitResult.frames.length);
      weldedResult.frames.forEach((frame, index) => {
        const equivalent = unsplitResult.frames[index];
        expect(frame.status).toBe(equivalent.status);
        if (frame.status !== 'ok' || equivalent.status !== 'ok') return;
        expect(frame.inputEffort!.valueSI).toBeCloseTo(equivalent.inputEffort!.valueSI, 9);
        frame.jointReactions.forEach((reaction, jointId) => {
          expect(reaction[0]).toBeCloseTo(equivalent.jointReactions.get(jointId)![0], 9);
          expect(reaction[1]).toBeCloseTo(equivalent.jointReactions.get(jointId)![1], 9);
        });
      });
    }
  });
});
