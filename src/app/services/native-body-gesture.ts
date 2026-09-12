import { sameBodyRecord } from '../model/body-system/body-edit-effects';
import { nativeGestureScale } from './native-gesture-scale';
import { BodyDocumentAuthority } from '../model/body-system/body-document-authority';
import { BodyEditPlan, BodyEditOperation } from '../model/body-system/body-edit-types';
import { BodyPointMove } from '../model/body-system/body-point-edit';
import { BodyDragMove } from '../model/body-system/body-drag-edit';
import { BodyCoordinateMove } from '../model/body-system/body-coordinate-edit';
import { Point, localToWorld } from '../model/body-system/body-frame';
import { jointCoordinate } from '../model/body-system/joint-coordinate';
import { withBodyEditFrame } from '../model/body-system/body-edit-frame';
import { snapshotCopy } from '../model/body-system/sample-results';
import { bodyEditRefusal } from '../model/body-system/joint-permission';
import { EditState } from '../model/edit-permission';

export type BodyGestureTarget =
  | Omit<BodyPointMove, 'target' | 'mode'>
  | Omit<BodyDragMove, 'target'>
  | Omit<BodyCoordinateMove, 'target'>;

/** Drafts never publish model changes. The accepted continuation is replayed as one undoable command. */
export class NativeBodyGesture {
  private readonly revision: number;
  private readonly display;
  private readonly clocks;
  private operations: BodyEditOperation[] = [];
  private last: Point | number;
  private readonly step: number;
  private closed = false;
  private plan: BodyEditPlan;
  constructor(
    private readonly authority: BodyDocumentAuthority,
    private readonly id: string,
    private readonly target: BodyGestureTarget,
    state: EditState
  ) {
    this.revision = authority.revision;
    this.display = authority.display;
    this.clocks = authority.local.clocks;
    this.target = snapshotCopy(target);
    const document = authority.display
      ? withBodyEditFrame(authority.document, authority.display)
      : authority.document;
    const plan = authority.preview({ id, operations: [] }, state);
    if (!plan.ok) throw new Error(plan.message);
    this.plan = plan;
    if (target.kind === 'move-coordinate') {
      const joint = document.joints.find((j) => j.id === target.coordinate.jointId);
      if (!joint) throw new Error('Missing gesture joint');
      this.last = jointCoordinate(
        joint,
        target.coordinate.coordinate,
        new Map(document.bodies.map((b) => [b.id, b.pose])),
        new Map(document.attachments.map((p) => [p.id, p]))
      );
    } else {
      const point =
        target.kind === 'move-body'
          ? { bodyId: target.bodyId, point: target.grab }
          : document.attachments.find((p) => p.id === target.attachmentId);
      if (!point) throw new Error('Missing gesture point');
      this.last = localToWorld(
        document.bodies.find((b) => b.id === point.bodyId)!.pose,
        point.point
      );
    }
    this.step = nativeGestureScale(document, target);
    if (!Number.isFinite(this.step) || this.step <= 0) throw new Error('Invalid gesture scale');
  }
  advance(target: Point | number, state: EditState) {
    if (!this.current()) return bodyEditRefusal('stale-pose');
    if (
      typeof target !== typeof this.last ||
      (typeof target === 'number'
        ? !Number.isFinite(target)
        : ![target.x, target.y].every(Number.isFinite))
    )
      return bodyEditRefusal('invalid-command');
    const start = this.last;
    const distance =
      typeof target === 'number'
        ? Math.abs(target - (start as number))
        : Math.hypot(target.x - (start as Point).x, target.y - (start as Point).y);
    const interpolate = (fraction: number): Point | number =>
      typeof target === 'number'
        ? (start as number) + (target - (start as number)) * fraction
        : {
            x: (start as Point).x + (target.x - (start as Point).x) * fraction,
            y: (start as Point).y + (target.y - (start as Point).y) * fraction,
          };
    const steps = Math.ceil(distance / this.step);
    if (steps > 256 || this.operations.length + steps > 1000)
      return bodyEditRefusal('unsolved-edit');
    let prior = 0;
    for (let i = 1; i <= steps; i++) {
      const fraction = i / steps;
      const attempt = (t: number) => {
        const value = interpolate(t);
        const operation = {
          ...this.target,
          target: value,
          ...(this.target.kind === 'move-point' ? { mode: 'project' as const } : {}),
        } as BodyEditOperation;
        const operations = [...this.operations, operation];
        const plan = this.authority.preview({ id: this.id, operations }, state);
        return { plan, operations, value };
      };
      const result = attempt(fraction);
      if (result.plan.ok) {
        this.plan = result.plan;
        this.operations = result.operations;
        this.last = result.value;
        prior = fraction;
        continue;
      }
      if (!['unsolved-edit', 'invalid-document'].includes(result.plan.code)) return result.plan;
      let low = prior,
        high = fraction;
      for (let cut = 0; cut < 24; cut++) {
        const mid = (low + high) / 2,
          candidate = attempt(mid);
        if (candidate.plan.ok) {
          this.plan = candidate.plan;
          this.operations = candidate.operations;
          this.last = candidate.value;
          low = mid;
        } else high = mid;
      }
      return { ok: true as const, plan: this.plan, limited: true };
    }
    return { ok: true as const, plan: this.plan, limited: false };
  }
  finish(authority: BodyDocumentAuthority, state: EditState) {
    if (authority !== this.authority) return bodyEditRefusal('stale-pose');
    if (!this.current()) return bodyEditRefusal('stale-pose');
    this.closed = true;
    return this.authority.commit(this.plan, state);
  }
  cancel() {
    this.closed = true;
  }
  private current() {
    return (
      !this.closed &&
      this.authority.revision === this.revision &&
      this.authority.display === this.display &&
      sameBodyRecord(this.authority.local.clocks, this.clocks)
    );
  }
}
