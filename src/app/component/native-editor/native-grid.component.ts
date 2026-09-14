import { bodySlotChannels } from '../../model/body-system/body-mounted-skin';
import { LengthUnit } from '../../model/unit-enums';
import { bodyCompoundMarks } from '../../model/body-system/body-compound-marks';
import { INK_FLIPS_AT, luminanceOf } from '../../model/contrast';
import { Coord } from '../../model/coord';
import { snapToAxes, SnapGuide } from '../../model/axis-snap';
import {
  blockPath,
  cylinderBlockPath,
  cylinderArrowPaths,
  motorBodyPath,
  plusPath,
  straightArrowPaths,
  railGeometry,
  GROUND_STROKE,
  MARK,
  CYLINDER,
} from '../../model/joint-marks';
import { bodyCenterMarks } from '../../model/body-system/body-center-marks';
import { JOINT_FAMILIES } from '../../model/joint-colors';
import { CanvasEffectsComponent } from '../canvas-effects/canvas-effects.component';
import { GridRulingComponent } from '../grid-ruling/grid-ruling.component';
import { MODEL_SCALE } from '../../model/render-scale';
import { SvgGridService } from '../../services/svg-grid.service';
import { ViewportService } from '../../services/viewport.service';
import { CHROME_SETTINGS, CHROME_TABS } from '../../services/chrome/chrome-tokens';
import { registerViewportCanvas } from '../../services/canvas-handle';
import { DragStateService } from '../../services/drag-state.service';
import { KeyboardShortcutsService } from '../../services/keyboard-shortcuts.service';
import { turnsClockwise } from '../../model/drive-direction';
import { bodyLockMarks } from '../../model/body-system/body-state-marks';
import { bodyDimensionMark } from '../../model/body-system/body-dimension-mark';
import { bodyMotionPoses, bodyTraceMarks } from '../../model/body-system/body-motion-marks';
import { NativePlaybackService } from '../../services/native-playback.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { compileWeldFrames } from '../../model/body-system/weld-frames';
import { bodyGroupPresentation } from '../../model/body-system/body-group-presentation';
import { LongPress, LongPressDirective } from '../../long-press.directive';
import { nativeMaterialSkin } from '../../model/body-system/body-cylinder-skin';
import { bodyLabelMark } from '../../model/body-system/body-label-marks';
import { BodyLoad } from '../../model/body-system/body-document';
import { bodyForceMarks } from '../../model/body-system/body-force-marks';
import { localToWorld, rotate } from '../../model/body-system/body-frame';
import { nativeCommand } from '../../model/body-system/body-joint-interaction';
import { BodyDocument } from '../../model/body-system/body-document';
import { refusalFor } from '../../model/edit-permission';
import {
  ChangeDetectionStrategy,
  afterNextRender,
  NgZone,
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
import { BodyId, newRecordId } from '../../model/body-system/body-id';
import { nativeForceInsert } from '../../model/body-system/body-menu-commands';
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
import { MaterialBody } from '../../model/body-system/material-body';

/**
 * The pointer id of a creation the menu started.
 *
 * Attach Link from the menu works as it does on the public canvas: the bar
 * starts at the right-click point, its ghost follows the pointer with no button
 * held, and the next click commits it. No button is down when that begins, so
 * there is no pointer id yet; the first press adopts the gesture and its id.
 */
const MENU_POINTER = -1;

interface PointerEdit {
  id: number;
  readonly start: Point;
  readonly screen: Point;
  readonly gesture?: NativeBodyGesture;
  readonly coordinate?: number;
  readonly coordinateId?: string;
  readonly axis?: Point;
  readonly pan?: boolean;
  readonly creation?: {
    kind: 'link' | 'cylinder' | 'force';
    owner?: BodyId;
    document: BodyDocument;
  };
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
    CanvasEffectsComponent,
    LongPressDirective,
    GridRulingComponent,
    ModelFrameDirective,
    UprightDirective,
    CdkContextMenuTrigger,
    ContextMenuComponent,
  ],
  templateUrl: './native-grid.component.html',
  styleUrl: './native-grid.component.scss',
})
export class NativeGridComponent {
  protected readonly editor = inject(NativeEditorService);
  private readonly playback = inject(NativePlaybackService);
  protected readonly traces = computed(() =>
    bodyTraceMarks(this.editor.document(), this.playback.snapshot())
  );
  private readonly shortcuts = inject(KeyboardShortcutsService);
  private readonly menus = inject(NativeContextMenuService);
  protected readonly longPress = viewChild(LongPressDirective);
  readonly multiple = signal(false);
  protected readonly selectionBox = signal<
    { x: number; y: number; width: number; height: number } | undefined
  >(undefined);
  protected readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('canvas');
  protected readonly frame = viewChild.required<ElementRef<SVGGElement>>('frame');
  protected readonly svgGrid = inject(SvgGridService);
  protected readonly settings = inject(CHROME_SETTINGS);
  private readonly tabs = inject(CHROME_TABS);
  private readonly dragState = inject(DragStateService);
  protected readonly MODEL_SCALE = MODEL_SCALE;
  protected viewportReady(): boolean {
    return this.svgGrid.panZoomObject !== undefined;
  }
  protected readonly hasMaterial = (body: BodyDocument['bodies'][number]) =>
    body.kind === 'material';
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
      .sort((a, b) => Number(rods.has(a.id)) - Number(rods.has(b.id)));
  });
  protected readonly compounds = computed(() => bodyCompoundMarks(this.editor.drawing()));
  private readonly compoundOf = computed(() => {
    const byBody = new Map<BodyId, ReturnType<typeof bodyCompoundMarks>[number]>();
    for (const group of this.compounds())
      for (const id of group.members) if (!byBody.has(id)) byBody.set(id, group);
    return byBody;
  });
  protected compound(id: BodyId) {
    return this.compoundOf().get(id);
  }
  /**
   * An outline is asked for by the template on every change-detection pass, and it
   * cannot change while the drawing it was cut from is the same object. Building it
   * once per drawing rather than once per pass is what keeps a drag's frames cheap.
   */
  private readonly outlines = new WeakMap<BodyDocument, WeakMap<MaterialBody, string>>();
  private outline(document: BodyDocument, body: MaterialBody): string {
    let kept = this.outlines.get(document);
    if (!kept) this.outlines.set(document, (kept = new WeakMap()));
    const known = kept.get(body);
    if (known !== undefined) return known;
    const built = nativeMaterialSkin(document, body) + ' ' + bodySlotChannels(document, body);
    kept.set(body, built);
    return built;
  }
  protected readonly ghostPath = (body: MaterialBody) => this.outline(this.editor.document(), body);
  protected readonly path = (body: MaterialBody) => this.outline(this.editor.drawing(), body);
  /** A label also follows the zoom and the center-of-mass switch, so both join its key. */
  private labels?: {
    readonly document: BodyDocument;
    readonly center: boolean;
    readonly pixel: number;
    readonly marks: WeakMap<MaterialBody, ReturnType<typeof bodyLabelMark>>;
  };
  protected label(body: MaterialBody) {
    const document = this.editor.drawing(),
      center = this.settings.isShowCOM.value,
      pixel = this.svgGrid.scaleWithZoom(1) / MODEL_SCALE;
    let kept = this.labels;
    if (!kept || kept.document !== document || kept.center !== center || kept.pixel !== pixel)
      this.labels = kept = { document, center, pixel, marks: new WeakMap() };
    if (!kept.marks.has(body)) kept.marks.set(body, this.labelOf(document, body, center, pixel));
    return kept.marks.get(body);
  }
  private labelOf(document: BodyDocument, body: MaterialBody, center: boolean, pixel: number) {
    const compound = this.compound(body.id);
    if (compound)
      return compound.members[0] === body.id
        ? {
            point: compound.center,
            name: compound.label,
            angle: 0,
            ink: luminanceOf(compound.fill) > INK_FLIPS_AT ? 'black' : 'white',
          }
        : undefined;
    return bodyLabelMark(document, body, center, pixel);
  }
  protected readonly locks = computed(() =>
    this.editor.playing() ? [] : bodyLockMarks(this.editor.drawing())
  );
  protected readonly dimension = computed(() =>
    bodyDimensionMark(this.editor.drawing(), this.editor.selection()[0], this.editor.dimension())
  );
  protected readonly centers = computed(() => bodyCenterMarks(this.editor.drawing()));
  protected readonly forces = computed(() => bodyForceMarks(this.editor.drawing()));
  protected readonly turnsClockwise = turnsClockwise;
  protected readonly plus = computed(() => plusPath(this.markerSize()));
  protected readonly motorCase = computed(() => motorBodyPath(this.markerSize()));
  protected readonly motorBox = computed(() => {
    const size = this.editor.document().settings.objectScale * MODEL_SCALE * 1.2;
    return { size, x: -0.505 * size, y: -0.435 * size };
  });
  protected driveSpeed(mark: BodyJointMark): number | undefined {
    if (mark.driveSpeed === undefined) return undefined;
    const machine = this.playback
      .machines()
      .find((machine) =>
        machine.frame.partition.drivers.some((driver) => mark.jointIds.includes(driver.row.jointId))
      );
    if (!machine) return mark.driveSpeed;

    const authored = machine.frame.partition.drivers[0].speed;
    // Reflected travel and a reader's reverse command both change the arrow, without editing the drive.
    return mark.driveSpeed * this.playback.travelDirection(machine) * Math.sign(authored || 1);
  }
  protected motorAngle(mark: BodyJointMark): number {
    const joint = this.editor.drawing().joints.find((joint) => joint.id === mark.key);
    const body = this.editor.drawing().bodies.find((body) => body.id === joint?.bodyA);
    return (body?.pose.angle ?? 0) + (joint?.frameA.angle ?? 0);
  }

  protected block(mark: BodyJointMark): string {
    const ram = this.editor.document().assemblies.find((ram) => ram.internalJoint === mark.key);
    if (!ram) return blockPath(this.markerSize());
    const r = ram.dimensions.rodDiameter / (2 * CYLINDER.rodHalf);
    return cylinderBlockPath(r, Math.min(MARK.blockAlongHalf * r, ram.dimensions.rodLength / 2));
  }
  protected arrows(mark: BodyJointMark) {
    const ram = this.editor.document().assemblies.find((ram) => ram.internalJoint === mark.key);
    const speed = this.driveSpeed(mark);
    const leading = speed === undefined ? undefined : turnsClockwise(speed) ? -1 : 1;
    if (!ram) return straightArrowPaths(this.markerSize(), leading);
    const r = ram.dimensions.rodDiameter / (2 * CYLINDER.rodHalf);
    return cylinderArrowPaths(
      r,
      Math.min(MARK.blockAlongHalf * r, ram.dimensions.rodLength / 2),
      leading
    );
  }
  protected rails(mark: BodyJointMark) {
    if (!mark.guide || !mark.grounded) return undefined;
    const attachment = this.editor
      .document()
      .attachments.find((point) => point.id === mark.attachmentId)!;
    const snapshot = this.playback.snapshot();
    const positions = snapshot
      ? bodyMotionPoses(snapshot, attachment.bodyId).map((pose) =>
          localToWorld(pose, attachment.point)
        )
      : [];
    const axis = { x: Math.cos(mark.angle), y: Math.sin(mark.angle) };
    const origin = mark.groundPoint ?? mark.guide[0];
    const coordinates = positions.length
      ? positions.map((point) => dot(subtract(point, origin), axis))
      : mark.guide.map((point) => dot(subtract(point, origin), axis));
    const min = Math.min(...coordinates),
      max = Math.max(...coordinates);
    const half = Math.max(
      (max - min) / 2 + this.markerSize() * MARK.blockAlongHalf,
      MARK.railHalfLengthMin * this.markerSize()
    );
    const center = {
      x: origin.x + ((min + max) / 2) * axis.x,
      y: origin.y + ((min + max) / 2) * axis.y,
    };
    return {
      ...railGeometry(this.markerSize(), half),
      transform: `translate(${center.x} ${center.y}) rotate(${(mark.angle * 180) / Math.PI})`,
    };
  }
  protected readonly ghosts = computed(() => {
    if (this.editor.playing()) return [];
    const snapshot = this.playback.snapshot();
    return this.editor.document().bodies.flatMap((body) => {
      if (body.kind !== 'material' || body.presentation.hidden) return [];
      const key = snapshot?.bodyPartition.get(body.id);
      return key && (this.playback.indices().get(key) ?? 0) > 0 ? [{ body, key }] : [];
    });
  });
  protected start(key: string, event: MouseEvent) {
    event.stopPropagation();
    this.playback.seek(key, 0);
  }
  protected readonly GROUND_STROKE = GROUND_STROKE;
  protected readonly markerSize = computed(
    () => this.editor.document().settings.objectScale * 0.15
  );
  private readonly contextTrigger = viewChild.required<ElementRef<HTMLElement>>('contextTrigger');
  protected readonly menu = signal<ContextMenuModel>({ groups: [] });
  readonly tool = signal<'link' | 'cylinder' | undefined>(undefined);
  protected readonly travelGhost = signal<Point | undefined>(undefined);
  protected readonly snapGuides = signal<readonly SnapGuide[]>([]);
  private snapPoints: Point[] = [];
  private pointer?: PointerEdit;
  private pending?: PointerEvent;
  private animation = 0;
  constructor() {
    const zone = inject(NgZone);
    afterNextRender(() => {
      const frame = requestAnimationFrame(() => {
        if (!this.cleanup.destroyed) zone.run(() => this.initializeViewport());
      });
      this.cleanup.onDestroy(() => cancelAnimationFrame(frame));
    });
  }
  private initializeViewport() {
    trackContextMenuPointer();
    const lengthUnit = () =>
      this.editor.document().units.length === 'cm'
        ? LengthUnit.CM
        : this.editor.document().units.length === 'm'
          ? LengthUnit.METER
          : LengthUnit.INCH;
    let previousUnit = lengthUnit();
    this.editor.store.changes.pipe(takeUntilDestroyed(this.cleanup)).subscribe(() => {
      const nextUnit = lengthUnit();
      this.svgGrid.compensateForUnitChange(previousUnit, nextUnit);
      previousUnit = nextUnit;
    });
    this.shortcuts.pressedKeys.pipe(takeUntilDestroyed(this.cleanup)).subscribe(({ id }) => {
      if (id === 'edit.deselect') {
        this.cancel();
        this.tool.set(undefined);
        this.editor.select();
      }
    });
    registerViewportCanvas({
      // Pointer release owns selection and phone-sheet opening; Hammer also reports desktop clicks.
      handleTap: () => undefined,
      releaseCanvasGestures: (event) =>
        event?.type === 'pointerup' ? this.up(event) : this.cancel(),
      isGestureLive: () => !!this.pointer && !this.pointer.pan,
      afterGlide: (run) => this.afterGlide(run),
      enableGridAnimationForThisAction: () => this.enableGlide(),
    });
    this.svgGrid.setNewElement(this.svg().nativeElement as unknown as HTMLElement);
    // The same hook the public canvas has: the library is told its viewport
    // changed size and the ruling is redrawn for it, through `ourOwnMove` so
    // that keeping up with the window is not mistaken for the reader choosing
    // a view. Without it the ruling stayed in the corner the old size covered
    // and every screen-to-model conversion answered for a canvas that was gone.
    fromEvent(window, 'resize')
      .pipe(takeUntilDestroyed(this.cleanup))
      .subscribe(() =>
        this.svgGrid.ourOwnMove(() => {
          this.svgGrid.panZoomObject.resize();
          this.svgGrid.handlePan();
        })
      );
    this.cleanup.onDestroy(() => {
      registerViewportCanvas(undefined);
      this.cancel();
      clearTimeout(this.glideTimer);
    });
  }
  private glideEndsAt = 0;
  private glideTimer = 0;
  private enableGlide() {
    const viewport = this.svg().nativeElement.querySelector('.svg-pan-zoom_viewport');
    viewport?.classList.add('animated');
    clearTimeout(this.glideTimer);
    this.glideEndsAt = performance.now() + 320;
    this.glideTimer = window.setTimeout(() => {
      this.glideEndsAt = 0;
      viewport?.classList.remove('animated');
    }, 320);
  }
  private afterGlide(run: () => void) {
    const remaining = this.glideEndsAt - performance.now();
    if (remaining > 0)
      window.setTimeout(() => {
        if (!this.cleanup.destroyed) run();
      }, remaining + 16);
    else run();
  }
  private readonly cleanup = inject(DestroyRef);
  private readonly viewport = inject(ViewportService);
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
  protected jointFill(mark: BodyJointMark) {
    const d = this.editor.document();
    const id =
      mark.attachmentId ?? d.joints.find((j) => mark.jointIds.includes(j.id))?.frameA.attachmentId;
    const color = d.attachments.find((a) => a.id === id)?.color;
    const family = JOINT_FAMILIES.find((f) => f.id === color) ?? JOINT_FAMILIES[0];
    return this.selected(mark.target) ? family.selected : family.normal;
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
    this.dragState.press();
    const at = this.point(event),
      screen = { x: event.clientX, y: event.clientY };
    this.svg().nativeElement.setPointerCapture(event.pointerId);
    this.snapPoints = this.marks()
      .filter((other) => other.key !== mark?.key)
      .map((other) => other.point);
    const owner =
      materialOwner ??
      mark?.materialOwner ??
      (target ? selectionBodies(this.editor.drawing(), [target])[0] : undefined);
    if (this.pointer?.creation && this.pointer.id === MENU_POINTER) {
      // The click that ends a menu-started creation: the release commits it.
      this.pointer.id = event.pointerId;
      return;
    }
    if (this.tool()) {
      this.pointer = {
        id: event.pointerId,
        start: mark?.point ?? this.snapped(at, event.altKey),
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
      this.pointer = { ...base, pan: true };
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
    this.dragState.press();
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
    const at = this.point(event);
    this.svgGrid.cursorAt = { x: at.x * MODEL_SCALE, y: at.y * MODEL_SCALE };
    if (!this.pointer) return;
    if (this.pointer.id !== MENU_POINTER && event.pointerId !== this.pointer.id) return;
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
    let at = this.point(event);
    if (p.marquee) {
      this.selectionBox.set({
        x: Math.min(p.start.x, at.x),
        y: Math.min(p.start.y, at.y),
        width: Math.abs(at.x - p.start.x),
        height: Math.abs(at.y - p.start.y),
      });
      return;
    }
    if (p.pan) return;
    if ((p.creation && p.creation.kind !== 'force') || p.gesture)
      at = this.snapped(at, event.altKey);
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
    if (p.creation?.kind === 'force') {
      // Nothing exists until the click lands: the arrow is a draft the whole
      // way, the way a menu-started link is.
      const command = p.creation.owner
        ? nativeForceInsert(p.creation.document, p.creation.owner, p.start, at, this.forceDraftId)
        : undefined;
      const preview = command ? this.editor.preview(command) : undefined;
      if (preview?.ok) this.editor.draft.set(preview);
      else if (preview) this.editor.report(preview.message);
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
          // The draft above already moved the marks; reading them again here would
          // rebuild, inside the pointer move, the list the canvas is about to draw.
          const mark = this.marks().find((m) => m.coordinate?.jointId === p.coordinateId);
          this.travelGhost.set(mark?.rider);
        }
      } else this.editor.report(result.message);
    }
  }
  private snapped(wanted: Point, suspended: boolean): Point {
    const grid = this.svgGrid.snapToGrid(
      new Coord(wanted.x * MODEL_SCALE, wanted.y * MODEL_SCALE),
      suspended
    );
    const at = { x: grid.x / MODEL_SCALE, y: grid.y / MODEL_SCALE };
    const result =
      this.settings.isSnapToAlignment.value && !suspended
        ? snapToAxes(at, this.snapPoints, 8 / (this.svgGrid.getZoom() * MODEL_SCALE))
        : { point: at, guides: [] };
    this.snapGuides.set(result.guides);
    return result.point;
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
          plan.effects.added.find((r) => r.kind === 'force') ??
          plan.effects.added.find((r) => r.kind === 'body');
        if (
          target &&
          (target.kind === 'body' || target.kind === 'assembly' || target.kind === 'force')
        )
          this.editor.select(target);
      }
    } else p.gesture?.cancel();
    if (!p.moved && p.target && event.button === 0 && this.viewport.isPhone())
      this.tabs.sheetExpanded.set(true);
    if (p.creation) this.tool.set(undefined);
    this.cancel();
  }
  private dropTarget(
    event: PointerEvent,
    document: BodyDocument
  ): { bodyId: BodyId; point: Point } | undefined {
    const at = this.point(event),
      radius = 12 / (this.svgGrid.getZoom() * MODEL_SCALE);
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
    this.dragState.release();
    this.pointer?.gesture?.cancel();
    this.pointer = undefined;
    this.pending = undefined;
    cancelAnimationFrame(this.animation);
    this.animation = 0;
    this.editor.draft.set(undefined);
    this.travelGhost.set(undefined);
    this.selectionBox.set(undefined);
    this.snapGuides.set([]);
    this.snapPoints = [];
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
      this.menus.build(
        target,
        this.point(event),
        (kind) => this.beginCreation(kind, event, target, materialOwner),
        materialOwner
      )
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
  /**
   * Start a link, a cylinder or a force from the menu, the way the public
   * canvas does.
   *
   * The part begins where the menu was opened -- on the mark that was
   * right-clicked, or on the grid square under the pointer -- and its ghost
   * follows the pointer from there. A left click places the far end, a drag
   * ends the same way at its release, and a right-click or Escape abandons it.
   * Arming a tool and waiting for a press-and-drag looked like nothing had
   * happened, because a click without a drag quietly disarmed it.
   *
   * A force takes the same route rather than landing on the first click: a
   * load is a direction as much as a place, and one dropped at a default
   * heading is one the reader has to go and fix.
   */
  private beginCreation(
    kind: 'link' | 'cylinder' | 'force',
    event: MouseEvent,
    target?: BodySelectionRef,
    materialOwner?: BodyId
  ) {
    this.cancel();
    const mark = target
      ? this.marks().find((m) => JSON.stringify(m.target) === JSON.stringify(target))
      : undefined;
    const owner =
      materialOwner ??
      mark?.materialOwner ??
      (target ? selectionBodies(this.editor.drawing(), [target])[0] : undefined);
    this.snapPoints = this.marks()
      .filter((other) => other.key !== mark?.key)
      .map((other) => other.point);
    // A load's heading is free, so its arrow does not snap to the marks the
    // way a bar's far end does.
    if (kind === 'force') this.snapPoints = [];
    else this.tool.set(kind);
    this.forceDraftId = newRecordId<'force'>();
    this.pointer = {
      id: MENU_POINTER,
      start: mark?.point ?? this.snapped(this.point(event), event.altKey),
      screen: { x: event.clientX, y: event.clientY },
      moved: false,
      creation: { kind, owner, document: this.editor.drawing() },
    };
  }

  /** One id for the whole draw, so the ghost arrow is the arrow that lands. */
  private forceDraftId = newRecordId<'force'>();
  zoom(factor: number) {
    if (factor > 1) this.svgGrid.zoomIn();
    else this.svgGrid.zoomOut();
  }
  fit() {
    this.svgGrid.scaleToFitLinkage();
  }
}
