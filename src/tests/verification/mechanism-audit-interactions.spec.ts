import './mechanism-audit-support';
import { TestBed } from '@angular/core/testing';
import { AnalysisGraphComponent } from '../../app/component/analysis-graph/analysis-graph.component';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { ExportFlowService } from '../../app/services/export/export-flow.service';
import { ExportTableService } from '../../app/services/export/export-table.service';
import { toCsv } from '../../app/services/export/csv-writer';
import { AngleUnit } from '../../app/model/unit-enums';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { bodiesUnder } from '../../app/model/link';
import { machineFacts } from '../../app/model/machine-facts/machine-facts';
import { jansenLegFixture } from '../../test-utils/verification/library-fixtures';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { openAuditFinding, openAuditPayload } from './mechanism-audit-support';

type Point = { x: number; y: number | null };
function graph(property: string, part: string) {
  const component = TestBed.runInInjectionContext(() => new AnalysisGraphComponent());
  component.analysis = 'kinematic';
  component.analysisType = 'loop';
  component.mechProp = property;
  component.mechPart = part;
  component.ngOnInit();
  return component;
}

describe('the audit through editing, graph and export commands', () => {
  it('finding #58: graph data preserve small acceleration in both angle units', () => {
    const opened = openAuditFinding(58);
    const component = graph('Angular Link Acc', 'BC');
    const values = () =>
      (component.chartOptions.series![0].data as Point[]).map((point) => point.y!);
    const degrees = values();
    expect(Math.max(...degrees.map(Math.abs))).toBeCloseTo(0.0000162187913, 11);
    expect(degrees.some((value) => Math.abs(value) > 1e-6)).toBe(true);
    opened.settings.angleUnit.next(AngleUnit.RADIAN);
    const radians = values();
    degrees.forEach((value, index) =>
      expect(radians[index]).toBeCloseTo((value * Math.PI) / 180, 14)
    );
    component.ngOnDestroy();
  });

  it('finding #61: reversed elapsed time agrees in playback, graph marker and actual CSV', () => {
    const opened = openAuditFinding(61);
    opened.service.seekMechanism(0, 1.8);
    const before = opened.service.joints.find((joint) => joint.id === 'B')!;
    const pose = [before.x, before.y];
    const component = graph('Linear Joint Pos', 'B');
    expect(opened.service.reverseDrive(0)).toBe(true);
    expect(opened.service.secondsOf(0)).toBeCloseTo(4.2, 10);
    const after = opened.service.joints.find((joint) => joint.id === 'B')!;
    expect(after.x).toBeCloseTo(pose[0], 9);
    expect(after.y).toBeCloseTo(pose[1], 9);
    component.updateChartData();
    opened.service.seekMechanism(0, 4.2);
    const curves = component.chartOptions.series!.map((series) => series.data as Point[]);
    const row = curves[0].findIndex((point) => Math.abs(point.x - 4.2) < 1e-8);
    expect(row).toBeGreaterThan(0);
    expect(curves[0][row].y).toBeCloseTo(after.x / MODEL_SCALE, 9);
    expect(curves[1][row].y).toBeCloseTo(after.y / MODEL_SCALE, 9);
    expect(Number(component.chartOptions.annotations!.xaxis![0].x)).toBeCloseTo(4.2, 9);

    const flow = TestBed.inject(ExportFlowService);
    flow.reset();
    flow.uniformRows = false;
    const part = flow.partGroups()[0].parts.find((one) => one.kind === 'joint' && one.id === 'B')!;
    flow.setParts([part], true);
    flow.setColumns(flow.allColumns(), false);
    flow.setColumns(
      flow.allColumns().filter((column) => column.key === 'j:pos'),
      true
    );
    const table = TestBed.inject(ExportTableService).tables()[0];
    expect(table.times.every((time, index) => index === 0 || time >= table.times[index - 1])).toBe(
      true
    );
    const csv = toCsv(table, 'full').trim().split('\n');
    const csvRow = csv
      .slice(1)
      .map((line) => line.split(',').map(Number))
      .find((cells) => Math.abs(cells[0] - 4.2) < 1e-8)!;
    expect(csvRow).toBeDefined();
    expect(csvRow[1]).toBeCloseTo(after.x / MODEL_SCALE, 9);
    expect(csvRow[2]).toBeCloseTo(after.y / MODEL_SCALE, 9);
    component.ngOnDestroy();
  });

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
