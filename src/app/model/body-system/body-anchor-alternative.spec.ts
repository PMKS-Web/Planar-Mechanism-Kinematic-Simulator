import { nativeRotaryCarriage } from '../../../test-utils/verification/native-rotary-carriage-fixture';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import { newRecordId } from './body-id';

describe('native anchors reachable around the other side of a rotation', () => {
  it('resets only when a finite angular stop also closes the route around the passive gap', () => {
    const f = nativeRotaryCarriage();
    const document = {
      ...f.document,
      limits: [
        ...f.document.limits,
        {
          id: newRecordId<'limit'>(),
          coordinate: f.driver.coordinate,
          lower: -0.2,
          upper: 3,
        },
      ],
    };
    const a = new BodyDocumentAuthority(document);
    const built = buildSimulationSnapshot(a.document, 0, {
      mode: 'static',
      gravity: { x: 0, y: 0 },
      path: { commandStep: 0.2 },
    });
    if (!built.ok) throw new Error(built.reason);
    const key = built.snapshot.bodyPartition.get(f.crank)!;
    const view = selectSimulationView(built.snapshot, {
      revision: 0,
      indices: new Map([[key, 12]]),
    });
    if (!view.ok) throw new Error(view.reason);
    expect(a.setSimulationView(view.value)).toBe(true);
    const result = a.commit(
      {
        id: 'closed-gap',
        operations: [
          {
            kind: 'move-point',
            attachmentId: f.tip,
            target: { x: Math.cos(2.8), y: Math.sin(2.8) },
          },
        ],
      },
      { ...NATIVE_EDIT_CONTEXT.state, atStart: false }
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.event!.plan!.anchors![0].status).toBe('unreachable');
    expect(a.local.clocks[0].anchor).toBeCloseTo(2.4, 9);
    expect(a.local.clocks[0].time).toBe(0);
    expect(a.document.bodies.find((body) => body.id === f.crank)!.pose.angle).toBeCloseTo(2.8, 9);
    expect(a.document.limits).toEqual(document.limits);
  });
  it('retains a feasible anchor and the display leg when an edit puts a passive travel gap on the direct route', () => {
    const f = nativeRotaryCarriage(),
      a = new BodyDocumentAuthority(f.document);
    const built = buildSimulationSnapshot(a.document, 0, {
      mode: 'static',
      gravity: { x: 0, y: 0 },
      path: { commandStep: 0.2 },
    });
    if (!built.ok) throw new Error(built.reason);
    const key = built.snapshot.bodyPartition.get(f.crank)!;
    const view = selectSimulationView(built.snapshot, {
      revision: 0,
      indices: new Map([[key, 12]]),
    });
    if (!view.ok) throw new Error(view.reason);
    expect(a.setSimulationView(view.value)).toBe(true);
    // Both endpoint angles are feasible at radius 1; the sine maximum between them violates 0.95.
    expect(Math.sin(0.4)).toBeLessThan(0.95);
    expect(Math.sin(2.8)).toBeLessThan(0.95);
    const result = a.commit(
      {
        id: 'passive-gap',
        operations: [
          {
            kind: 'move-point',
            attachmentId: f.tip,
            target: { x: Math.cos(2.8), y: Math.sin(2.8) },
          },
        ],
      },
      { ...NATIVE_EDIT_CONTEXT.state, atStart: false }
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.event!.plan!.anchors![0].status).toBe('retained');
    expect(a.document.bodies.find((body) => body.id === f.crank)!.pose.angle).toBeCloseTo(0.4, 8);
    expect(a.document.bodies.find((body) => body.id === f.carriage)!.pose.y).toBeCloseTo(
      Math.sin(0.4),
      8
    );
    const upper = Math.asin(0.95),
      lower = Math.PI - upper - 2 * Math.PI,
      shown = 2.8 - 2 * Math.PI;
    expect(a.local.clocks[0].command).toBeCloseTo(2.4 - 2 * Math.PI, 8);
    expect(a.local.clocks[0].direction).toBe(1);
    expect(a.local.clocks[0].time).toBeCloseTo(upper - 0.4 + (upper - lower) + (shown - lower), 7);
    expect(a.display!.poses.get(f.crank)!.angle).toBeCloseTo(shown, 8);
    // A second edit validates the unwrapped display frame against its selected coordinate.
    expect(
      a.commit(
        {
          id: 'after-gap',
          operations: [
            { kind: 'attachment-properties', attachmentId: f.tip, change: { trace: true } },
          ],
        },
        { ...NATIVE_EDIT_CONTEXT.state, atStart: false }
      ).ok
    ).toBe(true);
  });
});
