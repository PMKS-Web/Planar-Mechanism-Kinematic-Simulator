import { turnsClockwise } from '../../model/drive-direction';
import { bodyLockMarks } from '../../model/body-system/body-state-marks';
import { bodyDimensionMark } from '../../model/body-system/body-dimension-mark';
import { bodyMotionBounds, bodyTraceMarks } from '../../model/body-system/body-motion-marks';
import { NativePlaybackService } from '../../services/native-playback.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { bodyGridStep } from '../../model/body-system/body-grid-marks';
import { compileWeldFrames } from '../../model/body-system/weld-frames';
import { bodyGroupPresentation } from '../../model/body-system/body-group-presentation';
import Hammer from 'hammerjs';
import { LongPress, LongPressDirective } from '../../long-press.directive';
import { nativeMaterialSkin } from '../../model/body-system/body-cylinder-skin';
import { BodyLoad } from '../../model/body-system/body-document';
import { bodyForceMarks } from '../../model/body-system/body-force-marks';
import { rotate } from '../../model/body-system/body-frame';
import { nativeCommand } from '../../model/body-system/body-joint-interaction';
import { BodyDocument } from '../../model/body-system/body-document';
import { refusalFor } from '../../model/edit-permission';
import {
  ChangeDetectionStrategy,
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import { NativeEditorService } from '../../services/native-editor.service';
import { NativeBodyGesture } from '../../services/native-body-gesture';
import { BodyJointMark, bodyJointMarks } from '../../model/body-system/body-joint-marks';
import { bodyDrawingPoints } from '../../model/body-system/body-material-marks';
import { BodySelectionRef } from '../../model/body-system/body-edit-types';
import { BodyId } from '../../model/body-system/body-id';
import { Point, dot, subtract, worldToLocal } from '../../model/body-system/body-frame';
import { jointCoordinate } from '../../model/body-system/joint-coordinate';
import {
  createNativeMember,
  selectionBodies,
  weldedSelection,
} from '../../model/body-system/body-joint-interaction';
import { ModelFrameDirective, UprightDirective } from '../../model-frame.directive';
import { ContextMenuComponent } from '../BLOCKS/context-menu/context-menu.component';
import { ContextMenuModel, trackContextMenuPointer } from '../BLOCKS/context-menu/menu-model';
import { NativeContextMenuService } from '../../services/native-context-menu.service';
import { freeCanvasRect } from '../../services/view-framing';
import { MaterialBody } from '../../model/body-system/material-body';
import { unitFactors } from '../../model/body-system/body-units';

interface PointerEdit {
  readonly id: number;
  readonly start: Point;
  readonly screen: Point;
  readonly gesture?: NativeBodyGesture;
  readonly coordinate?: number;
  readonly coordinateId?: string;
  readonly axis?: Point;
  readonly pan?: Point;
  readonly creation?: { kind: 'link' | 'cylinder'; owner?: BodyId; document: BodyDocument };
  readonly force?: { load: BodyLoad; end: boolean; document: BodyDocument };
  readonly target?: BodySelectionRef;
  readonly additive?: boolean;
  readonly touch?: boolean;
  readonly marquee?: boolean;
  moved: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-native-grid',
  imports: [
    LongPressDirective,
    ModelFrameDirective,
    UprightDirective,
    CdkContextMenuTrigger,
    ContextMenuComponent,
  ],
  templateUrl: './native-grid.component.html',
  styleUrl: './native-grid.component.scss',
})
export class NativeGridComponent implements AfterViewInit {
  protected readonly editor = inject(NativeEditorService);
  private readonly playback = inject(NativePlaybackService);
  protected readonly traces = computed(() =>
    bodyTraceMarks(this.editor.document(), this.playback.snapshot())
  );
  private readonly menus = inject(NativeContextMenuService);
  protected readonly longPress = viewChild(LongPressDirective);
  readonly multiple = signal(false);
  protected readonly selectionBox = signal<
    { x: number; y: number; width: number; height: number } | undefined
  >(undefined);
  protected readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('canvas');
  protected readonly frame = viewChild.required<ElementRef<SVGGElement>>('frame');
  protected readonly size = signal({ width: 1000, height: 700 });
  protected readonly camera = signal({ x: 0, y: 0, scale: 80 });
  protected readonly marks = computed(() => bodyJointMarks(this.editor.drawing()));
  protected readonly material = computed(() => {
    const document = this.editor.drawing();
    const rods = new Set(document.assemblies.map((c) => c.rod));
    const frames = compileWeldFrames(document);
    return document.bodies
      .filter((b): b is MaterialBody => b.kind === 'material')
      .map((body) => {
        const group = frames.ok ? frames.groupOf.get(body.id) : undefined;
        const presentation = group
          ? bodyGroupPresentation(document, group).presentation
          : undefined;
        return presentation ? { ...body, presentation } : body;
      })
      .filter((body) => !body.presentation.hidden)
      .sort((a, b) => Number(rods.has(b.id)) - Number(rods.has(a.id)));
  });
  protected readonly path = (body: MaterialBody) => nativeMaterialSkin(this.editor.drawing(), body);
  protected readonly locks = computed(() =>
    this.editor.playing() ? [] : bodyLockMarks(this.editor.drawing())
  );
  protected readonly dimension = computed(() =>
    bodyDimensionMark(this.editor.drawing(), this.editor.selection()[0], this.editor.dimension())
  );
  protected readonly forces = computed(() => bodyForceMarks(this.editor.drawing()));
  protected readonly gridStep = computed(() => bodyGridStep(this.camera().scale));
  protected readonly turnsClockwise = turnsClockwise;
  protected readonly markerSize = computed(
    () => this.editor.document().settings.objectScale * 0.16
  );
  protected readonly viewBox = computed(() => {
    const c = this.camera(),
      s = this.size();
    return `${c.x - s.width / c.scale / 2} ${-c.y - s.height / c.scale / 2} ${s.width / c.scale} ${s.height / c.scale}`;
  });
  private readonly contextTrigger = viewChild.required<ElementRef<HTMLElement>>('contextTrigger');
  protected readonly menu = signal<ContextMenuModel>({ groups: [] });
  readonly tool = signal<'link' | 'cylinder' | undefined>(undefined);
  protected readonly travelGhost = signal<Point | undefined>(undefined);
  private pointer?: PointerEdit;
  private pending?: PointerEvent;
  private animation = 0;
  private lastUnit = 1;
  ngAfterViewInit() {
    trackContextMenuPointer();
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      this.size.set({ width: r.width, height: r.height });
    });
    observer.observe(this.svg().nativeElement);
    this.cleanup.onDestroy(() => {
      observer.disconnect();
      cancelAnimationFrame(this.animation);
    });
    this.lastUnit = unitFactors(this.editor.document().units).length;
    this.editor.store.changes.pipe(takeUntilDestroyed(this.cleanup)).subscribe(() => {
      const unit = unitFactors(this.editor.document().units).length,
        factor = this.lastUnit / unit;
      if (factor !== 1)
        this.camera.update((c) => ({ x: c.x * factor, y: c.y * factor, scale: c.scale / factor }));
      this.lastUnit = unit;
    });
    const hammer = new Hammer(this.svg().nativeElement, { inputClass: Hammer.TouchMouseInput });
    hammer.get('pinch').set({ enable: true });
    let scale = 1;
    hammer.on('pinchstart pinchmove', (event: HammerInput) => {
      this.cancel();
      if (event.type === 'pinchstart') scale = this.camera().scale;
      const synthetic = new MouseEvent('mousemove', {
        clientX: event.center.x,
        clientY: event.center.y,
      });
      const before = this.point(synthetic);
      this.camera.update((c) => ({ ...c, scale: scale * event.scale }));
      const after = this.point(synthetic);
      this.camera.update((c) => ({
        ...c,
        x: c.x + before.x - after.x,
        y: c.y + before.y - after.y,
      }));
    });
    this.cleanup.onDestroy(() => hammer.destroy());
    requestAnimationFrame(() => this.fit());
  }
  private readonly cleanup = inject(DestroyRef);
  protected point(event: MouseEvent | PointerEvent): Point {
    const matrix = this.frame().nativeElement.getScreenCTM()!;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    // DOMPoint coordinates are prototype accessors, so spreading it would silently drop x and y.
    return { x: point.x, y: point.y };
  }
  protected selected(target: BodySelectionRef) {
    return this.editor.selection().some((s) => JSON.stringify(s) === JSON.stringify(target));
  }
  protected bodySelected(id: BodyId) {
    return selectionBodies(this.editor.document(), this.editor.selection()).includes(id);
  }
  protected bodyTarget(id: BodyId, member = false): BodySelectionRef {
    const c = this.editor.document().assemblies.find((c) => c.barrel === id || c.rod === id);
    if (c && !member) return { kind: 'assembly', id: c.id };
    return member ? { kind: 'body', id } : weldedSelection(this.editor.document(), id);
  }
  protected pose(body: MaterialBody) {
    return `translate(${body.pose.x} ${body.pose.y}) rotate(${(body.pose.angle * 180) / Math.PI})`;
  }
  protected markPose(mark: BodyJointMark) {
    return `translate(${mark.point.x} ${mark.point.y}) rotate(${(mark.angle * 180) / Math.PI})`;
  }
  protected down(
    event: PointerEvent,
    target?: BodySelectionRef,
    mark?: BodyJointMark,
    materialOwner?: BodyId
  ) {
    if (event.button !== 0 && event.button !== 1) return;
    event.stopPropagation();
    const at = this.point(event),
      screen = { x: event.clientX, y: event.clientY };
    this.svg().nativeElement.setPointerCapture(event.pointerId);
    const owner =
      materialOwner ??
      mark?.materialOwner ??
      (target ? selectionBodies(this.editor.drawing(), [target])[0] : undefined);
    if (this.tool()) {
      this.pointer = {
        id: event.pointerId,
        start: mark?.point ?? at,
        screen,
        moved: false,
        creation: { kind: this.tool()!, owner, document: this.editor.drawing() },
      };
      return;
    }
    const additive = event.shiftKey || this.multiple(),
      touch = event.pointerType !== 'mouse';
    if (target && !touch && this.editor.mode() !== 'analysis') this.editor.select(target, additive);
    else if (!target && !additive) this.editor.select();
    const base = { id: event.pointerId, start: at, screen, moved: false, target, additive, touch };
    if (!target && additive) {
      this.pointer = { ...base, marquee: true };
      return;
    }
    if (!target || event.button === 1) {
      this.pointer = { ...base, pan: this.camera() };
      return;
    }
    if (additive || refusalFor('drag', this.editor.state())) {
      this.pointer = base;
      return;
    }
    const document = this.editor.drawing();
    if (mark?.coordinate) {
      const joint = document.joints.find((j) => j.id === mark.coordinate!.jointId)!;
      const coordinate = jointCoordinate(
        joint,
        mark.coordinate.coordinate,
        new Map(document.bodies.map((b) => [b.id, b.pose])),
        new Map(document.attachments.map((a) => [a.id, a]))
      );
      const body = document.bodies.find((b) => b.id === joint.bodyA)!;
      const angle = body.pose.angle + joint.frameA.angle;
      this.pointer = {
        ...base,
        coordinate,
        coordinateId: joint.id,
        axis: mark.coordinateAxis ?? { x: Math.cos(angle), y: Math.sin(angle) },
        gesture: this.editor.store.beginGesture(
          { kind: 'move-coordinate', coordinate: mark.coordinate },
          this.editor.state()
        ),
      };
    } else if (mark?.attachmentId)
      this.pointer = {
        ...base,
        gesture: this.editor.store.beginGesture(
          { kind: 'move-point', attachmentId: mark.attachmentId },
          this.editor.state()
        ),
      };
    else if (owner) {
      const body = document.bodies.find((b) => b.id === owner)!;
      this.pointer = {
        ...base,
        gesture: this.editor.store.beginGesture(
          { kind: 'move-body', bodyId: owner, grab: worldToLocal(body.pose, at) },
          this.editor.state()
        ),
      };
    }
  }
  protected forceDown(event: PointerEvent, id: string, end: boolean) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const load = this.editor.drawing().forces.find((f) => f.id === id)!;
    this.editor.select({ kind: 'force', id: load.id }, event.shiftKey);
    if (refusalFor('drag', this.editor.state())) return;
    this.svg().nativeElement.setPointerCapture(event.pointerId);
    this.pointer = {
      id: event.pointerId,
      start: this.point(event),
      screen: { x: event.clientX, y: event.clientY },
      moved: false,
      touch: event.pointerType !== 'mouse',
      force: { load, end, document: this.editor.drawing() },
    };
  }
  protected move(event: PointerEvent) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    this.pending = event;
    if (!this.animation)
      this.animation = requestAnimationFrame(() => {
        this.animation = 0;
        const next = this.pending;
        this.pending = undefined;
        if (next) this.advance(next);
      });
  }
  private advance(event: PointerEvent) {
    const p = this.pointer;
    if (!p) return;
    if (
      Math.hypot(event.clientX - p.screen.x, event.clientY - p.screen.y) < (p.touch ? 10 : 3) &&
      !p.moved
    )
      return;
    if (this.longPress()?.pressPending) return;
    p.moved = true;
    const at = this.point(event);
    if (p.marquee) {
      this.selectionBox.set({
        x: Math.min(p.start.x, at.x),
        y: Math.min(p.start.y, at.y),
        width: Math.abs(at.x - p.start.x),
        height: Math.abs(at.y - p.start.y),
      });
      return;
    }
    if (p.pan) {
      this.camera.update((c) => ({
        ...c,
        x: p.pan!.x - (event.clientX - p.screen.x) / c.scale,
        y: p.pan!.y + (event.clientY - p.screen.y) / c.scale,
      }));
      return;
    }
    if (p.force) {
      const { load, end, document } = p.force;
      const body = document.bodies.find((b) => b.id === load.bodyId)!;
      const start = bodyForceMarks(document).find((f) => f.id === load.id)!.start;
      const vector = subtract(at, start),
        length = Math.hypot(vector.x, vector.y),
        magnitude = Math.hypot(load.vector.x, load.vector.y);
      const unit = length > 0 ? { x: vector.x / length, y: vector.y / length } : { x: 1, y: 0 };
      const direction = rotate(unit, load.frame === 'body' ? -body.pose.angle : 0);
      const command = nativeCommand({
        kind: 'force-properties',
        forceId: load.id,
        change: end
          ? {
              vector: { x: direction.x * magnitude, y: direction.y * magnitude },
              presentation: { length, zeroAngle: Math.atan2(direction.y, direction.x) },
            }
          : { point: worldToLocal(body.pose, at) },
      });
      const preview = this.editor.preview(command);
      if (preview.ok) this.editor.draft.set(preview);
      else this.editor.report(preview.message);
      return;
    }
    if (p.creation) {
      if (
        Math.hypot(at.x - p.start.x, at.y - p.start.y) <
        this.editor.document().settings.objectScale * 0.2
      )
        return;
      const hit = this.dropTarget(event, p.creation.document);
      const destination = hit?.point ?? at;
      const command = createNativeMember(
        p.creation.document,
        p.creation.kind,
        p.start,
        destination,
        p.creation.owner,
        hit?.bodyId
      );
      const preview = this.editor.preview(command);
      if (preview.ok) this.editor.draft.set(preview);
      else this.editor.report(preview.message);
      return;
    }
    if (p.gesture) {
      const value =
        p.coordinate === undefined ? at : p.coordinate + dot(subtract(at, p.start), p.axis!);
      const result = p.gesture.advance(value, this.editor.state());
      if (result.ok) {
        this.editor.draft.set(result.plan);
        this.editor.report(result.limited ? result.refusal.message : '');
        if (p.coordinate !== undefined) {
          const mark = bodyJointMarks(this.editor.drawing()).find(
            (m) => m.coordinate?.jointId === p.coordinateId
          );
          this.travelGhost.set(mark?.rider);
        }
      } else this.editor.report(result.message);
    }
  }
  protected up(event: PointerEvent) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    this.advance(event);
    const p = this.pointer;
    const box = this.selectionBox();
    if (box) {
      for (const body of this.material()) {
        const points = bodyDrawingPoints({ ...this.editor.drawing(), bodies: [body] });
        const xs = points.map((p) => p.x),
          ys = points.map((p) => p.y);
        if (
          Math.min(...xs) <= box.x + box.width &&
          Math.max(...xs) >= box.x &&
          Math.min(...ys) <= box.y + box.height &&
          Math.max(...ys) >= box.y
        ) {
          const target = this.bodyTarget(body.id);
          if (!this.selected(target)) this.editor.select(target, true);
        }
      }
    }
    if (!p.moved && p.target && (p.touch || this.editor.mode() === 'analysis'))
      this.editor.select(p.target, p.additive);
    if (p.gesture && p.moved) {
      const result = this.editor.store.finishGesture(p.gesture, this.editor.state());
      if (!result.ok) this.editor.report(result.message);
      else if (result.changed) this.editor.report('');
    } else if ((p.creation || p.force) && this.editor.draft()) {
      const plan = this.editor.draft()!;
      if (this.editor.commit(plan) && p.creation) {
        const target =
          plan.effects.added.find((r) => r.kind === 'assembly') ??
          plan.effects.added.find((r) => r.kind === 'body');
        if (target && (target.kind === 'body' || target.kind === 'assembly'))
          this.editor.select(target);
      }
    } else p.gesture?.cancel();
    if (p.creation) this.tool.set(undefined);
    this.cancel();
  }
  private dropTarget(
    event: PointerEvent,
    document: BodyDocument
  ): { bodyId: BodyId; point: Point } | undefined {
    const at = this.point(event),
      radius = 12 / this.camera().scale;
    const marks = bodyJointMarks(document).filter(
      (mark) => Math.hypot(mark.point.x - at.x, mark.point.y - at.y) <= radius
    );
    for (const mark of marks) {
      const bodyId = selectionBodies(document, [mark.target])[0];
      if (bodyId) return { bodyId, point: mark.point };
    }
    const element = globalThis.document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((el) => document.bodies.some((body) => body.id === el.getAttribute('data-body-id')));
    const body = document.bodies.find((b) => b.id === element?.getAttribute('data-body-id'));
    return body ? { bodyId: body.id, point: at } : undefined;
  }
  cancel() {
    this.pointer?.gesture?.cancel();
    this.pointer = undefined;
    this.pending = undefined;
    cancelAnimationFrame(this.animation);
    this.animation = 0;
    this.editor.draft.set(undefined);
    this.travelGhost.set(undefined);
    this.selectionBox.set(undefined);
  }
  protected held(press: LongPress) {
    this.cancel();
    const target = globalThis.document.elementFromPoint(press.x, press.y) ?? press.target;
    target?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: press.x,
        clientY: press.y,
        button: 2,
      })
    );
  }
  protected context(event: MouseEvent, target?: BodySelectionRef, materialOwner?: BodyId) {
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
    if (target && !this.selected(target)) this.editor.select(target);
    if (!target) this.editor.select();
    this.menu.set(
      this.menus.build(target, this.point(event), (kind) => this.tool.set(kind), materialOwner)
    );
    // The CDK needs the opening event to ignore that same right-click's trailing auxclick.
    this.contextTrigger().nativeElement.dispatchEvent(
      new MouseEvent('contextmenu', {
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        ctrlKey: event.ctrlKey,
        cancelable: true,
      })
    );
  }
  zoom(factor: number) {
    this.camera.update((c) => ({ ...c, scale: Math.max(0.0001, Math.min(1e8, c.scale * factor)) }));
  }
  protected wheel(event: WheelEvent) {
    event.preventDefault();
    const before = this.point(event);
    this.zoom(Math.exp(-event.deltaY * 0.001));
    const after = this.point(event);
    this.camera.update((c) => ({ ...c, x: c.x + before.x - after.x, y: c.y + before.y - after.y }));
  }
  fit() {
    const measured = this.svg().nativeElement.getBoundingClientRect();
    this.size.set({ width: measured.width, height: measured.height });
    const points = bodyMotionBounds(this.editor.drawing(), this.playback.snapshot()),
      size = this.size(),
      rect = freeCanvasRect(this.svg().nativeElement);
    const minX = points.length ? Math.min(...points.map((p) => p.x)) : -5,
      maxX = points.length ? Math.max(...points.map((p) => p.x)) : 5;
    const minY = points.length ? Math.min(...points.map((p) => p.y)) : -4,
      maxY = points.length ? Math.max(...points.map((p) => p.y)) : 4;
    const scale =
      Math.min(
        rect.width / Math.max(maxX - minX, this.editor.document().settings.objectScale),
        rect.height / Math.max(maxY - minY, this.editor.document().settings.objectScale)
      ) * 0.7;
    const bounds = this.svg().nativeElement.getBoundingClientRect();
    this.camera.set({
      x: (minX + maxX) / 2 - (rect.x - bounds.x + rect.width / 2 - size.width / 2) / scale,
      y: (minY + maxY) / 2 + (rect.y - bounds.y + rect.height / 2 - size.height / 2) / scale,
      scale,
    });
  }
}
