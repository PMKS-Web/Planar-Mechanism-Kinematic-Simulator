import { nativeTwinCranksOnPinnedFrame } from '../../../test-utils/verification/native-fixed-frame-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { initialBodyContinuation, advanceBodyCommand } from './body-continuation';
import { BodyMotion, solveBodyRates } from './body-rates';
import { solveBodyForceFrame } from './body-force-frame';
import { driverForceValue, jointBodyWrench } from './force-frame-result';

const STILL: BodyMotion = {
  velocity: { vx: 0, vy: 0, omega: 0 },
  acceleration: { ax: 0, ay: 0, alpha: 0 },
};

describe('force samples on independent clocks sharing a material frame', () => {
  it('keeps each crank’s hand-derived torque and boundary reaction attached to its own sample', () => {
    const fixture = nativeTwinCranksOnPinnedFrame();
    for (const document of [
      fixture.document,
      {
        ...fixture.document,
        bodies: [...fixture.document.bodies].reverse(),
        joints: [...fixture.document.joints].reverse(),
      },
    ]) {
      const compiled = compileBodyDocument(document);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
      const system = compiled.system;
      const frames = fixture.cranks.map((crank, i) => {
        const partition = system.partitions.find((part) => part.materialIds.includes(crank.body))!;
        const admitted = admitBodyPartition(system, partition);
        if (!admitted.ok) throw new Error(admitted.reason);
        const command = i ? -0.4 : 0.7,
          speed = crank.driver.profile.speed;
        const advanced = advanceBodyCommand(admitted, initialBodyContinuation(admitted), command);
        if (!advanced.ok) throw new Error(advanced.reason);
        const rates = solveBodyRates(
          admitted.frame.partition,
          advanced.state.poses,
          new Map([[crank.driver.id, { value: command, velocity: speed, acceleration: 0 }]]),
          new Map([[fixture.frame, STILL]])
        );
        if (!rates.ok) throw new Error(rates.reason);
        const frame = solveBodyForceFrame(
          document,
          system,
          admitted.frame,
          {
            sample: {
              revision: 7,
              partitionKey: partition.key,
              index: i + 3,
              time: command / speed,
              command,
              direction: speed < 0 ? -1 : 1,
            },
            pose: {
              ok: true,
              poses: advanced.state.poses,
              commands: new Map([[crank.driver.id, command]]),
            },
            rates,
          },
          { mode: 'dynamic', gravity: { x: 0, y: 0 } }
        );
        if (!frame.ok) throw new Error(frame.reason);
        const angle = (i ? 1.1 : -0.3) + command,
          force = (i + 1) * 10;
        const effort = driverForceValue(frame, crank.driver.id);
        if (!effort.ok) throw new Error(effort.reason);
        expect(effort.value.value).toBeCloseTo(force * Math.cos(angle), 9);
        const reaction = jointBodyWrench(frame, crank.pin.id, crank.body);
        if (!reaction.ok) throw new Error(reaction.reason);
        expect(reaction.value.force.x).toBeCloseTo(-0.5 * speed * speed * Math.cos(angle), 9);
        expect(reaction.value.force.y).toBeCloseTo(
          force - 0.5 * speed * speed * Math.sin(angle),
          9
        );
        expect(jointBodyWrench(frame, crank.pin.id, fixture.frame).ok).toBe(true);
        for (const support of fixture.supports)
          expect(jointBodyWrench(frame, support.id, fixture.frame)).toEqual({
            ok: false,
            reason: 'frame-context',
          });
        const neighbor = fixture.cranks[1 - i];
        expect(driverForceValue(frame, neighbor.driver.id)).toEqual({
          ok: false,
          reason: 'outside-sample',
        });
        expect(jointBodyWrench(frame, neighbor.pin.id, fixture.frame)).toEqual({
          ok: false,
          reason: 'outside-sample',
        });
        expect([...frame.groups.keys()]).toEqual([crank.body]);
        if (!frame.power.ok) throw new Error(frame.power.reason);
        expect(frame.power.value.driver).toBeCloseTo(force * Math.cos(angle) * speed, 9);
        expect(frame.power.value.residual).toBeCloseTo(0, 9);
        return frame;
      });
      expect(frames[0].sample.time).toBe(0.7);
      expect(frames[1].sample.time).toBe(0.2);
      expect(frames[0].sample.partitionKey).not.toBe(frames[1].sample.partitionKey);
    }
  });
});
