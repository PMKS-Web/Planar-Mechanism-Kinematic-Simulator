// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { fourBarDrivenAtFixture } from '../../test-utils/verification/fixtures';

// A motor between two moving links turns one against the other, so it pushes on
// both: +τ on the body it drives and −τ on the one it is measured against. The
// two cancel, and the machine as a whole feels no torque from it. Only the
// frame's reactions and the loads act on the whole machine from outside, so
// they alone must balance, in force and in moment.
//
// Issue #81: the force solver put the torque on one body only. The frame then
// supplied the missing couple, and every reaction came out wrong while each
// body's total still balanced, since a couple has no resultant.

const LOAD: [number, number] = [0, -10];
const TRACER: [number, number] = [2.1, 3.3];

function cross(r: [number, number], f: [number, number]): number {
  return r[0] * f[1] - r[1] * f[0];
}

describe('a motor on a pin between two moving links', () => {
  const { mechanism } = buildMechanism({
    ...fourBarDrivenAtFixture('C'),
    load: { onLink: 'ACT', at: TRACER, vector: LOAD },
  });
  const series = mechanism.getForceAnalysis('static');
  const solved = series.frames
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => frame.status === 'ok');

  it('is solved at every sample', () => {
    expect(solved.length).toBe(series.frames.length);
  });

  it('exerts no torque on the machine as a whole', () => {
    for (const { frame, index } of solved) {
      const at = (id: string): [number, number] => {
        const joint = mechanism.joints[index].find((candidate) => candidate.id === id)!;
        return [joint.x, joint.y];
      };
      const load = mechanism.forces[index][0].startCoord;
      const onCrank = frame.jointReactionsByLink.get('O')!.get('OA')!;
      const onRocker = frame.jointReactionsByLink.get('D')!.get('CD')!;

      const force: [number, number] = [
        onCrank[0] + onRocker[0] + LOAD[0],
        onCrank[1] + onRocker[1] + LOAD[1],
      ];
      const moment =
        cross(at('O'), onCrank) + cross(at('D'), onRocker) + cross([load.x, load.y], LOAD);

      // The load's own moment about the origin sets the scale.
      const scale = Math.hypot(...LOAD) * Math.hypot(load.x, load.y);
      expect(Math.hypot(...force) / Math.hypot(...LOAD), `force, frame ${index}`).toBeLessThan(
        1e-9
      );
      expect(Math.abs(moment) / scale, `moment, frame ${index}`).toBeLessThan(1e-9);
      // Not balanced by a motor that does nothing: the load does work here.
      expect(Math.abs(frame.inputEffort!.valueSI), `effort, frame ${index}`).toBeGreaterThan(0);
    }
  });
});
