import { Coord } from '../../app/model/coord';
import '../../app/model/joint';
import { runInInjectionContext } from '@angular/core';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { GearEditorService } from '../../app/services/gear-editor.service';
import { SelectionBatchService } from '../../app/services/selection-batch.service';
import { RealJoint } from '../../app/model/joint';
import { MODEL_SCALE as S } from '../../app/model/render-scale';
import { urlGeneratorFor } from '../../test-utils/url-encoding';
import { AnalysisSampleService } from '../../app/services/analysis-sample.service';
import { SolverExplanationService } from '../../app/services/solver-explanation.service';
import { buildMechanism } from '../../test-utils/verification/fixture';

function pair() {
  const h = createMechanismHarness();
  const editor = runInInjectionContext(h.injector, () => new GearEditorService());
  const a = editor.create({ x: -3 * S, y: 0 })!;
  const b = editor.create({ x: 0, y: 0 })!;
  expect(editor.edit(b.id, { teeth: 40 })).toBe(true);
  expect(editor.mesh(a.id, b.id)).toBe(true);
  return { ...h, editor, a, b };
}

describe('production gear lifecycle', () => {
  it('keeps force analysis available for an unrelated gear-free partition', () => {
    const h = pair();
    const other = buildMechanism({
      joints: [
        { id: 'X', x: 2000, y: 0, ground: true, input: true },
        { id: 'Y', x: 2200, y: 0 },
      ],
      links: [{ joints: 'XY' }],
      inputAngVel: Math.PI,
    });
    h.service.joints.push(...other.joints);
    h.service.links.push(...other.links);
    h.service.updateMechanism();
    expect(h.service.mechanisms).toHaveLength(2);
    expect(h.service.forceAnalysisReady()).toBe(true);
    const geared = h.service.mechanisms.find((m) => m.transmission.gears.length)!;
    expect(geared.getForceAnalysis('static').successfulFrames).toBe(0);
    const ordinary = h.service.mechanisms.find((m) => !m.transmission.gears.length)!;
    expect(ordinary.getForceAnalysis('static').successfulFrames).toBeGreaterThan(0);
  });
  it('scrubs to the complete gear cycle without folding its travel back to zero', () => {
    const h = pair();
    h.service.seekMechanismTo(0, 1);
    expect(h.service.currentSampleOf(0)).toBe(h.service.mechanisms[0].joints.length - 1);
    expect(Math.abs(h.service.mechanisms[0].gearTravel[h.service.currentSampleOf(0)])).toBeCloseTo(
      4 * Math.PI,
      8
    );
  });
  it('creates, attaches, edits and meshes with one history entry per action', () => {
    const h = pair();
    expect(h.saveCount()).toBe(4);
    expect(h.service.mechanisms).toHaveLength(1);
    expect(h.service.mechanisms[0].isMechanismValid()).toBe(true);
    expect(h.service.joints.filter((j) => (j as RealJoint).input)).toHaveLength(1);
    expect(h.editor.mesh(h.a.id, h.b.id)).toBe(false);
    expect(h.saveCount()).toBe(4);
  });
  it('keeps an incompatible property edit and blocks solving until repaired', () => {
    const h = pair();
    const before = h.service.joints.map((j) => [j.x, j.y]);
    h.editor.edit(h.b.id, { teeth: 60 });
    expect(h.service.mechanisms[0].isMechanismValid()).toBe(false);
    expect(h.service.joints.map((j) => [j.x, j.y])).toEqual(before);
    h.editor.edit(h.b.id, { teeth: 40 });
    expect(h.service.mechanisms[0].isMechanismValid()).toBe(true);
  });
  it('deletes metadata while retaining hosts, and deleting a host cascades before ID reuse', () => {
    const h = pair();
    const hostCount = h.service.links.length;
    h.editor.removeGear(h.a.id);
    expect(h.service.links).toHaveLength(hostCount);
    expect(h.service.gearMeshes).toHaveLength(0);
    h.active.updateSelectedObj(h.service.links.find((l) => l.id === h.b.hostLinkId));
    h.service.deleteLink();
    expect(h.service.gears).toHaveLength(0);
    h.editor.create({ x: 0, y: 0 });
    expect(h.service.gears[0].id).not.toBe(h.b.id);
  });
  it('duplicates a full train with fresh internal IDs, and a partial train without external edges', () => {
    const h = pair();
    const batch = runInInjectionContext(h.injector, () => new SelectionBatchService());
    expect(
      batch.duplicateSelected(
        [
          { kind: 'link', id: h.a.hostLinkId },
          { kind: 'link', id: h.b.hostLinkId },
        ],
        { x: 0, y: 8 * S }
      ).ok
    ).toBe(true);
    const copied = h.service.gears.slice(2);
    const edge = h.service.gearMeshes[1];
    expect(copied.map((g) => g.id)).toContain(edge.gearAId);
    expect(copied.map((g) => g.id)).toContain(edge.gearBId);
    expect(edge.id).not.toBe(h.service.gearMeshes[0].id);
    expect(
      batch.duplicateSelected([{ kind: 'link', id: h.a.hostLinkId }], { x: 0, y: 16 * S }).ok
    ).toBe(true);
    expect(h.service.gears).toHaveLength(5);
    expect(h.service.gearMeshes).toHaveLength(2);
  });
  it('keeps the gear and mesh when a host gains and loses a tracer', () => {
    const h = pair();
    const host = h.service.links.find((l) => l.id === h.b.hostLinkId)!;
    h.active.updateSelectedObj(host);
    h.service.addJointAt(new Coord(S, S));
    expect(h.service.gears.find((g) => g.id === h.b.id)?.hostLinkId).toBe(host.id);
    expect(h.service.gearMeshes).toHaveLength(1);
    expect(h.service.mechanisms[0].isMechanismValid()).toBe(true);
    h.active.updateSelectedObj(h.service.joints.at(-1));
    h.service.deleteJoint();
    expect(h.service.gears.find((g) => g.id === h.b.id)?.hostLinkId).toBe(h.b.hostLinkId);
    expect(h.service.gearMeshes).toHaveLength(1);
    expect(h.service.mechanisms[0].isMechanismValid()).toBe(true);
    h.active.updateSelectedObj(host);
    h.service.addJointAt(new Coord(S, S));
    const batch = runInInjectionContext(h.injector, () => new SelectionBatchService());
    expect(batch.deleteSelected([{ kind: 'joint', id: h.service.joints.at(-1)!.id }]).ok).toBe(
      true
    );
    expect(h.service.gears.find((g) => g.id === h.b.id)?.hostLinkId).toBe(h.b.hostLinkId);
    expect(h.service.gearMeshes).toHaveLength(1);
  });
  it('refuses ambiguous host rewrites before mutating', () => {
    const h = pair();
    const before = urlGeneratorFor(h.service, h.settings).generateUrlQuery();
    const a = h.service.joints[0] as RealJoint,
      b = h.service.joints[2] as RealJoint;
    expect(h.service.mergeJoints(a, b)).toBe('gear-host');
    h.service.weldJoint(a);
    expect(urlGeneratorFor(h.service, h.settings).generateUrlQuery()).toBe(before);
  });
  it('edits metadata at a paused sample without redefining the authored phase', () => {
    const h = pair();
    const original = h.service.mechanisms[0].joints[0].map((j) => [j.x, j.y]);
    h.service.animate(180, false);
    h.editor.edit(h.b.id, { name: 'Output' });
    expect(h.service.mechanisms[0].joints[0].map((j) => [j.x, j.y])).toEqual(original);
    expect(h.service.mechanisms[0].gearTravel[0]).toBe(0);
  });
  it('shares continuous positions and rates with sampling and the educational worksheet', () => {
    const h = pair(),
      mechanism = h.service.mechanisms[0];
    const samples = h.injector.get(AnalysisSampleService);
    const step = mechanism.joints.length - 1;
    const travel = samples.sampleAt(
      mechanism,
      step,
      'kinematic',
      '',
      'Angular Gear Travel',
      h.b.id
    )[0];
    expect(Math.abs(travel)).toBeCloseTo(2 * Math.PI, 8);
    const rates = new SolverExplanationService()
      .gearsAt(mechanism, step)
      .find((g) => g.id === h.b.id)!;
    expect(rates.angle).toBe(
      samples.sampleAt(mechanism, step, 'kinematic', '', 'Angular Gear Pos', h.b.id)[0]
    );
    expect(rates.rpm).toBeCloseTo(
      (samples.sampleAt(mechanism, step, 'kinematic', '', 'Angular Gear Vel', h.b.id)[0] * 30) /
        Math.PI,
      10
    );
  });
});
