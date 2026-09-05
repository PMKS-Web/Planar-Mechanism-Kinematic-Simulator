import { SvgGridService } from '../../services/svg-grid.service';
import { heldBars, heldBarsReaching, heldBySentence, holdList } from '../../model/link-holds';
import {
  OnDestroy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ChangeDetectionStrategy,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { MechanismService } from '../../services/mechanism.service';
import { TutorialService } from '../../services/tutorial.service';
import { WhatsNewService } from '../../services/whats-new.service';
import { UrlProcessorService } from '../../services/url-processor.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { SettingsService } from '../../services/settings.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { LongPress, LongPressDirective } from '../../long-press.directive';
import { ModelFrameDirective, ModelPoint, UprightDirective } from '../../model-frame.directive';
import { turnsClockwise } from '../../model/drive-direction';
import { ViewportService } from '../../services/viewport.service';
import { ContextMenuComponent } from '../context-menu/context-menu.component';
import { ContextMenuModel, trackContextMenuPointer } from '../context-menu/menu-model';
import {
  ContextMenuBuilderService,
  MenuHandlers,
} from '../../services/context-menu-builder.service';
import { Link, RealLink, SliderBlock } from '../../model/link';
import { Lockable } from '../../model/lock-set';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { Coord } from '../../model/coord';
import {
  forceStates,
  gridStates,
  jointStates,
  linkStates,
  getDistance,
  AngleUnit,
  radToDeg,
  point_on_line_segment_closest_to_point,
} from '../../model/utils';
import { Force } from '../../model/force';
import { NotificationService } from '../../services/notification.service';
import { BackgroundImageService, MIN_WIDTH } from '../../services/background-image.service';
import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import { MatDialog } from '@angular/material/dialog';
import { TemplatesComponent } from '../MODALS/templates/templates.component';
import { backdropOfCard, placeTemplateBackdrop } from '../MODALS/templates/template-catalog';
import { Line } from '../../model/line';
import { SaveHistoryService } from 'src/app/services/save-history.service';
import { SynthesisBuilderService } from 'src/app/services/synthesis/synthesis-builder.service';
import { SelectedTabService, TabID } from 'src/app/selected-tab.service';
import { EditPermissionService } from 'src/app/services/edit-permission.service';
import { StartPoseGhost } from 'src/app/model/mechanism/anchor';
import { SynthesisPose } from 'src/app/services/synthesis/synthesis-util';
import { SynthesisCanvasService } from 'src/app/services/synthesis/synthesis-canvas.service';
import { SynthesisSolutionService } from 'src/app/services/synthesis/synthesis-solution.service';
import { ColorService } from '../../services/color.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { EditPanelComponent } from '../edit-panel/edit-panel.component';
import { DragStateService } from '../../services/drag-state.service';
import { SelectionBatchService } from '../../services/selection-batch.service';
import {
  Channel,
  CylinderMark,
  Guide,
  RiderDraw,
  SliderMark,
  SliderMarkService,
  WeldPlate,
} from '../../services/slider-mark.service';
import {
  barrelPath,
  cylinderBlockPath,
  GROUND_STROKE,
  MARK,
  orientedCapsulePath,
  plusPath,
  rodBodyPath,
  slotHalfLength,
  motorBodyPath,
  motorBodyAt,
  Segment,
} from '../../model/joint-marks';
import {
  JointDropCandidate,
  MERGE_REFUSAL_MESSAGES,
  MergeRefusal,
  resolveDropCandidate,
  resolveSlotDropTarget,
  SlotDropCandidate,
} from '../../model/drop-target';
import { mergedChannels, transformRigidPath } from '../../model/compound-link-path';
import {
  Cylinder,
  cylinderCreationLayout,
  cylinderHeadHalf,
  cylinderSizeOf,
  cylinderSpanRange,
  cylinderJoints,
  isCylinderInterior as isCylinderInteriorOf,
} from '../../model/cylinder';
import { SnapGuide, snapToAxes } from '../../model/axis-snap';
import { drawDepths } from '../../model/draw-order';
import { MODEL_SCALE } from '../../model/render-scale';
import { uniformBodyOf } from '../../model/uniform-body';
import { buildCompoundPath } from '../../model/compound-link-path';

import { angleReference, GROUND_BODY, resolveActuator } from '../../model/actuator';

/** One thing to draw in the slider layer, and how deep in the stack it sits. */
export interface SlotStackItem {
  key: string;
  depth: number;
  kind: 'block' | 'plate' | 'rider';
  mark: SliderMark;
  /** Set for a rider; the link this item draws. */
  rider?: RiderDraw;
  /** Set for a plate; the fused rider-and-block outline this item draws. */
  plate?: WeldPlate;
}
import { SvgArrowComponent } from '../svg-arrow/svg-arrow.component';
import { KeyboardShortcutsService, ShortcutId } from '../../services/keyboard-shortcuts.service';
import { INK_FLIPS_AT, luminanceOf } from '../../model/contrast';
import { DEFAULT_FORCE_COLOR, SELECTION_RING } from '../../model/joint-colors';
import { isAdditiveSelectionGesture, SelectedPart } from '../../model/selection';
import {
  captureSelectionTransform,
  canonicalSelectionClosure,
  SelectionAffineTransform,
  SelectionBounds,
  SelectionTransformSnapshot,
} from '../../model/selection-transform';

/** Which corner of the tracing underlay a resize gesture is holding. */
type BackgroundImageCorner = 'tl' | 'tr' | 'bl' | 'br';

/**
 * The angle a turn gesture clicks round in, unless Alt suspends it.
 *
 * Fifteen degrees: quarter turns and the common skews land exactly, which is
 * most of what squaring anything to a grid actually needs. Shared by the
 * tracing underlay and a group selection, because a reader who has learned what
 * the turn knob does on one should not find the other behaving differently.
 */
export const ROTATION_SNAP_RAD = Math.PI / 12;

/** Where a selection grip sits on the box, named as it appears on screen. */
export type SelectionGripId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** A grip, the axes it stretches, and the point it stretches away from. */
export interface SelectionGrip {
  id: SelectionGripId;
  cursor: string;
  axes: 'x' | 'y' | 'both';
  anchor: { x: number; y: number };
}

/** A driven pin's motor, in the frame of the body its case is bolted to. */
interface DrivenPinMotor {
  id: string;
  x: number;
  y: number;
  angle: number;
  bodyId: string | undefined;
  /** Which way this drive turns — its own machine's answer, not the document's. */
  cw: boolean;
}

/**
 * How long the canvas takes to glide to a new frame.
 *
 * A hair longer than the CSS transition it switches on, so the class comes off
 * after the move has landed rather than exactly as it lands -- the two used to
 * be the same 300, which cut the last frame of every reframe.
 */
const GRID_GLIDE_MS = 380;

/** How wide the ring inside a selected joint's edge is drawn, in screen pixels. */
const SELECTION_RING_PX = 3;

@Component({
  selector: 'app-new-grid',
  templateUrl: './new-grid.component.html',
  styleUrls: ['./new-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CdkContextMenuTrigger,
    ContextMenuComponent,
    LongPressDirective,
    ModelFrameDirective,
    UprightDirective,
  ],
})
export class NewGridComponent implements OnDestroy {
  readonly Math = Math;
  svgGrid = inject(SvgGridService);
  mechanismSrv = inject(MechanismService);
  private tutorial = inject(TutorialService);
  private whatsNew = inject(WhatsNewService);
  private urlParser = inject(UrlProcessorService);
  gridUtils = inject(GridUtilsService);
  private colors = inject(ColorService);
  settings = inject(SettingsService);
  activeObjService = inject(ActiveObjService);
  private tabService = inject(SelectedTabService);
  /** The one answer to whether an edit may happen; every gate here quotes it. */
  readonly permission = inject(EditPermissionService);
  synthesisBuilder = inject(SynthesisBuilderService);
  synthCanvas = inject(SynthesisCanvasService);
  synthSolution = inject(SynthesisSolutionService);
  notify = inject(NotificationService);
  private shortcuts = inject(KeyboardShortcutsService);
  dialog = inject(MatDialog);
  saveHistoryService = inject(SaveHistoryService);
  private colorService = inject(ColorService);
  nup = inject(NumberUnitParserService);
  dragState = inject(DragStateService);
  viewport = inject(ViewportService);
  sliderMarks = inject(SliderMarkService);
  bgImage = inject(BackgroundImageService);
  private menuBuilder = inject(ContextMenuBuilderService);
  private selectionBatch = inject(SelectionBatchService);
  /**
   * For the subscriptions taken in `ngOnInit`, which is outside the injection
   * context `takeUntilDestroyed` reads by default. Their sources are root
   * singletons, so without this a destroyed grid keeps answering shortcuts —
   * harmless in the app, where there is one grid for the session, and the
   * order-dependent cross-spec failures the static below describes in a suite.
   */
  private destroyRef = inject(DestroyRef);

  public static debugValue: unknown;
  static debugPoints: Coord[] = [];
  public static debugLines: Line[] = [];

  public originInScreen: Coord = new Coord(0, 0);
  private timeMouseDown: number = 0;

  constructor() {
    //This is for debug purposes, do not make anything else static!
    NewGridComponent.instance = this;
    // Ahead of the CDK's own contextmenu listener, so the menu card knows
    // which corner the pointer is in before it is measured.
    trackContextMenuPointer();
  }

  private svgGridElement!: HTMLElement;
  public cMenu: ContextMenuModel = { groups: [] };
  public lastRightClick: Joint | Link | Force | string | SynthesisPose = '';
  public lastRightClickCoord: Coord = new Coord(0, 0);

  public lastLeftClick: Joint | Link | Force | string | SynthesisPose = '';
  lastLeftClickType: string = 'Nothing';

  /** A selected-member click is held until release so the same press can become a group drag. */
  private pendingPartReplacement?: SelectedPart;
  /** An additive press edits membership only; it never starts a drag underneath itself. */
  private selectionTogglePress = false;

  private selectionGesture?: {
    snapshot: SelectionTransformSnapshot;
    mode: 'translate' | 'rotate' | 'scale';
    pointerStart: Coord;
    startAngle: number;
    startDistance: number;
    changed: boolean;
    attempted: boolean;
    refusalShown: boolean;
    replaceOnClick?: SelectedPart;
    /** Which grip is held, and the corner or edge it is pulling away from. */
    grip?: SelectionGrip;
    /** How far a turn has come, so the box can be drawn turning with it. */
    liveRotation?: number;
  };

  /**
   * The joint the one being dragged would merge into on release, or undefined.
   * Read by the template to draw the snap indicator.
   */
  public snapTargetJoint?: RevJoint;
  /**
   * Whether this gesture has already said it reached the ram's floor. Reset
   * when a drag begins, so the message is per-gesture and not per-frame.
   */

  /**
   * A joint in range that will not take the merge, kept with its reason so the
   * release can say why. Drawn as a refusal marker rather than left blank: a
   * target that just goes dark reads as the drag being broken.
   */
  public refusedTarget?: JointDropCandidate;

  /** Joints playing one-shot drop feedback, by id. */
  public shakingJointID?: string;
  public poppingJointID?: string;

  /** Set when the joint being merged approached its target from the right. */
  private mergeArrowReversed = false;

  /** Where the link being dragged was last placed, in SVG coordinates. */
  private linkDragAnchor: Coord = new Coord(0, 0);

  /**
   * Where the dragged body's reference point stood when the drag began.
   *
   * Snapping needs the whole distance dragged, not this frame's part of it: a
   * single pointer event moves a few units, which rounds to no move at all, and
   * a body measured frame by frame would never leave its corner however far the
   * cursor went.
   *
   * Taken on the first move rather than at the press, because which point is
   * the reference depends on what turned out to be under the cursor -- a bar's
   * first joint, or the mount a ram is named from.
   */
  private bodyDragOrigin?: { at: Coord; from: Coord };

  //This is terrible but:
  // -2 => hidden
  // -1 => Link length and angle shown
  // 0-N => Joint length and angle shown for joint N (in list from edit panel)
  public showLinkLengthOverlay: number = -2;
  public showLinkAngleOverlay: number = -2;

  static instance: NewGridComponent;
  //To distinguish between a click and a drag
  public delta: number = 6;
  private startX!: number;
  private startY!: number;
  mouseLocation: Coord = new Coord(0, 0);
  lastMouseLocation: Coord = new Coord(0, 0);

  mouseLocationRaw: Coord = new Coord(0, 0);

  /** For template bindings that size things in user units. */
  readonly MODEL_SCALE = MODEL_SCALE;

  /**
   * A grid line's label, in the user's units. Grid lines live at internal
   * model coordinates (MODEL_SCALE times the user's unit); the label is the
   * one place that number reaches the screen, so it converts here. Rounded so
   * a binary-representation artifact of the division never shows up as
   * 0.6000000001.
   */
  axisLabel(line: number): number {
    return Math.round((line / MODEL_SCALE) * 1e6) / 1e6;
  }

  readonly contextMenu = viewChild.required<CdkContextMenuTrigger>('trigger');
  private readonly backgroundImageInput =
    viewChild.required<ElementRef<HTMLInputElement>>('backgroundImageInput');

  ngOnInit() {
    this.shortcuts.pressedKeys
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ id, event }) => this.onShortcut(id, event));
    // What an arrow means depends on whether there is anything here to move.
    // The service asks; the answer is this canvas's to give, because the rules
    // about when a drawing may be edited already live here.
    this.shortcuts.whenArrowsNudge(
      () => this.canEditNow() && this.activeObjService.selectedParts.length > 0
    );
    // Handed back when this canvas goes away. The service holds the predicate
    // for as long as it is given one, so without this a torn-down canvas keeps
    // answering for a live one -- and answers by reaching into an injector that
    // no longer exists.
    this.destroyRef.onDestroy(() => this.shortcuts.whenArrowsNudge(() => false));

    const svgElement = document.getElementById('canvas') as HTMLElement;
    this.svgGrid.setNewElement(svgElement);

    // Explicit arrivals win over welcome content. New readers choose the
    // tutorial from the empty Edit panel; returning readers may see release notes.
    if (this.urlParser.wantsLibrary) {
      this.whatsNew.greet({ quietly: true });
      TemplatesComponent.openIn(this.dialog);
    } else {
      this.whatsNew.greet();
    }

    // A template opened in a *new tab* names its backdrop in the fragment,
    // because the query is the mechanism and nothing else fits beside it. The
    // picture never travels: what arrives is a card's name, and the asset is one
    // this build already ships. The name is read by the URL processor, which
    // sees the address before the decode strips it.
    const wantsBackdrop = backdropOfCard(this.urlParser.wantsBackdropFor);
    if (wantsBackdrop) void placeTemplateBackdrop(this.bgImage, wantsBackdrop);

    // A half-drawn bar belongs to the mode it was started in. Left armed across
    // a mode switch, the ghost went on tracking the cursor over the Synthesis
    // canvas and the next click there built a link -- in a mode whose Undo is
    // disabled, so it could not be taken back without switching away again.
    this.tabService.tabChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.abandonGesture());

    fromEvent(window, 'resize')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Through `ourOwnMove`: telling the library its viewport changed size,
        // and redrawing the ruling for it, is the app keeping up with the window
        // rather than the reader choosing a view. Read as a choice, it threw away
        // the view the canvas was about to give back once the resize settled.
        this.svgGrid.ourOwnMove(() => {
          this.svgGrid.panZoomObject.resize();
          this.svgGrid.handlePan();
        });
      });

    this.activeObjService.onActiveObjChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.showLinkAngleOverlay = -2;
        this.showLinkLengthOverlay = -2;
        // The hover previews die with the selection they described: a panel
        // swap can eat the mouseleave that would have cleared them.
        this.comMeasure = undefined;
        this.cylinderPartPreview = undefined;
        this.settings.previewCoMLinkId = null;
        //Disable focus on any text input when changing active object
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
  }

  /**
   * Whether the tutorial's current step is about this joint.
   *
   * Asked per joint rather than the ring being drawn from a coordinate, so it
   * rides the joint through a drag and cannot be left behind at an old
   * position.
   */
  isTutorialTarget(joint: Joint): boolean {
    return this.tutorial.ringJoint() === joint;
  }

  ngOnDestroy() {
    if (this.dragFrame !== undefined) cancelAnimationFrame(this.dragFrame);
    this.pendingDragMove = undefined;
    // Let go of the static. It is a debug handle, but services reach the
    // snackbar through it and it was never cleared — so a torn-down grid stayed
    // registered, and the next thing to send a notification sent it to a
    // component that no longer exists. In the app there is one grid for the
    // session and it never showed; across a test run there are many, and it
    // made unrelated specs fail depending on what had run before them.
    if (NewGridComponent.instance === this) {
      NewGridComponent.instance = undefined as unknown as NewGridComponent;
    }
  }

  ngAfterViewInit() {
    this.svgGridElement = document.getElementsByClassName(
      'svg-pan-zoom_viewport'
    )[0] as HTMLElement;
  }

  static debugGetGridState() {
    return this.instance.dragState.grid;
    //This is for debug purposes, do not make anything else static!
  }

  static debugGetJointState() {
    return this.instance.dragState.joint;
    //This is for debug purposes, do not make anything else static!
  }

  static debugGetLinkState() {
    return this.instance.dragState.link;
    //This is for debug purposes, do not make anything else static!
  }

  static debugGetForceState() {
    return this.instance.dragState.force;
    //This is for debug purposes, do not make anything else static!
  }

  /** Whether Synthesis owns the canvas: its handles, ghost and preview. */
  showSynthesis(): boolean {
    return this.tabService.getCurrentTab() === TabID.SYNTHESIZE;
  }

  /**
   * Whether the positions are on the grid at all.
   *
   * They outlive the mode. A design that has produced a linkage is the record
   * of what that linkage was *for*, and hiding it the moment the reader goes to
   * look at the motion leaves them with a machine and no account of it. Outside
   * Synthesis they are a shadow -- faint, and not in the way of anything -- and
   * the canvas menu is where they are taken away.
   */
  showSynthesisPositions(): boolean {
    return this.showSynthesis() || this.synthesisBuilder.getAllPoses().length > 0;
  }

  /** Positions drawn, but as a record rather than as controls. */
  synthesisShadowOnly(): boolean {
    return !this.showSynthesis();
  }

  /**
   * The handlers the menu needs that only the canvas can perform.
   *
   * Everything else a row does is an edit the services already own; these are
   * gestures — the next click lands the thing — and the gesture state lives
   * here, on the component that reads the pointer.
   */
  private menuHandlers(): MenuHandlers {
    return {
      attachLink: () => this.startCreatingLink(),
      attachCylinder: () => this.startCreatingCylinder(),
      attachTracerPoint: () => this.addJoint(),
      attachForce: (onLink) => this.createForce(onLink),
      backgroundImage: () => this.openBackgroundImage(),
      deletePosition: (id) => this.deleteSynthesisPosition(id),
      deleteAllPositions: () => this.deleteAllSynthesisPositions(),
      duplicateSelected: () => this.duplicateSelected(),
      deleteSelected: () => this.deleteSelectedParts(),
    };
  }

  private duplicateSelected(): void {
    const step = this.svgGrid.minorCellSize || MODEL_SCALE;
    const result = this.selectionBatch.duplicateSelected(this.activeObjService.selectedPartRefs, {
      x: step,
      y: step,
    });
    if (!result.ok) {
      this.notify.refusal(result.refusal.code, result.refusal.message);
      return;
    }
    this.activeObjService.restorePartSelection(
      { refs: result.selection, primary: result.selection.at(-1) },
      this.mechanismSrv.joints,
      this.mechanismSrv.links,
      this.mechanismSrv.forces
    );
  }

  private deleteSelectedParts(): void {
    // A delete is identity-addressed: it applies to the design and says nothing
    // about the pose. Held mid-drag it was neither -- the staged machine stayed
    // seeded from the display, so a neighbor came out at the provisional
    // coordinate rather than its own.
    this.mechanismSrv.cancelPosedEdit();
    const result = this.selectionBatch.deleteSelected(this.activeObjService.selectedPartRefs);
    if (!result.ok) {
      this.notify.refusal(result.refusal.code, result.refusal.message);
      return;
    }
    this.activeObjService.clearPartSelection();
  }

  /** Take one position away, or all of them, and record it as one step. */
  deleteSynthesisPosition(id: number): void {
    this.synthesisBuilder.removePose(id);
    this.synthSolution.invalidate();
    this.mechanismSrv.save();
  }

  deleteAllSynthesisPositions(): void {
    this.synthesisBuilder.deleteAllPoses();
    this.synthSolution.invalidate();
    this.mechanismSrv.save();
  }

  /**
   * Let the canvas glide to wherever it is being sent, for this one move.
   *
   * Added and removed from the list rather than written over it: this element
   * is svg-pan-zoom's viewport and carries the class the library found it by,
   * so setting `class` outright stripped that name off it permanently -- the
   * first reframe of a session left nothing on the page called
   * `svg-pan-zoom_viewport`.
   */
  enableGridAnimationForThisAction() {
    if (!this.svgGridElement) return;
    this.svgGridElement.classList.add('animated');
    window.clearTimeout(this.gridAnimationOff);
    this.glideEndsAt = performance.now() + GRID_GLIDE_MS;
    this.gridAnimationOff = window.setTimeout(() => {
      this.glideEndsAt = 0;
      this.svgGridElement?.classList.remove('animated');
    }, GRID_GLIDE_MS);
  }

  private gridAnimationOff = 0;
  private glideEndsAt = 0;

  /**
   * Do this once the canvas has stopped gliding, or now if it is not.
   *
   * Anything that measures the drawing has to wait: mid-transition the
   * transform *attribute* already reads as the destination while the picture on
   * screen is still on its way there, so a measurement taken then divides one
   * by the other and lands the drawing somewhere neither of them meant.
   */
  isGliding(): boolean {
    return this.glideEndsAt > performance.now();
  }

  afterGlide(run: () => void): void {
    const left = this.glideEndsAt - performance.now();
    if (left <= 0) {
      run();
      return;
    }
    window.setTimeout(run, left + 16);
  }

  static getLastLeftClickType(): string {
    return this.instance.objectKind(this.instance.lastLeftClick);
  }

  private objectKind(value: Joint | Link | string | Force | SynthesisPose): string {
    if (value instanceof Force) return 'Force';
    if (value instanceof RealLink) return 'RealLink';
    if (value instanceof PrisJoint) return 'PrisJoint';
    if (value instanceof RevJoint) return 'RevJoint';
    if (value instanceof SynthesisPose) return 'SynthesisPose';
    if (typeof value === 'string' || value instanceof String) return 'String';
    return 'Unknown';
  }

  /**
   * Rebuild the menu for whatever was just right-clicked.
   *
   * The whole of the decision — which rows, which of them are switches, which
   * are grayed and why — lives in `ContextMenuBuilderService`, which reads the
   * answers out of the model that enforces them.
   */
  updateContextMenuItems() {
    this.cMenu = this.menuBuilder.build(this.lastRightClick, this.menuHandlers());
  }

  /**
   * Whether the panel is currently editing the background image.
   *
   * Every clause is a way the panel can go without the selection changing: the
   * analysis modes replace it, Synthesis replaces it with the pose form, and
   * playback covers it with the stop-the-animation placeholder. An outline for
   * controls that are not on screen is a mark nobody can explain — and in
   * Synthesis the handles stayed live over pose work and could still move the
   * picture, which is why the mode is named rather than the analysis pair
   * excluded.
   *
   * The last one is not about the panel at all. `tempGridDisable` is the flag
   * "Fit to zoom" sets while it measures the drawing, and an outline the size
   * of the picture counts towards that box exactly as the picture would -- the
   * fit framed a hundred-centimeter photograph and left the linkage too small
   * to work on.
   */
  editingBackgroundImage(): boolean {
    return (
      this.activeObjService.objType === 'BackgroundImage' &&
      // Through the permission model rather than a rule of its own. The picture
      // belongs to no machine, so there is no anchor to put it back on and no
      // sense in which moving it "at this pose" means anything -- which makes
      // it a `properties` question, refused wherever a typed number is.
      this.permission.may('properties') &&
      !this.settings.tempGridDisable
    );
  }

  /** Half a centimeter of screen, whatever the zoom: a grabbable corner. */
  backgroundImageHandleSize(): number {
    return this.svgGrid.scaleWithZoom(10);
  }

  /** How far above the top edge the turn handle stands, at any zoom. */
  backgroundImageRotateReach(): number {
    return this.svgGrid.scaleWithZoom(34);
  }

  /**
   * The four corners, in SVG coordinates, each with the cursor that says which
   * way it pulls.
   */
  backgroundImageHandles(): { id: BackgroundImageCorner; x: number; y: number; cursor: string }[] {
    const image = this.bgImage.image();
    if (!image) return [];
    const left = this.bgImage.leftOf(image);
    const top = this.bgImage.topOf(image);
    const right = left + image.width;
    const bottom = top + this.bgImage.heightOf(image);
    return [
      { id: 'tl', x: left, y: top, cursor: 'nwse-resize' },
      { id: 'tr', x: right, y: top, cursor: 'nesw-resize' },
      { id: 'bl', x: left, y: bottom, cursor: 'nesw-resize' },
      { id: 'br', x: right, y: bottom, cursor: 'nwse-resize' },
    ];
  }

  /**
   * The gesture in flight on the picture, if there is one.
   *
   * `stopPropagation` on the press is what keeps svg-pan-zoom out of it — the
   * library binds its own handler to the canvas root, so a press that reaches
   * it starts a pan under the drag. The state lives here rather than in
   * DragStateService's enums because moving scenery is not an edit: it earns no
   * rebuild and no undo entry.
   */
  private bgDrag?: {
    corner?: BackgroundImageCorner;
    /** For a move: model-space offset from the pointer to the picture's center. */
    grabOffset?: Coord;
    /** For a resize: the corner that stays where it is, in model coordinates. */
    anchor?: Coord;
    /** For a turn: the angle the hand grabbed at, less the picture's own. */
    grabAngleRad?: number;
  };

  /**
   * The left button only, as `startPoseGesture` has it: a right-press is asking
   * for the menu, and taking it for a gesture moved, resized or turned the
   * picture on the way to opening one.
   */
  private isPrimaryPress(event: PointerEvent): boolean {
    return event.button === 0;
  }

  startBackgroundImageMove(event: PointerEvent): void {
    const image = this.bgImage.image();
    if (!image || !this.editingBackgroundImage() || !this.isPrimaryPress(event)) return;
    event.stopPropagation();
    const at = this.svgGrid.screenToModelFromXY(event.clientX, event.clientY);
    this.bgDrag = { grabOffset: new Coord(image.centerX - at.x, image.centerY - at.y) };
    this.dragState.press();
    this.dragState.beginDraggingBackgroundImage();
  }

  /**
   * How far along the picture's own axes a corner sits from its center: +1 to
   * the right and up in the picture's frame, whatever the picture is turned to.
   */
  private cornerSigns(corner: BackgroundImageCorner): { alongX: number; alongY: number } {
    return {
      alongX: corner === 'tr' || corner === 'br' ? 1 : -1,
      alongY: corner === 'tl' || corner === 'tr' ? 1 : -1,
    };
  }

  startBackgroundImageResize(event: PointerEvent, corner: BackgroundImageCorner): void {
    const image = this.bgImage.image();
    if (!image || !this.editingBackgroundImage() || !this.isPrimaryPress(event)) return;
    event.stopPropagation();
    // The opposite corner is what the drag pivots on, and it is held in world
    // coordinates: the resize moves the center, and the picture may be turned,
    // so an anchor remembered in the picture's own frame would not stay put.
    const { alongX, alongY } = this.cornerSigns(corner);
    const axes = this.backgroundImageAxes(image);
    const halfHeight = this.bgImage.heightOf(image) / 2;
    this.bgDrag = {
      corner,
      anchor: new Coord(
        image.centerX - alongX * (image.width / 2) * axes.u.x - alongY * halfHeight * axes.v.x,
        image.centerY - alongX * (image.width / 2) * axes.u.y - alongY * halfHeight * axes.v.y
      ),
    };
    this.dragState.press();
    this.dragState.beginDraggingBackgroundImage();
  }

  startBackgroundImageRotate(event: PointerEvent): void {
    const image = this.bgImage.image();
    if (!image || !this.editingBackgroundImage() || !this.isPrimaryPress(event)) return;
    event.stopPropagation();
    const at = this.svgGrid.screenToModelFromXY(event.clientX, event.clientY);
    // What the hand grabbed at, less what the picture already is: the drag then
    // turns the picture with the hand rather than snapping it to the pointer.
    this.bgDrag = {
      grabAngleRad: Math.atan2(at.y - image.centerY, at.x - image.centerX) - image.rotationRad,
    };
    this.dragState.press();
    this.dragState.beginDraggingBackgroundImage();
  }

  /** The picture's own axes in model coordinates: along its width, and up it. */
  private backgroundImageAxes(image: { rotationRad: number }): { u: Coord; v: Coord } {
    const cos = Math.cos(image.rotationRad);
    const sin = Math.sin(image.rotationRad);
    return { u: new Coord(cos, sin), v: new Coord(-sin, cos) };
  }

  /**
   * Follow the pointer for whichever gesture is in flight. Returns whether it
   * handled the move, so mouseMove can stop before the mechanism's own drags.
   */
  private dragBackgroundImage(at: Coord): boolean {
    const image = this.bgImage.image();
    if (!this.bgDrag || !image) return false;

    if (this.bgDrag.grabOffset) {
      this.bgImage.place({
        centerX: at.x + this.bgDrag.grabOffset.x,
        centerY: at.y + this.bgDrag.grabOffset.y,
      });
      return true;
    }

    if (this.bgDrag.grabAngleRad !== undefined) {
      const turned =
        Math.atan2(at.y - image.centerY, at.x - image.centerX) - this.bgDrag.grabAngleRad;
      // Alt suspends it, the same key that suspends snapping everywhere else on
      // this canvas.
      const step = ROTATION_SNAP_RAD;
      this.bgImage.place({
        rotationRad: this.snapSuspended ? turned : Math.round(turned / step) * step,
      });
      return true;
    }

    const anchor = this.bgDrag.anchor!;
    const ratio = image.naturalHeight / image.naturalWidth;
    const { alongX, alongY } = this.cornerSigns(this.bgDrag.corner!);
    const axes = this.backgroundImageAxes(image);
    // How far the pointer is from the anchor along each of the picture's own
    // axes. Measuring in the picture's frame is what lets a turned picture
    // resize by the corner the hand is actually holding.
    const reach = new Coord(at.x - anchor.x, at.y - anchor.y);
    const alongWidth = reach.x * axes.u.x + reach.y * axes.u.y;
    const alongHeight = reach.x * axes.v.x + reach.y * axes.v.y;
    // Whichever axis the hand pulled further decides the size, so the corner
    // keeps up with a diagonal drag instead of tracking only one of them.
    const width = Math.max(MIN_WIDTH, Math.abs(alongWidth), Math.abs(alongHeight) / ratio);
    const height = width * ratio;
    // The signs come from which corner is held, not from where the pointer is:
    // dragged past its anchor, the picture pins at its minimum rather than
    // flipping to the other side of it.
    this.bgImage.place({
      width,
      centerX: anchor.x + alongX * (width / 2) * axes.u.x + alongY * (height / 2) * axes.v.x,
      centerY: anchor.y + alongX * (width / 2) * axes.u.y + alongY * (height / 2) * axes.v.y,
    });
    return true;
  }

  /**
   * The one menu item, doing whichever half applies: pick a file if there is no
   * picture yet, otherwise just open the panel on the one there is.
   */
  private openBackgroundImage(): void {
    this.tabService.setTab(TabID.EDIT);
    if (this.bgImage.image()) {
      this.activeObjService.selectBackgroundImage();
      return;
    }
    const input = this.backgroundImageInput().nativeElement;
    input.value = '';
    input.click();
  }

  /** Read the chosen file, place it across half the visible grid, and select it. */
  async onBackgroundImageChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      // Half the width of what is on screen: big enough to be obviously there,
      // small enough that the mechanism under construction is still visible
      // around it. Zoom-dependent by design — the picture arrives where the
      // user is looking rather than at some fixed size off the edge.
      const visibleWidth = this.svgGrid.viewBoxMaxX - this.svgGrid.viewBoxMinX;
      await this.bgImage.load(file, visibleWidth / 2);
      this.activeObjService.selectBackgroundImage();
      this.notify.success(
        'bgImage.added',
        `${file.name} is behind the grid. It is not saved in the project web address.`
      );
    } catch (error) {
      this.notify.failure(
        'bgImage.failed',
        error instanceof Error ? error.message : 'That image could not be loaded.'
      );
    }
  }

  /** Where the two-point cylinder gesture started: the barrel-side mount. */
  private cylinderCreateStart?: Coord;
  /** The link the gesture started on, when it started on one rather than the grid. */
  private cylinderCreateOn?: RealLink;
  /** The joint it started on, when it started on one: the mount, already built. */
  private cylinderCreateAt?: RealJoint;

  /**
   * Begin the two-point cylinder gesture (§ cylinder 2), mirroring Add Link:
   * the right-click point is the barrel-side mount, a ghost of the assembly
   * tracks the cursor (which is where the ROD will finish), and the next
   * left-click commits. Right- or middle-click cancels, exactly as link
   * creation does.
   *
   * Started from a link's own menu, that link is what the ram is bolted to and
   * the mount joins its body — the same difference Attach Link has from Add
   * Link, and the reason both live on both menus.
   */
  startCreatingCylinder() {
    this.fitObjectScaleToFirstPart();
    this.cylinderCreateOn =
      this.lastRightClick instanceof RealLink ? this.lastRightClick : undefined;
    this.cylinderCreateAt =
      this.lastRightClick instanceof RealJoint ? this.lastRightClick : undefined;
    // From a joint, the mount is the joint itself, so the gesture starts at
    // where it actually is rather than wherever inside its hitbox the click
    // landed — a ram drawn a few pixels off its own mount is a ram at an angle
    // to the one the user pointed at.
    this.cylinderCreateStart = this.cylinderCreateAt
      ? new Coord(this.cylinderCreateAt.x, this.cylinderCreateAt.y)
      : this.svgGrid.snapToGrid(
          this.svgGrid.screenToModel(this.lastRightClickCoord),
          this.snapSuspendedAtRightClick
        );
    this.dragState.beginCreatingCylinder();
  }

  /**
   * The ghost cylinder of the creation gesture, tracking the cursor. Same
   * paths, same proportions and same frame as the committed skin, so what is
   * previewed is exactly what the left-click will create.
   */
  get cylinderPreview():
    | {
        x: number;
        y: number;
        rotation: number;
        barrel: string;
        rod: string;
        block: string;
        fill: string;
      }
    | undefined {
    if (this.dragState.grid !== gridStates.createCylinder || !this.cylinderCreateStart) {
      return undefined;
    }
    const creation = cylinderCreationLayout(
      this.cylinderCreateStart,
      // Where the click will put it, not where the pointer is: the rod's far
      // end is a joint, and it lands on the grid like every other.
      this.creationLanding(),
      this.settings.objectScale
    );
    const r = 0.15 * this.settings.objectScale;
    return {
      x: creation.pin.x,
      y: creation.pin.y,
      rotation: (creation.angleRad * 180) / Math.PI,
      // The preview is the part it will become: the barrel at its own length,
      // straddling the piston, with the rod telescoping out of its mouth.
      barrel: barrelPath(r, -creation.pinFromMount, creation.barrelLength - creation.pinFromMount),
      rod: rodBodyPath(r, creation.rodLength, cylinderHeadHalf(creation.barrelLength, r)),
      block: cylinderBlockPath(r, cylinderHeadHalf(creation.barrelLength, r)),
      // The color the barrel will be handed when the click builds it, which
      // the rod then wears too.
      fill: this.nextLinkColor,
    };
  }

  /** The left-click that ends the gesture: build the part, one undo entry. */
  private commitCylinderCreation(end: Coord) {
    // Capturing, not identity-addressed: where the barrel and the rod sit
    // relative to what they mount on is read off the pose the gesture was made
    // at, so it is staged and settled onto the anchor like a drag.
    this.mechanismSrv.capturingPose(this.cylinderCreateOn, () =>
      this.commitCylinderCreationNow(end)
    );
  }

  private commitCylinderCreationNow(end: Coord) {
    const start = this.cylinderCreateStart;
    const mountOn = this.cylinderCreateOn;
    const mountAt = this.cylinderCreateAt;
    this.cylinderCreateStart = undefined;
    this.cylinderCreateOn = undefined;
    this.cylinderCreateAt = undefined;
    this.dragState.finishCreating();
    if (!start) return;
    this.mechanismSrv.createCylinderFrom(start, end, mountOn, mountAt);
  }

  setLastRightClick(clickedObj: Joint | Link | string | Force | SynthesisPose, event?: MouseEvent) {
    this.lastRightClick = clickedObj;
    // Shared menu handlers act on the selection. Right-click must select its
    // target in Analysis too, or a delete/ground command edits the previously
    // graphed part instead of the part named by the menu.
    if (
      this.tabService.getCurrentTab() !== TabID.SYNTHESIZE &&
      (clickedObj instanceof Joint || clickedObj instanceof Link || clickedObj instanceof Force)
    ) {
      if (
        (clickedObj instanceof RealJoint ||
          clickedObj instanceof RealLink ||
          clickedObj instanceof Force) &&
        this.activeObjService.containsPart(clickedObj)
      ) {
        // A menu opened inside a group acts on the group. In particular, a
        // macOS Control-click must not collapse the selection before the
        // contextmenu event arrives. Cancel the undecided left-button gesture
        // as well: Control-click produces both on macOS, and its later release
        // must not collapse the group after this menu preserves it.
        this.selectionGesture = undefined;
        this.pendingPartReplacement = undefined;
        this.selectionTogglePress = false;
        // Before the cancel, which is what makes this the last moment the
        // gesture still looks like a drag. Past the slop it has already moved
        // something; cancelled with the moved geometry standing, the next
        // rebuild settles it onto the anchor as though it had been asked for.
        this.putBackTheDrag();
        this.dragState.cancel();
      } else {
        this.activeObjService.updateSelectedObj(clickedObj);
      }
    }

    switch (this.objectKind(clickedObj)) {
      case 'RealLink':
        this.lastLeftClickType = 'Link';
        if ((clickedObj as RealLink).subset.length > 1) {
          this.gridUtils.updateLastSelectedSublink(event!, clickedObj as RealLink);
        }
        break;
    }

    this.updateContextMenuItems();
  }

  /**
   * A press on a force's base handle.
   *
   * In an analysis mode a force has no graphs, and a base standing on a joint
   * is standing on something that does: the press is filed as a press on the
   * joint, all the way down. Otherwise it is the ordinary grab of the base --
   * the force selected first, then its base marked, in that order, because
   * selecting the force is what clears the marks.
   */
  pressForceBase(force: Force, event: PointerEvent): void {
    event.stopPropagation();
    const under = this.jointUnderForceBase(force);
    if (under) {
      this.setLastLeftClick(under, event);
      this.mouseDown(event);
      return;
    }
    this.setLastLeftClick(force);
    this.activeObjService.updateSelectedObj(force.startCoord, force);
    this.mouseDown(event);
  }

  /**
   * The joint a force's base is standing on, in the modes that have graphs
   * for joints but none for forces.
   */
  private jointUnderForceBase(force: Force): RealJoint | undefined {
    if (!this.tabService.isAnalysisMode()) return undefined;
    const reach = 0.3 * this.settings.objectScale;
    return force.link.joints.find(
      (joint): joint is RealJoint =>
        joint instanceof RealJoint &&
        Math.hypot(joint.x - force.startCoord.x, joint.y - force.startCoord.y) <= reach
    );
  }

  setLastLeftClick(clickedObj: Joint | Link | string | Force | SynthesisPose, event?: MouseEvent) {
    // Scenery in the analysis modes takes no clicks: every panel behind a
    // selection is about a machine that runs, and this geometry is not in one.
    if (
      (clickedObj instanceof Joint || clickedObj instanceof Link) &&
      this.mechanismSrv.isPartInert(clickedObj)
    ) {
      return;
    }
    this.grabToPause(clickedObj);
    this.lastLeftClick = clickedObj;
    this.selectionTogglePress = false;
    this.pendingPartReplacement = undefined;
    switch (this.objectKind(clickedObj)) {
      case 'Force':
        this.lastLeftClickType = 'Force';
        break;
      case 'RealLink':
        this.lastLeftClickType = 'Link';
        if ((clickedObj as RealLink).subset.length > 1) {
          this.gridUtils.updateLastSelectedSublink(event!, clickedObj as RealLink);
        }
        break;
      case 'PrisJoint':
      //Fall through intentional
      case 'RevJoint':
        this.lastLeftClickType = 'Joint';
        break;
      case 'String':
        this.lastLeftClickType = 'Grid';
        break;
      case 'SynthesisPose':
        this.lastLeftClickType = 'SynthesisPose';
        break;
      default:
        this.lastLeftClickType = 'Unknown';
        console.error('Unknown object type clicked');
    }
    if (event && event.button !== 0) return;
    if (
      this.tabService.getCurrentTab() === TabID.EDIT &&
      // A force is one of them: eight of them can be given one magnitude, one
      // frame or one color in a single press, which is the whole reason a
      // group selection exists. What it does not join is the geometry -- where
      // a force is, is decided by the body it is on.
      (clickedObj instanceof RealJoint ||
        clickedObj instanceof RealLink ||
        clickedObj instanceof Force)
    ) {
      if (
        isAdditiveSelectionGesture(
          { ctrlKey: event?.ctrlKey ?? false, metaKey: event?.metaKey ?? false },
          navigator.platform
        )
      ) {
        this.activeObjService.togglePartSelection(clickedObj);
        this.selectionTogglePress = true;
      } else if (
        this.activeObjService.objType === 'MultiSelection' &&
        this.activeObjService.containsPart(clickedObj)
      ) {
        this.pendingPartReplacement = clickedObj;
      } else {
        this.activeObjService.replacePartSelection(clickedObj);
      }
      return;
    }
    if (
      this.tabService.getCurrentTab() === TabID.EDIT &&
      typeof clickedObj === 'string' &&
      !(event?.ctrlKey || event?.metaKey)
    ) {
      this.activeObjService.clearPartSelection();
      return;
    }
    // Click selects, drag tunes.
    //
    // In an analysis mode the selection decides what the panel *graphs*, and a
    // drag is now an edit -- so grabbing a joint to tune it stole the graphs
    // away from whatever was being studied. Which is exactly backwards for the
    // move this unlock exists for: watch the output's acceleration, tune the
    // coupler pivot, watch the peak come down.
    //
    // The drag itself still works through the selection, which is nineteen
    // reads through the most delicate code here, so the selection is still made
    // on the press. What is remembered is what it was *before* -- and a gesture
    // that turns out to have travelled puts it back on release. The analysis
    // panel holds the pose it is graphing steady for the length of the gesture,
    // so the selection this makes and unmakes is never one the reader sees.
    if (this.tabService.isAnalysisMode()) {
      this.selectionBeforeGesture = this.graphedPart();
      // Before the line below moves it, so the panels never see the swap.
      this.activeObjService.holdGraphSubject();
    }
    this.activeObjService.updateSelectedObj(clickedObj);
  }

  /**
   * What was selected when this gesture began, in an analysis mode.
   *
   * Nothing outside a gesture, and nothing in the other modes: in Edit the
   * panel is about the thing being edited, so selecting what you drag is what
   * a reader expects there.
   */
  private selectionBeforeGesture?: RealJoint | RealLink | Force;

  /** Whatever the analysis panel is graphing, or nothing where it graphs nothing. */
  private graphedPart(): RealJoint | RealLink | Force | undefined {
    switch (this.activeObjService.objType) {
      case 'Joint':
        return this.activeObjService.selectedJoint;
      case 'Link':
        return this.activeObjService.selectedLink;
      case 'Force':
        return this.activeObjService.selectedForce;
      default:
        return undefined;
    }
  }

  /**
   * Put the graphs back on what the reader was studying.
   *
   * Only after a gesture that actually moved something -- a press that merely
   * selected is a click, and a click is exactly how the graphs are meant to be
   * changed.
   */
  private restoreSelectionAfterDrag(travelled: boolean): void {
    const before = this.selectionBeforeGesture;
    this.selectionBeforeGesture = undefined;
    // Whatever happens below, the panels stop being held: after a click the new
    // selection is the whole point of the click.
    try {
      if (!before || !travelled) return;
      if (before === this.graphedPart()) return;
      // Gone, if the gesture merged it away. The graphs then stay where the
      // gesture left them rather than pointing at something that is not there.
      const alive =
        before instanceof Force
          ? this.mechanismSrv.forces.includes(before)
          : before instanceof Link
            ? this.mechanismSrv.links.includes(before)
            : this.mechanismSrv.joints.includes(before);
      if (!alive) return;
      this.activeObjService.updateSelectedObj(before);
    } finally {
      this.activeObjService.releaseGraphSubject();
    }
  }

  selectionBounds(): SelectionBounds | undefined {
    // Mid-turn, the box the gesture started with, turned by `selectionSpin`
    // below. Re-fitting an upright box around the parts every frame made the
    // box breathe in and out as they swung -- it was measuring the drawing
    // rather than holding it, which is not what a hand on a turn knob expects.
    // Let go, and the box goes back to being the upright one that fits.
    const turning = this.selectionGesture;
    if (turning?.mode === 'rotate') return turning.snapshot.bounds;
    // `mechanismTimeStep` was the shared clock, which reads zero while an
    // unsynced machine is parked mid-cycle -- so the handles appeared over a
    // displaced drawing and every other surface disagreed with them.
    if (this.activeObjService.selectedParts.length < 2 || !this.permission.may('drag')) {
      return undefined;
    }
    const closure = canonicalSelectionClosure(
      this.activeObjService.selectedParts,
      this.mechanismSrv.joints,
      this.mechanismSrv.links
    );
    if (closure.joints.length === 0) return undefined;
    const xs = closure.joints.map((joint) => joint.x);
    const ys = closure.joints.map((joint) => joint.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }

  selectionHandleSize(): number {
    return this.svgGrid.scaleWithZoom(12);
  }

  selectionRotateReach(): number {
    return this.svgGrid.scaleWithZoom(34);
  }

  /**
   * How far the drawn box stands off the parts inside it.
   *
   * The bounds are the extreme joints themselves, so a box drawn straight
   * through them puts a grip exactly on top of a joint -- which then swallows
   * the click that would have selected it, and cuts the joint in half on
   * screen. Held off by a grip's width, the box reads as being *around* the
   * selection and every part inside it stays clickable.
   */
  selectionInset(): number {
    return this.selectionHandleSize();
  }

  /**
   * The eight grips round the box, in model coordinates.
   *
   * Four corners and four edge midpoints, the arrangement every drawing program
   * uses, so a reader who has resized a rectangle anywhere else already knows
   * which one does what: a corner takes both dimensions, an edge takes the one
   * it faces. Each carries the point it scales *away* from -- the opposite
   * corner or edge -- because that is the point that must not move while the
   * grip is dragged.
   *
   * Named for where they sit on screen. The overlay is drawn inside the canvas's
   * y-flip, so the box's greatest y is its top edge and `n` is the top grip,
   * which is what makes the cursor names read straight.
   */
  selectionGrips(bounds: SelectionBounds): (SelectionGrip & { x: number; y: number })[] {
    const box = this.selectionBox(bounds);
    const midX = (box.minX + box.maxX) / 2;
    const midY = (box.minY + box.maxY) / 2;
    // Grips sit on the drawn box; anchors sit on the parts. Pulling the east
    // grip scales about the westmost joint, not about the box's west edge, so
    // the side being held still does not creep by the width of the inset.
    const corner = (id: SelectionGripId, x: number, y: number, cursor: string) => ({
      id,
      x,
      y,
      cursor,
      axes: 'both' as const,
      anchor: {
        x: x === box.minX ? bounds.maxX : bounds.minX,
        y: y === box.minY ? bounds.maxY : bounds.minY,
      },
    });
    return [
      corner('nw', box.minX, box.maxY, 'nwse-resize'),
      corner('ne', box.maxX, box.maxY, 'nesw-resize'),
      corner('se', box.maxX, box.minY, 'nwse-resize'),
      corner('sw', box.minX, box.minY, 'nesw-resize'),
      {
        id: 'n',
        x: midX,
        y: box.maxY,
        cursor: 'ns-resize',
        axes: 'y',
        anchor: { x: midX, y: bounds.minY },
      },
      {
        id: 's',
        x: midX,
        y: box.minY,
        cursor: 'ns-resize',
        axes: 'y',
        anchor: { x: midX, y: bounds.maxY },
      },
      {
        id: 'e',
        x: box.maxX,
        y: midY,
        cursor: 'ew-resize',
        axes: 'x',
        anchor: { x: bounds.minX, y: midY },
      },
      {
        id: 'w',
        x: box.minX,
        y: midY,
        cursor: 'ew-resize',
        axes: 'x',
        anchor: { x: bounds.maxX, y: midY },
      },
    ];
  }

  /**
   * The turn the box is in the middle of, as an SVG transform, or nothing.
   *
   * Applied to the whole overlay -- box, grips and knob together -- so the
   * frame stays rigidly on the parts while they swing, the way a hand expects
   * of something it has hold of.
   */
  selectionSpin(): string | null {
    const gesture = this.selectionGesture;
    if (gesture?.mode !== 'rotate' || !gesture.liveRotation) return null;
    const degrees = (gesture.liveRotation * 180) / Math.PI;
    return `rotate(${degrees} ${gesture.snapshot.pivot.x} ${gesture.snapshot.pivot.y})`;
  }

  /** The drawn box: the parts' own bounds, held off by the inset. */
  selectionBox(bounds: SelectionBounds): SelectionBounds {
    const inset = this.selectionInset();
    return {
      minX: bounds.minX - inset,
      minY: bounds.minY - inset,
      maxX: bounds.maxX + inset,
      maxY: bounds.maxY + inset,
    };
  }

  beginSelectionRotate(event: PointerEvent): void {
    this.beginSelectionHandle(event, 'rotate');
  }

  beginSelectionScale(event: PointerEvent, grip: SelectionGrip): void {
    this.beginSelectionHandle(event, 'scale', grip);
  }

  private beginSelectionHandle(
    event: PointerEvent,
    mode: 'rotate' | 'scale',
    grip?: SelectionGrip
  ): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.timeMouseDown = Date.now();
    this.startX = event.pageX;
    this.startY = event.pageY;
    this.dragState.press();
    const at = this.svgGrid.screenToModelFromXY(event.clientX, event.clientY);
    this.beginSelectionGesture(mode, at, undefined, grip);
    this.holdPointer(event);
  }

  private beginSelectionGesture(
    mode: 'translate' | 'rotate' | 'scale',
    pointer: Coord,
    replaceOnClick?: SelectedPart,
    grip?: SelectionGrip
  ): void {
    const snapshot = captureSelectionTransform(
      this.activeObjService.selectedParts,
      this.mechanismSrv.joints,
      this.mechanismSrv.links
    );
    // A group transform is a geometry gesture like any other, so it stages the
    // same way -- but only where there is one machine to stage. Handing over
    // the first selected part staged *its* machine and left the rest of the
    // selection unstaged: the transform reported itself applied while the
    // members in other machines were restored to their own starts by the same
    // rebuild, so they moved and snapped back.
    //
    // A selection spanning machines is refused its staging outright. What that
    // means for the reader is that a group across two machines is edited at the
    // start pose, as it was before any of this existed.
    if (!this.stageSelection()) return;
    this.selectionGesture = {
      snapshot,
      mode,
      pointerStart: new Coord(pointer.x, pointer.y),
      startAngle: Math.atan2(pointer.y - snapshot.pivot.y, pointer.x - snapshot.pivot.x),
      startDistance: Math.max(getDistance(pointer, snapshot.pivot), 1e-9),
      changed: false,
      attempted: false,
      refusalShown: false,
      replaceOnClick,
      grip,
    };
  }

  private moveSelectionGesture(pointer: Coord, event: MouseEvent): boolean {
    const gesture = this.selectionGesture;
    if (!gesture) return false;
    if (!this.canEditNow() || !this.pastDragThreshold(event)) return true;
    gesture.attempted = true;

    let transform: SelectionAffineTransform;
    if (gesture.mode === 'translate') {
      const wanted = new Coord(
        gesture.snapshot.pivot.x + pointer.x - gesture.pointerStart.x,
        gesture.snapshot.pivot.y + pointer.y - gesture.pointerStart.y
      );
      const landed = this.svgGrid.snapToGrid(wanted, event.altKey);
      transform = {
        translation: {
          x: landed.x - gesture.snapshot.pivot.x,
          y: landed.y - gesture.snapshot.pivot.y,
        },
      };
    } else if (gesture.mode === 'rotate') {
      const turned =
        Math.atan2(pointer.y - gesture.snapshot.pivot.y, pointer.x - gesture.snapshot.pivot.x) -
        gesture.startAngle;
      // The turn *since the grab*, not an absolute bearing: a group has no
      // orientation of its own to be square to, so the increments are counted
      // from wherever the reader took hold of it. Alt suspends them, as it does
      // for the underlay's knob and for snapping to the grid.
      const rotation = event.altKey
        ? turned
        : Math.round(turned / ROTATION_SNAP_RAD) * ROTATION_SNAP_RAD;
      gesture.liveRotation = rotation;
      transform = { rotation };
    } else if (gesture.grip) {
      // Away from the opposite corner or edge, which is the point that holds
      // still: a grip drags the side it is on and leaves the far side where the
      // reader put it. An edge grip reports 1 for the axis it does not face, so
      // pulling the right edge widens the box without making it taller.
      const grip = gesture.grip;
      const reach = (from: number, to: number) => {
        // A box with no width cannot be widened by pulling on it -- there is no
        // distance for the ratio to be taken against. Held at 1 rather than
        // refused, so a row of joints all at one y still drags sideways.
        if (Math.abs(from) < 1e-6) return 1;
        const ratio = to / from;
        // Past the anchor the ratio goes negative and the selection turns
        // through it, which is what dragging a grip across the far side is
        // asking for. Only the neighborhood of zero is held off: that is the
        // one place with no way back, since a selection with no width cannot
        // be widened again.
        const smallest = 0.05;
        if (ratio <= -smallest || ratio >= smallest) return ratio;
        return ratio < 0 ? -smallest : smallest;
      };
      const startX = gesture.pointerStart.x - grip.anchor.x;
      const startY = gesture.pointerStart.y - grip.anchor.y;
      transform = {
        pivot: grip.anchor,
        scale: {
          x: grip.axes === 'y' ? 1 : reach(startX, pointer.x - grip.anchor.x),
          y: grip.axes === 'x' ? 1 : reach(startY, pointer.y - grip.anchor.y),
        },
      };
    } else {
      transform = {
        scale: Math.max(0.05, getDistance(pointer, gesture.snapshot.pivot) / gesture.startDistance),
      };
    }

    const result = gesture.snapshot.apply(transform);
    if (!result.applied) {
      if (!gesture.refusalShown) {
        gesture.refusalShown = true;
        const names = result.lockedJointIds.join(', ');
        this.notify.refusal(
          'selection.transform-locked',
          `The selection is held by ${names || 'a Lock'}. Unlock it before transforming the group.`
        );
      }
      return true;
    }
    gesture.changed = true;
    this.mechanismSrv.reseatFloatingSliders();
    this.mechanismSrv.updateMechanism(false);
    this.mechanismSrv.onMechUpdateState.next(2);
    this.activeObjService.fakeUpdateSelectedObj();
    // The traced path is a joint's or a body's; a force has none, and asking
    // for one would be asking about the wrong object.
    const primary = this.activeObjService.primaryPart;
    this.showPathWhileDragging(primary instanceof Force ? undefined : primary);
    return true;
  }

  /**
   * Move the selection by one square of the drawn grid, or five with Option.
   *
   * The same closure, the same locks and the same one-undo-per-change as
   * dragging it: an arrow is a drag nobody had to be steady for, and a reader
   * who cannot hold a joint still is exactly who it is for. Sized in grid
   * squares rather than model units so the step is something on screen -- what
   * moves is what the reader can see it move past.
   *
   * `dy` is positive upwards, as the model is: the canvas draws with y flipped
   * and the arrow keys are named for the drawing.
   */
  private nudgeSelection(dx: number, dy: number, coarse: boolean): void {
    if (!this.canEditNow()) return;
    const selected = this.activeObjService.selectedParts;
    if (selected.length === 0) return;
    const step = coarse ? this.svgGrid.majorCellSize : this.svgGrid.minorCellSize;
    if (!(step > 0)) return;
    // Before anything moves. Staging is where a selection spanning two machines
    // is refused, and asking after the transform had been applied left both
    // joints a grid step from where they started, with a refusal on screen
    // saying nothing had happened and no entry in the history to take it back.
    if (!this.stageSelection()) return;
    const snapshot = captureSelectionTransform(
      selected,
      this.mechanismSrv.joints,
      this.mechanismSrv.links
    );
    const result = snapshot.apply({ translation: { x: dx * step, y: dy * step } });
    if (!result.applied) {
      const names = result.lockedJointIds.join(', ');
      this.notify.refusal(
        'selection.transform-locked',
        `The selection is held by ${names || 'a Lock'}. Unlock it before moving the group.`
      );
      return;
    }
    // A nudge is a drag by another route, so it stages and commits like one. It
    // did not, and at a displaced pose that made it a no-op: the arrow moved
    // the joints, the rebuild restored them to t = 0 on its way past, and a key
    // the permission model had just allowed did nothing at all.
    const staged = this.mechanismSrv.posedEditKey !== null;
    this.mechanismSrv.reseatFloatingSliders();
    this.mechanismSrv.updateMechanism(false);
    this.mechanismSrv.onMechUpdateState.next(2);
    this.activeObjService.fakeUpdateSelectedObj();
    if (staged) {
      this.closePosedEdit(true, false);
      if (this.posedEditSaved) {
        this.posedEditSaved = false;
        return;
      }
      this.posedEditSaved = false;
    }
    this.mechanismSrv.save();
  }

  /**
   * Stage a group gesture, or say why it cannot be made here.
   *
   * A selection spanning two machines has no single machine to stage: whichever
   * one is put back on its anchor at the commit, the members of the other were
   * restored to *their* start by the same rebuild -- so they move under the
   * hand and snap back, and the gesture reports itself applied having done
   * nothing. Refused with a reason instead, which is the one honest answer
   * available: at the start pose it works exactly as it always has.
   */
  private stageSelection(): boolean {
    const parts = this.activeObjService.selectedParts;
    if (parts.length === 0 || this.mechanismSrv.isAtStartPose()) return true;
    const machines = new Set(
      parts.map((part) =>
        this.mechanismSrv.indexOfMechanismContaining(part as Joint | Link | Force)
      )
    );
    if (machines.size > 1) {
      this.notify.refusal(
        'selection.spans-machines',
        'This selection is spread across two mechanisms, which can only be moved together at the start pose. Press Back to the start pose, then try again.'
      );
      return false;
    }
    this.mechanismSrv.beginPosedEdit(parts[0] as Joint | Link | Force);
    return true;
  }

  private finishSelectionGesture(): boolean {
    this.mechanismSrv.committingPosedEdit = true;
    try {
      return this.finishSelectionGestureNow();
    } finally {
      this.mechanismSrv.committingPosedEdit = false;
    }
  }

  private finishSelectionGestureNow(): boolean {
    const gesture = this.selectionGesture;
    if (!gesture) return false;
    this.selectionGesture = undefined;
    this.dragState.release();
    // A group gesture stages a posed edit like any other, so it has to close
    // one. Left open, the staging outlived the gesture -- and the next ambient
    // rebuild, seeing a machine still marked "seed this one from what is
    // drawn", turned the displaced pose into the design. That is the ratchet,
    // reached by a click that moved nothing.
    this.closePosedEdit(gesture.changed, false);
    if (gesture.changed && !this.posedEditSaved) {
      this.mechanismSrv.save();
    } else if (!gesture.attempted && gesture.replaceOnClick) {
      this.activeObjService.replacePartSelection(gesture.replaceOnClick);
    }
    this.posedEditSaved = false;
    this.pendingPartReplacement = undefined;
    this.selectionTogglePress = false;
    return true;
  }

  addJoint() {
    // TODO: Make sure you add logic within here so that joint is part of fixedLocations for respective link subset
    const coord = this.svgGrid.screenToModelFromXY(
      this.lastRightClickCoord.x,
      this.lastRightClickCoord.y
    );

    this.mechanismSrv.addJointAt(this.svgGrid.snapToGrid(coord, this.snapSuspendedAtRightClick));
  }

  /**
   * Begin the force gesture on a named link.
   *
   * Named rather than inferred, because the row that starts this is on the
   * joint's menu as well as the link's: a load at a joint belongs to the one
   * link that meets there, and the joint is not itself a body that can carry
   * one. Where several links meet, the menu grays the row instead of guessing.
   */
  createForce(onLink: RealLink) {
    this.forceCreateOn = onLink;
    this.dragState.beginCreatingForce();
    // A real Force, built on the link the gesture started from, so the preview
    // is drawn by the same code as the finished arrow rather than by a line
    // that only resembles one. Same reason the cylinder gesture previews its
    // actual members: what is shown is what the next click will make.
    const at = this.svgGrid.screenToModel(this.lastRightClickCoord);
    this.forceGhost = new Force('ghost', onLink, at, new Coord(at.x, at.y));
    this.mechanismSrv.onMechUpdateState.next(3);
  }

  /** The link the force being drawn will be anchored to. */
  private forceCreateOn?: RealLink;

  /** The force being drawn, tracking the cursor. Undefined when not drawing. */
  forceGhost?: Force;

  /**
   * Settle the object scale before the first part is drawn.
   *
   * On an empty grid the scale is derived from the current zoom, so whatever is
   * built first decides how large every pin and bar is from then on. Deciding
   * that when the gesture *starts* is what lets its ghost be the right size:
   * done at the commit instead, the preview is drawn at the old scale and the
   * part appears at a different one the instant it is made.
   */
  private fitObjectScaleToFirstPart(): void {
    if (this.mechanismSrv.links.length === 0) {
      this.svgGrid.updateObjectScale();
    }
  }

  /** Where the link gesture started, in model coordinates. */
  private linkCreateStart?: Coord;

  /**
   * The point the link gesture began at.
   *
   * The three commit paths used to read this back out of the preview's own SVG
   * element, as two string attributes — so the drawing was load-bearing, and
   * removing it would have quietly changed where links get built. It is kept
   * here instead, which is also what the preview draws from.
   */
  private linkGestureStart(): Coord {
    return this.linkCreateStart ?? this.creationLanding();
  }

  /**
   * Where a creation gesture puts a joint: the cursor, on the grid.
   *
   * Dragging an existing joint has always landed it on the nearest grid square,
   * and placing a new one did not -- so the same setting meant one thing to a
   * joint that existed and nothing to a joint being made, and a mechanism built
   * on a grid came out on coordinates like 3.87. Read by the preview as well as
   * by the click, so the bar commits where the ghost was standing.
   *
   * Option suspends it, the way it suspends every other snap on the canvas.
   */
  private creationLanding(): Coord {
    return this.svgGrid.snapToGrid(this.mouseLocation, this.snapSuspended);
  }

  /**
   * The color the next link created will wear.
   *
   * A cylinder's barrel is the first link its gesture builds, and its rod wears
   * the barrel's fill — one part, one color — so both gestures preview the
   * same answer.
   */
  get nextLinkColor(): string {
    return this.colorService.peekNextLinkColor();
  }

  /**
   * The bar being drawn, tracking the cursor.
   *
   * Link creation showed a hairline and a dot, which says where the gesture
   * started and where it will end and nothing about what it will make — the
   * cylinder and force gestures both preview the part itself. This is the same
   * capsule a two-joint link is drawn as, at the same half-width, so what is
   * under the cursor is the bar the click commits.
   */
  get linkPreview(): { bar: string; from: Coord; fill: string } | undefined {
    const from = this.linkCreateStart;
    if (!this.dragState.isCreatingLink || !from) return undefined;
    const to = this.creationLanding();
    const half = this.settings.objectScale / 4;
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    // Nothing to point along yet: the first pixel of the gesture would spin a
    // zero-length bar through every angle at once.
    if (span < 1e-6) return undefined;
    return {
      bar: orientedCapsulePath(
        { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        Math.atan2(to.y - from.y, to.x - from.x),
        span / 2,
        half
      ),
      from,
      fill: this.nextLinkColor,
    };
  }

  /**
   * How big a force's anchor mark is drawn.
   *
   * Tied to the arrow's own thickness, which is how a force shows its
   * magnitude: a heavy load draws a thick arrow, and a mark at a fixed size
   * beside it reads as belonging to something else. Both constants are set so
   * that a force at the default width keeps the size it had.
   */
  forceAnchorRadius(force: Force): number {
    return 0.75 * force.visualWidth * this.settings.objectScale;
  }

  /** The plus a *local* force wears, at the same thickness as its arrow. */
  forceWeldMark(force: Force): string {
    return plusPath(1.5 * force.visualWidth * this.settings.objectScale);
  }

  /** Where inside the arrow a body drag picked it up, so it does not jump. */
  private forceGrabOffset = new Coord(0, 0);

  beginDraggingForceBody(force: Force, event: PointerEvent): void {
    const at = this.svgGrid.screenToModelFromXY(event.clientX, event.clientY);
    this.forceGrabOffset = new Coord(at.x - force.startCoord.x, at.y - force.startCoord.y);
  }

  /**
   * Put a force's anchor where the pointer asks, if it may go there.
   *
   * Two rules, and the joint one is checked first because a joint is on the
   * link whether or not the point lands inside the drawn bar: the anchor snaps
   * onto a joint that belongs to one link only, and is refused at a pin where
   * several meet — a force there does not say which body it acts on. Anywhere
   * else it has to be inside the bar.
   */
  private moveForceAnchor(wanted: Coord, how: 'anchor' | 'whole'): void {
    const force = this.activeObjService.selectedForce;
    // The force's own link, not whatever the panel last selected: a force knows
    // what it acts on, and the two can disagree after a click on the body.
    const link = force.link;
    const anchor = this.gridUtils.forceAnchorAt(link, wanted, this.settings.objectScale);
    let at = anchor.at;
    if (!anchor.snappedTo && !this.pointIsInsideLink(link, at)) {
      // The hand is off the bar. The force used to stop dead until the pointer
      // came back over the link, which made every drag along a bar feel
      // stuck: the nearest point on the link is where the hand means.
      at = this.closestPointOnLink(link, wanted);
    }
    if (anchor.shared) {
      // Held short of a pin several links meet at, along the bar it is on: a
      // force exactly there would not say which body it acts on, and a
      // snackbar saying so on every pointer move was the other half of what
      // made the drag feel stuck.
      at = this.heldOffJoint(link, anchor.shared, at, 0.3 * this.settings.objectScale);
    }
    this.gridUtils.dragForce(force, at, how);
    // So that the panel values update continuously.
    this.activeObjService.fakeUpdateSelectedObj();
    // Credited only while it is somewhere else: back where the gesture found
    // it, there is nothing for Undo to take back.
    const was = this.beforeDrag?.forces.find((one) => one.id === force.id);
    const restored =
      !!was &&
      force.startCoord.x === was.sx &&
      force.startCoord.y === was.sy &&
      force.endCoord.x === was.ex &&
      force.endCoord.y === was.ey;
    if (restored) this.dragState.noteMechanismRestored();
    else this.dragState.noteMechanismModified();
  }

  /**
   * The point on a link's bars nearest to a point off them: the nearest of
   * the projections onto the segments between its joints, clamped to them.
   */
  private closestPointOnLink(link: RealLink, point: Coord): Coord {
    const joints = link.joints;
    let best = point;
    let bestGap = Infinity;
    for (let first = 0; first < joints.length; first++) {
      for (let second = first + 1; second < joints.length; second++) {
        const [x, y] = point_on_line_segment_closest_to_point(
          point.x,
          point.y,
          joints[first].x,
          joints[first].y,
          joints[second].x,
          joints[second].y
        );
        const gap = Math.hypot(x - point.x, y - point.y);
        if (gap < bestGap) {
          bestGap = gap;
          best = new Coord(x, y);
        }
      }
    }
    return best;
  }

  /** The same point, pushed `margin` away from a joint along the bar it is on. */
  private heldOffJoint(link: RealLink, pin: RealJoint, at: Coord, margin: number): Coord {
    const gap = Math.hypot(at.x - pin.x, at.y - pin.y);
    if (gap >= margin) return at;
    // Away from the pin, along the bar the point is on -- toward the joint on
    // the bar's other end, which is the direction the force was coming from.
    const other = link.joints.find((joint) => joint !== pin) ?? pin;
    const dx = other.x - pin.x;
    const dy = other.y - pin.y;
    const length = Math.hypot(dx, dy);
    if (!(length > margin)) return at;
    return new Coord(pin.x + (dx / length) * margin, pin.y + (dy / length) * margin);
  }

  /**
   * Whether a point lands on the body of a link.
   *
   * Asked of the model rather than of the drawing. It used to hit-test the
   * link's own SVG path, which fails silently in a way that is very hard to see:
   * a link whose element carries an empty `d` — the punch press's rod is one —
   * answers "not inside" for every point in it, so its force could not be moved
   * anywhere at all while three other templates worked fine.
   *
   * A two-joint bar is a special case rather than an exception. Its hull is a
   * line segment, so no point off that line is ever "inside" it — and the
   * anchor of a force on such a bar has already been projected onto the segment
   * by `dragForce`, which is what makes it a bar's whole reachable set.
   */
  private pointIsInsideLink(link: RealLink, point: Coord): boolean {
    const half = this.settings.objectScale / 4;
    const joints = link.joints;
    if (joints.length < 2) return false;
    // Within a bar's own width of the line between any two of its joints. This
    // is what a link is drawn as, so it covers the straight ones — including
    // the three-joint booms, whose joints are collinear and whose hull is
    // therefore a line with no inside at all.
    for (let first = 0; first < joints.length; first++) {
      for (let second = first + 1; second < joints.length; second++) {
        const [x, y] = point_on_line_segment_closest_to_point(
          point.x,
          point.y,
          joints[first].x,
          joints[first].y,
          joints[second].x,
          joints[second].y
        );
        if (Math.hypot(point.x - x, point.y - y) <= half) return true;
      }
    }
    // And anywhere in the middle of a plate, which the edges above do not cover.
    return link.isPointInsideHull(point.x, point.y);
  }

  /**
   * The joint a force's anchor is sitting on, if it is sitting on one.
   *
   * Derived rather than stored, so a force that arrived in a URL already on a
   * tracer point reads the same as one just dragged there.
   */
  forceSnappedJoint(force: Force): RealJoint | undefined {
    for (const joint of force.link.joints) {
      if (!(joint instanceof RealJoint) || joint.links.length > 1) continue;
      if (Math.hypot(joint.x - force.startCoord.x, joint.y - force.startCoord.y) < 1e-6) {
        return joint;
      }
    }
    return undefined;
  }

  creatingForce($event: MouseEvent) {
    const mousePos = this.svgGrid.screenToModelFromXY($event.clientX, $event.clientY);
    this.forceGhost?.moveDirectionHandle(mousePos);
  }

  startCreatingLink() {
    // The first part on an empty grid sets the object scale from the zoom, and
    // everything is sized from it — so it has to be settled before anything is
    // drawn at it. It used to be settled at the *commit*, which meant the ghost
    // was drawn at the old scale and the bar changed size under the click.
    this.fitObjectScaleToFirstPart();
    const startCoord = this.svgGrid.screenToModel(this.lastRightClickCoord);
    switch (this.objectKind(this.lastRightClick)) {
      case 'String': {
        // Started on bare grid, so the grid is what it lands on -- the same
        // rule the second click follows. Not on a joint, whose own position is
        // where the bar has to start, and not on a link, where the new joint
        // has to stay on the bar it was asked for.
        const onGrid = this.svgGrid.snapToGrid(startCoord, this.snapSuspendedAtRightClick);
        startCoord.x = onGrid.x;
        startCoord.y = onGrid.y;
        this.dragState.beginCreatingLinkFromGrid();
        break;
      }
      case 'PrisJoint':
      case 'RevJoint':
        startCoord.x = this.activeObjService.selectedJoint.x;
        startCoord.y = this.activeObjService.selectedJoint.y;
        this.dragState.beginCreatingLinkFromJoint();
        break;
      case 'RealLink':
        // TODO: Create logic for attaching a link onto a link
        this.dragState.beginCreatingLinkFromLink();
        break;
      default:
        return;
    }
    this.linkCreateStart = startCoord;
    // The part this link is growing *from*, kept rather than re-derived. The
    // cross-machine guard asked the currently selected joint for the origin,
    // and by the time the second click lands that is the *destination* -- so
    // both ends looked like the same machine and a link drawn from a bar in one
    // machine to a joint in another fused them at two different poses.
    this.linkCreateFrom =
      this.lastRightClick instanceof Joint || this.lastRightClick instanceof Link
        ? this.lastRightClick
        : undefined;
  }

  /** The part the current Attach Link gesture started from, if it started on one. */
  private linkCreateFrom?: Joint | Link;

  mouseMove($event: MouseEvent) {
    // One solve per frame, however fast the pointer reports. Every move of a
    // held part re-solves the whole cycle, and a pointer can report faster
    // than the screen refreshes -- two or three times a frame on some
    // hardware -- with every report costing a solve nobody could see. So a
    // drag takes the latest move on the next animation frame and drops the
    // ones between; the last move always lands, and release flushes it.
    if (this.dragInProgress() && !this.applyingDragFrame) {
      this.pendingDragMove = $event;
      if (this.dragFrame === undefined) {
        this.dragFrame = requestAnimationFrame(() => {
          this.dragFrame = undefined;
          this.applyPendingDragMove();
        });
      }
      return;
    }
    this.snapSuspended = $event.altKey;
    const mousePosInSvg = this.svgGrid.screenToModelFromXY($event.clientX, $event.clientY);
    this.lastMouseLocation = this.mouseLocation;
    this.originInScreen = this.svgGrid.modelToScreen(new Coord(0, 0));
    this.mouseLocationRaw = new Coord($event.clientX, $event.clientY);
    this.mouseLocation = mousePosInSvg;
    this.svgGrid.cursorAt = mousePosInSvg;

    this.dragState.notePointerMoved();

    // The picture is scenery, and its gesture owns the pointer outright: no
    // snapping, no drop candidates, no mechanism state to keep in step.
    if (this.dragBackgroundImage(mousePosInSvg)) return;

    // Synthesis is the same kind of thing: positions and the preview are a
    // question and a proposed answer, not parts of the drawing, so nothing
    // here earns a rebuild or an undo entry. The cursor is recorded either
    // way -- the ghost about to be dropped follows it.
    //
    // Held to the same rule as a joint: a finger that has not yet decided
    // whether it is a press moves nothing. This path runs before the drag
    // threshold below and so had to be told separately -- which is why a
    // tremor on a position moved it eighteen units and then opened its menu
    // over the top.
    if (this.showSynthesis() && !this.longPress()?.pressPending) {
      if (this.synthCanvas.move(mousePosInSvg)) return;
    }

    if (this.moveSelectionGesture(mousePosInSvg, $event)) return;

    let deltaMouseX = this.mouseLocation.x - this.lastMouseLocation.x;
    let deltaMouseY = this.mouseLocation.y - this.lastMouseLocation.y;

    // The press earned a refusal, and the pointer has now actually tried to
    // move the object: say it, once per gesture.
    // Just `canEditNow` now. A held press in an analysis mode used to earn a
    // spoken refusal, because nothing there was editable and the reason was
    // nowhere on screen; a drag there is an edit, so there is nothing to say.
    // The gate is otherwise unchanged -- a press held while the animation runs
    // still says nothing, because the reader can see it running.
    if (
      this.heldGestureNotice &&
      this.dragState.isPointerDown &&
      this.canEditNow() &&
      this.pastDragThreshold($event) &&
      // Traveled, not merely held: `pastDragThreshold` also calls a press held
      // for a tenth of a second a drag, and a hand resting on the button while
      // the pointer twitches a pixel has not tried to move anything.
      !this.pressDidNotTravel($event)
    ) {
      this.heldGestureNotice();
      this.heldGestureNotice = undefined;
    }

    switch (this.dragState.joint) {
      case jointStates.creating:
        break;
      case jointStates.dragging: {
        if (!this.canEditNow() || !this.pastDragThreshold($event)) {
          return;
        }
        // A mount of a sealed cylinder drags parametrically: the whole
        // assembly re-poses about the OTHER mount, collinear by construction
        // (§ cylinder 6). Mounts merge onto other joints like any joint does —
        // that is how a cylinder attaches — with the refusal rules keeping
        // welded targets and the part's own joints out. Slot drops stay off
        // the table: a mount never rides a slot.
        const draggedCylinders = this.mechanismSrv.cylindersAt(this.activeObjService.selectedJoint);
        if (draggedCylinders.length > 0) {
          this.updateDropCandidate(mousePosInSvg, $event.altKey);
          this.slotCandidate = undefined;
          this.axisSnapGuides = [];
          // Snap to the axis of the ram the gesture is most obviously about --
          // the first -- but re-pose all of them, so a mount two rams share
          // does not drag one and deform the other.
          const wanted = this.snapTargetJoint
            ? new Coord(this.snapTargetJoint.x, this.snapTargetJoint.y)
            : this.mountAxisSnap(
                draggedCylinders[0],
                this.activeObjService.selectedJoint,
                mousePosInSvg
              );
          // Through dragJoint rather than straight at dragCylinderMount, so a
          // mount two rams share is agreed between them before either moves.
          this.gridUtils.dragJoint(this.activeObjService.selectedJoint, wanted);
          // The same answer every other drag gets from the holds: the line the
          // mount may slide on, and the refusal when it may not. A cylinder can
          // hold its own angle now, so a mount is as much a joint the holds
          // speak about as any other, and this branch was the one place that
          // never asked.
          this.afterHoldMove(this.activeObjService.selectedJoint);
          // Not announced. The mount stops following the cursor at the
          // shortest ram there is, and a part that stops moving under your own
          // hand has already said so.
          this.dragState.noteMechanismModified();
          this.activeObjService.updateSelectedObj(this.activeObjService.selectedJoint);
          this.showPathWhileDragging();
          break;
        }
        this.updateDropCandidate(mousePosInSvg, $event.altKey);
        // A capture has a target of its own, so any axis the last move squared
        // itself against is no longer what decides where the joint goes.
        this.axisSnapGuides = [];
        // Captured: the joint sits exactly on the target instead of trailing the
        // cursor, so what is on screen is what a release would produce.
        // A slot capture pulls the joint onto the slot line the same way, so a
        // drop-on-link is as unsurprising as a drop-on-joint (§4.3).
        this.activeObjService.selectedJoint = this.gridUtils.dragJoint(
          this.activeObjService.selectedJoint,
          this.snapTargetJoint
            ? new Coord(this.snapTargetJoint.x, this.snapTargetJoint.y)
            : this.slotCandidate
              ? new Coord(this.slotCandidate.x, this.slotCandidate.y)
              : this.alongItsSlot(
                  this.activeObjService.selectedJoint,
                  // Last, and only here: a capture is a target the reader
                  // picked, and a joint on a slot has a line to stay on. The
                  // grid gets the position nothing else has a claim on.
                  this.svgGrid.snapToGrid(mousePosInSvg, $event.altKey)
                )
        );
        this.afterHoldMove(this.activeObjService.selectedJoint);
        this.dragState.noteMechanismModified();
        //So that the panel values update continously
        this.activeObjService.updateSelectedObj(this.activeObjService.selectedJoint);
        this.showPathWhileDragging();
        break;
      }
    }
    switch (this.dragState.link) {
      case linkStates.creating:
        break;
      case linkStates.dragging: {
        if (!this.canEditNow() || !this.pastDragThreshold($event)) {
          return;
        }
        // One carried joint is locked: the drag is a swing about it. The body
        // turns by however far the cursor's bearing from the pivot changed
        // since the last move, so the grabbed point tracks the cursor's angle
        // without ever leaving its own radius.
        if (this.linkRotationPivot) {
          const pivot = this.linkRotationPivot;
          const bearing = Math.atan2(mousePosInSvg.y - pivot.y, mousePosInSvg.x - pivot.x);
          const theta = bearing - this.linkRotationGrabAngle;
          this.linkRotationGrabAngle = bearing;
          const swungCylinder = this.mechanismSrv.cylinderAt(this.activeObjService.selectedLink);
          if (swungCylinder) {
            this.gridUtils.rotateCylinder(swungCylinder, pivot, theta);
          } else {
            this.gridUtils.rotateLink(this.activeObjService.selectedLink, pivot, theta);
          }
          this.dragState.noteMechanismModified();
          this.activeObjService.updateSelectedObj(this.activeObjService.selectedLink);
          this.showPathWhileDragging(this.activeObjService.selectedLink);
          break;
        }
        // Measured from where the body was last placed, not from the previous
        // pointer event: the moves held back below the click threshold would
        // otherwise be lost motion, leaving the link trailing the cursor by
        // however far the hold lasted.
        const bodyCylinder = this.mechanismSrv.cylinderAt(this.activeObjService.selectedLink);
        if (bodyCylinder) {
          // Dragging the body translates the whole assembly rigidly; the
          // mounts are the handles for re-posing. It follows the cursor freely,
          // the same way a bar does, measured on the mount the ram is named
          // from.
          const mount = bodyCylinder.barrelFar;
          const target = this.placeDraggedBody(mount, mousePosInSvg, $event.altKey);
          this.gridUtils.dragCylinder(bodyCylinder, target.x - mount.x, target.y - mount.y);
          this.linkDragAnchor = mousePosInSvg;
          this.dragState.noteMechanismModified();
          this.activeObjService.updateSelectedObj(this.activeObjService.selectedLink);
          this.showPathWhileDragging(this.activeObjService.selectedLink);
          break;
        } else {
          // The body travels by however far the cursor has, measured on the
          // joint the link is named from. Measured from where the grab started,
          // not from the last frame: one pointer event is a few units, which
          // rounds to no move at all, and a link asked frame by frame would sit
          // on its corner for ever.
          const reference = this.activeObjService.selectedLink.joints[0];
          const landed = this.placeDraggedBody(reference, mousePosInSvg, $event.altKey);
          this.gridUtils.dragLink(
            this.activeObjService.selectedLink,
            landed.x - reference.x,
            landed.y - reference.y
          );
          this.linkDragAnchor = mousePosInSvg;
          this.dragState.noteMechanismModified();
          this.activeObjService.updateSelectedObj(this.activeObjService.selectedLink);
          this.showPathWhileDragging(this.activeObjService.selectedLink);
          break;
        }
      }
    }
    switch (this.dragState.force) {
      case forceStates.creating:
        this.creatingForce($event);
        break;
      case forceStates.draggingEnd:
        if (!this.canEditNow()) {
          return;
        }
        //The 3rd params could be this.selectedFroceEndPoint == 'startPoint'
        this.gridUtils.dragForce(this.activeObjService.selectedForce, mousePosInSvg, 'direction');
        //So that the panel values update continously
        this.activeObjService.fakeUpdateSelectedObj();
        this.dragState.noteMechanismModified();
        break;
      case forceStates.draggingStart:
        if (!this.canEditNow()) {
          return;
        }
        this.moveForceAnchor(mousePosInSvg, 'anchor');
        break;
      // Grabbing the arrow itself carries the whole force. `moveAnchor` already
      // translates both ends, so this is the same move as dragging the start —
      // less the jump, because where inside the arrow it was picked up is kept.
      case forceStates.draggingBody:
        if (!this.canEditNow()) {
          return;
        }
        this.moveForceAnchor(
          new Coord(
            mousePosInSvg.x - this.forceGrabOffset.x,
            mousePosInSvg.y - this.forceGrabOffset.y
          ),
          'whole'
        );
        break;
    }
  }

  /**
   * The pivot of the current link drag, when one carried joint is locked.
   * Set at the grab and read per pointer move; a drag with no locked joint
   * clears it, so a stale pivot cannot outlive its gesture.
   */
  private linkRotationPivot?: Coord;
  private linkRotationGrabAngle = 0;

  /**
   * The refusal a press on a held object has earned but not yet been given.
   * Spoken only when the pointer actually tries to move — a plain click is a
   * selection, and selecting a locked object is the way to its own Unlock
   * button, not an offense. Cleared on release.
   */
  private heldGestureNotice?: () => void;

  /**
   * Arm a refusal for this press, unless one is already armed.
   *
   * First wins, because the first is the outer reason: in an analysis mode
   * nothing moves whatever the locks say, and telling a reader to unlock a
   * joint that would still not move is sending them to fix the wrong thing.
   */
  private holdNotice(say: () => void): void {
    this.heldGestureNotice ??= say;
  }

  // `refuseAnalysisDrag` was here: "Geometry is fixed while analyzing. Switch
  // to Edit mode to move this part." Nothing is fixed while analyzing any more,
  // so the sentence would be false. What an analysis mode still refuses --
  // adding, deleting, welding -- is said by the context menu's grayed rows, in
  // the model's own words.

  /**
   * The padlock the canvas badges wear. Unlike lock.svg's fully hollow
   * outline, the body here is solid — at joint size the hollow body read as
   * a thin frame and disappeared, and the badge is a mark, not a control.
   */
  readonly lockGlyphPath = 'M7 10V7a5 5 0 0 1 10 0v3h2.5v11h-15V10H7Zm2 0h6V7a3 3 0 0 0-6 0v3Z';

  /**
   * Where a badge sits when the center spot is already taken: a force's anchor
   * is a small dark disc a centered glyph would vanish into, and a welded
   * joint's plus-mark is the very thing a centered chip covered. A plain
   * joint's badge takes no shoulder and stands dead center, on `upright`
   * alone -- the joint's own cream circle is chip enough behind it.
   */
  lockBadgeShoulder(): ModelPoint {
    const offset = 0.19 * this.settings.objectScale;
    return { x: offset, y: offset };
  }

  /** Center the 24-unit glyph on the badge point, sized to the drawing. */
  lockGlyphTransform(): string {
    const scale = (0.17 * this.settings.objectScale) / 24;
    return `scale(${scale}) translate(-12, -13.5)`;
  }

  /**
   * The joints a drag of this link would carry, filtered to the ones the
   * current Lock marks hold still. Carried means moved *as a body*: the
   * link's own joints, the coincident block joints riding them, and a sealed
   * cylinder's five.
   *
   * A floating slider riding this link is not among them, locked or not. Its
   * mark holds where it sits along the slot, and moving the link moves the
   * slot with the block still at that place on it — so a locked block is no
   * reason to refuse the drag, and pivoting the link about one would be
   * anchoring a point nothing asked to have held.
   */
  private frozenCarriedJoints(link: Link): Joint[] {
    const carried = new Map<string, Joint>();
    const add = (joint: Joint) => carried.set(joint.id, joint);
    const bodyCylinder = this.mechanismSrv.cylinderAt(link);
    if (bodyCylinder) {
      cylinderJoints(bodyCylinder).forEach(add);
    } else {
      link.joints.forEach((joint) => {
        add(joint);
        if (!(joint instanceof RealJoint)) return;
        joint.links.forEach((other) => {
          if (other instanceof SliderBlock) other.joints.forEach(add);
        });
      });
    }
    const frozen = this.gridUtils.frozenJointIds();
    return [...carried.values()].filter((joint) => frozen.has(joint.id));
  }

  /** Refuse a joint drag because the joint is held, naming what holds it. */
  private refuseLockedJoint(joint: RealJoint): boolean {
    if (!this.gridUtils.isJointFrozen(joint)) return false;
    const holds = this.gridUtils.locksHolding(joint);
    // A mark on the other half of a block counts as this joint's own: the two
    // are the same point, and only one of them has a letter the reader can see
    // to unlock.
    const block = joint.links.find((link): link is SliderBlock => link instanceof SliderBlock);
    const itself = new Set([joint.id, ...(block?.joints.map((member) => member.id) ?? [])]);
    const heldByItself = holds.some((lock) => itself.has(lock.id));
    const slider = this.mechanismSrv.sliderFor(joint);
    // A locked block has not been pinned to the grid — its slot is free to
    // move and will take it along. What it cannot do is slide, so that is what
    // the refusal says; "is locked" alone would promise a stillness this mark
    // does not buy.
    const text = !heldByItself
      ? `Joint ${joint.name} is on a locked ${this.lockNoun(holds)}.`
      : slider?.isFloating
        ? `Slider ${joint.name} is locked to its place in the slot.`
        : `Joint ${joint.name} is locked.`;
    this.refuseWithUnlock('lock.joint', text, holds);
    return true;
  }

  private refuseHeldLink(link: Link, held: Joint[]): void {
    const holds = this.uniqueLocks(held.flatMap((joint) => this.gridUtils.locksHolding(joint)));
    const text = this.mechanismSrv.isLockedTarget(link)
      ? this.mechanismSrv.cylinderAt(link)
        ? 'This cylinder is locked.'
        : `Link ${link.name} is locked.`
      : 'Two of the joints this drag would carry are locked. Unlock one to swing the body about the other.';
    this.refuseWithUnlock('lock.link', text, holds);
  }

  /** Whether the held-value chips are drawn: when the lock marks are, in Edit. */
  holdsVisible(): boolean {
    return this.mechanismSrv.lockVisualsOn();
  }

  /** The joint a hold has just refused to move, ringed in red while it is. */
  holdRing?: RealJoint;
  /** Where the dragged joint may go, when a single held bar decides that. */
  holdGuide?:
    | { kind: 'arc'; cx: number; cy: number; r: number }
    | { kind: 'line'; x1: number; y1: number; x2: number; y2: number };

  /**
   * After a move went through the holds: ring and say what they refused, or
   * clear the ring; and draw the freedom the dragged joint has left.
   */
  private afterHoldMove(joint: RealJoint): void {
    const refusal = this.gridUtils.lastHoldRefusal;
    if (refusal) {
      this.holdRing = joint;
      if (refusal.immovable.length > 0) this.refuseHeldByHolds(joint, refusal.bars);
      else this.refuseBeyondHolds(joint, refusal.bars);
    } else {
      this.holdRing = undefined;
    }
    this.holdGuide = this.holdGuideFor(joint);
  }

  /**
   * The arc or the line a joint on exactly one held bar slides on, when the
   * bar's other end is not going anywhere. With more holds in play, or a free
   * far end that gets towed, the freedom is not a curve worth drawing.
   */
  private holdGuideFor(joint: RealJoint): NewGridComponent['holdGuide'] {
    const links = this.mechanismSrv.links;
    // From the solver's own bars rather than from the links: a cylinder's held
    // pair is its two mounts, and neither of them is a joint of the link the
    // hold is written on.
    const cylinders = this.mechanismSrv.sealedStructures();
    const bars = heldBars(links, cylinders);
    const at = bars.filter((bar) => bar.a === joint.id || bar.b === joint.id);
    if (heldBarsReaching(joint, links, cylinders).length !== 1 || at.length !== 1) return undefined;
    const bar = at[0];
    const other = this.mechanismSrv.joints.find(
      (end) => end.id === (bar.a === joint.id ? bar.b : bar.a)
    );
    if (!(other instanceof RealJoint) || !this.gridUtils.isHoldAnchor(other)) return undefined;
    if (bar.hold === 'length') {
      return {
        kind: 'arc',
        cx: other.x,
        cy: other.y,
        r: Math.hypot(joint.x - other.x, joint.y - other.y),
      };
    }
    const reach = 50 * this.settings.objectScale;
    const dx = Math.cos(bar.angle) * reach;
    const dy = Math.sin(bar.angle) * reach;
    return {
      kind: 'line',
      x1: other.x - dx,
      y1: other.y - dy,
      x2: other.x + dx,
      y2: other.y + dy,
    };
  }

  /** One refusal for a joint the holds will not let go where it was asked. */
  private refuseHeldByHolds(joint: RealJoint, bars: RealLink[]): void {
    this.notify.refusal(
      'hold.joint',
      `${heldBySentence(bars, this.mechanismSrv.joints)}. Release one to move joint ${joint.name || joint.id}.`,
      { actions: this.releaseAction(bars) }
    );
  }

  /** The joint can move, but not to there: the held bars run out of reach. */
  private refuseBeyondHolds(joint: RealJoint, bars: RealLink[]): void {
    this.notify.refusal(
      'hold.reach',
      `Joint ${joint.name || joint.id} can go no further while ${holdList(bars, this.mechanismSrv.joints)} holds.`,
      { actions: this.releaseAction(bars) }
    );
  }

  /** Release, not Unlock: an Unlock beside this would be the joint mark's word. */
  private releaseAction(bars: RealLink[]): { label: string; run: () => void }[] {
    return bars.length > 0
      ? [{ label: 'Release', run: () => this.mechanismSrv.releaseHolds(bars) }]
      : [];
  }

  /**
   * A held bar wears its held value as a chip, where the hover dimension for
   * that value would put its label: beside the bar for a length, in the
   * angle's wedge for an angle. Sized in screen pixels, so it reads the same
   * at any zoom.
   */
  heldChips(): { id: string; x: number; y: number; text: string; w: number }[] {
    const chips: { id: string; x: number; y: number; text: string; w: number }[] = [];
    // The solver's own bars, so a cylinder's chip sits in the wedge of the
    // angle it is actually holding -- mount to mount -- rather than in the
    // barrel's, which is a pair of joints inside the part.
    for (const bar of heldBars(this.mechanismSrv.links, this.mechanismSrv.sealedStructures())) {
      const link = this.mechanismSrv.links.find((one) => one.id === bar.id);
      if (!(link instanceof RealLink) || this.mechanismSrv.isLockedTarget(link)) continue;
      const a = this.mechanismSrv.joints.find((joint) => joint.id === bar.a);
      const b = this.mechanismSrv.joints.find((joint) => joint.id === bar.b);
      if (!a || !b) continue;
      const hold = bar.hold;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const span = Math.hypot(dx, dy) || 1;
      const text =
        hold === 'length'
          ? this.nup.formatModelLength(span, this.settings.lengthUnit.getValue())
          : // The same reading as the panel's field and the hover pill: atan2's,
            // signed, so a bar pointing down reads -37 deg on all three.
            this.nup.formatValueAndUnit(
              this.nup.convertAngle(
                (Math.atan2(dy, dx) * 180) / Math.PI,
                AngleUnit.DEGREE,
                this.settings.angleUnit.getValue()
              ),
              this.settings.angleUnit.getValue()
            );
      const w = this.pillWidth(text, true);
      // Where the hover dimension labels that value, so hovering the field
      // adds the hairline and nothing else: the chip is the label. A length's
      // chip then moves along the bar, away from the name, so the center is
      // left to the center-of-mass mark.
      const at =
        hold === 'length'
          ? this.lengthLabelAt(a.x, a.y, b.x, b.y)
          : this.angleLabelAt(a.x, a.y, b.x, b.y);
      if (hold === 'length') {
        const placed = this.lengthChipPlace(link, w);
        if (placed) {
          at.x = placed.x;
          at.y = placed.y;
        }
      }
      chips.push({ id: link.id, x: at.x, y: at.y, text, w });
    }
    return chips;
  }

  /**
   * Whether the value the hover dimension is about is locked on the selected
   * bar, in which case its chip already labels it and the pill stays away.
   */
  overlayValueLocked(which: 'length' | 'angle'): boolean {
    if (this.activeObjService.objType !== 'Link') return false;
    const link = this.activeObjService.selectedLink;
    return this.mechanismSrv.holdOf(link) === which && !this.mechanismSrv.isLockedTarget(link);
  }

  /** Where a length's label goes: the middle of the bar. */
  private lengthLabelAt(x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }

  /** Where an angle's label goes: out along the half angle from the first joint. */
  private angleLabelAt(x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
    const offSetRadius = SettingsService.objectScale * 2;
    const midAngle = Math.atan2(y2 - y1, x2 - x1) / 2;
    return { x: x1 + offSetRadius * Math.cos(midAngle), y: y1 + offSetRadius * Math.sin(midAngle) };
  }

  /**
   * How far the link's name steps up from the center, in the label's own
   * units: clear of the center-of-mass mark, and clear of a locked length's
   * chip, which is a screen-sized pill and so needs a zoom-sized step.
   */
  linkLabelLift(link: Link): number {
    // A bar's name has already moved along the bar; only a body steps up.
    if (this.barAxis(link)) return 0;
    return this.showsCoM(link) ? -this.settings.objectScale * 0.13 : 0;
  }

  /** The label of the length hover dimension, as the panel spells it. */
  lengthOverlayLabel(): string {
    return this.nup.formatModelLength(
      this.getLengthBetweenOverlayPoints(),
      this.settings.lengthUnit.getValue()
    );
  }

  /** The label of the angle hover dimension, as the panel spells it. */
  angleOverlayLabel(): string {
    return this.nup.formatValueAndUnit(
      this.getAngleBetweenOverlayPoints(),
      this.settings.angleUnit.getValue()
    );
  }

  /** A pill wide enough for its words, in screen pixels at the current zoom. */
  pillWidth(text: string, withGlyph = false): number {
    return this.svgGrid.scaleWithZoom((withGlyph ? 32 : 20) + text.length * 7.2);
  }

  private refuseLockedForce(force: Force): void {
    this.refuseWithUnlock('lock.force', `Force ${force.name} is locked.`, [force]);
  }

  /** One refusal, carrying its own way out. */
  private refuseWithUnlock(id: string, text: string, holds: Lockable[]): void {
    this.notify.refusal(id, text, {
      actions:
        holds.length > 0 ? [{ label: 'Unlock', run: () => this.mechanismSrv.unlock(holds) }] : [],
    });
  }

  private uniqueLocks(locks: Lockable[]): Lockable[] {
    return locks.filter((lock, index) => locks.indexOf(lock) === index);
  }

  /**
   * What kind of thing holds this joint, for the refusal's sentence. Marks
   * live on joints, so the question is what the marked joint *is*: part of a
   * sealed cylinder, one of a link's fully-marked joints, or just itself.
   */
  private lockNoun(holds: Lockable[]): string {
    const joint = holds.find((lock): lock is RealJoint => lock instanceof RealJoint);
    if (!joint) return 'object';
    if (this.mechanismSrv.cylinderAt(joint)) return 'cylinder';
    const lockedLink = joint.links.find((link) => this.mechanismSrv.isLockedTarget(link));
    if (lockedLink) return `link ${lockedLink.name}`;
    return `joint ${joint.name}`;
  }

  /**
   * Whether an edit is allowed right now.
   *
   * Editing is only defined at the t=0 pose in Edit mode: the solved timesteps
   * are derived from it, so a change made anywhere else has nothing to write to.
   *
   * Silently. Each of these used to announce itself, and each was saying
   * something the reader could already see — which mode they are in is written
   * across the top strip and down the side of the window, and whether the
   * animation is running is the thing they are watching. A message for it was
   * a fifth place saying the same word.
   */
  private canEditNow(): boolean {
    // One question, asked of the one thing that answers it. This used to be
    // three tests here and near-identical tests in four other files, and they
    // did not agree: three read the *shared* clock, so with the machines
    // unsynced and one row scrubbed mid-cycle the canvas allowed a drag
    // against a displaced pose while undo refused. See `EditPermissionService`.
    return this.permission.may('drag');
  }

  /**
   * Taking hold of a moving part stops it, at the frame it was showing.
   *
   * The last piece of the video-scrubbing instinct: "pause, then edit" becomes
   * one motion, and it is the same rule on both pointers. Before the gesture is
   * classified, deliberately -- what happens next is a drag, a tap or a long
   * press, and every one of them wants the machine standing still. The gesture
   * arbiter downstream is untouched: no drag has begun until the threshold
   * passes, so a finger's tremor pauses and never edits, and resuming is one
   * tap on Play.
   *
   * Only a movable part. Panning must not stop the show, so a press on empty
   * canvas is not a grab. An analysis mode used to be excluded too, on the
   * grounds that a press there could only be picking a part for its graphs --
   * which stopped being true when a drag became an edit there.
   */
  private grabToPause(clickedObj: Joint | Link | string | Force | SynthesisPose): void {
    if (!this.mechanismSrv.isPlaying) return;
    if (typeof clickedObj === 'string' || clickedObj instanceof SynthesisPose) return;
    this.mechanismSrv.pauseInPlace();
    this.settings.animating.next(false);
  }

  // ---- the start-pose ghost (docs/edit-mode-playback-plan.md §6.1) ---------

  /**
   * Whether to draw where the machines start.
   *
   * Only when the mechanism is not already showing it, and only in Edit: the
   * analysis modes are read-only, so nothing there can move the start and a
   * second skeleton would be decoration over the graphs' own subject.
   */
  showStartGhost(): boolean {
    // Wherever a drag can move the start, which is now the analysis modes as
    // well. It is not decoration there: a drag at a displaced pose re-anchors
    // underneath it, and the ghost is the surface that warns when the start is
    // about to be lost. Synthesis has no mechanism to have a start.
    return (
      this.tabService.getCurrentTab() !== TabID.SYNTHESIZE && !this.mechanismSrv.isAtStartPose()
    );
  }

  startGhosts(): StartPoseGhost[] {
    return this.mechanismSrv.startPoseGhosts();
  }

  /**
   * The traced paths to draw while something is being dragged: one per joint
   * the gesture is moving.
   *
   * A joint gets its own; a link gets one for every joint on it, so a plate
   * dragged by its body shows all three curves and the reader sees the whole
   * part swing rather than one corner of it.
   *
   * Literally the app's own traced path -- the same curve `getJointPath` draws
   * for a joint the reader has switched tracing on for, in the same ink at the
   * same weight -- rather than a mark invented for this one occasion. It was a
   * dashed arc cut to the part of the cycle the gesture had covered, which is a
   * second vocabulary for a question the app already answers, and the shorter
   * answer at that: what a reader tuning a linkage wants to see is the whole
   * path the joint will take, changing under their hand.
   *
   * Additive, and temporary: a joint already tracing is left to the paths
   * holder rather than drawn twice over itself, and nothing here switches
   * anything on or off in the drawing.
   */
  dragArcs(): string[] {
    const dragging =
      this.dragState.joint === jointStates.dragging || this.dragState.link === linkStates.dragging;
    if (!dragging) return [];
    const joints =
      this.dragState.link === linkStates.dragging
        ? (this.activeObjService.selectedLink?.joints ?? [])
        : [this.activeObjService.selectedJoint];
    const alreadyDrawn = this.tracesVisible();
    return joints
      .filter((joint) => !!joint && !(alreadyDrawn && this.gridUtils.getJointShowCurve(joint)))
      .map((joint) => this.mechanismSrv.getJointPath(joint!))
      .filter((path) => !!path);
  }

  /**
   * How many readings in a row have said a machine cannot reach its start.
   *
   * The check is exact, but the *geometry* it is asked about crosses the
   * boundary continuously: a crank hovering on the edge of Grashof flips the
   * answer every few pixels, and a tag flickering under the reader's own hand
   * is worse than no tag. Three agreeing readings is a few frames and settles
   * it, at the cost of a warning that arrives a moment late -- which is the
   * right way round, because the commit is what it is warning about.
   */
  private ghostDoubts = new Map<number, number>();
  private ghostDoubtsAt = -1;
  private static readonly GHOST_SETTLES_AFTER = 3;

  /**
   * Above the skeleton, clear of everything drawn on it.
   *
   * Centered over the ghost's own span and lifted off its topmost pin, rather
   * than pinned to one joint: whichever joint that is, something is drawn on it
   * -- a ground's hatching, an input's motor box -- and the words went behind.
   *
   * In the drawing's own coordinates, which is what `upright` wants and what
   * every other tag on the canvas hands it. The template used to negate the y
   * on the way past, which mirrored the pill across the x-axis and left it
   * nowhere near the ghost or the pointer it is about.
   */
  ghostTagAt(ghost: StartPoseGhost): ModelPoint {
    // On the pointer, 20px off its tip, rather than over the ghost.
    //
    // It was centered over the ghost's own span, which is a place the reader is
    // not necessarily looking and which the drawing's own marks -- a ground's
    // hatching, an input's motor box -- kept getting in the way of. The pointer
    // is the one thing on screen they are definitely looking at, and while this
    // tag is on screen the pointer is down on the thing it is about.
    //
    // Only while a gesture is live: released, the pointer is not where the
    // reader's attention is any more, and the tag falls back to the ghost.
    if (this.dragState.isPointerDown) {
      const off = this.svgGrid.scaleWithZoom(20);
      return { x: this.mouseLocation.x + off, y: this.mouseLocation.y + off };
    }
    const xs = ghost.pins.map((pin) => pin.x);
    const ys = ghost.pins.map((pin) => pin.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: Math.max(...ys) + this.svgGrid.scaleWithZoom(26),
    };
  }

  /** Press the picture of the start pose to go there. */
  goToStart(ghost: StartPoseGhost): void {
    this.mechanismSrv.pauseInPlace();
    this.settings.animating.next(false);
    this.mechanismSrv.easeToStart();
    // A press that landed on the ghost was never a press on the grid, so the
    // selection it would otherwise have cleared stays where the reader put it.
    this.dragState.cancel();
  }

  ghostWarns(ghost: StartPoseGhost): boolean {
    // The warning narrates a gesture: "letting go moves the start here" is
    // only true while something is being held. Between gestures the answer is
    // no, whatever the counters say -- they are advanced by solves, and a
    // release that could not re-anchor runs no solve, so they stood at their
    // mid-drag count and the pill stayed up over a drawing the reader had
    // already let go of.
    if (!this.mechanismSrv.posedEditKey) {
      // And the next gesture starts its count from nothing, with the same
      // three solves' grace at the boundary as the first one had.
      this.ghostDoubts.clear();
      return false;
    }
    this.settleGhostDoubts();
    return (this.ghostDoubts.get(ghost.index) ?? 0) >= NewGridComponent.GHOST_SETTLES_AFTER;
  }

  /**
   * Advance the doubt counters once per solve, not once per read.
   *
   * A getter the template calls must be a *question*, not a step. Counting
   * inside `ghostWarns` made it both: Angular checks an expression, then checks
   * it again to prove nothing moved, and the second read had already been
   * counted -- so the answer changed between the two and a drag past the
   * boundary raised NG0100.
   *
   * Keyed on the solve, which is what the ghosts themselves are cached against,
   * so the count and the thing it is counting cannot fall out of step.
   */
  private settleGhostDoubts(): void {
    if (this.ghostDoubtsAt === this.mechanismSrv.solveRevision) return;
    this.ghostDoubtsAt = this.mechanismSrv.solveRevision;
    // Every machine, not only the ones with a ghost this solve: a count left
    // behind by a machine whose ghost went away would greet its next ghost
    // as already past the threshold.
    const was = this.ghostDoubts;
    this.ghostDoubts = new Map<number, number>();
    this.mechanismSrv.startPoseGhosts().forEach((ghost) => {
      this.ghostDoubts.set(ghost.index, ghost.reachable ? 0 : (was.get(ghost.index) ?? 0) + 1);
    });
  }

  /**
   * Whether the pointer has committed to a drag rather than a click. A short
   * press is held back so that selecting an object does not nudge it; moving
   * far enough overrides the hold, because by then the intent is unambiguous.
   */
  private pastDragThreshold($event: MouseEvent): boolean {
    if (getDistance(new Coord(this.startX, this.startY), new Coord($event.x, $event.y)) > 10) {
      this.timeMouseDown = 0;
    }
    // A finger that has not yet decided whether it is a press holds the drag
    // off entirely, however long it has been down. The 100ms below is a mouse's
    // number: a press is a click or it is a drag, and neither takes half a
    // second. A long press does, and every tremor in that half second used to
    // move the joint the reader was trying to open a menu on -- about thirty
    // model units, silently, before the menu even appeared. The ten pixels is
    // the same on both sides, so exactly one of the two ever happens.
    const gestures = this.longPress();
    if (gestures?.pressPending || gestures?.pinching) return false;
    return !(this.timeMouseDown !== undefined && Date.now() - this.timeMouseDown < 100);
  }

  /** How close a dragged joint has to get to another before it will merge. */
  private snapRadius(): number {
    return this.settings.objectScale * 0.4;
  }

  /**
   * Mark the joint the drag is aimed at. Holding Alt suppresses snapping
   * outright, which is the only way to park a joint on top of another without
   * merging the two.
   */
  private updateDropCandidate(mousePos: Coord, altHeld: boolean): void {
    const candidate = altHeld
      ? undefined
      : resolveDropCandidate(
          this.activeObjService.selectedJoint,
          mousePos.x,
          mousePos.y,
          // A sealed cylinder's interior joints are not attachment points, so
          // they never capture a drop; the mounts remain ordinary targets.
          this.mechanismSrv.joints.filter((joint) => !this.isCylinderInterior(joint)),
          this.snapRadius(),
          // The full structural picture rides along separately: the filtered
          // list above cannot answer mount questions (the pins are gone), and
          // this is the cached list, not a per-move derivation.
          this.mechanismSrv.sealedStructures()
        );
    this.setDropCandidate(candidate);

    // Joint snap wins outright when both are in range (§4.3). A joint is the
    // more specific intent and the only one that can be aimed at precisely, so
    // the slot preview only appears where no joint is claiming the drop -- which
    // is also what makes the two distinguishable before release: you either see
    // a ring on a joint, or a channel opening in a bar, never both.
    // A joint you are not allowed to merge with is still a joint you are aiming
    // at. `resolveDropCandidate` deliberately says nothing about the far end of
    // your own link -- the drawing already says the two are joined, so there is
    // no rule there worth explaining -- but dropping on top of it must not then
    // quietly cut a slot into whatever else passes through that point. Landing
    // a joint on a joint gave the four-bar a fifth one.
    const overAJoint = this.mechanismSrv.joints.some(
      (joint) =>
        joint.id !== this.activeObjService.selectedJoint?.id &&
        !(joint instanceof PrisJoint) &&
        Math.hypot(joint.x - mousePos.x, joint.y - mousePos.y) < this.snapRadius()
    );
    this.slotCandidate =
      altHeld || candidate || overAJoint
        ? undefined
        : resolveSlotDropTarget(
            this.activeObjService.selectedJoint,
            mousePos.x,
            mousePos.y,
            // No slot is ever cut into a sealed cylinder's members: the
            // barrel's one slot is the part's own bore.
            this.mechanismSrv.links.filter(
              (link) => link instanceof RealLink && !this.isCylinderMemberLink(link)
            ),
            this.slotDropRadius()
          );
  }

  /**
   * Where a block in a channel is allowed to go (§4.4).
   *
   * Dragging the block along its slot sets s₀ and changes nothing else, so the
   * drag is projected onto the slot line and clamped to the span the channel
   * actually occupies — the block cannot leave a hole it is inside of, and one
   * drag stays one quantity.
   *
   * Only for a floating slot. A grounded guide's line is fixed in the world
   * rather than cut into a body, so dragging its joint repositions the whole
   * guide; constraining that would leave no way to move a guide at all.
   */
  private alongItsSlot(joint: Joint, wanted: Coord): Coord {
    const slider = this.mechanismSrv.sliderFor(joint);
    if (!slider?.isFloating || !slider.isSlotWellFormed) return this.withAxisSnap(joint, wanted);

    const a = slider.slotJointA!;
    const b = slider.slotJointB!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return wanted;

    const ux = dx / length;
    const uy = dy / length;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const half = slotHalfLength(0.15 * this.settings.objectScale, length);
    const offset = (wanted.x - midX) * ux + (wanted.y - midY) * uy;
    const across = -(wanted.x - midX) * uy + (wanted.y - midY) * ux;

    // Sticky, then it lets go (§4.4). Sliding along the slot is by far the
    // commoner intent, so the block stays on its line through any amount of
    // sideways wobble -- but a slot is not a life sentence, and pulling clear
    // of the bar is the one gesture that plainly means "take this off here".
    // What is left behind is the dangling block: a slider with nowhere to
    // slide, drawn red until it is dropped on a link again.
    if (Math.abs(across) > this.slotReleaseDistance()) {
      this.mechanismSrv.detachSlider(slider);
      return this.withAxisSnap(joint, wanted);
    }

    const along = Math.max(-half, Math.min(half, offset));
    return new Coord(midX + along * ux, midY + along * uy);
  }

  /**
   * How far across its own slot a block has to be pulled before it comes out.
   *
   * Two bar-widths: far enough that no ordinary along-the-slot drag reaches it
   * by accident, close enough that deliberately pulling the block off the bar
   * does it on the first try.
   */
  private slotReleaseDistance(): number {
    return 4 * MARK.barHalf * 0.15 * this.settings.objectScale;
  }

  /**
   * Where a whole body being dragged should put its reference point.
   *
   * The cursor's own displacement, and nothing else. A body drag gets neither
   * of the two helps a joint drag gets, and for the same reason in both cases:
   * they act on the body's reference joint, which is whichever joint the link
   * is named from -- not the point under the hand. So the guide line appeared
   * at a corner the reader was not holding, naming a neighbor they had not
   * aimed at, and the body jumped a fraction of a grid square sideways to put
   * one of its several joints on a corner the others could not reach anyway.
   *
   * A joint dragged on its own still squares up and still lands on the grid:
   * there the thing that snaps is the thing in your hand.
   */
  private placeDraggedBody(
    reference: { x: number; y: number },
    cursor: Coord,
    suspended = false
  ): Coord {
    // Measured from the press, not from this first qualifying move: the moves
    // held back below the click threshold are still part of the gesture, and
    // starting the sum after them leaves the body trailing the cursor by
    // however far the hold lasted.
    this.bodyDragOrigin ??= {
      at: new Coord(reference.x, reference.y),
      from: new Coord(this.linkDragAnchor.x, this.linkDragAnchor.y),
    };
    const held = this.bodyDragOrigin;
    this.axisSnapGuides = [];
    const wanted = new Coord(
      held.at.x + (cursor.x - held.from.x),
      held.at.y + (cursor.y - held.from.y)
    );
    // On a corner, the same as a dragged joint. The measuring above exists for
    // this: a body asked frame by frame rounds a few units of travel to no
    // travel at all and never leaves the corner it is on -- which is what the
    // note above is about, and the rounding it is about was never applied.
    // Only the reference joint lands there; the rest of the body keeps its own
    // shape, because a bar has the length it has.
    return this.svgGrid.snapToGrid(wanted, suspended);
  }

  /** Lines showing which joints a drag has just squared itself against. */
  public axisSnapGuides: SnapGuide[] = [];

  /**
   * Whether the Option key is down, meaning "no help from the app".
   *
   * Read at the top of every move rather than passed down: the axis snap is
   * reached through `alongItsSlot`, three call sites deep, and a flag set once
   * a gesture is easier to keep true than a parameter threaded through all of
   * them.
   */
  private snapSuspended = false;
  /** Whether Option was down at the right-click a creation gesture started from. */
  private snapSuspendedAtRightClick = false;

  /** Is the app allowed to square this drag up with anything? */
  private alignmentAllowed(): boolean {
    return this.settings.isSnapToAlignment.value && !this.snapSuspended;
  }

  /**
   * Pull a free drag onto a neighbor's axis when it is nearly on it.
   *
   * Only a free drag: a block is already constrained to its slot, and a capture
   * has a target of its own, so snapping either would be a second opinion about
   * where the joint goes.
   */
  private withAxisSnap(joint: Joint, wanted: Coord): Coord {
    if (!this.alignmentAllowed()) {
      this.axisSnapGuides = [];
      return wanted;
    }
    const others = this.mechanismSrv
      .getJoints()
      .filter((other) => other.id !== joint.id && !(other instanceof PrisJoint));
    const snapped = snapToAxes(wanted, others, this.svgGrid.scaleWithZoom(8));
    this.axisSnapGuides = snapped.guides;
    return new Coord(snapped.point.x, snapped.point.y);
  }

  /**
   * Axis snapping for a mount drag. The assembly's own joints are excluded:
   * they move with the drag, so squaring the mount against them would be the
   * drag chasing its own tail. Every other joint's H/V guides still work.
   */
  private mountAxisSnap(sealed: Cylinder, dragged: Joint | undefined, wanted: Coord): Coord {
    if (!this.alignmentAllowed()) {
      this.axisSnapGuides = [];
      return wanted;
    }
    const memberIds = new Set(cylinderJoints(sealed).map((joint) => joint.id));
    // All but the mount at the other end. That one does not move when this one
    // is dragged, so it is exactly the thing to square up against -- and
    // squaring a ram against its own far mount is what stands it at 0, 90 or
    // 180, which is what a bar has always been able to do against its own far
    // joint. The rest of the assembly travels with the drag, and squaring
    // against those is the drag chasing its own tail.
    const opposite = dragged?.id === sealed.barrelFar.id ? sealed.rodFar : sealed.barrelFar;
    memberIds.delete(opposite.id);
    const others = this.mechanismSrv
      .getJoints()
      .filter((other) => !memberIds.has(other.id) && !(other instanceof PrisJoint));
    const snapped = snapToAxes(wanted, others, this.svgGrid.scaleWithZoom(8));
    this.axisSnapGuides = snapped.guides;
    return new Coord(snapped.point.x, snapped.point.y);
  }

  /**
   * How close to a bar's centerline the cursor must get to cut a slot there.
   *
   * Half the bar's own width, so the drop has to be genuinely over the body
   * rather than merely near it — a slot is a hole through the bar, and offering
   * one while the cursor is off in open canvas reads as the bar grabbing at it.
   */
  private slotDropRadius(): number {
    return MARK.barHalf * 0.15 * this.settings.objectScale;
  }

  /**
   * The slot this drag would cut, previewed as the real thing.
   *
   * Not a stand-in: the previewed channel is pushed through the same path
   * subtraction a committed slot uses, so the hover state is pixel-identical to
   * the result and its legibility cannot depend on the carrier's random color.
   */
  public slotCandidate?: SlotDropCandidate;

  private setDropCandidate(candidate?: JointDropCandidate): void {
    // Capture starts further out than the joint's own hitbox, so pointerover
    // cannot be what lifts the target to its hovered fill.
    if (this.snapTargetJoint && this.snapTargetJoint !== candidate?.joint) {
      this.snapTargetJoint.showHighlight = false;
    }
    const captured = candidate && !candidate.refusal ? candidate.joint : undefined;

    // Which way the arrow points is latched the moment the ring appears, from
    // the side the joint was still on. Recomputing it per frame would flip it
    // back and forth as the cursor wanders across the target, and the joint has
    // by then been parked on top of it anyway, so there is nothing left to read.
    if (captured && captured !== this.snapTargetJoint) {
      this.mergeArrowReversed = this.activeObjService.selectedJoint.x > captured.x;
    }

    this.snapTargetJoint = captured;
    this.refusedTarget = candidate?.refusal ? candidate : undefined;
    if (this.snapTargetJoint) this.snapTargetJoint.showHighlight = true;
  }

  /**
   * `B → D` when this joint is the one a capture is about to merge into.
   *
   * A captured joint sits exactly on its target, so both names render at the
   * same point and overlap into an unreadable smudge. Naming the merge in one
   * label reads better than either name alone, and says which of the two
   * survives — which is not otherwise visible anywhere.
   */
  mergeLabelFor(joint: Joint): string {
    if (!this.snapTargetJoint || joint.id !== this.snapTargetJoint.id) return '';
    const source = this.activeObjService.selectedJoint;
    if (!source || source.id === joint.id) return '';
    return this.mergeArrowReversed
      ? `${joint.name} \u2190 ${source.name}`
      : `${source.name} \u2192 ${joint.name}`;
  }

  /** Whether this joint is the one being dragged into another. */
  isMergingAway(joint: Joint): boolean {
    return (
      !!this.snapTargetJoint &&
      joint.id === this.activeObjService.selectedJoint?.id &&
      joint.id !== this.snapTargetJoint.id
    );
  }

  /** The one-shot feedback animation playing on `joint`, if any. */
  jointEffectClass(joint: Joint): string {
    if (joint.id === this.shakingJointID) return 'jointShake';
    if (joint.id === this.poppingJointID) return 'jointPop';
    return '';
  }

  /**
   * Shake the dropped joint and say why it could not land where it was aimed.
   *
   * The reason is its own message rather than a shared "cannot drop here", so
   * dragging against one rule and then another says both instead of falling
   * silent on the second.
   */
  private refuseDrop(jointID: string, reason: MergeRefusal): void {
    this.notify.refusal(`merge.${reason}`, MERGE_REFUSAL_MESSAGES[reason]);
    this.shakingJointID = jointID;
    setTimeout(() => (this.shakingJointID = undefined), 420);
  }

  /** Pop the survivor of a merge, so the change is legible where it happened. */
  private popJoint(jointID: string): void {
    this.poppingJointID = jointID;
    setTimeout(() => (this.poppingJointID = undefined), 400);
  }

  /**
   * @param body the part the gesture is actually moving. A link drag has to
   * name its link: the selection is that link, so `selectedJoint` still holds
   * whichever joint was last clicked — nothing at all on a fresh load, and on a
   * drawing with two machines a joint of the *other* one, whose dof then
   * decided whether this machine drew its path.
   */
  private showPathWhileDragging(body?: Joint | Link): void {
    // The machine being dragged, not whichever was built first — and possibly
    // none at all, while a chain is still being drawn and has yet to reach
    // ground.
    const dragged = body ?? this.activeObjService.selectedJoint;
    const solved = dragged ? this.mechanismSrv.mechanismContaining(dragged) : undefined;
    if (!solved || solved.joints[0].length === 0) return;
    if (solved.dof !== 1) return;
    if (this.mechanismSrv.showPathHolder === false) {
      this.mechanismSrv.onMechUpdateState.next(1);
    }
    this.mechanismSrv.showPathHolder = true;
  }

  /**
   * Remember where the pointer was, so the gestures a row starts land there
   * and the card can grow from the corner nearest it.
   *
   * What the menu *contains* was decided by `setLastRightClick`, which the
   * element under the pointer fired first — including whether it contains
   * anything at all. The menu is open in every mode now: the analysis modes
   * get the trace switch and the way back into Edit, and Edit while the
   * mechanism is parked mid-cycle grays its editing rows with the reason
   * rather than refusing to open.
   */
  /** The gesture arbiter on the canvas, asked whether a press is undecided. */
  private longPress = viewChild(LongPressDirective);

  /** Set when a press turned into a menu, so its release places nothing. */
  private pressBecameMenu = false;

  /**
   * Put down whatever the canvas had hold of, whoever was holding it.
   *
   * The three lines the right-button path has always run, plus the synthesis
   * canvas -- which owns its gesture separately, because a position is a
   * question about a mechanism rather than part of one, and so is not in
   * `DragStateService` at all. A press that became a menu over a position left
   * that position still being dragged underneath it.
   */
  /**
   * Where every joint was when this drag took hold.
   *
   * Only the coordinates, and only for a pointer drag: it exists so a gesture
   * that turns out to have been about the view can put back what it moved on
   * the way to finding that out.
   */
  private beforeDrag?: {
    joints: { id: string; x: number; y: number }[];
    /**
     * And the forces. A load's endpoints are stored coordinates, not something
     * re-derived from the link it rides on -- so putting the joints back left
     * every force where the drag had dragged it, and a phone's view gesture
     * moved sample zero by a hundred and sixty units with nothing to undo it.
     */
    forces: { id: string; sx: number; sy: number; ex: number; ey: number }[];
  };

  private rememberBeforeDrag(): void {
    this.beforeDrag = {
      joints: this.mechanismSrv.joints.map((joint) => ({
        id: joint.id,
        x: joint.x,
        y: joint.y,
      })),
      forces: this.mechanismSrv.forces.map((force) => ({
        id: force.id,
        sx: force.startCoord.x,
        sy: force.startCoord.y,
        ex: force.endCoord.x,
        ey: force.endCoord.y,
      })),
    };
  }

  private putBackTheDrag(): void {
    const was = this.beforeDrag;
    this.beforeDrag = undefined;
    if (!was || !this.dragState.isDragging) return;
    const joints = new Map(was.joints.map((joint) => [joint.id, joint]));
    const forces = new Map(was.forces.map((force) => [force.id, force]));
    let moved = false;
    this.mechanismSrv.joints.forEach((joint) => {
      const back = joints.get(joint.id);
      if (!back) return;
      if (joint.x !== back.x || joint.y !== back.y) moved = true;
      joint.x = back.x;
      joint.y = back.y;
    });
    this.mechanismSrv.forces.forEach((force) => {
      const back = forces.get(force.id);
      if (!back) return;
      if (force.startCoord.x !== back.sx || force.startCoord.y !== back.sy) moved = true;
      force.startCoord.x = back.sx;
      force.startCoord.y = back.sy;
      force.endCoord.x = back.ex;
      force.endCoord.y = back.ey;
      force.forceLine = force.createForceLine(force.startCoord, force.endCoord);
      force.forceArrow = force.createForceArrow(force.startCoord, force.endCoord);
    });
    // Only where something actually moved: a press that never travelled -- a
    // pinch that began on a joint and simply zoomed -- must not be "restored"
    // and re-solved, because a re-solve of an unchanged drawing still rewrites
    // its coordinates in the last few decimal places.
    if (!moved) return;
    // Rebuilt while still staged, deliberately, and the caller cancels the
    // posed edit immediately afterwards. That order is the whole trick: this
    // rebuild solves a fresh cycle from the geometry just put back, and the
    // cancel then finds the anchor *in those frames* and makes it t = 0 again.
    // Cancelled first, the settle would be searching frames solved from the
    // geometry the drag had already changed.
    this.mechanismSrv.updateMechanism();
  }

  /**
   * Put down whatever the canvas had hold of.
   *
   * `revert` for the callers that are not a release at all -- a pinch, a long
   * press, a window losing focus. Those gestures never decided anything, so
   * what the pointer moved on the way to being recognized is put back rather
   * than committed.
   */
  private letGoOfEverything(revert = false): void {
    this.restoreSelectionAfterDrag(this.dragState.travelled);
    this.beforeDrag = undefined;
    this.linkCreateFrom = undefined;
    this.endComDrag?.(revert);
    this.endComDrag = undefined;
    this.dragState.cancel();
    // Including a staged posed edit. This is the path a pinch and a long press
    // take, and staging left behind outlives the gesture -- the next ambient
    // rebuild then reads "seed this machine from what is drawn" and turns the
    // displaced pose into the design. Letting go means letting go of that too.
    this.mechanismSrv.cancelPosedEdit();
    this.selectionGesture = undefined;
    this.pendingPartReplacement = undefined;
    this.selectionTogglePress = false;
    this.cylinderCreateStart = undefined;
    this.linkCreateStart = undefined;
    this.linkCreateFrom = undefined;
    if (this.showSynthesis()) this.synthCanvas.release();
  }

  onContextMenu($event: MouseEvent) {
    this.lastRightClickCoord.x = $event.clientX;
    this.lastRightClickCoord.y = $event.clientY;
    // Kept apart from `snapSuspended`, which every pointer move rewrites: the
    // reader lets Option go on the way to the menu row, and by the time the row
    // is pressed the live flag has long since forgotten it. For a gesture that
    // starts at the right-click, the right-click is when the key was meant.
    this.snapSuspendedAtRightClick = $event.altKey;
    // A menu is opening, so whatever the other button had hold of is over --
    // and putting a gesture down means putting the drawing back.
    //
    // This is where a right-click during a drag actually announces itself.
    // `mouseDownNow`'s button cases never see one: these bindings are
    // `pointerdown`, and the Pointer Events spec fires `pointerdown` only for
    // the *first* button -- a second button pressed while one is already down
    // arrives as a `pointermove` with different `buttons`. So the teardown that
    // was written into those cases could not run, and past the drag slop the
    // gesture had already moved something and staged the machine: the next
    // rebuild settled the moved geometry onto the anchor as though it had been
    // asked for, and an abandoned gesture mints no entry to undo it with.
    //
    // After `setLastRightClick`, which the element under the pointer fires
    // first, so the menu still knows what it is about.
    this.putBackTheDrag();
    this.letGoOfEverything(true);
  }

  /**
   * A finger held still, which is what a touch device has instead of a right
   * button.
   *
   * The press has already started a drag -- `mouseDown` cannot know at the
   * time whether a finger is going to move -- so the first thing to do is put
   * that drag down *and put the drawing back*, which is exactly what the
   * right-button case of `mouseDown` does and for the same reason.
   *
   * Then it asks the element under the finger for a `contextmenu`, rather than
   * building a menu here. Every part on this canvas already answers that event
   * with `setLastRightClick`, the trigger on the canvas already turns it into
   * an open menu, and the builder already knows what belongs in one. A second
   * path to the same menu would be a second path to get wrong -- so a long
   * press does not *resemble* a right-click, it becomes one.
   */
  /**
   * A second finger, which makes this a pinch.
   *
   * The same three things a right-click does, for the same reason: the first
   * finger has already taken hold of whatever it went down on, and a pinch is
   * about the view rather than about the mechanism. Without this a two-finger
   * zoom that happened to begin on a joint dragged that joint while it zoomed.
   */
  onPinch() {
    // Put the drawing back first. A pinch is a question about the view, and the
    // existing rule -- a pinch that begins on a joint leaves the joint alone --
    // held only while the first finger was still undecided. Past the drag slop
    // it has already moved something, and letting go merely settled that onto
    // the anchor: an edit the reader never asked for, and could not undo,
    // because a view gesture mints no entry to undo with.
    this.putBackTheDrag();
    this.letGoOfEverything(true);
  }

  onLongPress(press: LongPress) {
    // Synthesis places a position on the *release* of a press that did not
    // travel, and a press held still is exactly that -- so a hold on the canvas
    // with placing armed opened the menu and then dropped a position under it
    // on the way out. Spent by the release that follows.
    this.pressBecameMenu = true;
    this.putBackTheDrag();
    this.letGoOfEverything(true);
    // Aimed at whatever is under the finger *now*, not at the node the press
    // began on. Letting go of the gesture above re-renders the canvas, and
    // Angular replaces the marks it re-creates -- so the captured target is
    // often a detached node by this line, and an event dispatched into it
    // bubbles to nothing. The menu then opened with no rows at all, because
    // nothing had told it what was pressed: a held finger on a selected joint
    // produced an empty card.
    const under = document.elementFromPoint(press.x, press.y);
    (under ?? press.target ?? document.getElementById('canvas'))?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: press.x,
        clientY: press.y,
        button: 2,
      })
    );
  }

  /**
   * Show the panel about the thing that was just tapped.
   *
   * On the *release*, and only for a press that neither traveled nor became a
   * menu. Doing it on selection was tried and is worse than it sounds:
   * selecting happens on press, so a finger going down on a joint raised the
   * sheet over that joint while the finger was still on it, and a long press
   * held there then found the sheet under it rather than the joint it had been
   * aimed at.
   *
   * Only what a panel has something to say about. `Grid` is the press that
   * landed on bare canvas and cleared the selection, and opening a panel to
   * say "nothing is selected" is the opposite of what that gesture asked for.
   */
  private openPanelForTap($event: MouseEvent): void {
    if (!this.viewport.isPhone() || this.pressBecameMenu) return;
    if ($event.button !== 0 || !this.pressDidNotTravel($event)) return;
    // What the press landed on, recorded when it went down, rather than what is
    // selected now. The selection is cleared by a tap on bare canvas later in
    // this same gesture than anything here can read it -- so asking the
    // selection opened the panel about the joint the reader had just tapped
    // away from. `String` is the grid: `setLastLeftClick('grid')`.
    if (this.objectKind(this.lastLeftClick) === 'String') return;
    this.tabService.sheetExpanded.set(true);
  }

  private pendingDragMove?: MouseEvent;
  private dragFrame?: number;
  private applyingDragFrame = false;

  private dragInProgress(): boolean {
    return (
      this.dragState.joint === jointStates.dragging ||
      this.dragState.link === linkStates.dragging ||
      this.dragState.link === linkStates.resizing ||
      this.dragState.force === forceStates.draggingStart ||
      this.dragState.force === forceStates.draggingEnd ||
      this.dragState.force === forceStates.draggingBody
    );
  }

  /** Run the move that is waiting for a frame, now. */
  private applyPendingDragMove(): void {
    if (this.dragFrame !== undefined) {
      cancelAnimationFrame(this.dragFrame);
      this.dragFrame = undefined;
    }
    const move = this.pendingDragMove;
    this.pendingDragMove = undefined;
    if (!move) return;
    this.applyingDragFrame = true;
    try {
      this.mouseMove(move);
    } finally {
      this.applyingDragFrame = false;
    }
  }

  mouseUp($event: MouseEvent) {
    this.holdRing = undefined;
    this.holdGuide = undefined;
    // The last move of a drag lands before the release is read, so the part
    // ends where the hand was, not one frame short of it.
    this.applyPendingDragMove();
    //This is the mouseUp that is called no matter what is clicked on
    this.bgDrag = undefined;
    if (this.showSynthesis()) {
      const wasDragging = this.synthCanvas.release();
      // One gesture, one entry: the design is carried in the same URL the undo
      // stack is made of, so a drag that moved a position has to be written --
      // once, here, rather than on every pointer-move that made it.
      if (wasDragging) this.mechanismSrv.save();
      // A press that neither took hold of anything nor moved is a click, and
      // while placing is armed a click on the canvas drops the next position.
      // On the release rather than the press so svg-pan-zoom keeps its own
      // gesture: a press it never sees is a canvas that cannot be panned.
      if (
        $event.button === 0 &&
        !wasDragging &&
        !this.synthPressTaken &&
        !this.pressBecameMenu &&
        this.synthesisBuilder.armed &&
        this.pressDidNotTravel($event)
      ) {
        const at = this.svgGrid.screenToModelFromXY($event.clientX, $event.clientY);
        this.synthesisBuilder.placePose(at);
        // A position added is a different question, not a different answer.
        this.synthSolution.invalidate();
        this.dragState.release();
        this.mechanismSrv.save();
        return;
      }
      // A click on the canvas that took hold of nothing lets go of whatever
      // position was selected -- the same way clicking empty grid clears the
      // selection everywhere else in the app. Only when placing is not armed:
      // armed, the click has already been spent dropping a position.
      if (
        !wasDragging &&
        !this.synthPressTaken &&
        !this.synthesisBuilder.armed &&
        this.synthesisBuilder.selectedPose !== 0 &&
        this.pressDidNotTravel($event) &&
        this.objectKind(this.lastLeftClick) === 'String'
      ) {
        this.synthesisBuilder.selectedPose = 0;
      }
    }
    // The alignment guides belong to the drag that made them.
    this.axisSnapGuides = [];
    // A press on a held object that never tried to move it is a click — a
    // selection, most likely on the way to the panel's own Unlock — and a
    // click deserves no scolding.
    this.heldGestureNotice = undefined;

    if (!this.finishSelectionGesture()) this.finishMechanismDrag($event);

    // Last, once the press has finished deciding what it selected. Run first,
    // this read the selection the *previous* gesture left: a tap on bare canvas
    // clears the selection later in this same method, so the panel opened about
    // a joint the reader had just tapped away from.
    this.openPanelForTap($event);
  }

  /**
   * Land whatever the gesture did to the mechanism: fold a pending merge,
   * rebuild if it needs one, and mint the undo entry.
   *
   * Its own method because `mouseUp` is not the only release that reaches it —
   * a drag let go of over a panel comes up on the window instead, and that path
   * has to commit the same drag rather than leave it in flight.
   */
  private finishMechanismDrag($event: MouseEvent): void {
    // Said out loud, because the pointer is already up by the time the commit
    // runs and the service's stale-staging guard would otherwise read that as
    // an abandoned gesture.
    this.mechanismSrv.committingPosedEdit = true;
    try {
      this.finishMechanismDragNow($event);
    } finally {
      this.mechanismSrv.committingPosedEdit = false;
    }
  }

  private finishMechanismDragNow($event: MouseEvent): void {
    // Resolve the drop before releasing: the snap target is only meaningful
    // while the drag it belongs to is still in flight.
    const merged = this.completePendingJointMerge($event);
    const outcome = this.dragState.release();

    if (outcome.rebuild) {
      this.mechanismSrv.updateMechanism();
    }
    // The whole outcome is known by here -- a drop that merged two joints or
    // cut a slot has already changed the topology -- which is why closing a
    // posed edit belongs after it rather than at the release. Nothing happens
    // for a gesture that was not one.
    this.closePosedEdit(outcome.save || merged, merged);
    if (this.mechanismSrv.showPathHolder) {
      this.mechanismSrv.onMechUpdateState.next(2);
    }
    // Only in Edit, where this holder is the preview a drag puts up and the end
    // of the gesture is what puts it away. In an analysis mode the traces are
    // what the reader came to look at, so a click on the grid must not take
    // them down -- and the temporary ones a drag turns on are additive and go
    // when the gesture does.
    if (!this.tabService.isAnalysisMode()) {
      this.mechanismSrv.showPathHolder = false;
    }

    // Click selects, drag tunes: a gesture that travelled puts the graphs back
    // on whatever was being studied before it. From the outcome rather than
    // from the service, because `release()` above has already cleared the flag
    // by the time the question is asked here.
    this.restoreSelectionAfterDrag(outcome.travelled);

    // One gesture earns one undo entry. Undo is a stack of URL strings, so
    // saving per pointer-move would fill it with intermediate poses nobody
    // asked to return to. A re-anchored posed edit has already minted its own,
    // from the rebuild that made the anchored pose t = 0.
    if ((outcome.save || merged) && !this.posedEditSaved) {
      this.mechanismSrv.save();
    }
    this.posedEditSaved = false;
  }

  /** Whether closing a posed edit has already written this gesture's entry. */
  private posedEditSaved = false;

  /**
   * Put the design back on its anchor, and say so if it could not be.
   *
   * The edit always lands. An anchor the new geometry cannot reach -- a crank
   * lengthened until it is a rocker -- moves the start rather than refusing
   * what the reader just did: the old start pose belongs to the old geometry,
   * and the way back to both of them is Undo, which the entry beside this
   * message holds.
   */
  private closePosedEdit(changed: boolean, structuralNews: boolean): void {
    if (!this.mechanismSrv.posedEditKey) return;
    if (!changed) {
      this.mechanismSrv.cancelPosedEdit();
      return;
    }
    const outcome = this.mechanismSrv.finishPosedEdit();
    this.posedEditSaved = outcome.reanchored;
    // Yielding to structural news: one message per gesture, and a merge or a
    // cut slot is the bigger thing that just happened. With the ghost warning
    // live through the drag (§6.1), this is narration of something the reader
    // watched rather than the first they hear of it.
    if (outcome.lost) {
      // The row keeps the fact whether or not the message gets to say it: the
      // notification is the news, the chip is the record, and structural news
      // taking the message away must not take the record with it.
      this.mechanismSrv.markStartMoved(outcome.lost);
    }
    if (outcome.lost && !structuralNews) {
      // Half the words it used to have, and a verb rather than a report: what
      // happened is that the machine starts here now. Indigo rather than an
      // alarm color, because nothing failed -- the edit landed exactly as it
      // was asked for, and this is the consequence that came with it. Undo
      // rides the message, per the app's rule that a consequence carries its
      // own exit.
      this.notify.news(
        'anchor.unreachable',
        `${outcome.lost} starts here now — its old start is out of reach.`,
        { actions: [{ label: 'Undo', run: () => this.saveHistoryService.undo() }] }
      );
    }
  }

  /**
   * If a joint drag is ending over another joint, fold the two together.
   * Returns whether the mechanism changed structurally.
   */
  private completePendingJointMerge($event: MouseEvent): boolean {
    // Alt is read from the release, not from the last pointermove. Pressing a
    // modifier emits no move, so a target acquired before Alt went down would
    // otherwise still merge on a release the user meant to be inert.
    if ($event.altKey) {
      this.snapTargetJoint = undefined;
      this.refusedTarget = undefined;
      this.slotCandidate = undefined;
      return false;
    }
    const target = this.snapTargetJoint;
    const refused = this.refusedTarget;
    const slot = this.slotCandidate;
    this.setDropCandidate(undefined);
    this.slotCandidate = undefined;
    if (this.dragState.joint !== jointStates.dragging) {
      return false;
    }

    const source = this.activeObjService.selectedJoint;
    if (refused?.refusal) {
      this.refuseDrop(source.id, refused.refusal);
      return false;
    }
    // A drop that would join this machine to a different one, made at a
    // displaced pose, has no consistent geometry to become. The staged machine
    // is holding the pose under the reader's hand while every other machine has
    // been restored to its own start, so the fused body would be half one and
    // half the other -- and the anchor it would need to be put back on belongs
    // to a topology that no longer exists.
    //
    // Refused with a reason rather than solved: the reader can do exactly this
    // at the start pose, where both halves mean the same thing.
    const across = this.crossesMachines(source, target ?? slot?.carrier);
    if (across) {
      this.refuseDrop(source.id, across);
      return false;
    }
    if (!target) {
      // No joint claimed the drop, so a bar may have. Cutting the slot is the
      // gesture's whole point (§4.3) and it earns the same receipt a merge does.
      if (slot && this.mechanismSrv.cutSlotOn(source, slot)) {
        this.popJoint(source.id);
        return true;
      }
      return false;
    }

    const wasWelded = source.isWelded || target.isWelded;
    const refusal = this.mechanismSrv.mergeJoints(source, target);
    if (refusal) {
      this.refuseDrop(source.id, refusal);
      return false;
    }

    // A merged-into-welded joint re-welds itself, but a grounded, driven, or
    // slider-carrying survivor cannot be welded at all. Losing the weld
    // silently would leave the user with a linkage they did not ask for. A
    // merge that goes exactly as asked says nothing: the pop is the receipt.
    // A warning, not a refusal: the merge happened, and the linkage the reader
    // now has is not quite the one they drew. It waits to be dismissed.
    if (wasWelded && !target.isWelded) {
      this.notify.warning(
        'merge.weld-lost',
        `Merged ${source.id} into ${target.id}. The weld did not carry over — ${target.id} cannot be welded.`
      );
    }
    this.popJoint(target.id);
    return true;
  }

  /**
   * Why a drop joining two machines is refused mid-cycle, if it is.
   *
   * Only mid-cycle, and only across machines: everything else about a merge or
   * a slot cut is unchanged.
   */
  private crossesMachines(source: Joint, onto: Joint | Link | undefined): MergeRefusal | undefined {
    if (!onto || !this.mechanismSrv.posedEditKey) return undefined;
    const from = this.mechanismSrv.indexOfMechanismContaining(source);
    const to = this.mechanismSrv.indexOfMechanismContaining(onto);
    if (from === -1 || to === -1 || from === to) return undefined;
    return 'crosses-machines';
  }

  /**
   * Whether this press stayed put -- a click rather than a drag.
   *
   * Deliberately not `pastDragThreshold`, which also calls a press held for a
   * tenth of a second a drag. That is right for a part already on the grid,
   * where holding still is how you take hold of something, but wrong for
   * dropping a position: aiming at a spot takes as long as it takes, and every
   * click slower than 100ms was being thrown away -- which is why a position
   * seemed to need several clicks to place. Distance is the only thing that
   * tells the two gestures apart here.
   */
  private pressDidNotTravel($event: MouseEvent): boolean {
    const from = new Coord(this.startX, this.startY);
    return getDistance(from, new Coord($event.pageX, $event.pageY)) <= 10;
  }

  /**
   * Let go of any canvas gesture still in flight.
   *
   * Called from the window-level release in SvgGridService, for the presses
   * that come up somewhere the canvas cannot hear. Safe to call when nothing
   * is happening -- it is the same tidying `mouseUp` does.
   *
   * The mechanism's own drags take no pointer capture, so this is the only
   * thing that ends one released over the floating panel. Left out, the joint
   * went on following a button-less cursor, panning stayed refused, and the
   * click that eventually dropped it kept the moved geometry with no undo entry
   * to take it back. It commits, as `mouseUp` does: what is on screen when the
   * hand lets go is what the drawing keeps.
   */
  releaseCanvasGestures(event?: PointerEvent): void {
    this.applyPendingDragMove();
    this.bgDrag = undefined;
    if (this.synthCanvas.dragging) {
      this.synthCanvas.release();
      this.mechanismSrv.save();
    }
    this.axisSnapGuides = [];
    this.heldGestureNotice = undefined;
    // Only a drag. A creation gesture is armed by the menu and committed by the
    // next click, with no pointer held down in between: releasing it here would
    // cancel the rubber band whenever a button anywhere else was pressed.
    if (this.selectionGesture) {
      this.finishSelectionGesture();
    } else if (event && this.dragState.isDragging) {
      this.finishMechanismDrag(event);
    } else if (!event) {
      // No event means the release never arrived -- the pointer was let go in
      // another tab, or the window was hidden under it. Nobody finished the
      // gesture and there is no position to finish it at, so what it moved on
      // the way is put back, exactly as a pinch's is: an edit committed by a
      // window losing focus is one the reader never asked for, and a gesture
      // that never finished mints no entry to undo it with.
      //
      // Then everything is put down, which also stops the canvas believing a
      // finger is still held -- the flag the stale-staging guard reads.
      this.putBackTheDrag();
      this.letGoOfEverything(true);
    }
  }

  /**
   * Whether a synthesis gesture has the pointer.
   *
   * Read by the pan guard, which cannot inject the canvas service -- that
   * service needs the grid's own zoom, so the two would depend on each other.
   * The static is how everything else in this file answers that question.
   */
  static isSynthesisGestureLive(): boolean {
    return this.instance?.synthCanvas.dragging ?? false;
  }

  /** A group transform owns the pointer even though it does not use the legacy drag enums. */
  static isSelectionGestureLive(): boolean {
    return this.instance?.selectionGesture !== undefined;
  }

  // --- Synthesis on the canvas -------------------------------------------
  //
  // Thin plumbing only: every handler turns a screen point into a model point
  // and hands it to SynthesisCanvasService, which decides what it means. None
  // of it goes through the mechanism's own drag state -- a position is a
  // question about a machine, not part of one.

  /**
   * Hold the pointer for the rest of the gesture.
   *
   * The canvas hears `pointerup` only on itself, so a drag released anywhere
   * else -- over the panel, off the window -- was never told it had ended: the
   * gesture stayed live, which left the canvas unpannable and the search frozen
   * until something else was clicked. Capture makes the release come back here
   * whatever it happens over.
   */
  private holdPointer(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Element && target.hasPointerCapture !== undefined) {
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Some pointers cannot be captured; the window-level release below is
        // what covers those.
      }
    }
  }

  /** Take hold of a position by its body, its turn knob, or a corner grip. */
  startPoseGesture(event: PointerEvent, id: number, mode: 'move' | 'rotate' | 'length'): void {
    // The left button only. A right-press is asking for the menu, and taking
    // the pointer for a drag took the menu with it.
    if (event.button !== 0) return;
    event.stopPropagation();
    this.synthPressTaken = true;
    this.holdPointer(event);
    const at = this.svgGrid.screenToModelFromXY(event.clientX, event.clientY);
    this.synthCanvas.grabPose(at, id, mode);
    if (this.synthesisBuilder.isPoseDefined(id)) {
      const pose = this.synthesisBuilder.getPose(id);
      this.setLastLeftClick(pose);
      this.activeObjService.updateSelectedObj(pose);
    }
  }

  /** Take hold of the ground-pivot region, or draw a new one. */
  startRegionGesture(event: PointerEvent, mode: 'move' | 'corner' | 'draw', corner?: string): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    this.synthPressTaken = true;
    this.holdPointer(event);
    const at = this.svgGrid.screenToModelFromXY(event.clientX, event.clientY);
    this.synthCanvas.grabRegion(at, mode, corner);
  }

  /**
   * The wheel turns the position about to be dropped.
   *
   * Only while placing is armed, and only then: the wheel is the canvas zoom
   * the rest of the time, and svg-pan-zoom has been asked to stand down for
   * exactly as long as this gesture is running.
   */
  onCanvasWheel(event: WheelEvent): void {
    if (!this.showSynthesis() || !this.synthesisBuilder.armed) return;
    if (this.synthesisBuilder.getFirstUndefinedPose() === undefined) return;
    event.preventDefault();
    this.synthCanvas.turnGhost(event.deltaY);
  }

  /** Where the hint beside the pointer sits while a position is being placed. */
  get synthesisHint(): { x: number; y: number; text: string; sub: string } | undefined {
    const cursor = this.synthCanvas.cursor;
    if (!this.showSynthesis() || !cursor) return undefined;
    if (this.synthesisBuilder.regionDraw) {
      return {
        x: cursor.x,
        y: cursor.y,
        text: 'Drag to draw the region',
        sub: '',
      };
    }
    const next = this.synthesisBuilder.getFirstUndefinedPose();
    if (!this.synthesisBuilder.armed || next === undefined) return undefined;
    return {
      x: cursor.x,
      y: cursor.y,
      text: 'Click to drop position ' + next,
      sub: 'Scroll to turn · ' + this.synthCanvas.ghostAngleLabel(),
    };
  }

  /** Whether a synthesis handle claimed the press that is in flight. */
  private synthPressTaken = false;

  mouseDown($event: MouseEvent) {
    // A press that *finishes* a creation gesture -- the second click of a link
    // or a cylinder -- makes a part whose geometry is read off the pose it was
    // drawn at. That is capturing, in the plan's §6.2 terms, so it is staged
    // and settled onto the anchor like a drag; without it the rebuild inside
    // restored over the new part and moved the mount it was drawn from.
    //
    // Wrapped here rather than at each of the six commits inside, because they
    // are branches of one gesture and it is the gesture that captures a pose.
    // Force attachments map directly back through the existing body's transform.
    if (
      this.dragState.grid !== gridStates.waiting &&
      this.dragState.grid !== gridStates.createForce &&
      !this.mechanismSrv.isAtStartPose()
    ) {
      // A link drawn between two machines fuses them, and mid-cycle the two
      // halves are at different places in their own cycles -- so the body it
      // makes is half one and half the other, exactly what the merge and
      // slot-cut refusals exist to prevent. Refused the same way, and offered
      // again at the start pose where both halves mean the same thing.
      if (this.creationWouldCrossMachines()) {
        this.notify.refusal('merge.crosses-machines', MERGE_REFUSAL_MESSAGES['crosses-machines']);
        this.dragState.cancel();
        this.linkCreateStart = undefined;
        this.linkCreateFrom = undefined;
        this.linkCreateFrom = undefined;
        return;
      }
      this.mechanismSrv.capturingPose(this.creationAnchorPart(), () => this.mouseDownNow($event));
      return;
    }
    this.mouseDownNow($event);
  }

  /**
   * Whether the part this creation gesture started from and the one it is about
   * to land on belong to two different machines.
   *
   * The staged machine is whichever end the canvas has selected; the other end
   * is not staged, so it would be restored to its own start by the same rebuild
   * that keeps the first at the reader's pose.
   */
  private creationWouldCrossMachines(): boolean {
    const from = this.creationAnchorPart();
    const onto = this.lastLeftClick;
    if (!from || typeof onto === 'string' || onto instanceof SynthesisPose) return false;
    if (!(onto instanceof Joint || onto instanceof Link)) return false;
    const a = this.mechanismSrv.indexOfMechanismContaining(from);
    const b = this.mechanismSrv.indexOfMechanismContaining(onto);
    return a !== -1 && b !== -1 && a !== b;
  }

  /** The part a creation gesture is growing from, if it is growing from one. */
  private creationAnchorPart(): Joint | Link | Force | undefined {
    if (this.cylinderCreateOn) return this.cylinderCreateOn;
    if (this.linkCreateFrom) return this.linkCreateFrom;
    // Retain a force's source when identifying the creation body defensively.
    // Normal force gestures bypass staging and map directly to authored t=0.
    if (this.forceCreateOn) return this.forceCreateOn;
    // A link grows from wherever the first click landed, which is a coordinate
    // rather than a part -- so the machine is named by what is selected, which
    // for a link drawn from a joint is that joint.
    const selected = this.activeObjService.selectedJoint;
    return selected && this.mechanismSrv.indexOfMechanismContaining(selected) !== -1
      ? selected
      : undefined;
  }

  private mouseDownNow($event: MouseEvent) {
    // The other two buttons put the gesture down rather than starting one, and
    // that has to happen *before* anything below touches the drag state.
    // `press()` on the next line re-arms the gesture -- it clears the travelled
    // and modified flags -- so a teardown further down was working from a
    // gesture that looked as though it had never moved.
    //
    // Past the drag slop the first button has already moved something and
    // staged the machine. Cancelling the drag state alone left the moved
    // geometry standing, and the next rebuild settled it onto the anchor as
    // though it had been asked for: an edit nobody made, with nothing to undo
    // it, because an abandoned gesture mints no entry. The same two lines the
    // pinch and the long press already run, for the same reason.
    if ($event.button === 1 || $event.button === 2) {
      this.putBackTheDrag();
      this.letGoOfEverything(true);
      if ($event.button === 1) return;
    }
    // Log the time that the mouse was clicked
    this.timeMouseDown = new Date().getTime();
    this.synthPressTaken = false;
    // A new press: whatever the last one turned into is behind us.
    this.pressBecameMenu = false;
    this.dragState.press();
    this.startX = $event.pageX;
    this.startY = $event.pageY;
    let joint1: RevJoint;
    let joint2: RevJoint;
    let link: RealLink;

    const mousePosInSvg = this.svgGrid.screenToModelFromXY($event.clientX, $event.clientY);
    this.mouseLocation = mousePosInSvg;
    this.svgGrid.cursorAt = mousePosInSvg;
    // The click carries the key too, so a placement made without stirring the
    // pointer first still honors a held Option.
    this.snapSuspended = $event.altKey;
    // Where a link drag measures its offset from. Without anchoring it here the
    // first move would translate the link by the distance from whatever
    // unrelated pointer event came last — a jump on grab.
    this.linkDragAnchor = mousePosInSvg;
    this.bodyDragOrigin = undefined;

    if ($event.button === 0 && this.selectionTogglePress) return;
    if (
      $event.button === 0 &&
      this.activeObjService.objType === 'MultiSelection' &&
      this.pendingPartReplacement
    ) {
      this.beginSelectionGesture('translate', mousePosInSvg, this.pendingPartReplacement);
      return;
    }

    switch ($event.button) {
      case 0: // Handle Left-Click on canvas
        // The second click of the two-point cylinder gesture commits wherever
        // it lands — over grid, joint or link alike — with the cursor as the
        // rod's end, exactly where the ghost has been standing.
        if (this.dragState.grid === gridStates.createCylinder) {
          this.commitCylinderCreation(this.creationLanding());
          break;
        }
        // A force's arrow tip can land on another part as well as empty grid.
        if (this.dragState.grid === gridStates.createForce) {
          const start = this.svgGrid.screenToModel(this.lastRightClickCoord);
          this.mechanismSrv.createForce(start, mousePosInSvg, this.forceCreateOn);
          this.dragState.finishCreating();
          this.forceGhost = undefined;
          this.forceCreateOn = undefined;
          break;
        }
        switch (this.lastLeftClickType) {
          case 'Grid':
            switch (this.dragState.grid) {
              case gridStates.createJointFromGrid:
                //Here's where you actaully make the link
                joint1 = this.mechanismSrv.createRevJoint(
                  this.linkGestureStart().x.toString(),
                  this.linkGestureStart().y.toString()
                );
                joint2 = this.mechanismSrv.createRevJoint(
                  this.creationLanding().x.toString(),
                  this.creationLanding().y.toString(),
                  joint1.id
                );
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);

                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToJoints([joint1, joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                this.linkCreateFrom = undefined;
                break;
              case gridStates.createJointFromJoint:
                joint2 = this.mechanismSrv.createRevJoint(
                  this.creationLanding().x.toString(),
                  this.creationLanding().y.toString()
                );
                this.activeObjService.prevSelectedJoint.connectedJoints.push(joint2);
                joint2.connectedJoints.push(this.activeObjService.prevSelectedJoint);

                link = this.gridUtils.createRealLink(
                  this.activeObjService.prevSelectedJoint.id + joint2.id,
                  [this.activeObjService.prevSelectedJoint, joint2]
                );
                this.activeObjService.prevSelectedJoint.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToJoints([joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                this.linkCreateFrom = undefined;
                break;
              case gridStates.createJointFromLink:
                //This is werid bug, ensures that when you use a context menu it always counts as a real click instead of a mis-drag
                this.startY = 9999999;
                this.startX = 9999999;
                // TODO: set context Link as a part of joint 1 or joint 2
                joint1 = this.mechanismSrv.createRevJoint(
                  this.linkGestureStart().x.toString(),
                  this.linkGestureStart().y.toString()
                );
                joint2 = this.mechanismSrv.createRevJoint(
                  this.creationLanding().x.toString(),
                  this.creationLanding().y.toString(),
                  joint1.id
                );
                // Have within constructor other joints so when you add joint, that joint's connected joints also attach
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);
                // Through the same door every other creation gesture uses: this is
                // where a link is given its color, and the two branches that built
                // one directly skipped it. The link came out in RealLink's own
                // stand-in gray -- and the ghost the gesture had just drawn was in
                // the palette color it was promised, so the bar changed color at
                // the moment of the click.
                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                // TODO: Be sure that I think joint1 also changes the link to add the desired joint to it's connected Joints and to its connected Links
                this.activeObjService.selectedLink.joints.forEach((j) => {
                  if (!(j instanceof RealJoint)) {
                    return;
                  }
                  j.connectedJoints.push(joint1);
                  joint1.connectedJoints.push(j);
                });
                if (
                  this.activeObjService.selectedLink.isWelded &&
                  this.activeObjService.selectedLink.lastSelectedSublink
                ) {
                  this.activeObjService.selectedLink.lastSelectedSublink.id =
                    this.activeObjService.selectedLink.lastSelectedSublink?.id.concat(joint1.id);
                  this.activeObjService.selectedLink.lastSelectedSublink.fixedLocations.push({
                    id: joint1.id,
                    label: joint1.id,
                  });
                  this.activeObjService.selectedLink.lastSelectedSublink.joints.push(joint1);
                }
                joint1.links.push(this.activeObjService.selectedLink);
                this.activeObjService.selectedLink.joints.push(joint1);
                // TODO: Probably attach method within link so that when you add joint, it also changes the name of the link
                this.activeObjService.selectedLink.id =
                  this.activeObjService.selectedLink.id.concat(joint1.id);
                this.mechanismSrv.mergeToJoints([joint1, joint2]);
                this.mechanismSrv.mergeToLinks([link]);
                this.activeObjService.selectedLink.d =
                  this.activeObjService.selectedLink.getPathString();
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                this.linkCreateFrom = undefined;
                break;
            }
            break;
          case 'Joint':
            // Get the joint that was clicked on and top left of the rectangualr bounds
            switch (this.dragState.grid) {
              case gridStates.waiting:
                break;
              case gridStates.createJointFromGrid:
                joint1 = this.mechanismSrv.createRevJoint(
                  this.linkGestureStart().x.toString(),
                  this.linkGestureStart().y.toString()
                );
                joint2 = this.activeObjService.selectedJoint;
                // joint2 = this.createRevJoint(
                //   this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                //   joint1.id
                // );
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);

                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToJoints([joint1]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                // PositionSolver.setUpSolvingForces(link.forces); // needed to determine force location when dragging a joint
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                this.linkCreateFrom = undefined;
                break;
              case gridStates.createJointFromJoint:
                // joint2 = this.createRevJoint(
                //   this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                // );

                joint2 = this.activeObjService.selectedJoint;
                let commonLinkCheck = false;
                // Make sure link is not being attached to the same link
                joint2.links.forEach((l) => {
                  if (commonLinkCheck) return;
                  if (
                    this.activeObjService.prevSelectedJoint.links.findIndex(
                      (li) => li.id === l.id
                    ) !== -1
                  ) {
                    commonLinkCheck = true;
                  }
                });
                if (commonLinkCheck) {
                  this.dragState.finishCreating();
                  this.linkCreateStart = undefined;
                  this.linkCreateFrom = undefined;
                  // Named rather than counted: clicking the joint the gesture
                  // started from lands here too, and "those two joints" was a
                  // sentence about two things when the reader had pointed at
                  // one.
                  const from = this.activeObjService.prevSelectedJoint;
                  this.notify.refusal(
                    'link.already-joined',
                    from.id === joint2.id
                      ? `A link needs two joints, and this gesture started at ${from.name || from.id}. Click somewhere else to finish it.`
                      : `${from.name || from.id} and ${joint2.name || joint2.id} are already on one link.`
                  );
                  return;
                }
                this.activeObjService.prevSelectedJoint.connectedJoints.push(joint2);
                joint2.connectedJoints.push(this.activeObjService.prevSelectedJoint);

                link = this.gridUtils.createRealLink(
                  this.activeObjService.prevSelectedJoint.id + joint2.id,
                  [this.activeObjService.prevSelectedJoint, joint2]
                );
                this.activeObjService.prevSelectedJoint.links.push(link);
                joint2.links.push(link);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                this.linkCreateFrom = undefined;
                break;
              case gridStates.createJointFromLink:
                // TODO: set context Link as a part of joint 1 or joint 2
                joint1 = this.mechanismSrv.createRevJoint(
                  this.linkGestureStart().x.toString(),
                  this.linkGestureStart().y.toString()
                );
                // joint2 = this.createRevJoint(
                //   this.jointTempHolderSVG.children[0].getAttribute('x2')!,
                //   this.jointTempHolderSVG.children[0].getAttribute('y2')!,
                //   joint1.id
                // );
                joint2 = this.activeObjService.selectedJoint;
                // Have within constructor other joints so when you add joint, that joint's connected joints also attach
                joint1.connectedJoints.push(joint2);
                joint2.connectedJoints.push(joint1);
                // Through the same door every other creation gesture uses: this is
                // where a link is given its color, and the two branches that built
                // one directly skipped it. The link came out in RealLink's own
                // stand-in gray -- and the ghost the gesture had just drawn was in
                // the palette color it was promised, so the bar changed color at
                // the moment of the click.
                link = this.gridUtils.createRealLink(joint1.id + joint2.id, [joint1, joint2]);
                joint1.links.push(link);
                joint2.links.push(link);
                // TODO: Be sure that I think joint1 also changes the link to add the desired joint to it's connected Joints and to its connected Links
                this.activeObjService.selectedLink.joints.forEach((j) => {
                  if (!(j instanceof RealJoint)) {
                    return;
                  }
                  j.connectedJoints.push(joint1);
                  joint1.connectedJoints.push(j);
                });
                joint1.links.push(this.activeObjService.selectedLink);
                this.activeObjService.selectedLink.joints.push(joint1);
                // TODO: Probably attach method within link so that when you add joint, it also changes the name of the link
                this.activeObjService.selectedLink.id =
                  this.activeObjService.selectedLink.id.concat(joint1.id);
                this.mechanismSrv.mergeToJoints([joint1]);
                this.mechanismSrv.mergeToLinks([link]);
                this.mechanismSrv.updateMechanism(true);
                this.dragState.finishCreating();
                this.linkCreateStart = undefined;
                this.linkCreateFrom = undefined;
                break;
            }
            switch (this.dragState.joint) {
              case jointStates.waiting: {
                // Decided at the grab, not per pointer move: a locked joint
                // never enters the dragging state, so nothing downstream has
                // to remember to hold it still.
                const grabbed = this.activeObjService.selectedJoint;
                if (this.gridUtils.isJointFrozen(grabbed)) {
                  this.holdNotice(() => this.refuseLockedJoint(grabbed));
                  break;
                }
                // A joint the held bars around it have fully determined is as
                // still as a locked one, and is refused the same way, at the
                // grab, naming what holds it.
                const immobilized = this.gridUtils.holdsImmobilizing(grabbed);
                if (immobilized.length > 0) {
                  this.holdNotice(() => this.refuseHeldByHolds(grabbed, immobilized));
                  break;
                }
                this.dragState.beginDraggingJoint();
                this.mechanismSrv.beginPosedEdit(grabbed);
                this.rememberBeforeDrag();
                break;
              }
            }
            break;
          case 'Link':
            if (this.dragState.isCreatingLink) {
              this.notify.refusal(
                'link.needs-a-joint',
                'A link joins two joints. Add a tracer point to that bar, then draw to it.'
              );
              this.dragState.cancel();
              this.linkCreateStart = undefined;
              this.linkCreateFrom = undefined;
              break;
            }
            if (this.dragState.link === linkStates.waiting) {
              // Of the joints this drag would carry: none locked moves freely,
              // exactly one turns the drag into a swing about that joint —
              // the only motion the linkage would allow if the pin were
              // bolted down — and two or more leave the body nowhere to go.
              const held = this.frozenCarriedJoints(this.activeObjService.selectedLink);
              if (held.length >= 2) {
                const grabbedLink = this.activeObjService.selectedLink;
                this.holdNotice(() => this.refuseHeldLink(grabbedLink, held));
                break;
              }
              if (held.length === 1) {
                this.linkRotationPivot = new Coord(held[0].x, held[0].y);
                this.linkRotationGrabAngle = Math.atan2(
                  mousePosInSvg.y - held[0].y,
                  mousePosInSvg.x - held[0].x
                );
              } else {
                this.linkRotationPivot = undefined;
              }
              this.dragState.beginDraggingLink();
              this.mechanismSrv.beginPosedEdit(this.activeObjService.selectedLink);
              this.rememberBeforeDrag();
            }
            break;
          case 'Force':
            console.log('force is last left click');
            this.mechanismSrv.beginPosedEdit(this.activeObjService.selectedForce);
            // Snapshotted like a joint drag: a force's endpoints are stored
            // coordinates, so a pinch that interrupted one left the endpoint
            // where the drag had put it with nothing to undo it.
            this.rememberBeforeDrag();
            switch (this.dragState.force) {
              case forceStates.waiting:
                if (this.activeObjService.selectedForce.locked) {
                  const grabbedForce = this.activeObjService.selectedForce;
                  this.holdNotice(() => this.refuseLockedForce(grabbedForce));
                  break;
                }
                if (this.activeObjService.selectedForce.isStartSelected) {
                  this.dragState.beginDraggingForceStart();
                } else if (this.activeObjService.selectedForce.isEndSelected) {
                  this.dragState.beginDraggingForceEnd();
                } else {
                  // Neither handle: the arrow itself was grabbed, so the whole
                  // force moves. This is the ordinary way to pick one up —
                  // reaching for the little square at its tail is not.
                  this.dragState.beginDraggingForceBody();
                }
            }
            break;
          // 'JointTemp' used to be here: clicking the ghost joint the old
          // line-and-dot preview drew at the start of the gesture. Nothing sets
          // that type any more, and a click back on the joint itself is caught
          // where the link is actually built — with a better sentence, because
          // by then it knows the two joints already share a bar.
        }
        break;
      // Buttons 1 and 2 are handled at the top of this method, before the
      // press below could re-arm the gesture they are putting down.
      case 1: // Middle-Click
      case 2: // Right-Click
        break;
    }
  }

  debug() {
    console.log('debug');
  }

  handleTap() {
    if (this.lastLeftClick == 'grid') {
      console.log('tap on grid');
      this.activeObjService.updateSelectedObj(undefined);
    }
  }

  getFirstPosCoords(link: Link) {
    // The link's own machine, and its joint found by name. Indexing another
    // mechanism's frames by this drawing's array position would label the link
    // at some unrelated joint's coordinates.
    const solved = this.mechanismSrv.mechanismContaining(link);
    const anchor = link.joints[0];
    return solved?.joints[0]?.find((candidate) => candidate.id === anchor.id) ?? anchor;
  }

  getFirstXPos(link: Link) {
    return this.getFirstPosCoords(link).x;
  }

  getFirstYPos(link: Link) {
    return this.getFirstPosCoords(link).y;
  }

  /**
   * The slider marks of §2.8, recomputed only when something they depend on has
   * actually moved.
   *
   * Change detection asks for these far more often than the mechanism changes —
   * and during playback it asks every frame across ~360 timesteps — so the
   * fingerprint is what keeps the glyphs cheap. It is deliberately built from
   * the same values the marks are: anything that can change a mark and not the
   * fingerprint would be a stale drawing.
   */
  private markCache?: { key: string; marks: SliderMark[]; channels: Channel[] };

  get sliderMarkList(): SliderMark[] {
    const marks = this.freshMarks().marks;
    const slot = this.slotCandidate;
    if (!slot || this.dragState.joint !== jointStates.dragging) return marks;
    const pinID = this.activeObjService.selectedJoint?.id;
    if (!pinID) return marks;
    const slotAngleDeg = (Math.atan2(slot.b.y - slot.a.y, slot.b.x - slot.a.x) * 180) / Math.PI;
    // Re-framed rather than re-stamped: turning the frame alone turns the
    // riders with it, and this getter is read several times a change and once
    // per pointer move, so the turned geometry is kept until the angle moves.
    return marks.map((mark) => {
      if (mark.pin.id !== pinID) return mark;
      if (this.previewMark?.key !== `${pinID}|${slotAngleDeg}` || this.previewMark.from !== mark) {
        this.previewMark = {
          key: `${pinID}|${slotAngleDeg}`,
          from: mark,
          mark: { ...this.sliderMarks.reframed(mark, slotAngleDeg), dangling: false },
        };
      }
      return this.previewMark.mark;
    });
  }

  /** The one re-framed mark of a drop preview, kept while its angle holds. */
  private previewMark?: { key: string; from: SliderMark; mark: SliderMark };

  get channelList(): Channel[] {
    return this.freshMarks().channels;
  }

  /**
   * Where each grounded guide sits in the world, and how far along itself its
   * block runs.
   *
   * Measured over the solved timesteps rather than read off the joint, because
   * during playback the joint *is* the thing sliding: anchoring the rails to it
   * makes the track travel with the block, which is only visible once the
   * mechanism is playing and looks like the whole guide has come loose.
   *
   * An unsolved or invalid linkage has no timesteps, and then the joint's own
   * position is the only frame there is -- which is also the right one, since
   * nothing is moving.
   */
  private guides(): Map<string, Guide> {
    const found = new Map<string, Guide>();
    // Every machine in the drawing, because a rail belongs to whichever one
    // slides along it. Reading one mechanism's frames would leave the guides of
    // every other linkage undrawn.
    for (const mechanism of this.mechanismSrv.mechanisms) {
      const frames = mechanism?.isMechanismValid() ? mechanism.joints : undefined;
      if (!frames?.length) continue;

      const rest = frames[0];
      for (let index = 0; index < rest.length; index++) {
        const joint = rest[index];
        if (!(joint instanceof PrisJoint) || !joint.ground) continue;
        const angle = joint.slotAngle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        let lo = 0;
        let hi = 0;
        for (const frame of frames) {
          // By index rather than by id: every timestep is built by walking
          // frames[0] in order, so a joint keeps its place in all of them. The
          // search was a scan of the whole frame per timestep per guide, on a
          // cache that playback invalidates once an animation frame.
          const at = frame[index];
          if (!at) continue;
          const along = (at.x - joint.x) * cos + (at.y - joint.y) * sin;
          lo = Math.min(lo, along);
          hi = Math.max(hi, along);
        }
        found.set(joint.id, { x: joint.x, y: joint.y, lo, hi });
      }
    }
    return found;
  }

  /**
   * Which way one drive turns, asked of the machine that drive belongs to.
   *
   * Not the document-wide `isInputCW`. That is only the default a drive with no
   * speed of its own falls back to, and setting any machine's speed mirrors it
   * there — so on a drawing holding two machines the arrow beside one crank
   * reported whichever machine had been touched last. A drive that has never
   * been given a speed of its own still gets exactly the old answer.
   */
  drivenClockwise(joint: Joint): boolean {
    return turnsClockwise(
      this.mechanismSrv.driveSpeedOf(joint instanceof RealJoint ? joint : undefined)
    );
  }

  /** Which way each drive runs, for the mark service to ask per joint. */
  private readonly driveForward = (joint: RealJoint): boolean => !this.drivenClockwise(joint);

  /**
   * Every drive's direction, as one string.
   *
   * The mark caches below are keyed on where things are, and reversing a drive
   * moves nothing at all — so without this, flipping one machine's direction
   * redraws no arrows. One entry per driven joint rather than one boolean for
   * the drawing, because each machine turns its own way.
   */
  private driveDirections(joints: Joint[]): string {
    return joints
      .filter((joint) => (joint as RealJoint).input)
      .map((joint) => `${joint.id}:${this.drivenClockwise(joint) ? 1 : 0}`)
      .join(',');
  }

  /**
   * Pins that carry the drive but no block and no ground.
   *
   * Grounded pins already have the black input arrow, and a slider's drive
   * shows as straight arrows on its block. This is the case with neither: the
   * freedom is a rotation, so the overlay is the curved arrow, and it supplies
   * its own dark backing because there is nothing underneath to guarantee the
   * white will read.
   */
  get drivenFloatingPins(): Joint[] {
    return this.mechanismSrv
      .getJoints()
      .filter(
        (joint) =>
          this.gridUtils.getInput(joint) &&
          !this.gridUtils.getGround(joint) &&
          this.gridUtils.typeOfJoint(joint) === 'R' &&
          !this.gridUtils.isAttachedToSlider(joint)
      );
  }

  /**
   * Each driven pin, in the frame of the body its motor is bolted to.
   *
   * An actuator has a reference body and a driven one (§2.9). The motor's case
   * is fixed to the reference body and its shaft turns the other, so the mark
   * is drawn along the reference body's direction — which is what lets the
   * fillets meet that bar and makes the pair read as one welded piece.
   */
  get drivenPinMotors(): DrivenPinMotor[] {
    return this.drivenFloatingPins.map((joint) => {
      const actuator = resolveActuator(joint);
      const reference = actuator
        ? angleReference(actuator.referenceBody, joint as RealJoint)
        : undefined;
      // Degrees, in the same frame the joints are drawn in: the layer's own
      // y-flip is what turns this into a screen angle, so the mark must not
      // pre-flip it as well or it lands mirrored about the bar.
      const angle = reference
        ? (Math.atan2(reference.y - joint.y, reference.x - joint.x) * 180) / Math.PI
        : 0;
      const bodyId =
        actuator && actuator.referenceBody !== GROUND_BODY
          ? (actuator.referenceBody as Link).id
          : undefined;
      return {
        id: joint.id,
        x: joint.x,
        y: joint.y,
        angle,
        bodyId,
        cw: this.drivenClockwise(joint),
      };
    });
  }

  /**
   * The sealed cylinders, always wearing their skin. Sealed ⇔ skinned: there
   * is no reveal on selection and no per-session preference any more.
   */
  private cylinderListCache?: {
    revision: number;
    pose: number;
    scale: number;
    forward: string;
    paint: string;
    list: CylinderMark[];
  };

  /**
   * The drawn cylinder marks, cached per mechanism revision. This getter runs
   * for every template binding on every change-detection pass — dozens of
   * times per pointer move — and each uncached call re-resolved every
   * assembly and rebuilt every path string, which is where the quarter-second
   * interaction stutters came from.
   *
   * Keyed on the pose as well as the structure. A mark is a drawing of where
   * the joints *are*, and against the structure revision alone the skin stayed
   * painted where the mechanism was built while the linkage under it animated.
   * And on the paint, because a skin wears its barrel's color: without it the
   * Visual Settings picker moved its own swatch and repainted nothing.
   */
  get cylinderList(): CylinderMark[] {
    const revision = this.mechanismSrv.cylinderRevision;
    const pose = this.mechanismSrv.poseRevision;
    const scale = this.settings.objectScale;
    const forward = this.driveDirections(this.mechanismSrv.getJoints());
    const paint = this.linkPaint();
    const cache = this.cylinderListCache;
    if (
      !cache ||
      cache.revision !== revision ||
      cache.pose !== pose ||
      cache.scale !== scale ||
      cache.forward !== forward ||
      cache.paint !== paint
    ) {
      this.cylinderListCache = {
        revision,
        pose,
        scale,
        forward,
        paint,
        list: this.sliderMarks.cylinderMarks(
          this.mechanismSrv.getJoints(),
          0.15 * scale,
          this.driveForward
        ),
      };
    }
    return this.cylinderListCache!.list;
  }

  /**
   * Which of the cylinder panel's two size fields is being pointed at, if any.
   * 'travel' is how far the rod goes; 'start' is where in that it sits now.
   */
  cylinderRangeOverlay?: 'travel' | 'start';

  setCylinderRangeOverlay(which: 'travel' | 'start' | undefined): void {
    this.cylinderRangeOverlay = which;
  }

  /**
   * The center-of-mass distance being pointed at in the Edit panel, drawn
   * where it is measured: from the chosen frame's zero, along one axis, to
   * the link's center of mass. The panel hands the points over because the
   * frame choice lives there, not here.
   */
  comMeasure?: {
    axis: 'x' | 'y';
    origin: { x: number; y: number };
    com: { x: number; y: number };
    /* 'origin' measures along the frame origin's own line with a dashed run
       up to the mark; 'axis' (the global-grid frame) measures at the CoM's
       height straight to the grid's axis line, which needs no connector. */
    mode: 'origin' | 'axis';
  };

  setComMeasureOverlay(measure: NewGridComponent['comMeasure']): void {
    this.comMeasure = measure;
  }

  /**
   * The selected link's CoM mark is a handle, not just a glyph: drag it to
   * place a custom center of mass, exactly as typing in the panel's X/Y
   * would. Only the selected link's mark — a whole canvas of grabbable
   * marks would fight the links they sit on for every click.
   */
  comDraggable(link: Link): boolean {
    return (
      link instanceof RealLink &&
      this.activeObjService.objType === 'Link' &&
      this.activeObjService.selectedLink === link &&
      !this.mechanismSrv.cylinderAt(link) &&
      this.canEditNow()
    );
  }

  /**
   * Where the shape's own center sits, for a link whose CoM was placed
   * elsewhere: the custom mark is defined as an offset from this point, so
   * the point deserves to be visible while the mark is off wandering.
   */
  comCentroidDot(link: Link): { x: number; y: number } | null {
    if (!(link instanceof RealLink) || !link.comIsCustom) return null;
    const centroid = uniformBodyOf(link.joints).centroid;
    if (Math.hypot(centroid.x - link.CoM.x, centroid.y - link.CoM.y) < 1e-6) return null;
    return centroid;
  }

  /** Live while a CoM mark rides the pointer; the ring stays lit through it. */
  draggingCoMLink?: RealLink;

  startComDrag(link: RealLink, event: PointerEvent): void {
    event.stopPropagation();
    event.preventDefault();
    // A center of mass is a *property*, not geometry -- `applyMechanismPose`
    // writes it back from solved frames, and the panel speaks it in three
    // different frames -- so it is refused wherever the panel's CoM fields are
    // rather than wherever a drag is. It asked for `drag`, which Phase 2 allows
    // at a paused pose, and so stayed live beside its own frozen fields.
    if (!this.permission.may('properties')) return;
    // And a Lock holds it, as it holds every other way of moving this link.
    if (this.mechanismSrv.isLockedTarget(link)) {
      this.refuseLockedCoM(link);
      return;
    }
    this.draggingCoMLink = link;
    const started = { x: link.CoM.x, y: link.CoM.y };
    let moved = false;
    let savedElsewhere = false;
    const move = (e: PointerEvent) => {
      // Asked every move, not once at the grab. A gesture that began while the
      // gates were open went on writing through a mode switch and through Play:
      // the mark followed the pointer with every visible surface saying the
      // drawing was read-only, and the release saved it.
      // Both, every move. A Lock applied *during* the gesture -- the K key is
      // one press away -- left the panel showing Unlock and the lock marks
      // drawn while the mark kept following the pointer.
      if (!this.permission.may('properties') || this.mechanismSrv.isLockedTarget(link)) {
        // A Lock applied mid-gesture has already written the state it locked,
        // so the end of this gesture must not write it again: the two entries
        // were byte-identical, and the first Undo was a visible no-op that
        // could not take the lock back either.
        savedElsewhere = this.mechanismSrv.isLockedTarget(link);
        up();
        return;
      }
      const pos = this.svgGrid.screenToModelFromXY(e.clientX, e.clientY);
      const placed = e.altKey ? pos : this.snapComToJointLines(link, pos);
      link.placeCustomCoM({ x: placed.x, y: placed.y });
      moved = true;
      // So the panel's X/Y read the drag as it happens, like a force's do.
      this.activeObjService.fakeUpdateSelectedObj();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.endComDrag = undefined;
      if (this.draggingCoMLink === undefined) return;
      this.draggingCoMLink = undefined;
      // Nothing to write down for a grab that never moved -- and for one cut
      // short by the gates closing under it, what it already wrote is the last
      // position it was allowed to write.
      if (!moved) return;
      // One undo step for the whole gesture, then the panel re-reads its
      // fields the same way a unit change makes it re-read them.
      this.mechanismSrv.updateMechanism(!savedElsewhere);
      this.mechanismSrv.onMechUpdateState.next(2);
      this.activeObjService.fakeUpdateSelectedObj();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    // And a way to end it from outside. A pointer released in another tab sends
    // no `pointerup` here, so the listeners stayed on and the mark followed the
    // next buttonless move across the window.
    this.endComDrag = (revert) => {
      if (revert && moved) {
        // The gesture never finished, so nothing was decided. Same rule the
        // joints follow: what a view gesture moved on its way to being
        // recognized is put back, not committed.
        link.placeCustomCoM({ x: started.x, y: started.y });
        moved = false;
      }
      up();
    };
  }

  /**
   * Ends the CoM gesture from outside, for the paths that hear about a release
   * it does not -- and, with `revert`, for the ones that were never a release.
   */
  private endComDrag?: (revert?: boolean) => void;

  /** Say why a locked link's center of mass will not follow the pointer. */
  private refuseLockedCoM(link: RealLink): void {
    this.notify.refusal(
      'com.locked',
      `Link ${link.name || link.id} is locked. Unlock it to move its center of mass.`
    );
  }

  /**
   * A dragged center snaps to the lines a reader would put it on: the
   * centerline of a bar, each side of a triangle — every joint-pair segment
   * of the link. Alt suspends it, like every other snap on the canvas.
   */
  private snapComToJointLines(link: RealLink, pos: Coord): { x: number; y: number } {
    const joints = link.joints;
    let best: { x: number; y: number } | undefined;
    let bestDist = this.svgGrid.scaleWithZoom(12);
    // The centroid outranks the lines: it is the point the whole feature is
    // an offset from, and a pointer near it means it exactly.
    const centroid = uniformBodyOf(joints).centroid;
    if (Math.hypot(pos.x - centroid.x, pos.y - centroid.y) < bestDist) {
      return centroid;
    }
    for (let i = 0; i < joints.length; i++) {
      for (let j = i + 1; j < joints.length; j++) {
        const a = joints[i];
        const b = joints[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSq = dx * dx + dy * dy;
        if (!(lengthSq > 0)) continue;
        const t = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / lengthSq));
        const proj = { x: a.x + t * dx, y: a.y + t * dy };
        const dist = Math.hypot(pos.x - proj.x, pos.y - proj.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = proj;
        }
      }
    }
    return best ?? pos;
  }

  /** Which cylinder part's mass field is being pointed at in the panel. */
  cylinderPartPreview?: 'barrel' | 'rod' | 'head';

  setCylinderPartPreview(part: NewGridComponent['cylinderPartPreview']): void {
    this.cylinderPartPreview = part;
  }

  /** The pointed-at part's own outline, in the hover accent — barrel and rod
   *  by their skins, the piston head by the block that draws it. */
  cylinderPartPreviewPath(cyl: CylinderMark): string | null {
    if (!this.cylinderPartPreview || !this.isBodySelected(cyl)) return null;
    if (this.cylinderPartPreview === 'barrel') return cyl.barrel;
    if (this.cylinderPartPreview === 'rod') return cyl.rod;
    return cyl.block;
  }

  /** The measured stretch: the frame's zero to the CoM's coordinate on one axis. */
  comMeasureLine(m: NonNullable<NewGridComponent['comMeasure']>) {
    if (m.mode === 'axis') {
      const to = m.axis === 'x' ? { x: 0, y: m.com.y } : { x: m.com.x, y: 0 };
      return { from: { x: m.com.x, y: m.com.y }, to };
    }
    const to = m.axis === 'x' ? { x: m.com.x, y: m.origin.y } : { x: m.origin.x, y: m.com.y };
    return { from: m.origin, to };
  }

  /** End caps like the length overlay's: short bars across the line. */
  comMeasureCaps(m: NonNullable<NewGridComponent['comMeasure']>): string {
    const { from, to } = this.comMeasureLine(m);
    const t = SettingsService.objectScale / 7;
    return m.axis === 'x'
      ? `M${from.x} ${from.y - t} L${from.x} ${from.y + t} M${to.x} ${to.y - t} L${to.x} ${to.y + t}`
      : `M${from.x - t} ${from.y} L${from.x + t} ${from.y} M${to.x - t} ${to.y} L${to.x + t} ${to.y}`;
  }

  /** A dashed run from the line's end to the mark it measures to. */
  comMeasureConnector(m: NonNullable<NewGridComponent['comMeasure']>): string {
    if (m.mode === 'axis') return '';
    const { to } = this.comMeasureLine(m);
    return `M${to.x} ${to.y} L${m.com.x} ${m.com.y}`;
  }

  /**
   * Where the number stands: on the line, at its middle.
   *
   * It used to sit clear of the line, because a bare label centered on one runs
   * its digits through the stroke. The chip has its own white and breaks the
   * hairline instead, which is what every other dimension here does.
   */
  comMeasureLabelPos(m: NonNullable<NewGridComponent['comMeasure']>) {
    const { from, to } = this.comMeasureLine(m);
    return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  }

  /** The measure, in the reader's own length unit. */
  comMeasureLabel(m: NonNullable<NewGridComponent['comMeasure']>): string {
    return this.nup.formatModelLength(this.comMeasureValue(m), this.settings.lengthUnit.getValue());
  }

  comMeasureValue(m: NonNullable<NewGridComponent['comMeasure']>): number {
    return m.axis === 'x' ? Math.abs(m.com.x - m.origin.x) : Math.abs(m.com.y - m.origin.y);
  }

  /**
   * The stretch of ground the rod's mount covers, drawn on the canvas.
   *
   * One picture for both fields, because they are two readings of one line:
   * *Travel* is how long it is, and *Starts at* is how far along it the ram is
   * standing. Drawn as the mount's own path rather than as a bar beside the
   * barrel — what a user wants to see when typing a stroke is where the end of
   * the ram will get to, and that is a place on the grid rather than a length
   * in the abstract.
   *
   * Nothing is drawn for a ram with no usable travel: the line would be a point
   * and the number beside it a zero, which says less than the panel already does.
   */
  get cylinderRange():
    { from: Coord; to: Coord; at: Coord; showsPosition: boolean; label: string } | undefined {
    if (!this.cylinderRangeOverlay) return undefined;
    const sealed = this.mechanismSrv.cylinderAt(this.activeObjService.selectedLink);
    if (!sealed) return undefined;
    const r = 0.15 * this.settings.objectScale;
    const size = cylinderSizeOf(sealed, r);
    if (!(size.stroke > 0)) return undefined;

    const { barrelFar, rodFar } = sealed;
    const span = Math.hypot(rodFar.x - barrelFar.x, rodFar.y - barrelFar.y);
    if (!(span > 1e-9)) return undefined;
    const ux = (rodFar.x - barrelFar.x) / span;
    const uy = (rodFar.y - barrelFar.y) / span;
    const at = (along: number) => new Coord(barrelFar.x + along * ux, barrelFar.y + along * uy);

    const ends = cylinderSpanRange(size.stroke, r);
    const showsPosition = this.cylinderRangeOverlay === 'start';
    return {
      from: at(ends.retracted),
      to: at(ends.extended),
      at: at(span),
      showsPosition,
      label: showsPosition
        ? `${Math.round(size.start * 1000) / 10}%`
        : this.nup.formatModelLength(size.stroke, this.settings.lengthUnit.getValue()),
    };
  }

  /** Whether the slot-angle field is being pointed at. */
  slotAngleOverlay = false;

  setSlotAngleOverlay(showing: boolean): void {
    this.slotAngleOverlay = showing;
  }

  /**
   * What a grounded slot's angle is measured from, drawn where the slot is.
   *
   * The panel used to say "Slot angle measured from the +x axis" underneath the
   * field, which is a sentence explaining a picture. This is the picture: a ray
   * out along +x from the block, the slot's own direction, and the arc between
   * them carrying the number. Nothing has to be read to know which way a bigger
   * number turns the slot, because the arc is already going that way.
   */
  get slotAngleGuide():
    | { at: Coord; axis: Coord; along: Coord; arc: string; label: string; labelAt: Coord }
    | undefined {
    if (!this.slotAngleOverlay) return undefined;
    const slider = this.mechanismSrv.sliderFor(this.activeObjService.selectedJoint);
    if (!slider || !slider.ground) return undefined;

    // Clear of the block, which is itself about 0.58 object scales across the
    // joint: drawn any smaller the whole guide hides underneath the part it is
    // describing, which is how the first cut of it looked.
    const radius = 1.8 * this.settings.objectScale;
    const angle = slider.slotAngle;
    const at = new Coord(slider.x, slider.y);
    const axis = new Coord(at.x + radius, at.y);
    const along = new Coord(at.x + radius * Math.cos(angle), at.y + radius * Math.sin(angle));

    // Swept from +x to the slot, the short way round, so the arc reads as the
    // angle the number names rather than as its reflex twin.
    const swept = Math.atan2(Math.sin(angle), Math.cos(angle));
    const arcRadius = radius * 0.62;
    const arcEnd = new Coord(
      at.x + arcRadius * Math.cos(swept),
      at.y + arcRadius * Math.sin(swept)
    );
    const sweepFlag = swept >= 0 ? 1 : 0;
    const arc =
      `M ${at.x + arcRadius} ${at.y} ` +
      `A ${arcRadius} ${arcRadius} 0 0 ${sweepFlag} ${arcEnd.x} ${arcEnd.y}`;

    const halfway = swept / 2;
    const labelRadius = arcRadius + 0.16 * this.settings.objectScale;
    return {
      at,
      axis,
      along,
      arc,
      // The same words every other angle on this canvas is written in. It
      // used to spell its own degree sign and its own degrees, so it read
      // "45°" beside the length dimension's "45 deg" -- and it went on saying
      // degrees to a reader who had asked for radians.
      label: this.nup.formatValueAndUnit(
        this.nup.convertAngle(
          (swept * 180) / Math.PI,
          AngleUnit.DEGREE,
          this.settings.angleUnit.getValue()
        ),
        this.settings.angleUnit.getValue()
      ),
      labelAt: new Coord(
        at.x + labelRadius * Math.cos(halfway),
        at.y + labelRadius * Math.sin(halfway)
      ),
    };
  }

  /** End ticks across the travel line, so its two ends read as limits. */
  cylinderRangeCaps(range: { from: Coord; to: Coord }): Segment[] {
    const dx = range.to.x - range.from.x;
    const dy = range.to.y - range.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const half = 0.12 * this.settings.objectScale;
    const nx = (-dy / length) * half;
    const ny = (dx / length) * half;
    return [range.from, range.to].map((end) => ({
      x1: end.x - nx,
      y1: end.y - ny,
      x2: end.x + nx,
      y2: end.y + ny,
    }));
  }

  /** The label sits clear of the line, on the side away from the barrel. */
  /** On the travel line, at its middle: the chip breaks the hairline there. */
  cylinderRangeLabelPos(range: { from: Coord; to: Coord }): Coord {
    return new Coord((range.from.x + range.to.x) / 2, (range.from.y + range.to.y) / 2);
  }

  /**
   * Whether the selection is this cylinder's body, however it was selected.
   *
   * Including by selecting the whole machine it belongs to: the cylinder is
   * drawn as one part by its own skin rather than through the link classes, so
   * it was the one body a machine-wide selection left unlit.
   */
  isBodySelected(mark: CylinderMark): boolean {
    if (
      this.activeObjService.objType === 'Link' &&
      this.activeObjService.selectedLink?.id === mark.body.id
    ) {
      return true;
    }
    return this.mechanismSrv.isPartInSelectedMechanism(mark.body);
  }

  /** The reader is pointing at this cylinder's machine in the transport. */
  isBodyHovered(mark: CylinderMark): boolean {
    return this.mechanismSrv.isPartInHoveredMechanism(mark.body) || this.isBodyPointedAt(mark);
  }

  /** Or at this ram itself, from a list that offers it as one part. */
  isBodyPointedAt(mark: CylinderMark): boolean {
    return this.mechanismSrv.isPointedAtBody(mark.body);
  }

  /**
   * The selection stroke traces the part's exact silhouette — sharp at every
   * profile step, curved only at the two end caps. The mark computes it
   * analytically, so there is no union to pay for or to soften the corners.
   */
  cylinderSilhouette(mark: CylinderMark): string {
    return mark.contour;
  }

  /** A link the cylinder skin is standing in for, so it is not drawn twice. */
  private skinnedLink(link: Link): CylinderMark | undefined {
    return this.cylinderList.find((mark) => mark.barrelId === link.id || mark.rodId === link.id);
  }

  /**
   * Everything in the slider layer, deepest first.
   *
   * A block is above the carrier it slides in; a link is above the block it is
   * pinned to. Emitting each assembly as a unit — block, then its riders — can
   * only honor those two while no link is ever both a carrier and a rider, and
   * the Scotch yoke's yoke is exactly that. It also put one assembly's block
   * over another's rider whenever the two shared a link, which is what a pair
   * of dangling blocks on one bar looks like. Ordering by depth is the same two
   * rules, applied to the chain rather than to a layer number.
   */
  get slotStack(): SlotStackItem[] {
    const depths = drawDepths(this.mechanismSrv.getJoints());
    const items: SlotStackItem[] = [];
    for (const mark of this.sliderMarkList) {
      if (this.isSkinned(mark)) continue;
      const blockDepth = depths.block.get(mark.id) ?? 1;
      items.push({ key: `${mark.id}:block`, depth: blockDepth, kind: 'block', mark });
      const plate = mark.plate;
      if (plate) {
        items.push({
          key: `${mark.id}:plate`,
          depth: depths.link.get(plate.links[0]?.id ?? '') ?? blockDepth + 1,
          kind: 'plate',
          mark,
          plate,
        });
      }
      for (const rider of mark.riders) {
        items.push({
          key: `${mark.id}:${rider.link.id}`,
          depth: depths.link.get(rider.link.id) ?? blockDepth + 1,
          kind: 'rider',
          mark,
          rider,
        });
      }
    }
    return items.sort((a, b) => a.depth - b.depth);
  }

  /**
   * The weight of a grounded guide's rails, matched to the ground symbol a
   * grounded pin already uses.
   *
   * `Ground.svg` is placed at 1.2 objectScale and draws its baseline 4/157 of
   * its own width, so this is that same line in model units. It deliberately
   * does not go through `scaleWithZoom`: that keeps a stroke a constant number
   * of screen pixels, and the asset beside it does not, so across a 25x zoom
   * range a rail went from half the hatch's weight to twelve times it. The two
   * marks say the same thing about the same world, so they have to be drawn the
   * same way, and the asset is the one that cannot change.
   *
   * Stated in R by `GROUND_STROKE` rather than here, because the hatch geometry
   * needs the same two numbers to sit its ticks against the rail, and a stroke
   * the drawing and the geometry each carry their own copy of is a stroke they
   * can disagree about.
   */
  get groundLineWidth(): number {
    return GROUND_STROKE.rail * 0.15 * this.settings.objectScale;
  }

  /** The hatch bars of that same symbol, drawn at 5/157 of its width. */
  get groundHatchWidth(): number {
    return GROUND_STROKE.hatch * 0.15 * this.settings.objectScale;
  }

  /**
   * A link its own slider assembly is drawing: either fused into a weld plate,
   * or hoisted above the block it is pinned to. Either way the link layer has
   * to leave it alone, or it is drawn twice at 0.7 alpha over itself.
   */
  private platedLink(link: Link): boolean {
    return this.sliderMarkList.some((mark) => {
      if (this.isSkinned(mark)) return false;
      if (mark.plate?.links.some((rider) => rider.id === link.id)) return true;
      return mark.riders.some((rider) => rider.link.id === link.id);
    });
  }

  /** A slider the cylinder skin has replaced. */
  isSkinned(mark: SliderMark): boolean {
    return this.cylinderList.some((cylinder) => cylinder.pin.id === (mark.pin as Joint).id);
  }

  /**
   * A cylinder's interior joints — the buried barrel end, the pin, and the
   * sliding joint — get no hitbox, hover, label or selection at all. Only the
   * two mounts remain selectable; the skin's own geometry selects the body.
   */
  isCylinderInterior(joint: Joint): boolean {
    // Checked against the structural resolution as well as the drawn marks:
    // the marks are geometric, and mid-edit (a weld landing, a drag in
    // flight) they can lag a frame — long enough for an interior label to
    // blink into view.
    if (
      this.cylinderList.some(
        (mark) =>
          mark.hiddenJointId === joint.id ||
          mark.pin.id === joint.id ||
          mark.cylinder.slider.id === joint.id
      )
    ) {
      return true;
    }
    const sealed = this.mechanismSrv.cylinderAt(joint);
    return !!sealed && isCylinderInteriorOf(sealed, joint);
  }

  /** One tag per part: the rod defers to the barrel's tag. */
  isSecondaryCylinderTag(link: Link): boolean {
    const sealed = this.mechanismSrv.cylinderAt(link);
    return !!sealed && link.id !== sealed.barrel.id;
  }

  /**
   * Whether this mode refuses to let the mechanism be *restructured*.
   *
   * It was `geometryLocked`, and it meant it: the whole drawing was painted as
   * scenery, with a `pointer-events: none` layer over the forces and every part
   * drawn in the grayed family. None of that is true now -- a part in an
   * analysis mode is a thing you can pick up -- so what is left of the old lock
   * is this narrower question, asked by the gestures that build rather than by
   * the ones that move.
   */
  get structureLocked(): boolean {
    return this.permission.modeLocksStructure();
  }

  /**
   * The color one joint is drawn in, or nothing for the family they all share.
   *
   * A family is three colors, one per state, so this follows the state rather
   * than standing aside from it -- that is what keeps a joint reading as one
   * object resting, pointed at and picked. Amber returns nothing at all: it is
   * what the stylesheet already draws, so a drawing nobody has colored is
   * drawn by exactly the rules it always was.
   *
   * The grayed-out analysis state is the one exception. Scenery is scenery
   * whatever color it would otherwise be.
   */
  jointFillOf(joint: Joint): string | null {
    if (!joint.colorFamily) return null;
    const state = this.mechanismSrv.getJointCSSClass(joint);
    if (state.includes('joint-inert')) return null;
    const family = this.colors.jointFamily(joint.colorFamily);
    if (state.includes('joint-selected')) return family.selected;
    if (state.includes('joint-highlight') || state.includes('joint-dragging')) return family.hover;
    return family.normal;
  }

  /**
   * The ring a selected joint wears inside its own edge, if it needs one.
   *
   * Amber is what "picked" means everywhere in the app, and a joint in another
   * family keeps its own color rather than borrowing it -- so the fill says
   * which joint this is and the ring says it is the selected one. A joint
   * already drawn in amber needs no ring: its picked color is the ring color.
   */
  selectionRingOn(joint: Joint): string | null {
    if (!joint.colorFamily) return null;
    return this.mechanismSrv.getJointCSSClass(joint).includes('joint-selected')
      ? SELECTION_RING
      : null;
  }

  /** How wide that ring is drawn, in screen pixels however far this is zoomed. */
  selectionRingWidth(): number {
    return this.svgGrid.scaleWithZoom(SELECTION_RING_PX);
  }

  /**
   * The padlock's ink on a given joint.
   *
   * The badge is drawn on the joint rather than beside it, so on a dark one the
   * default near-black glyph disappears into the pin it is sitting on. A welded
   * joint brings its own white chip and the glyph stands on that instead.
   */
  lockInkOn(joint: Joint): string | null {
    const fill = this.jointFillOf(joint);
    if (!fill || this.gridUtils.getWelded(joint)) return null;
    return luminanceOf(fill) > INK_FLIPS_AT ? '#263238' : '#eceff1';
  }

  /**
   * The color one force is drawn in -- line, arrowhead and anchor together.
   *
   * Nothing in an analysis mode where the force is scenery: a load on a body
   * this analysis has nothing to say about is grayed with the body, and a
   * color somebody chose is still a louder thing than the machine being
   * analyzed.
   */
  /** The global visibility switch applies to traced paths in every drawing mode. */
  tracesVisible(): boolean {
    return this.settings.isShowTraces.value && this.tabService.getCurrentTab() !== TabID.SYNTHESIZE;
  }

  forceInkOf(force: Force): string | null {
    if (this.mechanismSrv.isPartInert(force.link)) return null;
    return force.color || DEFAULT_FORCE_COLOR;
  }

  /**
   * The ink the "this is not attached to anything" marks are drawn in.
   *
   * Red on the canvas means "fix this", which is a thing to do in Edit. In an
   * analysis mode the same geometry is scenery -- grayed out, not analyzed, not
   * even selectable -- so a red ring around it is the loudest thing on a canvas
   * about something the reader cannot act on and did not ask about. It goes
   * gray with the rest of the body it marks.
   */
  get orphanMarkInk(): string {
    return this.tabService.isAnalysisMode() ? '#b6bac6' : '#F44336';
  }

  /** The pale fill inside that mark, likewise. */
  get orphanMarkFill(): string {
    return this.tabService.isAnalysisMode() ? '#d9dbe2' : '#c5cae9';
  }

  /**
   * How big a name on the canvas is drawn, for joints, links and forces alike.
   *
   * A fraction of the object scale rather than a pixel size, so a name keeps
   * its proportion to the part it names at every zoom level.
   */
  get tagFontSize(): number {
    return this.settings.objectScale * 0.2;
  }

  /**
   * The angle a link's name is written at, in degrees clockwise from flat.
   *
   * A bar is long and thin, and a name longer than a couple of letters written
   * across it hangs off both edges. Written along it, it has the whole bar to
   * sit in. Only bars: a compound body is not a direction, and a two-letter
   * name already fits, so both stay level and stay easy to read.
   *
   * Kept within a quarter turn of flat, so the name is never upside down.
   */
  private linkLabelAngle(link: Link, name: string): number {
    if ((link.joints?.length ?? 0) !== 2) return 0;
    if (name.length <= 2) return 0;
    const [from, to] = link.joints;
    // Screen degrees: y runs down here, and the label sits in a frame that has
    // already flipped it, so the rise is negated.
    let angle = (Math.atan2(-(to.y - from.y), to.x - from.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    return Math.round(angle * 10) / 10;
  }

  /**
   * Whether this link's center-of-mass mark is on screen right now.
   *
   * The view toggle governs it, but a massless link is excused: mass starts at
   * zero until someone chooses one, and a center-of-mass mark on a link with no
   * mass points at a property the link does not have. The preview (hovering
   * the analysis panel's center-of-mass heading) still shows it, because there
   * the reader is asking about exactly that property.
   */
  showsCoM(link: Link): boolean {
    if (this.settings.previewCoMLinkId === link.id) return true;
    // A slider block carries mass but has no center-of-mass mark to draw --
    // getLinkProp declines it -- so asking for one drew four undefined
    // quarters. The rule is a body with a mass, and a block is not one of the
    // bodies this mark is about.
    return this.settings.isShowCOM.value && link instanceof RealLink && link.mass > 0;
  }

  /**
   * Where a link's name goes, and in what ink.
   *
   * The anchor is the average of the joints the link is made of, which is
   * inside the hull they describe -- and the body is drawn around that hull, so
   * it is inside the body. Not the center of mass, which is a physical property
   * with a field of its own in the Edit panel: a link told its mass sits out at
   * one end is a link whose name was written off the metal.
   *
   * Two bodies are not their own hull. A welded link is the Boolean union of
   * its parts and can be any shape at all -- an L has nothing in the crook --
   * so the name goes in the middle of its biggest part, which is inside the
   * union because that part is. And a bar carrying a slot is drawn as a rail
   * with a channel down it, so the name goes in the channel, in full black:
   * there is no body color behind it there to be read against.
   */
  linkLabelStyle(link: Link): {
    x: number;
    y: number;
    ink: string;
    opacity: number;
    name: string;
    angle: number;
  } {
    const name = this.linkDisplayName(link);
    const angle = this.linkLabelAngle(link, name);
    const slot = this.slotCarriedBy(link);
    if (slot) {
      const [from, to] = [slot.slotJointA!, slot.slotJointB!];
      return {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
        // Black *in a channel*, because there is no body color behind the name
        // there. A cylinder's barrel carries a slot too -- that is how the rod
        // slides in it -- but it is drawn as painted metal, so its name is read
        // against its own color like every other body's. Left on black, a
        // cylinder given one of the dark navies disappeared while the bar
        // beside it in the same color turned its name white.
        ink: this.mechanismSrv.cylinderAt(link) ? this.linkLabelInk(link) : 'black',
        opacity: 1,
        name,
        angle,
      };
    }
    const parts = (link instanceof RealLink ? link.subset : []) ?? [];
    const middleOf = (of: Link) => {
      const joints = of.joints ?? [];
      if (joints.length === 0) return { x: 0, y: 0 };
      return {
        x: joints.reduce((total, joint) => total + joint.x, 0) / joints.length,
        y: joints.reduce((total, joint) => total + joint.y, 0) / joints.length,
      };
    };
    const span = (part: Link) => {
      const first = part.joints[0];
      const last = part.joints[part.joints.length - 1];
      return first && last ? Math.hypot(last.x - first.x, last.y - first.y) : 0;
    };
    const on =
      parts.length === 0
        ? link
        : parts.reduce((best, part) => (span(part) > span(best) ? part : best));
    const center = middleOf(on);
    // On a bar the name gives up the center to the center-of-mass mark and a
    // locked length's chip by moving *along* the bar, toward its higher end;
    // stepping "up" across the bar put a flat bar's name on top of its chip.
    const axis = this.barAxis(link);
    if (axis && (this.showsCoM(link) || this.lengthChipShown(link))) {
      const along = this.labelHalfExtentAlong(name, angle, axis);
      const off = this.centerClearance() + along;
      center.x += axis.x * off;
      center.y += axis.y * off;
    }
    return { ...center, ink: this.linkLabelInk(link), opacity: 0.55, name, angle };
  }

  /**
   * The direction along a two-joint bar the name moves in, or nothing for a
   * body that has no direction. Toward the bar's higher end, so the name is
   * above the center and the chip below it whichever way the bar was drawn;
   * a flat bar sends it toward the right-hand end.
   */
  private barAxis(link: Link): { x: number; y: number } | undefined {
    if ((link.joints?.length ?? 0) !== 2) return undefined;
    if (link instanceof RealLink && link.subset.length > 0) return undefined;
    const [from, to] = link.joints;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const span = Math.hypot(dx, dy);
    if (span < 1e-9) return undefined;
    const up = dy > 1e-9 || (Math.abs(dy) <= 1e-9 && dx > 0) ? 1 : -1;
    return { x: (up * dx) / span, y: (up * dy) / span };
  }

  /** Whether this bar wears a length chip right now. */
  private lengthChipShown(link: Link): boolean {
    return (
      this.holdsVisible() &&
      this.mechanismSrv.holdOf(link) === 'length' &&
      !this.mechanismSrv.isLockedTarget(link)
    );
  }

  /** How far from the center anything must sit to clear the center-of-mass mark. */
  private centerClearance(): number {
    return 0.16 * this.settings.objectScale + this.svgGrid.scaleWithZoom(4);
  }

  /**
   * Half of how much a name takes up along the bar: a name written along the
   * bar is its own width; one left flat is its box projected onto the axis.
   */
  private labelHalfExtentAlong(
    name: string,
    angle: number,
    axis: { x: number; y: number }
  ): number {
    const width = name.length * this.tagFontSize * 0.32;
    const height = this.tagFontSize * 0.4;
    if (angle !== 0) return width;
    return Math.abs(axis.x) * width + Math.abs(axis.y) * height;
  }

  /** Half of how much a chip takes up along the bar: its box projected onto the axis. */
  private chipHalfExtentAlong(width: number, axis: { x: number; y: number }): number {
    return (Math.abs(axis.x) * width) / 2 + Math.abs(axis.y) * this.svgGrid.scaleWithZoom(11);
  }

  /**
   * Where a length's chip sits on a bar: from the center, along the bar and
   * away from the name, by enough to clear the center-of-mass mark. The hover
   * dimension's pill sits in exactly this place too, so locking the length
   * turns the one into the other without anything moving.
   */
  private lengthChipPlace(link: Link, chipWidth: number): { x: number; y: number } | undefined {
    const axis = this.barAxis(link);
    if (!axis) return undefined;
    const [a, b] = link.joints;
    const off = this.centerClearance() + this.chipHalfExtentAlong(chipWidth, axis);
    return { x: (a.x + b.x) / 2 - axis.x * off, y: (a.y + b.y) / 2 - axis.y * off };
  }

  /**
   * The length dimension on the selected bar: where its pill goes, and how
   * much of the bar around it the hairline leaves clear. Nothing for a
   * joint's distance-to-joint dimension or a cylinder, which keep the
   * midpoint and the middle third.
   */
  private lengthDimensionOnBar():
    { center: { x: number; y: number }; halfGap: number } | undefined {
    if (this.activeObjService.objType !== 'Link') return undefined;
    const link = this.activeObjService.selectedLink;
    if (!link || this.mechanismSrv.cylinderAt(link)) return undefined;
    const axis = this.barAxis(link);
    if (!axis) return undefined;
    // Sized for the chip, glyph and all, so the pill lands where the chip will.
    const width = this.pillWidth(this.lengthOverlayLabel(), true);
    const center = this.lengthChipPlace(link, width);
    if (!center) return undefined;
    return {
      center,
      halfGap: this.chipHalfExtentAlong(width, axis) + this.svgGrid.scaleWithZoom(8),
    };
  }

  /**
   * The two ends of the hairline along the bar, as distances from the first
   * joint: up to the gap the pill sits in, and from that gap to the far end.
   */
  private hairlineReach(): { toGap: number; fromGap: number; length: number } {
    const { x1, y1, x2, y2 } = this.findStartAndEndPoints();
    const length = Math.hypot(x2 - x1, y2 - y1);
    const onBar = this.lengthDimensionOnBar();
    if (!onBar || length < 1e-9) {
      return { toGap: length / 3, fromGap: (2 * length) / 3, length };
    }
    const along = ((onBar.center.x - x1) * (x2 - x1) + (onBar.center.y - y1) * (y2 - y1)) / length;
    return {
      toGap: Math.max(0, along - onBar.halfGap),
      fromGap: Math.min(length, along + onBar.halfGap),
      length,
    };
  }

  /** The slot this bar carries, if it is a plain bar carrying one. */
  private slotCarriedBy(link: Link): PrisJoint | undefined {
    if ((link.joints?.length ?? 0) !== 2) return undefined;
    return this.mechanismSrv.joints.find(
      (joint): joint is PrisJoint =>
        joint instanceof PrisJoint &&
        joint.carrier?.id === link.id &&
        !!joint.slotJointA &&
        !!joint.slotJointB
    );
  }

  /**
   * Black or white, whichever the link's own color can be read against.
   *
   * The label sits on the body it names, and the bodies run from pale mint to
   * navy, so one ink cannot serve them all. Through `contrast.ts`, which is
   * where the joint mark and the swatch picker get the same answer: this used
   * to do its own luminance and flip at its own threshold, so a band of grays
   * took dark ink on the mark and light ink on the name beside it.
   */
  linkLabelInk(link: Link): string {
    // A body the analysis modes have nothing to say about is drawn in one pale
    // gray whatever color it was given, so its name is read against that gray
    // rather than against the color it no longer wears. A dark link's white
    // name went invisible the moment the body went gray under it.
    if (this.mechanismSrv.isPartInert(link)) return 'black';
    const fill = (link as { fill?: string }).fill ?? '#ffffff';
    return luminanceOf(fill) > INK_FLIPS_AT ? 'black' : 'white';
  }

  /**
   * What a link's canvas tag calls it. A sealed cylinder's interior joints are
   * an implementation detail, so its letters come from the two mounts alone —
   * and a compound that swallowed a member keeps only its visible letters too.
   */
  linkDisplayName(link: Link): string {
    const sealed = this.mechanismSrv.cylinderAt(link);
    if (!sealed) return link.name;
    const interior = new Set(
      [sealed.pin.id, sealed.slider.id, sealed.barrelNear.id].map((id) => id)
    );
    const stripped = [...link.name].filter((letter) => !interior.has(letter)).join('');
    if (link.id === sealed.barrel.id || link.id === sealed.rod.id) {
      return `${sealed.barrelFar.name}${sealed.rodFar.name}`;
    }
    return stripped || link.name;
  }

  /** A member link of a sealed cylinder: never a slot-drop target. */
  private isCylinderMemberLink(link: Link): boolean {
    return this.cylinderList.some(
      (mark) =>
        mark.barrelId === link.id || mark.rodId === link.id || mark.cylinder.block.id === link.id
    );
  }

  /**
   * Whether the link layer draws this body with holes in it. A skinned or
   * plated link is drawn somewhere else, and its holes are handed back there.
   */
  hasChannelHit(link: Link): boolean {
    return this.channelCountOn(link) > 0 && !this.skinnedLink(link) && !this.platedLink(link);
  }

  /**
   * How many channels this carrier holds. Published on the element because a
   * cut channel is otherwise indistinguishable from a compound link's extra
   * subpath, and a test that cannot tell them apart is not testing the channel.
   */
  channelCountOn(link: Link): number {
    return (
      this.channelList.filter((channel) => channel.carrierId === link.id).length +
      (this.slotCandidate?.carrier.id === link.id ? 1 : 0)
    );
  }

  /**
   * Where the motor's turning arrow is drawn: exactly where a grounded input
   * draws its own. The wider circle the arrow rides is in the asset, not here,
   * so the two stay the same weight and the same placement.
   */
  get motorArrowBox(): { size: number; x: number; y: number } {
    const box = this.settings.objectScale * 1.2;
    return { size: box, x: -0.505 * box, y: -0.435 * box };
  }

  /** The motor's case in its own frame, for the black layer beneath the links. */
  get drivenPinCase(): string {
    return motorBodyPath(0.15 * this.settings.objectScale);
  }

  /** The unioned outline, per pose, so the clipping is not redone every frame. */
  private motorUnionCache?: {
    pose: number;
    scale: number;
    byLink: Map<string, string>;
    motors: DrivenPinMotor[];
  };

  /**
   * A link's outline, with the motor's case fused into it where one is bolted
   * on (§2.9).
   *
   * A union rather than a black box laid behind: the motor's case *is* part of
   * the body it is bolted to, and drawing it as a separate shape in a separate
   * color says the opposite -- that it is an ornament sitting on the joint.
   * Same Boolean and the same fillet a welded compound uses, so a motor reads
   * as the app's other rigid attachments read.
   */
  private outlineWithMotor(link: Link): string {
    const pose = this.mechanismSrv.poseRevision;
    const scale = this.settings.objectScale;
    if (this.motorUnionCache?.pose !== pose || this.motorUnionCache.scale !== scale) {
      // The motors are re-derived once per rebuild rather than per link: the
      // getter walks every joint and resolves an actuator for each driven one,
      // and it cannot answer differently within one pose.
      this.motorUnionCache = { pose, scale, byLink: new Map(), motors: this.drivenPinMotors };
    }
    const cached = this.motorUnionCache.byLink.get(link.id);
    if (cached !== undefined) return cached;

    // Read on the miss only: on a hit the fused path already holds it.
    const outline = String(this.mechanismSrv.getLinkProp(link, 'd') ?? '');
    const r = 0.15 * scale;
    const cases = this.motorUnionCache.motors
      .filter((motor) => motor.bodyId === link.id)
      .map((motor) => motorBodyAt(r, { x: motor.x, y: motor.y }, (motor.angle * Math.PI) / 180));
    const fused =
      cases.length === 0 ? outline : buildCompoundPath([outline, ...cases], MARK.fillet * r).path;
    this.motorUnionCache.byLink.set(link.id, fused);
    return fused;
  }

  /**
   * A carrier's outline with its channels cut out of it.
   *
   * The link already fills even-odd, so appending a channel subpath subtracts
   * it, and the link's own stroke then traces the new edge in the link's own
   * color — the channel is a hole in the bar rather than a lighter shape laid
   * on top, which is what keeps its legibility independent of the random color
   * that bar happens to have. A bar carrying two slots simply gets two
   * subpaths.
   */
  linkPathWithChannels(link: Link): string {
    // A skinned barrel or rod is drawn by the cylinder instead, so its ordinary
    // outline is suppressed rather than drawn underneath — otherwise the skin
    // would be a shape laid over the shape it replaces.
    if (this.skinnedLink(link)) return '';
    // Likewise a welded rider: its weld plate draws the rider and the block it
    // is fused to as one outline, so drawing the rider here as well would put
    // its own edge inside that outline and double the fill's alpha over itself.
    if (this.platedLink(link)) return '';
    const outline = this.outlineWithMotor(link);
    const channels = this.channelsCutInto(link);

    return channels === '' ? outline : `${outline} ${channels}`;
  }

  /**
   * The channels cut into this link, as one path in the world frame.
   *
   * The slot being previewed goes through the same subtraction a committed one
   * does, rather than being drawn as a stand-in on top. Two reasons: the hover
   * state is then pixel-identical to the result, and a real hole has no
   * legibility to lose against a link color it cannot predict -- every
   * stand-in considered (a white fill, an outline, an amber highlight) fell
   * below contrast on part of the palette, because the palette is random.
   */
  channelsCutInto(link: Link): string {
    const paths = this.channelList
      .filter((channel) => channel.carrierId === link.id)
      .map((channel) => channel.path);
    const preview = this.previewChannelOn(link);
    if (preview) paths.push(preview);
    return paths.length === 0 ? '' : mergedChannels(paths);
  }

  /**
   * A rider or plate outline with the previewed slot cut into it as well.
   *
   * The preview has to reach whatever is actually drawing the link. Once a
   * rider is hoisted out of the link layer, cutting the preview into the link
   * layer's copy cuts it into nothing, and sweeping a joint across a coupler
   * that happens to be pinned to a slider shows no feedback at all.
   *
   * The preview is merged with the piece's committed channels rather than
   * appended after them, for the same reason `linkPathWithChannels` merges: on
   * a carrier whose slot is already occupied the preview lands on top of the
   * committed channel, the overlap is wound twice, and the even-odd fill paints
   * the slot back in — a solid bar exactly where the drop is legal.
   */
  markPathWithPreview(
    mark: SliderMark,
    piece: { path: string; outline: string; cuts: string[] },
    link: Link
  ): string {
    const preview = this.previewChannelOn(link);
    if (!preview) return piece.path;
    return `${piece.outline} ${this.markChannelsCutInto(mark, piece, link)}`.trim();
  }

  /**
   * The same channels on their own, in the mark's frame: what the piece's `d`
   * has taken out of itself, for the hit shape that hands the holes back.
   */
  markChannelsCutInto(
    mark: SliderMark,
    piece: { outline: string; cuts: string[] },
    link: Link
  ): string {
    const preview = this.previewChannelOn(link);
    if (!preview) return piece.cuts.length === 0 ? '' : mergedChannels(piece.cuts);
    const angle = (mark.rotation * Math.PI) / 180;
    const localPreview = transformRigidPath(
      preview,
      { x: mark.x, y: mark.y },
      { x: mark.x + Math.cos(angle), y: mark.y + Math.sin(angle) },
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    );
    return mergedChannels([...piece.cuts, localPreview]);
  }

  private previewChannelOn(link: Link): string | undefined {
    const slot = this.slotCandidate;
    if (!slot || slot.carrier.id !== link.id) return undefined;
    const r = 0.15 * this.settings.objectScale;
    const separation = Math.hypot(slot.b.x - slot.a.x, slot.b.y - slot.a.y);
    return orientedCapsulePath(
      { x: (slot.a.x + slot.b.x) / 2, y: (slot.a.y + slot.b.y) / 2 },
      Math.atan2(slot.b.y - slot.a.y, slot.b.x - slot.a.x),
      slotHalfLength(r, separation),
      MARK.channelHalfWidth * r
    );
  }

  /**
   * The welded marker, at the 1.47R the mark system specifies.
   *
   * It replaces a hand-written path that predates the system and drew 2.2R —
   * larger than the free circle it stands opposite, which inverted the reading
   * that a weld removes a freedom. One marker, one size, everywhere.
   */
  get weldMarkerPath(): string {
    return plusPath(0.15 * this.settings.objectScale);
  }

  /**
   * Every link's color, as one string.
   *
   * A mark can be painted in a link's own color — a Slide's weld plate is its
   * rider's, a cylinder's skin is its barrel's — so recoloring changes a mark
   * while moving nothing at all. Every cache down here is keyed on where things
   * *are*, and a color is the one edit that changes what is drawn without
   * changing that, so it has to be in the key or the panel shows the new color
   * beside a canvas still wearing the old one.
   */
  private linkPaint(): string {
    return this.mechanismSrv
      .getLinks()
      .map((link) => `${link.id}:${(link as RealLink).fill}`)
      .join(',');
  }

  private freshMarks(): { marks: SliderMark[]; channels: Channel[] } {
    const joints = this.mechanismSrv.getJoints();
    const r = 0.15 * this.settings.objectScale;
    const key =
      `${r}|${this.linkPaint()}|${this.driveDirections(joints)}|` +
      joints
        .map((joint) => {
          const real = joint as RealJoint;
          const base = `${joint.id},${joint.x.toFixed(6)},${joint.y.toFixed(6)},${real.ground},${real.input},${real.isWelded}`;
          // Rebinding a slot changes its channel without moving anything, and a
          // grounded guide's angle turns its whole mark while every coordinate
          // in the mechanism stays exactly where it was -- so both have to be in
          // here, or editing the angle field redraws nothing.
          return joint instanceof PrisJoint
            ? `${base},${joint.angle_rad},${joint.carrier?.id},${joint.slotJointA?.id},${joint.slotJointB?.id}`
            : base;
        })
        .join(';');
    if (this.markCache?.key !== key) {
      this.markCache = {
        key,
        marks: this.sliderMarks.marks(joints, r, this.guides(), this.driveForward),
        channels: this.sliderMarks.channels(joints, r),
      };
    }
    return this.markCache;
  }

  /**
   * Re-answer "what would this drop do?" when Alt is pressed or let go.
   *
   * A modifier emits no pointer event, so without this the ring would sit there
   * claiming a target that Alt has already called off, and the user would have
   * to jiggle the mouse to find out whether the key registered. Alt also
   * releases a captured joint back to the cursor, because suppressing the snap
   * while leaving the joint parked on the target says the opposite.
   */
  @HostListener('window:keyup', ['$event'])
  onAltReleased($event: KeyboardEvent) {
    this.reconsiderDrop($event, false);
  }

  private reconsiderDrop($event: KeyboardEvent, held: boolean) {
    if ($event.key !== 'Alt') return;
    if (this.dragState.joint !== jointStates.dragging) return;

    this.updateDropCandidate(this.mouseLocation, held);
    const restingOn = this.snapTargetJoint ?? this.mouseLocation;
    this.activeObjService.selectedJoint = this.gridUtils.dragJoint(
      this.activeObjService.selectedJoint,
      new Coord(restingOn.x, restingOn.y)
    );
    this.activeObjService.updateSelectedObj(this.activeObjService.selectedJoint);
  }

  // Angular keys host listeners by event name, so this component gets exactly
  // one window:keydown. Alt is the only key the canvas reads for itself: it
  // means something only while a drag is in flight, which is state no registry
  // outside this component can see. Every other key is a shortcut, and those
  // are declared once in KeyboardShortcutsService and answered below.
  @HostListener('window:keydown', ['$event'])
  onKeyPress($event: KeyboardEvent) {
    this.reconsiderDrop($event, true);
    if ($event.key === 'Escape') this.abandonGesture();
  }

  /**
   * Put down a gesture that has been started and not finished.
   *
   * A creation gesture is armed by a menu row and disarmed by the click that
   * completes it, and until now there was no third way out. Escape did nothing
   * -- the ghost went on tracking the cursor and the next click built the bar
   * -- so the only escape was a right-click, which nothing says.
   *
   * Nothing to say when nothing is held: this runs on every Escape anywhere in
   * the window, including the ones closing a dialog.
   */
  private abandonGesture(): void {
    const armed =
      this.dragState.isCreatingLink ||
      this.dragState.grid === gridStates.createCylinder ||
      this.dragState.grid === gridStates.createForce ||
      this.dragState.isDragging;
    if (!armed) return;
    this.letGoOfEverything(true);
    this.forceGhost = undefined;
    this.forceCreateOn = undefined;
    this.mechanismSrv.onMechUpdateState.next(3);
  }

  /** Answer the shortcuts whose action is the canvas's own. */
  // The keystroke is optional because only the nudges read it: every other
  // shortcut is the same action whatever was held down with it.
  private onShortcut(id: ShortcutId, event?: KeyboardEvent): void {
    switch (id) {
      case 'edit.nudgeLeft':
        this.nudgeSelection(-1, 0, event?.altKey === true);
        return;
      case 'edit.nudgeRight':
        this.nudgeSelection(1, 0, event?.altKey === true);
        return;
      case 'edit.nudgeUp':
        this.nudgeSelection(0, 1, event?.altKey === true);
        return;
      case 'edit.nudgeDown':
        this.nudgeSelection(0, -1, event?.altKey === true);
        return;
      case 'edit.deselect':
        this.activeObjService.updateSelectedObj(undefined);
        return;
      case 'edit.delete':
        // The permission model, not the mode alone. Naming the mode caught an
        // analysis mode -- which is a reading of a finished mechanism, and
        // Delete was going through it, removing a joint from a drawing the
        // reader was measuring with no way back short of leaving the mode --
        // but it missed a running mechanism entirely: with the canvas, the
        // panel, the menu and undo all refusing, Backspace still deleted the
        // selection. A key is a control like any other and asks the same
        // question the button beside it asks.
        if (!this.permission.may('structure')) return;
        this.deleteSelection();
        return;
      case 'edit.lock':
        if (this.permission.menuRefusal('preserve')) return;
        this.toggleLockOnSelection();
        return;
      case 'history.undo':
      case 'history.redo':
        // Nothing to take back in the analysis modes, which is why the buttons
        // are not there either -- and nothing to take back under a running or
        // parked-away-from-start mechanism, which is why they gray. The same
        // predicate the buttons quote, so the key and the button cannot give
        // two answers in the same session.
        if (!this.gridUtils.canRestoreHistory()) return;
        if (id === 'history.redo') {
          this.saveHistoryService.redo();
        } else {
          this.saveHistoryService.undo();
        }
        return;
    }
  }

  /**
   * Lock or unlock whatever is selected -- the same act as the panel's own
   * Lock button, which is the only other way to do it.
   *
   * With nothing selected the key has no target, and says so rather than doing
   * nothing: a lock is not a state the grid as a whole can be in.
   */
  private toggleLockOnSelection(): void {
    // The type first, then the object. `getSelectedObj` throws for everything
    // it has no case for — the grid, a position, the picture, a whole machine,
    // nothing at all — so asking it before checking turned "there is nothing to
    // lock" into an uncaught error on a fresh grid.
    const kind = this.activeObjService.objType;
    if (kind === 'MultiSelection') {
      const parts = this.activeObjService.selectedParts;
      const allLocked = parts.every((part) => this.mechanismSrv.isLockedTarget(part));
      this.mechanismSrv.setLocks(parts, !allLocked);
      return;
    }
    if (kind !== 'Joint' && kind !== 'Link' && kind !== 'Force') {
      this.notify.refusal(
        'lock.nothing-selected',
        'Select something first — Lock holds whatever is selected.'
      );
      return;
    }
    this.mechanismSrv.toggleLock(this.activeObjService.getSelectedObj());
  }

  /**
   * Take away whatever is selected.
   *
   * Every selectable thing that has a Delete of its own is answered here. Left
   * out, the key cleared the selection and left the object standing -- which
   * reads as a delete that did not take, and is the exact failure the force
   * branch was added to prevent. A machine is the one selection with no answer
   * of its own: "delete" on it means all of its parts at once, which is its
   * panel's own button rather than a per-part key.
   */
  private deleteSelection(): void {
    switch (this.activeObjService.objType) {
      case 'MultiSelection':
        this.deleteSelectedParts();
        break;
      case 'Joint':
        this.mechanismSrv.deleteJoint();
        break;
      case 'Link':
        this.mechanismSrv.deleteLink();
        break;
      case 'Force':
        this.mechanismSrv.deleteForce();
        break;
      case 'SynthesisPose':
        this.deleteSynthesisPosition(this.activeObjService.selectedPose.id);
        break;
      case 'BackgroundImage':
        this.bgImage.remove();
        this.notify.success('bgImage.removed', 'Background image removed.');
        break;
      case 'Mechanism':
        this.notify.refusal(
          'delete.whole-mechanism',
          'Delete removes one part — the mechanism panel has its own Delete for the whole mechanism.'
        );
        return;
      default:
        this.notify.refusal(
          'delete.nothing-selected',
          'Select something first — Delete removes whatever is selected.'
        );
        return;
    }
    this.activeObjService.updateSelectedObj(undefined);
  }

  returnDebugValue() {
    return NewGridComponent.debugValue;
  }

  getDebugPointX(coord: Coord) {
    if (coord == undefined) {
      return 0;
    }
    return coord.x;
  }

  getDebugPointY(coord: Coord) {
    if (coord == undefined) {
      return 0;
    }
    return coord.y;
  }

  getDebugPoints() {
    return NewGridComponent.debugPoints;
  }

  getDebugLines(): Line[] {
    return NewGridComponent.debugLines;
  }

  findStartAndEndPoints() {
    let x1, y1, x2, y2;
    if (this.showLinkAngleOverlay == -2) {
      switch (this.showLinkLengthOverlay) {
        case -2:
          //Throw an error
          throw new Error(
            'showLinkLengthOverlay should not be -2, this means an overlay was requested even though the objects to show the overlay based on was not selected'
          );
          break;
        case -1: {
          const link = this.activeObjService.selectedLink;
          // A cylinder body's span is mount to mount, not the barrel's own
          // two joints (one of which is buried inside the part).
          const sealed = this.mechanismSrv.cylinderAt(link);
          const [from, to] = sealed ? [sealed.barrelFar, sealed.rodFar] : link.joints;
          x1 = from.x;
          y1 = from.y;
          x2 = to.x;
          y2 = to.y;
          break;
        }
        default:
          let thisJoint = this.activeObjService.selectedJoint;
          let otherJoint =
            EditPanelComponent.instance.listOfOtherJoints[this.showLinkLengthOverlay];
          x1 = thisJoint.x;
          y1 = thisJoint.y;
          x2 = otherJoint.x;
          y2 = otherJoint.y;
      }
    } else {
      switch (this.showLinkAngleOverlay) {
        case -2:
          //Throw an error
          throw new Error(
            'showLinkLengthOverlay should not be -2, this means an overlay was requested even though the objects to show the overlay based on was not selected'
          );
          break;
        case -1: {
          const link = this.activeObjService.selectedLink;
          const sealed = this.mechanismSrv.cylinderAt(link);
          const [from, to] = sealed ? [sealed.barrelFar, sealed.rodFar] : link.joints;
          x1 = from.x;
          y1 = from.y;
          x2 = to.x;
          y2 = to.y;
          break;
        }
        default:
          let thisJoint = this.activeObjService.selectedJoint;
          let otherJoint = EditPanelComponent.instance.listOfOtherJoints[this.showLinkAngleOverlay];
          x1 = thisJoint.x;
          y1 = thisJoint.y;
          x2 = otherJoint.x;
          y2 = otherJoint.y;
      }
    }

    return { x1, y1, x2, y2 };
  }

  /**
   * Whether there is a length here worth drawing.
   *
   * Two coincident points have no direction, so every part of the dimension is
   * a division by zero: the end caps come out `MNaN NaN LNaN NaN`, the browser
   * refuses the path and says so on the console, and what is left on the canvas
   * is a chip reading 0.00 standing on nothing. A slider's block and its pin
   * are coincident by construction, so pointing at their Distance to Joints
   * field did this every time.
   */
  hasLengthDimension(): boolean {
    const { x1, y1, x2, y2 } = this.findStartAndEndPoints();
    if (![x1, y1, x2, y2].every(Number.isFinite)) return false;
    return Math.hypot(x2 - x1, y2 - y1) > 1e-9;
  }

  getSVGPerpendicularLine1() {
    //Return the SVG path of the line that is perpendicular to the first line and intersects the first line at the first joint
    //The line will be 1 unit long and will be centered at the first joint
    //It will act was an end cap for the line to represnet the lenght of the line
    let length = SettingsService.objectScale / 7;

    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    //Find the slope of the original line
    let m1 = (y2 - y1) / (x2 - x1);

    //Find the slope of the perpendicular line
    let m2 = -1 / m1;

    //Find the angle of the perpendicular line
    let angle = Math.atan(m2);

    //Find the endpoints of the perpendicular line
    let x3 = x1 + length * Math.cos(angle);
    let y3 = y1 + length * Math.sin(angle);
    let x4 = x1 - length * Math.cos(angle);
    let y4 = y1 - length * Math.sin(angle);

    //Return the SVG path of the perpendicular line
    return 'M' + x3 + ' ' + y3 + ' L' + x4 + ' ' + y4;
  }

  getSVGPerpendicularLine2() {
    //Same as getSVGPerpendicularLine1 but for the second joint
    let length = SettingsService.objectScale / 7;
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    let m1 = (y2 - y1) / (x2 - x1);
    let m2 = -1 / m1;
    let angle = Math.atan(m2);

    let x3 = x2 + length * Math.cos(angle);
    let y3 = y2 + length * Math.sin(angle);
    let x4 = x2 - length * Math.cos(angle);
    let y4 = y2 - length * Math.sin(angle);

    return 'M' + x3 + ' ' + y3 + ' L' + x4 + ' ' + y4;
  }

  getSVGPrimaryAxisLine1() {
    // From the first joint up to the gap the pill sits in. The gap was the
    // middle third; on a bar it is wherever the chip is, so the line stops
    // short of the chip on its side.
    const { x1, y1, x2, y2 } = this.findStartAndEndPoints();
    const { toGap, length } = this.hairlineReach();
    if (length < 1e-9) return '';
    const ux = (x2 - x1) / length;
    const uy = (y2 - y1) / length;
    return 'M' + x1 + ' ' + y1 + ' L' + (x1 + ux * toGap) + ' ' + (y1 + uy * toGap);
  }

  getSVGPrimaryAxisLine2() {
    // From the far side of the gap to the second joint.
    const { x1, y1, x2, y2 } = this.findStartAndEndPoints();
    const { fromGap, length } = this.hairlineReach();
    if (length < 1e-9) return '';
    const ux = (x2 - x1) / length;
    const uy = (y2 - y1) / length;
    return 'M' + (x1 + ux * fromGap) + ' ' + (y1 + uy * fromGap) + ' L' + x2 + ' ' + y2;
  }

  getSVGAngleOverlayLines() {
    //This function returns the SVG path of the angle overlay
    //Is has one line that goes along the primary axis of the link starting at the first joint
    //The 2nd line starts at the first joint and is parallel to the x axis
    //The third arc connects the endpoint of the first line to the endpoint of the second line
    const lengthOfIndicator = SettingsService.objectScale * 2;
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    //Find the slope and the angle of the original line
    let angle = Math.atan2(y2 - y1, x2 - x1);
    let length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    //Find the coordinates of the endpoints of the two lines that form the angle with the original line
    let x3 = x1 + length * Math.cos(angle);
    let y3 = y1 + length * Math.sin(angle);
    let x4 = x1 + lengthOfIndicator;
    let y4 = y1;

    //Return the SVG paths of the angle overlay without the arrow
    let line1 = 'M' + x3 + ' ' + y3 + ' L' + x1 + ' ' + y1;
    let line2 = ' M' + x1 + ' ' + y1 + ' L' + x4 + ' ' + y4;

    //Return the SVG path of the angle overlay with the arrow
    return line1 + line2;
  }

  getSVGAngleOverlayArc() {
    //This function returns the SVG path of the angle overlay
    //Is has one line that goes along the primary axis of the link starting at the first joint
    //The 2nd line starts at the first joint and is parallel to the x axis
    //The third arc connects the endpoint of the first line to the endpoint of the second line
    const lengthOfIndicator = SettingsService.objectScale * 1.8;
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    //Find the slope and the angle of the original line
    let angle = Math.atan2(y2 - y1, x2 - x1);

    //Find the coordinates of the endpoints of the two lines that form the angle with the original line
    let x3 = x1 + lengthOfIndicator * Math.cos(angle);
    let y3 = y1 + lengthOfIndicator * Math.sin(angle);
    let x4 = x1 + lengthOfIndicator;
    let y4 = y1;

    //Find the direction and flags for drawing the arc
    //Assume that we want to draw a quarter circle with radius equal to lengthOfIndicator
    let sweepFlag = angle > 0 ? 1 : 0;

    //Return the SVG paths of the angle overlay without the arrow
    let arc =
      ' M' +
      x4 +
      ' ' +
      y4 +
      ' A' +
      lengthOfIndicator +
      ' ' +
      lengthOfIndicator +
      ' ' +
      '90' +
      ' ' +
      0 +
      ' ' +
      sweepFlag +
      ' ' +
      x3 +
      ' ' +
      y3;

    //Return the SVG path of the angle overlay with the arrow
    return arc;
  }

  protected readonly AngleUnit = AngleUnit;

  getSVGLengthOverlayTextPos() {
    // On a bar, exactly where its length chip sits; otherwise the midpoint.
    const onBar = this.lengthDimensionOnBar();
    if (onBar) return onBar.center;
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();
    let x = (x1 + x2) / 2;
    let y = (y1 + y2) / 2;
    return { x, y };
  }

  getSVGAngleOverlayTextPos() {
    //Get the positon to put the angle label
    //It needs to be at the midpoint of the arc which goes from x axis to the primary axis
    //But with an offset so it's farther from the radius
    //Make sure to use atan2
    const offSetRadius = SettingsService.objectScale * 2;
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();

    //Calculate the angle between the x-axis and the primary axis
    let angle = Math.atan2(y2 - y1, x2 - x1);

    //Calculate the midpoint of the arc
    let midAngle = angle / 2;
    let midX = offSetRadius * Math.cos(midAngle);
    let midY = offSetRadius * Math.sin(midAngle);

    //Add the offset to the midpoint
    let labelX = midX + x1;
    let labelY = midY + y1;

    //Return an object with x and y properties
    return { x: labelX, y: labelY };
  }

  protected readonly RealJoint = RealJoint;

  secondJointIsGrounded(selectedLink: RealLink) {
    //If we are looking at distToJoints, we always move the 2nd joint
    if (this.activeObjService.objType == 'Joint') {
      return false;
    }
    return (selectedLink.joints[1] as RealJoint).ground;
  }

  getLengthBetweenOverlayPoints() {
    //Get the length between the two joints
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();
    let length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    return length;
  }

  getAngleBetweenOverlayPoints() {
    //Get the angle between the two joints
    let { x1, y1, x2, y2 } = this.findStartAndEndPoints();
    let angle = Math.atan2(y2 - y1, x2 - x1);

    //Convert the angle to this.settings.angleUnit.getValue();
    switch (this.settings.angleUnit.getValue()) {
      case AngleUnit.DEGREE:
        angle = radToDeg(angle);
        break;
      case AngleUnit.RADIAN:
        break;
    }
    return angle;
  }
}
