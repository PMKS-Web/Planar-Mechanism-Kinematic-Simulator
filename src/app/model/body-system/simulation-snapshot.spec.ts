import {
  nativeWeldedLoadedRod,
  nativeLoadedRod,
} from '../../../test-utils/verification/native-force-fixtures';
import {
  nativeTwinCranksOnPinnedFrame,
  nativeSeparateFoundations,
} from '../../../test-utils/verification/native-fixed-frame-fixtures';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { SimulationSnapshot } from './simulation-snapshot';
import { BodyDocument } from './body-document';
import { selectSimulationView, reverseSimulationSample } from './simulation-view';
import {
  simulationBodyPose,
  simulationBodyMotion,
  simulationBodyPoint,
  simulationBodyPointRates,
  simulationAttachmentPosition,
  simulationMaterialCenter,
  simulationMaterialCenterRates,
} from './simulation-body-readers';
import {
  simulationCoordinateValue,
  simulationCoordinateRates,
} from './simulation-coordinate-readers';
import {
  simulationDriverEffort,
  simulationJointReaction,
  simulationPower,
} from './simulation-force-readers';
import { SimulationValue } from './simulation-values';
import { BodyUnits, SI_UNITS, unitFactors } from './body-units';
import { BodyFactory } from './body-factory';
import { add, rotate } from './body-frame';
import { rebaseBody } from './rebase-body';
import { WORLD } from './body-id';

