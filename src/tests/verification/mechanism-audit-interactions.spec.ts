import './mechanism-audit-support';
import { TestBed } from '@angular/core/testing';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { bodiesUnder } from '../../app/model/link';
import { machineFacts } from '../../app/model/machine-facts/machine-facts';
import { jansenLegFixture } from '../../test-utils/verification/library-fixtures';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { openAuditFinding, openAuditPayload } from './mechanism-audit-support';

describe('the audit through editing, graph and export commands', () => {
  it('finding #59: a member force immediately loads and follows its root, and survives unwelding', () => {
    const opened = openAuditFinding(59);
    const service = opened.service;
    for (const body of bodiesUnder(service.links)) {
      body.mass = 0;
      body.massMoI = 0;
    }
    service.updateMechanism(false);
    const leaf = bodiesUnder(service.links).find((body) => body.id === 'CD')!;
    TestBed.inject(ActiveObjService).updateSelectedObj(leaf);
    service.createForceAtCOM();
    const force = service.forces.at(-1)!;
    force.setComponents(80, 60);
    service.updateMechanism(false);
    expect(force.anchoredTo).toBe('CD');
    expect(service.partitions[0].forces).toContain(force);
    expect(
      service.forceSetupIssues().some((issue) => issue.title === 'Nothing loads the mechanism')
    ).toBe(false);
    const solved = service.mechanisms[0];
    expect(solved.forces.every((frame) => frame.some((one) => one.id === force.id))).toBe(true);
    // Independent five-point load-point velocity, rather than the old
    // rounded-pose torque pinned in the audit report.
    const dt = solved.timeNum[1] - solved.timeNum[0];
    const derivative = (axis: 'x' | 'y') => {
      const values = solved.forces
        .slice(0, 5)
        .map((frame) => frame.find((one) => one.id === force.id)!.startCoord[axis]);
      return (values[0] - 8 * values[1] + 8 * values[3] - values[4]) / (12 * dt);
    };
    const expected =
      (-(80 * derivative('x') + 60 * derivative('y')) * 0.01) /
      MODEL_SCALE /
      solved.inputAngularVelocities[2];
    expect(Math.abs(expected)).toBeGreaterThan(0.1);
    expect(solved.getForceAnalysis('static').frames[2].inputEffort!.valueSI).toBeCloseTo(
      expected,
      5
    );
    service.seekMechanism(0, 2.216666666666667);
    const movedLeaf = bodiesUnder(service.links).find((body) => body.id === 'CD')!;
    expect(force.startCoord.x).toBeCloseTo(movedLeaf.CoM.x, 6);
    expect(force.startCoord.y).toBeCloseTo(movedLeaf.CoM.y, 6);
    service.seekMechanism(0, 0);
    const reopened = openAuditPayload(TestBed.inject(UrlGenerationService).generateUrlQuery());
    expect(reopened.service.forces.at(-1)!.anchoredTo).toBe('CD');
    const root = reopened.service.forces.at(-1)!.link;
    reopened.service.unweldAll(root);
    expect(reopened.service.forces.at(-1)!.link.id).toBe('CD');
  });

  it('finding #60: a paused member tracer appears at the requested world point', () => {
    const { service } = openAuditFinding(60);
    service.seekMechanism(0, 2.216666666666667);
    const leaf = bodiesUnder(service.links).find((body) => body.id === 'CD')!;
    const [a, b] = leaf.joints;
    const angle = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    const requested = [
      leaf.CoM.x + Math.cos(angle) * 0.01 * MODEL_SCALE,
      leaf.CoM.y + Math.sin(angle) * 0.01 * MODEL_SCALE,
    ];
    const old = service.joints.map((joint) => [joint.id, joint.x, joint.y] as const);
    TestBed.inject(ActiveObjService).updateSelectedObj(leaf);
    service.addJointAtCOM();
    const added = service.joints.find((joint) => !old.some(([id]) => id === joint.id))!;
    expect(added).toBeDefined();
    expect(added.x).toBeCloseTo(requested[0], 6);
    expect(added.y).toBeCloseTo(requested[1], 6);
    expect(service.secondsOf(0)).toBeCloseTo(2.216666666666667, 10);
    for (const [id, x, y] of old) {
      const joint = service.joints.find((one) => one.id === id)!;
      expect(joint.x).toBeCloseTo(x, 6);
      expect(joint.y).toBeCloseTo(y, 6);
    }
  });

  for (const scale of [0.01, 1, 100]) {
    it(`finding #68: retains a connected Jansen leg at scale ${scale} and rotated axes`, () => {
      const fixture = jansenLegFixture();
      const turn = 0.37;
      fixture.joints.forEach((joint) => {
        const { x, y } = joint;
        joint.x = scale * (x * Math.cos(turn) - y * Math.sin(turn));
        joint.y = scale * (x * Math.sin(turn) + y * Math.cos(turn));
      });
      const opened = openAuditPayload(fixturePayload(fixture));
      expect(opened.mechanism.isMechanismValid()).toBe(true);
      expect(
        machineFacts(opened.service.partitions[0], opened.mechanism)!.family.some((match) =>
          match.family.includes('Jansen')
        )
      ).toBe(true);
    });
  }
});