function value<T>(result: SimulationValue<T>): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
function build(document: BodyDocument, mode: 'static' | 'dynamic' = 'dynamic') {
  const result = buildSimulationSnapshot(document, 12, {
    mode,
    gravity: { x: 0, y: -9.81 },
    path: { commandStep: 0.2 },
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.snapshot;
}
function view(
  snapshot: SimulationSnapshot,
  indices = new Map([...snapshot.partitions.keys()].map((key) => [key, 0]))
) {
  return value(selectSimulationView(snapshot, { revision: snapshot.revision, indices }));
}
const ENGLISH: BodyUnits = { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' };

describe('native simulation snapshots and readers', () => {
  it('reverses rates and power without changing pose, acceleration, forces or the stored sample', () => {
    const fixture = nativeLoadedRod();
    const snapshot = build(fixture.document);
    const key = snapshot.bodyPartition.get(fixture.body)!;
    const indices = new Map([[key, 3]]);
    const forward = value(selectSimulationView(snapshot, { revision: 12, indices }));
    const backward = value(
      selectSimulationView(snapshot, { revision: 12, indices, directions: new Map([[key, -1]]) })
    );
    const a = value(simulationBodyMotion(forward, fixture.body));
    const b = value(simulationBodyMotion(backward, fixture.body));
    for (const axis of ['vx', 'vy', 'omega'] as const)
      expect(b.velocity[axis]).toBeCloseTo(-a.velocity[axis], 12);
    expect(Math.abs(a.velocity.omega)).toBeGreaterThan(0);
    expect(b.acceleration).toEqual(a.acceleration);
    expect(simulationBodyPose(backward, fixture.body)).toEqual(
      simulationBodyPose(forward, fixture.body)
    );
    expect(simulationDriverEffort(backward, fixture.driver.id)).toEqual(
      simulationDriverEffort(forward, fixture.driver.id)
    );
    const power = value(simulationPower(forward, key));
    const reversed = value(simulationPower(backward, key));
    for (const name of ['applied', 'driver', 'boundary', 'kineticEnergyRate', 'residual'] as const)
      expect(reversed[name]).toBe(-power[name]);
    const selected = value(forward.samples.get(key)!);
    expect(reverseSimulationSample(reverseSimulationSample(selected))).toEqual(selected);
    expect(value(selectSimulationView(snapshot, { revision: 12, indices }))).toEqual(forward);
  });

  it('owns immutable design, compiled frames and samples without freezing or mutating the drawing', () => {
    const fixture = nativeLoadedRod(),
      before = JSON.stringify(fixture.document);
    const snapshot = build(fixture.document);
    const selected = view(snapshot),
      body = fixture.document.bodies.find((item) => item.id === fixture.body)!;
    expect(JSON.stringify(fixture.document)).toBe(before);
    expect(Object.isFrozen(body.pose)).toBe(false);
    expect(Object.isFrozen(snapshot.document.bodies[1].pose)).toBe(true);
    expect('set' in snapshot.system.groups).toBe(false);
    expect('set' in snapshot.system.groups.get(fixture.body)!.members).toBe(false);
    expect('set' in snapshot.partitions).toBe(false);
    const old = value(simulationBodyPose(selected, fixture.body));
    (body.pose as { x: number }).x = 123;
    expect(value(simulationBodyPose(selected, fixture.body))).toEqual(old);
    expect(snapshot.document).not.toBe(fixture.document);
    expect(
      value(simulationPower(selected, snapshot.bodyPartition.get(fixture.body)!)).residual
    ).toBeCloseTo(0, 8);
    expect(selectSimulationView(snapshot, { revision: 13, indices: new Map() })).toEqual({
      ok: false,
      reason: 'stale-snapshot',
    });
  });

  it('reads a welded member and off-axis material witness in SI through rebasing and unit changes', () => {
    for (const units of [SI_UNITS, ENGLISH]) {
      const fixture = nativeWeldedLoadedRod(units),
        factor = unitFactors(units).length;
      const f = new BodyFactory(fixture.document);
      const local = { x: 0.7 / factor, y: 0.2 / factor },
        witness = f.attachment(fixture.bracket, local);
      const changed = rebaseBody(f.document, fixture.bracket, {
        x: 0.3 / factor,
        y: -0.8 / factor,
        angle: 0.9,
      });
      for (const document of [
        f.document,
        changed,
        {
          ...changed,
          bodies: [...changed.bodies].reverse(),
          joints: [...changed.joints].reverse(),
        },
      ]) {
        const snapshot = build(document),
          key = snapshot.bodyPartition.get(fixture.bracket)!;
        const partition = snapshot.partitions.get(key)!;
        if (!partition.ok) throw new Error(partition.reason);
        const sample = partition.inputs[3].sample,
          theta = fixture.angle + sample.command;
        const selected = view(snapshot, new Map([[key, 3]]));
        const relative = add({ x: 1, y: 1 }, rotate({ x: 0.7, y: 0.2 }, 0.3));
        const world = rotate(relative, theta),
          position = value(simulationAttachmentPosition(selected, witness));
        expect(position.x).toBeCloseTo(world.x, 9);
        expect(position.y).toBeCloseTo(world.y, 9);
        const anchor = document.attachments.find((item) => item.id === witness)!;
        const rates = value(simulationBodyPointRates(selected, fixture.bracket, anchor.point));
        expect(rates.velocity.x).toBeCloseTo(-3 * world.y, 9);
        expect(rates.velocity.y).toBeCloseTo(3 * world.x, 9);
        expect(rates.acceleration.x).toBeCloseTo(-9 * world.x, 9);
        expect(rates.acceleration.y).toBeCloseTo(-9 * world.y, 9);
        expect(value(simulationBodyMotion(selected, fixture.bracket)).velocity.omega).toBeCloseTo(
          3,
          10
        );
        expect(
          value(simulationBodyMotion(selected, fixture.bracket)).acceleration.alpha
        ).toBeCloseTo(0, 10);
        const center = rotate(add({ x: 1, y: 1 }, rotate({ x: 0.5, y: 0 }, 0.3)), theta);
        const readCenter = value(simulationMaterialCenter(selected, fixture.bracket));
        expect(readCenter.x).toBeCloseTo(center.x, 9);
        expect(readCenter.y).toBeCloseTo(center.y, 9);
        expect(
          value(simulationMaterialCenterRates(selected, fixture.bracket)).acceleration.x
        ).toBeCloseTo(-9 * center.x, 9);
        const coordinate = value(simulationCoordinateRates(selected, fixture.driver.coordinate));
        expect(coordinate.value).toBeCloseTo(sample.command, 10);
        expect(coordinate.velocity).toBeCloseTo(3, 10);
      }
    }
  });

  it('combines explicit clock selections with one fixed support policy and preserves other foundations', () => {
    const fixture = nativeTwinCranksOnPinnedFrame(),
      snapshot = build(fixture.document, 'static');
    const keys = fixture.cranks.map((crank) => snapshot.bodyPartition.get(crank.body)!);
    expect([...snapshot.fixedSupportPolicies.values()]).toEqual(['evenest']);
    const indices = new Map([
      [keys[0], 1],
      [keys[1], 4],
    ]);
    const selected = view(snapshot, indices);
    const reaction = value(
      simulationJointReaction(selected, fixture.supports[0].id, fixture.frame)
    );
    expect(reaction.basis).toBe('evenest');
    expect(
      simulationJointReaction(selected, fixture.supports[0].id, fixture.cranks[0].body)
    ).toEqual({ ok: false, reason: 'wrong-body' });
    const component = selected.fixedForces;
    if (!component.ok) throw new Error(component.reason);
    const result = [...component.components.values()][0].result;
    if (!result.ok) throw new Error(result.reason);
    expect(result.context.samples.map((sample) => sample.time).sort()).toEqual([0.2, 0.4]);
    indices.clear();
    expect(selected.samples.get(keys[0])!.ok).toBe(true);
    const missing = view(snapshot, new Map([[keys[1], 4]]));
    expect(simulationBodyPose(missing, fixture.cranks[0].body)).toEqual({
      ok: false,
      reason: 'missing-sample',
    });
    expect(simulationJointReaction(missing, fixture.supports[0].id, fixture.frame)).toMatchObject({
      ok: false,
      reason: 'frame-context',
    });
    expect(value(simulationBodyMotion(missing, fixture.frame)).velocity).toEqual({
      vx: 0,
      vy: 0,
      omega: 0,
    });
    expect(value(simulationBodyPose(missing, fixture.cranks[1].body)).angle).toBeCloseTo(
      1.1 - 0.8,
      9
    );
    const separate = nativeSeparateFoundations(),
      separated = build(separate.document, 'static');
    const [first, second] = separate.foundations;
    const separateView = view(
      separated,
      new Map([[separated.bodyPartition.get(second.crank)!, 0]])
    );
    expect(simulationJointReaction(separateView, first.support.id, first.body).ok).toBe(false);
    const good = value(simulationJointReaction(separateView, second.support.id, second.body));
    expect(good.wrench.force.y).toBeCloseTo(10 + (second.mass + 1) * 9.81, 9);
  });

  it('keeps position and scalar coordinates at a reversal while rates and dynamics are unavailable', () => {
    const fixture = nativeAxialCarriage('weld'),
      snapshot = build(fixture.document),
      key = snapshot.bodyPartition.get(fixture.carriage)!;
    const partition = snapshot.partitions.get(key)!;
    if (!partition.ok) throw new Error(partition.reason);
    const stop = partition.inputs.findIndex((input) => input.reversal);
    const selected = view(snapshot, new Map([[key, stop]]));
    expect(simulationAttachmentPosition(selected, fixture.witness).ok).toBe(true);
    expect(simulationCoordinateValue(selected, fixture.driver.coordinate).ok).toBe(true);
    expect(simulationCoordinateRates(selected, fixture.driver.coordinate)).toEqual({
      ok: false,
      reason: 'reversal',
    });
    expect(simulationBodyPointRates(selected, fixture.carriage, { x: 0, y: 0 })).toEqual({
      ok: false,
      reason: 'reversal',
    });
    expect(simulationDriverEffort(selected, fixture.driver.id)).toEqual({
      ok: false,
      reason: 'reversal',
    });
    const later = view(snapshot, new Map([[key, stop + 1]]));
    expect(simulationBodyMotion(later, fixture.carriage).ok).toBe(true);
    expect(simulationDriverEffort(later, fixture.driver.id).ok).toBe(true);
    const invalid = view(snapshot, new Map([[key, -1]]));
    expect(simulationBodyPose(invalid, fixture.carriage)).toEqual({
      ok: false,
      reason: 'sample-index',
    });
    expect(simulationBodyPose(invalid, WORLD).ok).toBe(true);
  });

  it('reports a massless material center as unavailable while an arbitrary material witness remains usable', () => {
    const fixture = nativeLoadedRod();
    const document = {
      ...fixture.document,
      bodies: fixture.document.bodies.map((body) =>
        body.kind === 'material'
          ? { ...body, mass: { ...body.mass, mass: { mode: 'explicit' as const, value: 0 } } }
          : body
      ),
    };
    const selected = view(build(document));
    expect(simulationMaterialCenter(selected, fixture.body)).toEqual({
      ok: false,
      reason: 'zero-mass',
    });
    expect(simulationMaterialCenterRates(selected, fixture.body)).toEqual({
      ok: false,
      reason: 'zero-mass',
    });
    expect(simulationBodyPoint(selected, fixture.body, { x: 0.5, y: 0.7 }).ok).toBe(true);
  });
});
