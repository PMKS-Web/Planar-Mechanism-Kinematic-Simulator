import { describeActuatorRefusal } from '../../model/actuator';
import { speedTurning, turnsClockwise } from '../../model/drive-direction';
import { Subscription } from 'rxjs';
import {
  AfterContentInit,
  DoCheck,
  Component,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
  effect,
  inject,
} from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { ViewportService } from '../../services/viewport.service';
import { Joint, PrisJoint, RealJoint, RevJoint } from 'src/app/model/joint';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { Coord } from 'src/app/model/coord';
import {
  AngleUnit,
  AngularVelocityUnit,
  ForceUnit,
  getDistance,
  getNewOtherJointPos,
  InertiaUnit,
  LengthUnit,
  MassUnit,
} from 'src/app/model/utils';
import { NumberUnitParserService } from 'src/app/services/number-unit-parser.service';
import { SettingsService } from '../../services/settings.service';
import { MechanismService } from '../../services/mechanism.service';
import { EditPermissionService } from '../../services/edit-permission.service';
import { EditRefusal } from '../../model/edit-permission';
import { GridUtilsService } from '../../services/grid-utils.service';
import { Link, RealLink } from '../../model/link';
import { canvasHandle } from '../../services/canvas-handle';
import { registerEditPanel } from '../../services/edit-panel-handle';
import { MODEL_SCALE } from '../../model/render-scale';
import { EditBannerComponent } from '../BLOCKS/banner/edit-banner.component';
import { StateInputComponent } from '../BLOCKS/state-input/state-input.component';
import { uniformBodyOf } from '../../model/uniform-body';
import { cylinderAtSeal, cylinderLengthsOf, cylinderSizeOf, Cylinder } from '../../model/cylinder';
import { bodyLabelParts } from '../../model/body-label';
import { NotificationService } from 'src/app/services/notification.service';
import { BackgroundImageService, MIN_WIDTH } from 'src/app/services/background-image.service';
import { NOT_A } from 'src/app/ui-text';
import { MatIcon } from '@angular/material/icon';
import { TutorialService } from '../../services/tutorial.service';
import { MechanismPanelComponent } from '../mechanism-panel/mechanism-panel.component';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { EditableTitleComponent } from '../BLOCKS/editable-title/editable-title.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { DualInputComponent } from '../BLOCKS/dual-input/dual-input.component';
import { HoldFieldComponent } from '../BLOCKS/hold-field/hold-field.component';
import { LockBannerComponent } from '../BLOCKS/banner/lock-banner.component';
import { ToggleComponent } from '../BLOCKS/toggle/toggle.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { InputComponent } from '../BLOCKS/input/input.component';
import { ColorPickerComponent } from '../BLOCKS/color-picker/color-picker.component';
import { DualButtonComponent } from '../BLOCKS/dual-button/dual-button.component';
import { RadioComponent } from '../BLOCKS/radio/radio.component';
import { MatTooltip } from '@angular/material/tooltip';
import { MultiEditPanelComponent } from '../multi-edit-panel/multi-edit-panel.component';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';
import { JointTypeService } from '../../services/joint-type.service';
import { SplitJointService } from '../../services/split-joint.service';
import { JOINT_TYPES, JointTypeChoice, NOWHERE_TO_SLIDE } from '../../model/joint-type';

/**
 * Input Settings unit choices, in the order the picker shows them. The labels
 * match how the unit parser prints these units everywhere else in the app.
 */
const INPUT_SPEED_UNITS = [
  { unit: AngularVelocityUnit.RPM, label: 'RPM' },
  { unit: AngularVelocityUnit.DEG_PER_SEC, label: 'deg/s' },
  { unit: AngularVelocityUnit.RAD_PER_SEC, label: 'rad/s' },
];

@Component({
  selector: 'app-edit-panel',
  templateUrl: './edit-panel.component.html',
  styleUrls: ['./edit-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    EditBannerComponent,
    MatTooltip,
    MatIcon,
    StateInputComponent,
    MechanismPanelComponent,
    PanelSectionComponent,
    EditableTitleComponent,
    CollapsibleSubsectionComponent,
    DualInputComponent,
    HoldFieldComponent,
    LockBannerComponent,
    FormsModule,
    ReactiveFormsModule,
    ToggleComponent,
    ButtonComponent,
    InputComponent,
    ColorPickerComponent,
    DualButtonComponent,
    RadioComponent,
    MultiEditPanelComponent,
    SegmentedComponent,
  ],
})
export class EditPanelComponent implements OnInit, AfterContentInit, DoCheck, OnDestroy {
  activeSrv = inject(ActiveObjService);
  viewport = inject(ViewportService);

  /**
   * How this reader opens the menu, in the words their device gives them.
   *
   * Sentence-initial, because that is the only place the panel uses it.
   */
  get press(): string {
    return this.viewport.isTouch() ? 'Press and hold on' : 'Right-click';
  }

  protected settingsService = inject(SettingsService);
  private fb = inject(FormBuilder);
  private nup = inject(NumberUnitParserService);
  mechanismService = inject(MechanismService);
  /** The one place that says whether an edit may happen, and in what words. */
  /** Read from the template too: the CoM frame selector is not a form control. */
  readonly permission = inject(EditPermissionService);
  gridUtils = inject(GridUtilsService);
  bgImage = inject(BackgroundImageService);
  private notify = inject(NotificationService);
  private jointTypes = inject(JointTypeService);
  protected splitJoints = inject(SplitJointService);
  /** What the Joint Type choice says under a block with nowhere to slide. */
  protected readonly nowhereToSlide = NOWHERE_TO_SLIDE;
  tutorial = inject(TutorialService);

  listOfOtherJoints: RealJoint[] = [];
  private currentlyOpenJointID: string = '';

  //A dictionary for whether each collapsible section is expanded or not
  sectionExpanded: { [key: string]: boolean } = {
    JBasic: true, //This is the default (starting) state
    JInput: true, //Expanded on arrival, so a new input's settings are visible
    // Open on arrival, like the link's own mass section: it is only there at
    // all for a slider, so a reader who has one has come to a joint that
    // weighs something.
    JMass: true,
    JVisual: false,
    JDistToJ: true,
    LBasic: true,
    LVisual: false,
    LMass: true,
    LCompound: true,
    FBasic: true,
    FVisual: false,
    BGPlace: true,
  };

  /**
   * A massless link has no inertia and no center of mass to speak of.
   *
   * Those three fields describe how a mass is distributed, so with no mass
   * they describe nothing -- and a force analysis run off numbers nobody chose
   * reports an answer that looks meant. Angular's own disable is what grays
   * them, so the value stays and comes back the moment a mass does.
   */
  private syncMassDependents(): void {
    const massless = !(this.activeSrv.selectedLink?.mass > 0);
    const dependents = [
      this.linkForm.controls.massMoI,
      this.linkForm.controls.comX,
      this.linkForm.controls.comY,
    ];
    for (const control of dependents) {
      if (!control) continue;
      if (massless && control.enabled) control.disable({ emitEvent: false });
      if (!massless && control.disabled) control.enable({ emitEvent: false });
    }
  }

  /** Nothing drawn yet, so nothing to select and nothing to drag. */
  gridIsEmpty(): boolean {
    return this.mechanismService.joints.length === 0 && this.mechanismService.links.length === 0;
  }

  /**
   * Why editing is refused right now, or nothing when it is not.
   *
   * The panel used to replace itself with a placeholder card and an animated
   * GIF the moment anything moved -- so pressing Play took away the thing the
   * reader was in the middle of reading, and the way back was a picture rather
   * than a control. It stays now: the fields are inert and dimmed, this
   * sentence sits across the top, and the button beside it is the way out.
   */
  banner(): EditRefusal | null {
    return this.permission.editingBanner();
  }

  /** The same question, for the handlers that must not write while refused. */
  editingRefused(): boolean {
    return this.banner() !== null;
  }

  /**
   * The same question for the handlers behind the controls the freeze leaves
   * live away from the start -- Grounded, Driven Input, Slider, Weld, Trace,
   * the masses. Those are identity-addressed or staged, so a paused pose
   * allows them; only playing, an analysis mode or Synthesis refuse. They used
   * to ask `editingRefused`, which is the *placement* question, so away from
   * the start every one of them returned without writing while its switch
   * still flipped on screen -- a control lying about state, and a reader
   * concluding the app had broken.
   */
  structureRefused(): boolean {
    return !this.permission.may('structure');
  }

  /**
   * Whether the panel as a whole is out of reach.
   *
   * Coarser than the banner, and deliberately so. Playing or in an analysis
   * mode, nothing here may be touched. Merely *paused* away from the start,
   * Phase 2 allows the structural half -- Grounded, Driven Input, Joint Type,
   * Rename, Lock, Delete are addressed by identity and apply to the design
   * without needing the pose -- while the numbers below stay frozen,
   * because each of those needs a written transform back to t = 0 that does
   * not exist yet.
   */
  panelIsFrozen(): boolean {
    return !this.permission.may('structure');
  }

  /**
   * The fields that read a pose rather than a design.
   *
   * A joint's X and Y outright. A link's length reads pose-invariantly but its
   * handler repositions joints along the *displayed* orientation, which at a
   * displaced pose writes pose geometry. A force's endpoints are world
   * coordinates when it is global. A cylinder is re-derived from its mounts on
   * every rebuild. And an input speed moves the visible pose by changing what
   * the held elapsed seconds land on.
   *
   * Frozen from `ngDoCheck` rather than by a template binding, because a
   * reactive control's disabled state belongs to the control: setting it from
   * the template is what produces Angular's own warning about the two of them
   * disagreeing.
   */
  private freezePoseBoundFields(): void {
    const frozen = !this.permission.may('placement');
    if (!frozen) {
      // Exactly what this froze, and nothing else -- and then the lock rules
      // again, because a control can be held by both. Enabling only its own set
      // was not enough: a Lock applied *while displaced* was recorded by
      // `syncLockDisabledFields` on a control this had already disabled, so it
      // was never in that set, and returning to the start handed back a field
      // the lock was still holding.
      const held = [...this.frozenByPose];
      this.frozenByPose.clear();
      held.forEach((control) => control.enable({ emitEvent: false }));
      this.syncLockDisabledFields();
      return;
    }
    const freeze = (group: FormGroup, names: string[]) =>
      names.forEach((name) => {
        const control = group.get(name);
        if (!control || control.disabled) return;
        control.disable({ emitEvent: false });
        this.frozenByPose.add(control);
      });
    // Not the masses. A mass is not read off a pose and needs no transform
    // back to the start, so it is typed at any pose, playing included: the
    // force graphs re-solve under it, which is the point of typing it then.
    freeze(this.jointForm, [
      'xPos',
      'yPos',
      'prisAngle',
      'cylinderStart',
      'inputSpeed',
      'inputSpeedUnit',
    ]);
    this.otherJoints.controls.forEach((control) => {
      if (control.disabled) return;
      control.disable({ emitEvent: false });
      this.frozenByPose.add(control);
    });
    freeze(this.linkForm, ['length', 'angle', 'comX', 'comY']);
    freeze(this.forceForm, ['magnitude', 'angle', 'xComp', 'yComp', 'isGlobal']);
  }

  /** The controls this freeze disabled, so unfreezing gives back only those. */
  private frozenByPose = new Set<AbstractControl>();

  /** Whether any machine on the grid is running. */
  playingNow(): boolean {
    const mechanism = this.mechanismService;
    return (
      mechanism.isPlaying || mechanism.mechanisms.some((_, i) => mechanism.isMechanismPlaying(i))
    );
  }

  /**
   * The masses are typed at any pose -- they are not read off one -- but not
   * while the machine runs, like every other setting: a rebuild under a solve
   * in flight is the one thing the freeze exists to prevent.
   */
  private freezeMassesWhilePlaying(): void {
    if (!this.playingNow()) {
      const held = [...this.frozenByPlay];
      this.frozenByPlay.clear();
      held.forEach((control) => control.enable({ emitEvent: false }));
      if (held.length) this.syncLockDisabledFields();
      return;
    }
    const freeze = (group: FormGroup, names: string[]) =>
      names.forEach((name) => {
        const control = group.get(name);
        if (!control || control.disabled) return;
        control.disable({ emitEvent: false });
        this.frozenByPlay.add(control);
      });
    freeze(this.jointForm, ['sliderMass']);
    freeze(this.linkForm, ['mass', 'massMoI']);
  }

  private frozenByPlay = new Set<AbstractControl>();

  /** Whether the input's direction may be turned round -- it moves the pose. */
  driveIsFrozen(): boolean {
    return !this.permission.may('drive');
  }

  /** Whether the banner's own way out would do anything. */
  backToStartHelps(): boolean {
    return this.banner()?.backToStartHelps === true;
  }

  backToStart(): void {
    // Stopped, then walked home. `easeToStart` only moves the pose; pressed
    // while the mechanism was running it would have been racing the playback
    // that was still advancing underneath it.
    this.mechanismService.pauseInPlace();
    this.settingsService.animating.next(false);
    this.mechanismService.easeToStart();
  }

  /**
   * Keep the shown coordinates honest while the mechanism moves.
   *
   * The fields are patched on selection and on commit, neither of which happens
   * during playback -- so a panel that no longer vanishes would sit there
   * showing the start pose's numbers beside a joint visibly somewhere else.
   * Reading them tick is the reason the panel stays.
   *
   * From `ngDoCheck` rather than a subscription, for the reason the tutorial
   * card is: `animate()` mutates the joints in place and publishes on nothing.
   */
  ngDoCheck(): void {
    this.freezePoseBoundFields();
    this.freezeMassesWhilePlaying();
    if (!this.editingRefused() || this.activeSrv.objType !== 'Joint') return;
    const joint = this.activeSrv.selectedJoint;
    if (!joint) return;
    const unit = this.settingsService.lengthUnit.getValue();
    this.jointForm.patchValue(
      {
        xPos: this.nup.formatModelLength(joint.x, unit),
        yPos: this.nup.formatModelLength(joint.y, unit),
      },
      { emitEvent: false }
    );
  }

  /** Unit choices for the Input Speed field's inline picker. */
  readonly speedUnitOptions = INPUT_SPEED_UNITS.map((option, index) => ({
    value: index.toString(),
    label: option.label,
  }));

  /**
   * The joint whose drive this panel is editing, if it is editing one.
   *
   * One hop shorter than it was. A cylinder used to be driven from the panel of
   * a *body*, so this had to find the pin underneath it; the slide is a joint a
   * reader can click now (D9), and it is the joint the drive has always been
   * on. Without the hop the Input Settings section rendered while every handler
   * here missed the machine: the speed went to the document default, and the
   * direction flip turned the *other* mechanisms round.
   */
  private get drivenJoint(): RealJoint | undefined {
    if (this.activeSrv.objType !== 'Joint') return undefined;
    const joint = this.activeSrv.selectedJoint;
    return joint && joint.input ? joint : undefined;
  }

  /** One button for both directions: flip rather than pick. */
  flipInputDirection(): void {
    const joint = this.drivenJoint;
    if (joint) {
      // This mechanism's drive, not the document's. A drawing can hold several
      // and turning one round must leave the others turning as they were.
      this.mechanismService.setDriveSpeed(joint, -this.mechanismService.driveSpeedOf(joint));
    } else {
      this.settingsService.isInputCW.next(!this.settingsService.isInputCW.value);
    }
    this.mechanismService.updateMechanism(true);
  }

  /**
   * Show the stored speed in whichever unit the picker is set to.
   *
   * A slider input reads a different setting, not the same one in another unit:
   * `linearInputSpeed` is length per second and is shown exactly as stored,
   * where the rotational speed is kept in RPM and converted for display.
   */
  private patchInputSpeedField(): void {
    const own = Math.abs(this.mechanismService.driveSpeedOf(this.drivenJoint));
    const shown = this.isSliderInput
      ? own
      : this.nup.convertAngularVelocity(
          own,
          AngularVelocityUnit.RPM,
          this.settingsService.inputSpeedUnit.value
        );
    this.jointForm.patchValue(
      { inputSpeed: Number(shown.toFixed(2)).toString() },
      { emitEvent: false }
    );
  }

  /** Mirror the current input speed and unit into the Input Settings fields. */
  private syncInputSettingsFields(): void {
    const unitIndex = this.isSliderInput
      ? 0
      : INPUT_SPEED_UNITS.findIndex(
          (option) => option.unit === this.settingsService.inputSpeedUnit.value
        );
    this.jointForm.patchValue(
      { inputSpeedUnit: (unitIndex < 0 ? 0 : unitIndex).toString() },
      { emitEvent: false }
    );
    this.patchInputSpeedField();
  }

  constructor() {
    //Set the instance to this
    EditPanelComponent.instance = this;
    // The analysis setup drawer lands the reader on a section through this
    // rather than through the static, so it never imports this panel.
    registerEditPanel({ expandSection: (key) => (this.sectionExpanded[key] = true) });
    // The picture can now be moved and resized on the canvas as well as typed
    // at, so the fields follow it rather than only leading it. Patched without
    // emitting, so mirroring a drag cannot loop back into a commit.
    effect(() => {
      this.bgImage.image();
      this.patchBackgroundImageForm();
    });
  }

  //Instance of this
  static instance: EditPanelComponent;

  //maintain a list of subcriptions to unsubscribe later
  onDestroySubscriptions: Subscription[] = [];
  //dynamic form array subscriptions
  otherJoitnsSubscriptions: Subscription[] = [];
  /**
   * The pending re-enable pass scheduled by a selection change. It has to be
   * cancellable: the pass asks the mechanism what the joint may do, and a
   * timer that fires after the component is gone reaches an injector that no
   * longer exists.
   */
  private pendingFieldSync?: ReturnType<typeof setTimeout>;

  ngOnDestroy() {
    this.onDestroySubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.otherJoitnsSubscriptions.forEach((subscription) => subscription.unsubscribe());
    if (this.pendingFieldSync !== undefined) clearTimeout(this.pendingFieldSync);
    if (EditPanelComponent.instance === this) registerEditPanel(undefined);
  }

  lengthUnit: LengthUnit = this.settingsService.lengthUnit.value;
  angleUnit: AngleUnit = this.settingsService.angleUnit.value;
  forceUnit: ForceUnit = this.settingsService.forceUnit.value;
  // torqueUnit: TorqueUnit = this.settingsService.inputTorque.value;
  jointForm = this.fb.group(
    {
      xPos: [''],
      yPos: [''],
      prisAngle: [''],
      // A cylinder's slide alone: where along the stroke the rod begins its
      // cycle, in percent (D9, D11). It belongs to the joint form because the
      // slide is a joint -- the field used to sit on a panel for the whole
      // part, beside a Travel the barrel's own Length says better.
      cylinderStart: [''],
      ground: [false, { updateOn: 'change' }],
      // No input control: Add Input is a button that presses
      // `MechanismService.adjustInput`, which is the one door to the drive.
      // There was a control here as well, bound to nothing, writing the flag
      // straight onto the joint and rebuilding without an undo entry.
      // No slider or weld control: the two are the joint's type, which the
      // Joint Type choice reads and changes through JointTypeService.
      curve: [false, { updateOn: 'change' }],
      // Input Settings. The unit picker commits on change; the speed field commits
      // on blur like every other numeric field. Direction is a button, not a control.
      inputSpeed: [''],
      inputSpeedUnit: ['0', { updateOn: 'change' }],
      // The sliding body's own mass. It lives on the block, which is a link
      // nobody can select -- clicking one picks the pin it rides on -- so
      // without a field here the only way to it was the mass table in the
      // force-analysis drawer.
      sliderMass: [''],
      otherJoints: this.fb.array([]), //Dynamic form array
    },
    { updateOn: 'blur' }
  );

  linkForm = this.fb.group(
    {
      length: [''],
      angle: [''],
      mass: [''],
      massMoI: [''],
      comX: [''],
      comY: [''],
      // A switch, not a blurred field: it flips the moment it is pressed.
      drawAsDisc: [false, { updateOn: 'change' }],
    },
    { updateOn: 'blur' }
  );
  /**
   * Where the tracing underlay sits and how solid it is drawn.
   *
   * Position and width are lengths in the panel's own unit; opacity is a plain
   * percentage, because there is no unit for "how far you can see through it".
   */
  backgroundImageForm = this.fb.group(
    {
      centerX: [''],
      centerY: [''],
      width: [''],
      rotation: [''],
      opacity: [''],
    },
    { updateOn: 'blur' }
  );

  forceForm = this.fb.group(
    {
      magnitude: [''],
      angle: [''],
      xComp: [''],
      yComp: [''],
      isGlobal: ['0', { updateOn: 'change' }],
    },
    { updateOn: 'blur' }
  );

  get otherJoints() {
    return this.jointForm.get('otherJoints') as FormArray;
  }

  debug() {
    this.mechanismService.animate(5, false);
    this.mechanismService.mechanismTimeStep = 0;
    this.mechanismService.updateMechanism();
  }

  ngOnInit(): void {
    this.onChanges();
    this.disableAndEnableJointFields();
  }

  ngAfterContentInit() {
    this.activeSrv.fakeUpdateSelectedObj();
  }

  mouseDown(): void {
    console.log('test');
  }

  /**
   * Ground is no longer disabled while Slider is on (§4.1).
   *
   * The two were coupled because toggleSlider only ever produced a grounded
   * slider and toggleGround dismantled one. They are independent axes now, so
   * coupling their controls would make a reachable cell of the 2x2 unreachable
   * -- which is the gate condition this phase has to meet.
   *
   * The angle field belongs to a grounded guide alone: a floating slot's
   * direction is the line through two of its carrier's joints, so there is no
   * number to type and no frame to type it in. A cylinder's slide is the
   * exception (D10): the part has one bearing, and the slide is one of the
   * three places it is stated.
   */
  disableAndEnableJointFields(): void {
    const wantsAngle = this.isGroundedSlider || this.sealCylinder !== undefined;
    //This is such a werid bug, the only way to update the visual of the input to be enabled is to emit the event
    //But emitting the event causes the update to be called, which calls this function, which causes an infinite loop
    //So we have to only call the enable on change
    if (wantsAngle && this.jointForm.get('prisAngle')?.disabled) {
      this.jointForm.get('prisAngle')?.enable({ emitEvent: true });
    }
    if (!wantsAngle && this.jointForm.get('prisAngle')?.enabled) {
      this.jointForm.get('prisAngle')?.disable({ emitEvent: true });
    }
    if (this.jointForm.get('ground')?.disabled) {
      this.jointForm.get('ground')?.enable({ emitEvent: true });
    }
    // Nothing to do for the joint's type: which types it can take is asked of
    // the refusal model by the Joint Type choice each time it is drawn, not
    // kept on a control that could go stale.

    this.syncLockDisabledFields();
    // Last, so it is the outer authority: a lock and a displaced pose can both
    // hold the same field, and the pose freeze must not be undone by the lock
    // rules deciding that particular field is free.
    this.freezePoseBoundFields();
    this.freezeMassesWhilePlaying();
  }

  /**
   * The fields that move geometry go quiet while a Lock holds it — the same
   * statement the canvas makes by refusing the drag, made in the panel's own
   * language. Everything else (ground, weld, mass, color, rename) stays
   * live: a lock pins position, it does not embalm the object.
   */
  private syncLockDisabledFields(): void {
    const setEnabled = (control: AbstractControl | null, on: boolean) => {
      if (!control) return;
      if (on && control.disabled) control.enable({ emitEvent: false });
      if (!on && control.enabled) control.disable({ emitEvent: false });
    };
    if (this.activeSrv.objType === 'Joint' && this.activeSrv.selectedJoint) {
      const frozenIds = this.gridUtils.frozenJointIds();
      const held = frozenIds.has(this.activeSrv.selectedJoint.id);
      setEnabled(this.jointForm.get('xPos'), !held);
      setEnabled(this.jointForm.get('yPos'), !held);
      // The guide's direction is part of what a lock on a slider holds; only
      // the held case is written, because the grounded-guide rule above owns
      // the enabled side. *Starts at* moves the part the same way, so it goes
      // quiet with it.
      if (held) {
        setEnabled(this.jointForm.get('prisAngle'), false);
        setEnabled(this.jointForm.get('cylinderStart'), false);
      } else {
        setEnabled(this.jointForm.get('cylinderStart'), true);
      }
      // Per row, by the joint the row would MOVE. A distance field
      // repositions the *other* joint, so a held selected joint may still
      // edit its distances — and a free selected joint must not be a back
      // door for moving a held neighbor.
      this.listOfOtherJoints.forEach((other, i) => {
        const otherHeld = frozenIds.has(other.id);
        setEnabled(this.otherJoints.controls[i * 2] ?? null, !otherHeld);
        setEnabled(this.otherJoints.controls[i * 2 + 1] ?? null, !otherHeld);
      });
    } else if (this.activeSrv.objType === 'Link' && this.activeSrv.selectedLink) {
      const frozenIds = this.gridUtils.frozenJointIds();
      const sealed = this.mechanismService.cylinderOfBar(this.activeSrv.selectedLink);
      if (sealed) {
        // A member's Length and its Angle each move some of the part, and the
        // part re-lays itself from whatever is still free -- so one held joint
        // is the ordinary case, exactly as a bar with one pinned end. All four
        // held is the real refusal: there is nothing left for either to move,
        // which is also the state `app-lock-banner` puts a sentence under.
        const movable = [sealed.mountA, sealed.mountB, sealed.seal, sealed.inner].some(
          (joint) => !frozenIds.has(joint.id)
        );
        setEnabled(this.linkForm.get('length'), movable);
        setEnabled(this.linkForm.get('angle'), movable);
      } else {
        // A bar with one end pinned is the ordinary case, not a refused one:
        // the lock says where that end is, and lengthening the bar swings the
        // *other* end. `resolveNewLink` anchors on the held joint, so the mark
        // is honored rather than worked around.
        //
        // Both ends held is the real refusal -- there is nothing left to move,
        // and a length is the distance between two points that are both fixed.
        const held = this.activeSrv.selectedLink.joints.filter((joint) => frozenIds.has(joint.id));
        if (held.length >= this.activeSrv.selectedLink.joints.length) {
          setEnabled(this.linkForm.get('length'), false);
          setEnabled(this.linkForm.get('angle'), false);
        }
      }
    } else if (this.activeSrv.objType === 'Force' && this.activeSrv.selectedForce) {
      // Direction is what the drag handles edit, so the lock covers it;
      // magnitude is not a position and stays live.
      const held = this.activeSrv.selectedForce.locked;
      setEnabled(this.forceForm.get('angle'), !held);
      setEnabled(this.forceForm.get('xComp'), !held);
      setEnabled(this.forceForm.get('yComp'), !held);
    }
  }

  // No "is this joint on a cylinder" question here any more, and that is
  // decision D13: a mount is a pin like any other, so Joint Type, Grounded and
  // Add Input are its own rows, and what the *interior* joints may not do is
  // the permission model's to say (`groundRefused`, `refuseJointType`) rather
  // than a branch this panel keeps for itself.

  /**
   * The sealed cylinder whose own bar is selected.
   *
   * Its own bar, not a body carrying it: a bracket welded to a mount is a body
   * of its own, with its own name, color and mass, and answering here with the
   * ram inside it opened the cylinder's card over the bracket's and left the
   * bracket's properties unreachable.
   */
  get selectedCylinder(): Cylinder | undefined {
    if (this.activeSrv.objType !== 'Link') return undefined;
    return this.mechanismService.cylinderOfBar(this.activeSrv.selectedLink);
  }

  /**
   * The cylinder whose *slide* is the selected joint — S, the square the skin
   * draws (D9).
   *
   * The counterpart of `selectedCylinder`: that one answers for a body, this
   * one for the joint in the middle of the part. Between them they are every
   * piece of a cylinder a reader can open a panel on, and the two are never
   * both answered, because one is a link selection and the other a joint.
   */
  get sealCylinder(): Cylinder | undefined {
    if (this.activeSrv.objType !== 'Joint') return undefined;
    const joint = this.activeSrv.selectedJoint;
    return joint ? cylinderAtSeal(joint) : undefined;
  }

  /**
   * Whether the selected body's inertia and center follow its shape, with no
   * field to type one into (decision S14).
   *
   * The Mass Settings section asks this rather than `selectedCylinder`, so it
   * is quoting the same predicate the linkage table, the analysis setup and
   * the center-of-mass drag quote. A control offered here and thrown away by
   * the next decode is worse than no control: the reader has no way to find
   * out their number is gone.
   */
  protected memberMassDerived(): boolean {
    if (this.activeSrv.objType !== 'Link') return false;
    return this.mechanismService.memberInertiaIsDerived(this.activeSrv.selectedLink);
  }

  /** The ram's own size and position, read back off its joints. */
  private cylinderSize(sealed: Cylinder) {
    return cylinderSizeOf(sealed, 0.15 * this.settingsService.objectScale);
  }

  /** The Starts-at field's value: where the rod begins, as a share of the stroke. */
  private cylinderStartLabel(sealed: Cylinder): string {
    // One decimal, not a whole number. Rounded to an integer the field said
    // 34 for a ram positioned at 33.7%, and on a long ram that gap is a real
    // distance -- the panel would be quietly disagreeing with the drawing.
    return `${Math.round(this.cylinderSize(sealed).start * 1000) / 10}`;
  }

  /**
   * A ram parked at one end of its travel: 0 fully closed, 1 fully open.
   *
   * The bound is the panel's own resolution — *Starts at* shows one decimal, so
   * anything that reads 0.0% or 100.0% counts as parked. A tighter test would
   * leave the field saying 100.0 beside a control still offering both
   * directions, which is the disagreement this exists to prevent.
   */
  private cylinderTravelEnd(sealed: Cylinder): 0 | 1 | undefined {
    const { start } = this.cylinderSize(sealed);
    if (start < 5e-4) return 0;
    if (start > 1 - 5e-4) return 1;
    return undefined;
  }

  /**
   * A ram at a stop has one way to go, so its direction stops being a choice.
   *
   * Not a refusal — the control is grayed rather than left to be pressed and
   * silently undone. The solver already reverses a drive commanded past a stop
   * on its first sample, so pressing it changed nothing about the animation
   * while the label, the arrows and the Analyze text all claimed otherwise.
   */
  get cylinderDirectionForced(): boolean {
    const sealed = this.sealCylinder;
    return !!sealed && !!sealed.seal.input && this.cylinderTravelEnd(sealed) !== undefined;
  }

  /**
   * Point a driven ram the only way it can go, when its start leaves only one.
   *
   * Through the ram's own drive rather than through `isInputCW`: the direction
   * this panel and the solver read is the sign on the joint, so writing only
   * the document-wide default left the grayed button naming the one direction
   * the ram cannot take. `setDriveSpeed` mirrors the default along anyway.
   */
  private syncCylinderDirection(sealed: Cylinder): void {
    if (!sealed.seal.input) return;
    const end = this.cylinderTravelEnd(sealed);
    if (end === undefined) return;
    const wantsRetract = end === 1;
    const signed = this.mechanismService.driveSpeedOf(sealed.seal);
    if (signed === 0 || turnsClockwise(signed) === wantsRetract) return;
    this.mechanismService.setDriveSpeed(sealed.seal, speedTurning(wantsRetract, signed));
    this.mechanismService.updateMechanism(false);
  }

  /**
   * Mount-to-mount axis angle, in the user's angle unit.
   *
   * The one bearing a cylinder has (D10). The Barrel's Angle, the Rod's Angle
   * and the slide's Slider Angle are all this number, read here once so the
   * three fields cannot show three answers.
   */
  private cylinderAngleLabel(sealed: Cylinder): string {
    const raw = Math.atan2(sealed.mountB.y - sealed.mountA.y, sealed.mountB.x - sealed.mountA.x);
    return this.nup.formatValueAndUnit(
      this.nup.convertAngle(raw, AngleUnit.RADIAN, this.settingsService.angleUnit.getValue()),
      this.settingsService.angleUnit.getValue()
    );
  }

  /**
   * What a committed cylinder edit does after the geometry has landed.
   *
   * The grid utils own the transaction and the refusal; what is left is the
   * panel's own three duties. A refusal has already been said, so nothing here
   * runs on one -- and in particular nothing is saved, because an edit that
   * changed nothing must not take an undo step with it.
   */
  private afterCylinderEdit(sealed: Cylinder, went: boolean): boolean {
    if (!went) return false;
    // A ram parked at a stop has one way left to go; its drive is pointed that
    // way before the save, so the entry holds the pair as the reader sees it.
    this.syncCylinderDirection(sealed);
    this.mechanismService.onMechUpdateState.next(2);
    // One committed edit, one undo step. A canvas drag saves on release and a
    // panel edit did not, so typing a ram's size and then pressing Undo took
    // back whatever the *previous* gesture was -- on a freshly opened template,
    // the template itself.
    this.mechanismService.save();
    return true;
  }

  /** The selected member's own length: the barrel's, or the rod's (S3). */
  private memberLength(sealed: Cylinder): number {
    const lengths = cylinderLengthsOf(sealed);
    return this.activeSrv.selectedLink === sealed.barrel ? lengths.barrel : lengths.rod;
  }

  /**
   * Give the selected member the length typed into its own field (S6).
   *
   * Which member it is decides which joint moves: the barrel's buried end, or
   * the joint at the rod's far end. The ladder underneath — what gives when
   * that joint is grounded, and when the answer is a refusal — is the model's
   * (`model/cylinder-edit.ts`), so this only says which of the two was typed.
   */
  private commitMemberLength(sealed: Cylinder, value: number): void {
    const went =
      this.activeSrv.selectedLink === sealed.barrel
        ? this.gridUtils.setBarrelLength(sealed, value)
        : this.gridUtils.setRodLength(sealed, value);
    this.afterCylinderEdit(sealed, went);
    // Either way, from the drawing: a refused edit has to put the old number
    // back, and an accepted one is reformatted at the length that landed.
    this.patchLinkSize();
  }

  /** Turn the whole part to the bearing typed into a member's Angle field (D10). */
  private commitMemberAngle(sealed: Cylinder, radians: number): void {
    this.afterCylinderEdit(sealed, this.gridUtils.setCylinderAngle(sealed, radians));
    this.patchLinkSize();
  }

  /** The selected joint's slider, whichever end of the pair is selected. */
  get selectedSlider(): PrisJoint | undefined {
    const joint = this.activeSrv.selectedJoint;
    return joint instanceof PrisJoint ? joint : undefined;
  }

  get isGroundedSlider(): boolean {
    return this.selectedSlider?.ground === true;
  }

  /**
   * The sliding joint whose mass this panel edits, where the selection is one.
   *
   * D6: Mass Settings shows for a joint whose type has a slot — a cylinder's
   * slide included, which is where the sliding body's mass has lived since the
   * three-body Edit Cylinder panel was retired.
   *
   * This used to answer with the *block* -- a zero-length link nobody could
   * select, which is the whole reason the field is here. Stage 1 of
   * `docs/joint-type-and-cylinder-plan.md` moved that mass onto the joint.
   */
  get sliderMassJoint(): PrisJoint | undefined {
    if (this.activeSrv.objType !== 'Joint') return undefined;
    const joint = this.activeSrv.selectedJoint;
    return joint instanceof PrisJoint ? joint : undefined;
  }

  /**
   * Write a mass to the sliding body.
   *
   * The same door every other mass goes through, so a slider's weight reaches
   * the solver the way a bar's does: it is what gravity pulls on and what the
   * guide has to take, and in an in-motion analysis it is the reciprocating
   * mass -- on a slider-crank it moves the input torque further than either
   * bar's does.
   */
  private commitSliderMass(raw: string | null): void {
    const slider = this.sliderMassJoint;
    if (!slider) return;
    const units = this.massUnit();
    const [success, value] = this.nup.parseMassString(raw ?? '', units);
    if (!success || value < 0) {
      this.notify.refusal('value.mass', success ? NOT_A.nonNegativeMass : NOT_A.mass);
      this.patchSliderMass();
      return;
    }
    // Written straight onto the joint. `assignBodyMass` is the one door for a
    // *body's* mass because a compound and its members have to keep telling one
    // story; a joint belongs to no compound, so there is no aggregate to keep
    // true and nothing for that door to do.
    slider.mass = value;
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.patchSliderMass();
  }

  /** Mirror the sliding body's mass into the field, without re-firing it. */
  patchSliderMass(): void {
    const slider = this.sliderMassJoint;
    if (!slider) return;
    this.jointForm.patchValue(
      { sliderMass: this.nup.formatValueAndUnit(slider.mass, this.massUnit()) },
      { emitEvent: false }
    );
  }

  /**
   * Whether the drive on this joint is a translation rather than a rotation.
   *
   * Everything the Input Settings section says changes with the answer. A block
   * on a slot does not turn clockwise, and it does not have an RPM: the panel
   * was offering both, and the value in the box was not reaching the solver at
   * all, so a slider input always ran at one fixed speed however it was set.
   */
  get isSliderInput(): boolean {
    // A cylinder's slide is one of these: it is a prismatic joint, so its speed
    // is a translation — same unit, same field, same machinery.
    return this.activeSrv.objType === 'Joint' && this.selectedSlider !== undefined;
  }

  /** What the Input Speed field's help says, in terms of what is being driven. */
  get inputSpeedHelp(): string {
    if (this.sealCylinder) {
      return 'How fast the rod travels. Use the direction button to choose opening or closing.';
    }
    return this.isSliderInput
      ? 'How fast this block slides. Negative reverses it.'
      : 'How fast this joint turns. Negative reverses it.';
  }

  /** Length per second, in whatever length unit the mechanism is drawn in. */
  get linearSpeedUnitOptions(): { value: string; label: string }[] {
    return [{ value: '0', label: this.linearSpeedUnitLabel }];
  }

  /** Whichever force unit the reader is currently reading in — one of three. */
  get forceUnitLabel(): string {
    return this.nup.unitLabel(this.settingsService.forceUnit.value);
  }

  /**
   * The body a selected force turns with, for the Reference frame choice.
   *
   * By the name the canvas tags it with rather than the link's own, which for a
   * bracket welded to a barrel mount is an id holding the buried inner end
   * (D14, S11) -- so the reader was offered a frame named after a joint the
   * drawing never shows.
   */
  get forceFrameOption(): string {
    const body = this.activeSrv.selectedForce?.link;
    return `Link (${body ? this.mechanismService.visibleBodyName(body) : ''})`;
  }

  /**
   * A stored force in the unit the reader picked.
   *
   * Magnitudes are held in the length system's own force unit — lbf under
   * English, newtons otherwise — and kilograms-force is a way of reading them
   * rather than a way of keeping them, so every force field converts at this
   * boundary and nowhere else.
   */
  private forceText(stored: number): string {
    return this.nup.formatStoredForce(
      stored,
      this.settingsService.lengthUnit.getValue(),
      this.settingsService.forceUnit.getValue()
    );
  }

  /** The same boundary the other way: typed in the reader's unit, kept in ours. */
  private parseForce(input: string): [boolean, number] {
    return this.nup.parseStoredForce(
      input,
      this.settingsService.lengthUnit.getValue(),
      this.settingsService.forceUnit.getValue()
    );
  }

  /** A translation's speed has exactly one unit — shown as plain text, no picker. */
  get linearSpeedUnitLabel(): string {
    const unit = this.settingsService.lengthUnit.value;
    return unit === LengthUnit.INCH ? 'in/s' : unit === LengthUnit.METER ? 'm/s' : 'cm/s';
  }

  /**
   * Which way *this* drive is set, read off the joint rather than off
   * `isInputCW` — that setting only mirrors the machine whose speed was set
   * last, so on a drawing holding several it described whichever one the reader
   * had touched most recently rather than the one in front of them.
   */
  private get drivenClockwise(): boolean {
    return turnsClockwise(this.mechanismService.driveSpeedOf(this.drivenJoint));
  }

  /**
   * Which way the drive sets off, said in the terms that drive has (§5.5).
   *
   * A cylinder extends or retracts — it is the one part whose two directions
   * have names an engineer already uses. A bare block on a slot has no such
   * pair, so it is named for the slot rather than for the screen: the slot's
   * own angle is shown right above this, and "forward" means along it whichever
   * way it happens to point.
   */
  get inputDirectionLabel(): string {
    if (this.sealCylinder) {
      // Toward the two ends of the stroke *Starts at* measures along.
      return this.drivenClockwise ? 'Closing' : 'Opening';
    }
    if (!this.isSliderInput) {
      return this.drivenClockwise ? 'Clockwise' : 'Counter-clockwise';
    }
    return this.drivenClockwise ? 'Backward along slot' : 'Forward along slot';
  }

  get inputDirectionIcon(): string {
    if (!this.isSliderInput) {
      return this.drivenClockwise ? 'rotate_right' : 'rotate_left';
    }
    return this.drivenClockwise ? 'arrow_back' : 'arrow_forward';
  }

  /**
   * What the Joint Type choice draws for the selected joint: its type, the
   * glyph set Grounded picks, each type it cannot take with the model's reason,
   * and whether the chosen one has nowhere to slide.
   */
  get jointTypeChoice(): JointTypeChoice | undefined {
    const joint = this.activeSrv.selectedJoint;
    return joint instanceof RealJoint ? this.jointTypes.choiceFor(joint) : undefined;
  }

  /**
   * Make the selected joint the type chosen: one press, one edit, whatever the
   * block and the weld underneath it have to do (`JointTypeService.set`).
   */
  setJointType(index: number): void {
    const joint = this.activeSrv.selectedJoint;
    const type = JOINT_TYPES[index];
    if (!(joint instanceof RealJoint) || !type || this.structureRefused()) return;
    this.jointTypes.set(joint, type);
    this.mechanismService.onMechUpdateState.next(2);
    // The type decides which rows the panel has -- Slider Angle, Mass
    // Settings -- and what they read, so the form is patched again.
    this.activeSrv.fakeUpdateSelectedObj();
  }

  disableAndEnableLinkFields(): void {
    if (this.activeSrv.selectedLink) {
      if (this.activeSrv.selectedLink.joints.length > 2) {
        this.linkForm.get('angle')?.disable({ emitEvent: false });
        this.linkForm.get('length')?.disable({ emitEvent: false });
      } else {
        this.linkForm.get('angle')?.enable({ emitEvent: false });
        this.linkForm.get('length')?.enable({ emitEvent: false });
      }
    }
  }

  /**
   * Why the selected joint has no Grounded row, or nothing when it has one.
   *
   * Quoted from the permission model rather than asked again here, so the row
   * the menu grays and the row this panel leaves out are one rule: a cylinder
   * is bolted to the world at the joints at its two ends, never at the slide
   * in the middle of it (D9).
   */
  get groundRefused(): boolean {
    return this.gridUtils.groundRefusal(this.activeSrv.selectedJoint) !== undefined;
  }

  /**
   * The joints the center-of-mass frame may be held against: the body's own,
   * less the one a cylinder derives.
   *
   * N has no marker and no hitbox, so it is no more an anchor a reader can
   * choose than it is a letter they can read (D14, S11).
   */
  get comFrameJoints(): Joint[] {
    return this.mechanismService.visibleJoints(this.activeSrv.selectedLink?.joints ?? []);
  }

  /** The noun the selected body's title is headed with: Barrel, Rod or Link (S10). */
  get bodyNoun(): string {
    return bodyLabelParts(
      this.activeSrv.selectedLink,
      this.selectedCylinder,
      this.mechanismService.sealedStructures()
    ).noun;
  }

  /**
   * The name beside it: a member's two ends, and otherwise the body's own
   * visible name.
   *
   * It answered for a member alone and left a plain link to the title block's
   * fallback, which reads the link's stored `name` -- and that is its id, which
   * holds the cylinder's buried inner end wherever a barrel mount has been
   * welded. A bracket came out headed `Edit Link AA1D` over a canvas showing
   * two joints. One answer for every body instead, and the Rename field
   * pre-fills from it.
   */
  get bodyName(): string {
    return bodyLabelParts(
      this.activeSrv.selectedLink,
      this.selectedCylinder,
      this.mechanismService.sealedStructures()
    ).name;
  }

  /**
   * What the Visual Settings color field is called: Barrel Color, Rod Color or
   * Link Color, which is the title's own noun again.
   *
   * The rod had no field at all while the skin painted it from the barrel — a
   * control that would have changed the barrel too or changed nothing. It has
   * one of its own now (S15), and the two are independent in either order.
   */
  get bodyColorLabel(): string {
    return `${this.bodyNoun} Color`;
  }

  /** What the Length row's help says on a member, where "two joints" names one nobody sees. */
  get memberLengthHelp(): string | undefined {
    const sealed = this.selectedCylinder;
    if (!sealed) return undefined;
    return this.activeSrv.selectedLink === sealed.barrel
      ? 'How long the barrel is. The stroke, and where the rod starts in it, follow.'
      : 'How long the rod is. The joint at its far end moves.';
  }

  /** And the Angle row's: one bearing for the whole part, not this member's own (D10). */
  get memberAngleHelp(): string | undefined {
    return this.selectedCylinder ? 'The direction the cylinder points, joint to joint.' : undefined;
  }

  onChanges(): void {
    this.onDestroySubscriptions.push(
      this.settingsService.angleUnit.subscribe((val) => {
        this.activeSrv.fakeUpdateSelectedObj();
      })
    );

    this.onDestroySubscriptions.push(
      this.activeSrv.onActiveObjChange.subscribe((val) => {
        this.disableAndEnableLinkFields();
        clearTimeout(this.pendingFieldSync);
        this.pendingFieldSync = setTimeout(() => {
          this.pendingFieldSync = undefined;
          this.disableAndEnableJointFields();
        });
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['sliderMass'].valueChanges.subscribe((val) => {
        if (this.structureRefused()) return;
        this.commitSliderMass(val ?? '');
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['xPos'].valueChanges.subscribe((val) => {
        if (this.editingRefused()) return;
        const [success, value] = this.nup.parseModelLengthString(
          val!,
          this.settingsService.lengthUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.length', NOT_A.length);
          this.jointForm.patchValue({
            xPos: this.nup.formatModelLength(
              this.activeSrv.selectedJoint.x,
              this.settingsService.lengthUnit.getValue()
            ),
          });
        } else {
          this.activeSrv.selectedJoint.x = value;
          this.gridUtils.dragJoint(
            this.activeSrv.selectedJoint,
            new Coord(this.activeSrv.selectedJoint.x, this.activeSrv.selectedJoint.y)
          );
          this.jointForm.patchValue(
            {
              xPos: this.nup.formatModelLength(value, this.settingsService.lengthUnit.getValue()),
            },
            { emitEvent: false }
          );
          this.mechanismService.onMechUpdateState.next(2);
          // One committed edit, one undo step. Some fields in this panel
          // reached `updateMechanism(true)` and entered the history; the ones
          // that re-pose through a drag did not, so typing a coordinate and
          // pressing Undo took back the gesture before it -- on a freshly
          // opened template, the template.
          this.mechanismService.save();
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['yPos'].valueChanges.subscribe((val) => {
        if (this.editingRefused()) return;
        const [success, value] = this.nup.parseModelLengthString(
          val!,
          this.settingsService.lengthUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.length', NOT_A.length);
          this.jointForm.patchValue({
            yPos: this.nup.formatModelLength(
              this.activeSrv.selectedJoint.y,
              this.settingsService.lengthUnit.getValue()
            ),
          });
        } else {
          this.activeSrv.selectedJoint.y = value;
          this.gridUtils.dragJoint(
            this.activeSrv.selectedJoint,
            new Coord(this.activeSrv.selectedJoint.x, this.activeSrv.selectedJoint.y)
          );
          this.jointForm.patchValue(
            {
              yPos: this.nup.formatModelLength(value, this.settingsService.lengthUnit.getValue()),
            },
            { emitEvent: false }
          );
          this.mechanismService.onMechUpdateState.next(2);
          // One committed edit, one undo step. Some fields in this panel
          // reached `updateMechanism(true)` and entered the history; the ones
          // that re-pose through a drag did not, so typing a coordinate and
          // pressing Undo took back the gesture before it -- on a freshly
          // opened template, the template.
          this.mechanismService.save();
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['prisAngle'].valueChanges.subscribe((val) => {
        if (this.editingRefused()) return;
        // Enabling and disabling this control emits (see
        // disableAndEnableJointFields), and a disabled control's emission is
        // not a reader typing an angle. Handled as one, grounding a slider's
        // pin wrote the angle it already had and minted two history entries
        // beside the toggle's own -- so one Undo took back none of it.
        if (this.jointForm.controls['prisAngle'].disabled) return;
        const [success, value] = this.nup.parseAngleString(
          val!,
          this.settingsService.angleUnit.getValue()
        );
        if (!this.activeSrv.selectedJoint) return;
        const slider = this.selectedSlider;
        if (!slider) return;
        // A cylinder's slide states the part's one bearing rather than its own
        // slot's (D10): typing it turns A–N–S–B about the slide, or about a
        // grounded end joint, and is refused when both ends are grounded. The
        // Barrel's and the Rod's Angle fields read the same number after it,
        // because all three are this one.
        const sealed = this.sealCylinder;
        if (sealed) {
          if (val !== this.cylinderAngleLabel(sealed)) {
            if (!success) this.notify.refusal('value.angle', NOT_A.angle);
            else {
              this.afterCylinderEdit(
                sealed,
                this.gridUtils.setCylinderAngle(
                  sealed,
                  this.nup.convertAngle(
                    value,
                    this.settingsService.angleUnit.getValue(),
                    AngleUnit.RADIAN
                  )
                )
              );
            }
            this.patchSlideFields(sealed);
          }
          return;
        }
        // Nor is the angle it already has, as this panel shows it: the control
        // is patched with the angle rounded for display, and re-parsing that
        // is not the same number as the radians on the joint.
        const shown = this.nup.formatValueAndUnit(
          this.nup.convertAngle(
            this.selectedSlider?.angle_rad ?? 0,
            AngleUnit.RADIAN,
            this.settingsService.angleUnit.getValue()
          ),
          this.settingsService.angleUnit.getValue()
        );
        if (val === shown) return;
        if (!success) {
          this.notify.refusal('value.angle', NOT_A.angle);
          // Two things had to be true for this to recurse until the stack ran
          // out, and both were: the angle was read off the *pin*, which has no
          // angle_rad, so the field was restored to the string "NaN"; and the
          // restore emitted, so the handler ran again on its own unparseable
          // output. Neither is new -- both predate this branch -- but the angle
          // field is a Phase 4 surface now, so they are fixed here.
          this.jointForm.patchValue(
            {
              prisAngle: this.nup
                .convertAngle(
                  this.selectedSlider?.angle_rad ?? 0,
                  AngleUnit.RADIAN,
                  this.settingsService.angleUnit.getValue()
                )
                .toFixed(0)
                .toString(),
            },
            { emitEvent: false }
          );
        } else {
          slider.angle_rad = this.nup.convertAngle(
            value,
            this.settingsService.angleUnit.getValue(),
            AngleUnit.RADIAN
          );
          this.jointForm.patchValue(
            {
              prisAngle: this.nup.formatValueAndUnit(
                value,
                this.settingsService.angleUnit.getValue()
              ),
            },
            { emitEvent: false }
          );
          this.mechanismService.updateMechanism();
          this.mechanismService.onMechUpdateState.next(2);
          // One committed edit, one undo step, exactly as the position fields
          // above: `updateMechanism` does not save on its own, so without this
          // Undo took back the slot angle *and* whatever was done before it.
          this.mechanismService.save();
        }
      })
    );

    // *Starts at*, the slide's own field: where the rod begins its cycle, as a
    // share of the stroke (D11). Percent alone -- the length it used to offer
    // beside it was the mount-to-mount span, which the barrel's and the rod's
    // own Length fields now say between them.
    this.onDestroySubscriptions.push(
      this.jointForm.controls['cylinderStart'].valueChanges.subscribe((val) => {
        if (this.editingRefused()) return;
        const sealed = this.sealCylinder;
        if (!sealed) return;
        // A blank field is not 0%. `Number('')` is zero, so emptying the box
        // and tabbing away would retract the rod to its stop -- an edit nobody
        // asked for, made out of an absence.
        const typed = String(val ?? '')
          .replace('%', '')
          .trim();
        const asked = Number(typed);
        if (typed !== '' && Number.isFinite(asked)) {
          // Outside its own travel there is nowhere further to go, so the ends
          // are what an out-of-range number means.
          const held = Math.min(Math.max(asked / 100, 0), 1);
          this.afterCylinderEdit(sealed, this.gridUtils.setCylinderStart(sealed, held));
        }
        this.patchSlideFields(sealed);
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['ground'].valueChanges.subscribe((val) => {
        if (this.structureRefused()) {
          return;
        }
        // Through the service rather than straight onto the joint. A slider is
        // selected by its pin, and the pin's own ground flag is not the slot's
        // -- writing it here grounded the pin and left the guide floating, with
        // no reconcile and no undo entry. toggleGround resolves the pair.
        this.mechanismService.toggleGround();
        this.mechanismService.onMechUpdateState.next(2);
      })
    );

    // URL restore and undo rewrite the speed behind the panel's back; mirror it
    // back into the field so an open Input Settings section stays truthful. The
    // direction button reads its state directly, so it needs no subscription.
    this.onDestroySubscriptions.push(
      this.settingsService.inputSpeed.subscribe(() => this.syncInputSettingsFields())
    );
    this.onDestroySubscriptions.push(
      this.settingsService.linearInputSpeed.subscribe(() => this.syncInputSettingsFields())
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['inputSpeed'].valueChanges.subscribe((val) => {
        // The unit comes from the picker beside the field, never from the text, so
        // this reads as a plain number rather than going through the unit parser.
        const typed = Number(String(val ?? '').trim());
        // A rejected value changes nothing, so it must not mint an undo entry.
        if (Number.isFinite(typed) && typed !== 0) {
          const joint = this.drivenJoint;
          const magnitude = this.isSliderInput
            ? Math.abs(typed)
            : this.nup.convertAngularVelocity(
                Math.abs(typed),
                this.settingsService.inputSpeedUnit.value,
                AngularVelocityUnit.RPM
              );
          // The field carries magnitude; a minus sign reads as "the other way",
          // so -20 becomes 20 with the direction flipped.
          const wasClockwise = turnsClockwise(this.mechanismService.driveSpeedOf(joint));
          const clockwise = typed < 0 ? !wasClockwise : wasClockwise;
          if (joint) {
            this.mechanismService.setDriveSpeed(joint, speedTurning(clockwise, magnitude));
          } else if (this.isSliderInput) {
            this.settingsService.linearInputSpeed.next(magnitude);
            this.settingsService.isInputCW.next(clockwise);
          } else {
            this.settingsService.inputSpeed.next(magnitude);
            this.settingsService.isInputCW.next(clockwise);
          }
          this.mechanismService.updateMechanism(true);
        }
        this.patchInputSpeedField();
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['inputSpeedUnit'].valueChanges.subscribe((val) => {
        // Changing the unit re-expresses the same speed; it does not alter it.
        this.settingsService.inputSpeedUnit.next(INPUT_SPEED_UNITS[Number(val)].unit);
        this.patchInputSpeedField();
      })
    );

    this.onDestroySubscriptions.push(
      this.jointForm.controls['curve'].valueChanges.subscribe((val) => {
        if (this.structureRefused()) {
          return;
        }
        this.gridUtils.toggleCurve(this.activeSrv.selectedJoint);
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['length'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseModelLengthString(
          val!,
          this.settingsService.lengthUnit.getValue()
        );
        // Zero is a bar collapsed onto a point and a negative one is a bar
        // with a sign the geometry cannot carry -- both used to be taken
        // silently, the second stored as its own absolute value while the
        // field went on showing the minus.
        if (!success || value <= 0) {
          this.notify.refusal('value.length', success ? NOT_A.positiveLength : NOT_A.length);
          this.patchLinkSize();
        } else if (this.selectedCylinder) {
          // A member's own length (S3): the barrel's moves its buried end and
          // the stroke with it, the rod's moves the joint at its far end.
          this.commitMemberLength(this.selectedCylinder, value);
        } else {
          // Near a lock the number is a constraint to solve, not an end to
          // move; the solver says whether it can be true at all.
          const solved = this.gridUtils.setBarValue(this.activeSrv.selectedLink, 'length', value);
          if (solved === 'refused') {
            this.refuseTypedValue('length');
            this.patchLinkLength();
            return;
          }
          if (solved === 'unheld') {
            this.activeSrv.selectedLink.length = value;
            this.resolveNewLink();
          }
          this.mechanismService.onMechUpdateState.next(2);
          // One committed edit, one undo step. Some fields in this panel
          // reached `updateMechanism(true)` and entered the history; the ones
          // that re-pose through a drag did not, so typing a coordinate and
          // pressing Undo took back the gesture before it -- on a freshly
          // opened template, the template.
          this.mechanismService.save();
          this.linkForm.patchValue(
            {
              length: this.nup.formatModelLength(value, this.settingsService.lengthUnit.getValue()),
            },
            { emitEvent: false }
          );
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['angle'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseAngleString(
          val!,
          this.settingsService.angleUnit.getValue()
        );
        const radians = success
          ? this.nup.convertAngle(
              value,
              this.settingsService.angleUnit.getValue(),
              AngleUnit.RADIAN
            )
          : 0;
        if (!success) {
          this.notify.refusal('value.angle', NOT_A.angle);
          this.patchLinkSize();
        } else if (this.selectedCylinder) {
          // One bearing for the whole part (D10), so the Rod's field and the
          // slide's Slider Angle read this the moment it lands.
          this.commitMemberAngle(this.selectedCylinder, radians);
        } else {
          const solved = this.gridUtils.setBarValue(this.activeSrv.selectedLink, 'angle', radians);
          if (solved === 'refused') {
            this.refuseTypedValue('angle');
            this.patchLinkAngle();
            return;
          }
          if (solved === 'unheld') {
            this.activeSrv.selectedLink.angleRad = radians;
            this.resolveNewLink();
          }
          this.mechanismService.onMechUpdateState.next(2);
          // One committed edit, one undo step. Some fields in this panel
          // reached `updateMechanism(true)` and entered the history; the ones
          // that re-pose through a drag did not, so typing a coordinate and
          // pressing Undo took back the gesture before it -- on a freshly
          // opened template, the template.
          this.mechanismService.save();
          this.linkForm.patchValue(
            {
              angle: this.nup.formatValueAndUnit(value, this.settingsService.angleUnit.getValue()),
            },
            { emitEvent: false }
          );
        }
        this.activeSrv.fakeUpdateSelectedObj();
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['mass'].valueChanges.subscribe((val) => {
        const units = this.massUnit();
        const [success, value] = this.nup.parseMassString(val ?? '', units);
        if (!success || value < 0) {
          this.notify.refusal('value.mass', success ? NOT_A.nonNegativeMass : NOT_A.mass);
          this.linkForm.patchValue(
            { mass: this.nup.formatValueAndUnit(this.activeSrv.selectedLink.mass, units) },
            { emitEvent: false }
          );
          return;
        }
        this.mechanismService.assignBodyMass(this.activeSrv.selectedLink, value);
        this.syncMassDependents();
        this.mechanismService.updateMechanism(true);
        this.mechanismService.onMechUpdateState.next(2);
        this.linkForm.patchValue(
          { mass: this.nup.formatValueAndUnit(value, units) },
          { emitEvent: false }
        );
        // An auto moment of inertia follows the mass it belongs to; show what
        // the rebuild just derived rather than the number from before it.
        this.refreshDerivedMassFields();
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['massMoI'].valueChanges.subscribe((val) => {
        // A member's inertia follows its shape and has no field (decision S14).
        if (this.memberMassDerived()) return;
        // Typed in the display unit (g·cm² for metric), stored in the unit the
        // solver and every URL are written against (kg·cm²).
        const length = this.settingsService.lengthUnit.getValue();
        const display = this.nup.displayInertiaUnit(length);
        const [success, value] = this.nup.parseInertiaString(val ?? '', display);
        if (!success || value < 0 || !(this.activeSrv.selectedLink.mass > 0)) {
          if (!success || value < 0) this.notify.refusal('value.inertia', NOT_A.momentOfInertia);
          this.refreshDerivedMassFields();
          return;
        }
        this.activeSrv.selectedLink.massMoI = this.nup.convertInertia(
          value,
          display,
          this.nup.storedInertiaUnit(length)
        );
        this.activeSrv.selectedLink.moiIsCustom = true;
        this.mechanismService.updateMechanism(true);
        this.mechanismService.onMechUpdateState.next(2);
        this.refreshDerivedMassFields();
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['comX'].valueChanges.subscribe((val) => {
        this.updateLinkCenterOfMass('x', val);
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['comY'].valueChanges.subscribe((val) => {
        this.updateLinkCenterOfMass('y', val);
      })
    );

    this.onDestroySubscriptions.push(
      this.linkForm.controls['drawAsDisc'].valueChanges.subscribe((wanted) => {
        // The switch says what the link should be drawn as; the service owns
        // the flip. Pressed to a state the link is already in there is nothing
        // to do, which is what a programmatic sync looks like from here.
        if (wanted === this.drawnAsDisc()) return;
        if (!this.canDrawAsDisc()) {
          this.linkForm.patchValue({ drawAsDisc: this.drawnAsDisc() }, { emitEvent: false });
          return;
        }
        this.mechanismService.toggleLinkCircular();
        this.linkForm.patchValue({ drawAsDisc: this.drawnAsDisc() }, { emitEvent: false });
      })
    );

    this.onDestroySubscriptions.push(
      this.forceForm.controls['magnitude'].valueChanges.subscribe((val) => {
        const [success, value] = this.parseForce(val!);
        if (!success || value < 0) {
          this.notify.refusal(
            'value.force',
            success
              ? 'Force magnitude must be zero or greater. Change the angle to reverse its direction.'
              : NOT_A.force
          );
          // The stored value in the unit the field shows, and quietly: a
          // refusal that emits runs the parser over its own restore.
          this.forceForm.patchValue(
            { magnitude: this.forceText(this.activeSrv.selectedForce.mag) },
            { emitEvent: false }
          );
        } else {
          this.activeSrv.selectedForce.setMagnitude(value);
          this.mechanismService.updateMechanism(true);
          this.mechanismService.onMechUpdateState.next(2);
          this.forceForm.patchValue(
            {
              magnitude: this.forceText(this.activeSrv.selectedForce.mag),
            },
            { emitEvent: false }
          );
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.forceForm.controls['angle'].valueChanges.subscribe((val) => {
        const [success, value] = this.nup.parseAngleString(
          val!,
          this.settingsService.angleUnit.getValue()
        );
        if (!success) {
          this.notify.refusal('value.angle', NOT_A.angle);
          // Put back what the force actually points at, in the unit this field
          // is read in, and without waking this handler again. It used to write
          // the raw radians as a bare number *and* emit -- so refusing "zzz" on
          // a force pointing straight down fed "-1.57" back through the parser,
          // which read it as -1.57 *degrees* and swung the arrow to horizontal.
          // The refusal did the edit it was refusing.
          this.forceForm.patchValue(
            {
              angle: this.nup.formatValueAndUnit(
                this.nup.convertAngle(
                  this.activeSrv.selectedForce.angleRad,
                  AngleUnit.RADIAN,
                  this.settingsService.angleUnit.getValue()
                ),
                this.settingsService.angleUnit.getValue()
              ),
            },
            { emitEvent: false }
          );
        } else {
          //Always convert to Radian since Force.angle is in Radian
          this.activeSrv.selectedForce.setDirectionRadians(
            this.nup.convertAngle(
              value,
              this.settingsService.angleUnit.getValue(),
              AngleUnit.RADIAN
            )
          );
          this.mechanismService.updateMechanism(true);
          this.mechanismService.onMechUpdateState.next(2);
          this.forceForm.patchValue(
            {
              angle: this.nup.formatValueAndUnit(value, this.settingsService.angleUnit.getValue()),
            },
            { emitEvent: false }
          );
        }
        this.activeSrv.fakeUpdateSelectedObj();
      })
    );

    this.onDestroySubscriptions.push(
      this.forceForm.controls['xComp'].valueChanges.subscribe((val) => {
        const [success, value] = this.parseForce(val!);
        if (!success) {
          this.notify.refusal('value.force', NOT_A.force);
          // The stored value in the unit the field shows, and quietly: a
          // refusal that emits runs the parser over its own restore.
          this.forceForm.patchValue(
            { xComp: this.forceText(this.activeSrv.selectedForce.xComp) },
            { emitEvent: false }
          );
        } else {
          this.activeSrv.selectedForce.setComponents(value, this.activeSrv.selectedForce.yComp);
          this.mechanismService.updateMechanism(true);
          this.mechanismService.onMechUpdateState.next(2);
          this.forceForm.patchValue(
            {
              xComp: this.forceText(value),
            },
            { emitEvent: false }
          );
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.forceForm.controls['yComp'].valueChanges.subscribe((val) => {
        const [success, value] = this.parseForce(val!);
        if (!success) {
          this.notify.refusal('value.force', NOT_A.force);
          // The stored value in the unit the field shows, and quietly: a
          // refusal that emits runs the parser over its own restore.
          this.forceForm.patchValue(
            { yComp: this.forceText(this.activeSrv.selectedForce.yComp) },
            { emitEvent: false }
          );
        } else {
          this.activeSrv.selectedForce.setComponents(this.activeSrv.selectedForce.xComp, value);
          this.mechanismService.updateMechanism(true);
          this.mechanismService.onMechUpdateState.next(2);
          this.forceForm.patchValue(
            {
              yComp: this.forceText(value),
            },
            { emitEvent: false }
          );
        }
      })
    );

    this.onDestroySubscriptions.push(
      this.forceForm.controls['isGlobal'].valueChanges.subscribe((val) => {
        if (this.editingRefused()) {
          return;
        }
        this.mechanismService.changeForceLocal();
      })
    );

    // The three lengths behave alike, so they are wired alike. Nothing here
    // calls updateMechanism or save: moving a picture is not an edit to the
    // linkage, and putting it in the undo history would mean Undo silently
    // re-posing the machine because the user nudged the underlay.
    (['centerX', 'centerY', 'width'] as const).forEach((field) => {
      this.onDestroySubscriptions.push(
        this.backgroundImageForm.controls[field].valueChanges.subscribe((val) => {
          this.commitBackgroundImageLength(field, val);
        })
      );
    });

    this.onDestroySubscriptions.push(
      this.backgroundImageForm.controls['rotation'].valueChanges.subscribe((val) => {
        if (!this.bgImage.image()) return;
        const [ok, value] = this.nup.parseAngleString(
          val ?? '',
          this.settingsService.angleUnit.getValue()
        );
        if (!ok) {
          this.notify.refusal('value.angle', NOT_A.angle);
        } else {
          this.bgImage.place({
            rotationRad: this.nup.convertAngle(
              value,
              this.settingsService.angleUnit.getValue(),
              AngleUnit.RADIAN
            ),
          });
        }
        this.patchBackgroundImageForm();
      })
    );

    this.onDestroySubscriptions.push(
      this.backgroundImageForm.controls['opacity'].valueChanges.subscribe((val) => {
        if (!this.bgImage.image()) return;
        const typed = (val ?? '').replace('%', '').trim();
        const percent = Number(typed);
        // Emptiness is not zero. Number('') is 0, so a blank field silently
        // turned the picture invisible -- and then the panel reported 0% as
        // though that had been asked for.
        if (typed === '' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
          this.notify.refusal('bgImage.opacity', 'Opacity has to be a number from 0 to 100.');
        } else {
          this.bgImage.place({ opacity: percent / 100 });
        }
        this.patchBackgroundImageForm();
      })
    );

    this.onDestroySubscriptions.push(
      this.activeSrv.onActiveObjChange.subscribe((newObjType: string) => {
        if (newObjType == 'Joint') {
          //Is this a real change where the form needs to get updated?
          if (this.currentlyOpenJointID != this.activeSrv.selectedJoint.id) {
            this.listOfOtherJoints = [];
            setTimeout(() => {
              this.reloadOtherJointForm();
              this.listOfOtherJoints.forEach((joint, i) => {
                this.setFormDistAndAngle(this.activeSrv.selectedJoint, joint, i);
              });
            });
          }

          this.listOfOtherJoints.forEach((joint, i) => {
            this.setFormDistAndAngle(this.activeSrv.selectedJoint, joint, i);
          });
          this.currentlyOpenJointID = this.activeSrv.selectedJoint.id;

          const angleTemp_rad = this.selectedSlider?.angle_rad ?? 0;
          this.jointForm.patchValue(
            {
              xPos: this.nup.formatModelLength(
                this.activeSrv.selectedJoint.x,
                this.settingsService.lengthUnit.getValue()
              ),
              yPos: this.nup.formatModelLength(
                this.activeSrv.selectedJoint.y,
                this.settingsService.lengthUnit.getValue()
              ),
              prisAngle: this.nup.formatValueAndUnit(
                this.nup.convertAngle(
                  angleTemp_rad,
                  AngleUnit.RADIAN,
                  this.settingsService.angleUnit.getValue()
                ),
                this.settingsService.angleUnit.getValue()
              ),
              // A slider's ground lives on its PrisJoint, not on the pin the
              // panel selected, so reading the pin shows every grounded guide
              // as ungrounded.
              ground: this.selectedSlider?.ground ?? this.activeSrv.selectedJoint.ground,
              curve: this.activeSrv.selectedJoint.showCurve,
              sliderMass: this.sliderMassJoint
                ? this.nup.formatValueAndUnit(this.sliderMassJoint.mass, this.massUnit())
                : '',
            },
            { emitEvent: false }
          );
          // A cylinder's slide overwrites both of those: its Slider Angle is
          // the part's one bearing rather than its own slot's, and *Starts at*
          // is the only field on this panel that reads off the whole assembly.
          const sealed = this.sealCylinder;
          if (sealed) this.patchSlideFields(sealed);
          this.syncInputSettingsFields();

          this.disableAndEnableLinkFields();
          setTimeout(() => {
            this.disableAndEnableJointFields();
          });
        } else if (newObjType == 'Link') {
          this.currentlyOpenJointID = '';
          this.patchLinkSize();
          this.linkForm.patchValue(
            {
              mass: this.nup.formatValueAndUnit(this.activeSrv.selectedLink.mass, this.massUnit()),
              drawAsDisc: this.drawnAsDisc(),
            },
            { emitEvent: false }
          );
          this.refreshDerivedMassFields();
          this.syncMassDependents();
        } else if (newObjType == 'Force') {
          this.currentlyOpenJointID = '';
          this.forceForm.patchValue(
            {
              magnitude: this.forceText(this.activeSrv.selectedForce.mag),
              angle: this.nup.formatValueAndUnit(
                this.nup.convertAngle(
                  this.activeSrv.selectedForce.angleRad,
                  AngleUnit.RADIAN,
                  this.settingsService.angleUnit.getValue()
                ),
                this.settingsService.angleUnit.getValue()
              ),
              xComp: this.forceText(this.activeSrv.selectedForce.xComp),
              yComp: this.forceText(this.activeSrv.selectedForce.yComp),
              isGlobal: this.activeSrv.selectedForce.local ? '0' : '1',
            },
            { emitEvent: false }
          );
        } else if (newObjType == 'BackgroundImage') {
          this.currentlyOpenJointID = '';
          this.patchBackgroundImageForm();
        } else {
          this.currentlyOpenJointID = '';
        }
      })
    );
  }

  /**
   * Whether the selected link is on the canvas as a disc right now.
   *
   * Not the same question as "was it asked to be one": the choice is kept
   * through a ground being removed, so that putting the ground back brings the
   * disc back rather than making someone ask twice. In between, the link is
   * drawn as a bar, and everything a person can see about it should agree.
   */
  drawnAsDisc(): boolean {
    const link = this.activeSrv.selectedLink;
    return !!link?.isCircle && this.canDrawAsDisc();
  }

  /**
   * Whether this body may be drawn as a disc at all.
   *
   * A cylinder's member never may, whatever its own two joints look like: the
   * part is drawn by one skin from end to end, and a barrel bolted to the frame
   * at its mount otherwise passes the link's own test and offers a switch that
   * the skin would ignore. Shown grayed rather than hidden (D12), with the
   * reason on the row.
   */
  canDrawAsDisc(): boolean {
    return !this.selectedCylinder && this.activeSrv.selectedLink?.canBeCircular() === true;
  }

  /** Why Draw as a Disc is unavailable, in terms of this particular body. */
  whyNotCircular(): string {
    if (this.selectedCylinder) {
      return `A disc is centered on the pin its link turns about. This is half of a cylinder, which
        slides along its own axis rather than turning about a pin.`;
    }
    const link = this.activeSrv.selectedLink;
    const grounded = link.joints.filter(
      (joint) => joint instanceof RealJoint && joint.ground && !(joint instanceof PrisJoint)
    );
    const held = link.isCircle ? 'Drawn as a bar: a' : 'A';
    if (link.subset.length > 0) {
      return `${held} disc is centered on one fixed pin, and a welded compound is drawn from the
        shapes of its parts. Unweld it to draw a part of it as a disc.`;
    }
    if (grounded.length === 0) {
      return `${held} disc is centered on the pin its link turns about, and this link has no fixed
        pin. Ground one of its joints to draw it as a disc.`;
    }
    if (grounded.length > 1) {
      return `${held} disc is centered on the pin its link turns about, and this link is fixed at
        ${grounded.length} joints, so it does not turn about any of them.`;
    }
    return `${held} disc is centered on a fixed revolute pin; this link's fixed joint is a slider,
      which anchors a slot rather than a pivot.`;
  }

  /**
   * The frame the Center of Mass is both typed in and held against, read off
   * the selected link rather than remembered here — it is the link's property,
   * so selecting another link shows that link's answer and a reloaded drawing
   * shows the one it was saved with.
   */
  get comFrame(): string {
    const anchor = this.activeSrv.selectedLink?.comAnchor ?? 'centroid';
    if (anchor === 'grid' || anchor === 'centroid') return anchor;
    return 'joint:' + anchor.joint;
  }

  setComFrame(frame: string): void {
    const link = this.activeSrv.selectedLink;
    if (!link) return;
    link.comAnchor =
      frame === 'grid'
        ? 'grid'
        : frame.startsWith('joint:')
          ? { joint: frame.slice('joint:'.length) }
          : 'centroid';
    // Re-read the offsets against the new anchor before anything moves, so
    // choosing a frame re-describes where the point already is instead of
    // moving it there.
    link.captureComOffset();
    this.mechanismService.updateMechanism(true);
    this.refreshDerivedMassFields();
  }

  /** Where the chosen frame's zero sits, in model coordinates. */
  private comFrameOrigin(link: RealLink): { x: number; y: number } {
    if (this.comFrame === 'grid') return { x: 0, y: 0 };
    if (this.comFrame.startsWith('joint:')) {
      const id = this.comFrame.slice('joint:'.length);
      const joint = link.joints.find((candidate) => candidate.id === id);
      if (joint) return { x: joint.x, y: joint.y };
    }
    return uniformBodyOf(link.joints).centroid;
  }

  // ---------------------------------------------------------------------------
  // Background image
  //
  // The one thing this panel edits that is not part of the mechanism: it never
  // touches MechanismService, never enters the undo history, and never reaches
  // the URL codec. Its numbers are ordinary lengths, so they go through the same
  // parser and the same length unit as every other length here.
  // ---------------------------------------------------------------------------

  /** Show the placement as it actually is, in the user's own units. */
  private patchBackgroundImageForm(): void {
    const image = this.bgImage.image();
    if (!image) return;
    const unit = this.settingsService.lengthUnit.getValue();
    this.backgroundImageForm.patchValue(
      {
        centerX: this.nup.formatModelLength(image.centerX, unit),
        centerY: this.nup.formatModelLength(image.centerY, unit),
        width: this.nup.formatModelLength(image.width, unit),
        rotation: this.nup.formatValueAndUnit(
          this.nup.convertAngle(
            image.rotationRad,
            AngleUnit.RADIAN,
            this.settingsService.angleUnit.getValue()
          ),
          this.settingsService.angleUnit.getValue()
        ),
        opacity: Math.round(image.opacity * 100).toString(),
      },
      { emitEvent: false }
    );
  }

  /**
   * Commit one length field, or put back the value that is still true.
   *
   * A width the picture cannot have is refused rather than silently rounded up
   * to the minimum: the number left in the field has to be the number that took
   * effect, or the panel is lying about where the picture is.
   */
  private commitBackgroundImageLength(
    field: 'centerX' | 'centerY' | 'width',
    raw: string | null
  ): void {
    if (!this.bgImage.image()) return;
    const [ok, value] = this.nup.parseModelLengthString(
      raw ?? '',
      this.settingsService.lengthUnit.getValue()
    );
    if (!ok) {
      this.notify.refusal('value.length', NOT_A.length);
    } else if (field === 'width' && value < MIN_WIDTH) {
      this.notify.refusal(
        'bgImage.width',
        `A background image has to be at least ${this.nup.formatModelLength(
          MIN_WIDTH,
          this.settingsService.lengthUnit.getValue()
        )} wide.`
      );
    } else {
      this.bgImage.place({ [field]: value });
    }
    // Either way the field is rewritten from the picture: a rejected entry goes
    // back to the truth, and an accepted one is reformatted.
    this.patchBackgroundImageForm();
  }

  saveBackgroundImage(): void {
    // The placement is already live -- every field commits on blur -- so this
    // closes the editor rather than writing anything. Leaving the picture
    // selected would keep its outline on the canvas over finished work.
    this.activeSrv.updateSelectedObj(null);
    this.notify.success('bgImage.saved', 'Background image placed.');
  }

  deleteBackgroundImage(): void {
    this.bgImage.remove();
    this.activeSrv.updateSelectedObj(null);
    this.notify.success('bgImage.removed', 'Background image removed.');
  }

  private updateLinkCenterOfMass(axis: 'x' | 'y', rawValue: string | null): void {
    // A member offers no such field (decision S14). The control still exists on
    // the form, and a form control nothing renders is exactly the kind of door
    // a later template change reopens by accident.
    if (this.memberMassDerived()) return;
    const [success, value] = this.nup.parseModelLengthString(
      rawValue ?? '',
      this.settingsService.lengthUnit.getValue()
    );
    const link = this.activeSrv.selectedLink;
    if (!success) {
      this.notify.refusal('value.length', NOT_A.length);
      this.refreshDerivedMassFields();
      return;
    }

    const origin = this.comFrameOrigin(link);
    const point = {
      x: axis === 'x' ? origin.x + value : link.CoM.x,
      y: axis === 'y' ? origin.y + value : link.CoM.y,
    };
    link.placeCustomCoM(point);
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.refreshDerivedMassFields();
  }

  /** Hand both derived fields back to the shape at once. */
  useUniformBody(): void {
    this.activeSrv.selectedLink.moiIsCustom = false;
    this.activeSrv.selectedLink.comIsCustom = false;
    this.activeSrv.selectedLink.comOffset = undefined;
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.refreshDerivedMassFields();
  }

  /** Hand a field back to the uniform body, and show what it derives. */
  useUniformBodyMoI(): void {
    this.activeSrv.selectedLink.moiIsCustom = false;
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.refreshDerivedMassFields();
  }

  useUniformBodyCoM(): void {
    this.activeSrv.selectedLink.comIsCustom = false;
    this.activeSrv.selectedLink.comOffset = undefined;
    this.mechanismService.updateMechanism(true);
    this.mechanismService.onMechUpdateState.next(2);
    this.refreshDerivedMassFields();
  }

  /** Re-read MoI and CoM from the link after a rebuild may have re-derived them. */
  private refreshDerivedMassFields(): void {
    const link = this.activeSrv.selectedLink;
    if (!link) return;
    const length = this.settingsService.lengthUnit.getValue();
    const origin = this.comFrameOrigin(link);
    const display = this.nup.displayInertiaUnit(length);
    const inertia = this.nup.convertInertia(
      link.massMoI,
      this.nup.storedInertiaUnit(length),
      display
    );
    this.linkForm.patchValue(
      {
        // The unit is typed into the box, as every Basic Settings field does
        // it; the center-of-mass pair stays bare — its unit is the frame's.
        massMoI: this.nup.formatValueAndUnit(inertia, display),
        comX: ((link.CoM.x - origin.x) / MODEL_SCALE).toFixed(2),
        comY: ((link.CoM.y - origin.y) / MODEL_SCALE).toFixed(2),
      },
      { emitEvent: false }
    );
  }

  momentOfInertiaUnit(): InertiaUnit {
    return this.nup.displayInertiaUnit(this.settingsService.lengthUnit.value);
  }

  massUnit(): MassUnit {
    switch (this.settingsService.lengthUnit.value) {
      case LengthUnit.INCH:
        return MassUnit.LBM;
      case LengthUnit.METER:
        return MassUnit.KG;
      default:
        return MassUnit.GRAM;
    }
  }

  getDistanceBetweenJoints(j1: RevJoint, j2: RevJoint): number {
    return Math.sqrt((j1.x - j2.x) ** 2 + (j1.y - j2.y) ** 2);
  }

  getAngleBetweenJoints(j1: RevJoint, j2: RevJoint): number {
    return Math.atan2(j2.y - j1.y, j2.x - j1.x);
  }

  updateDistanceBetweenJoints(j1: RevJoint, j2: RevJoint, newDist: number): void {
    //Use gridUtils to move the joint
    this.gridUtils.dragJoint(
      j2,
      getNewOtherJointPos(j1, this.getAngleBetweenJoints(j1, j2), newDist)
    );
  }

  updateAngleBetweenJoints(j1: RevJoint, j2: RevJoint, newAngle: number): void {
    //Use gridUtils to move the joint
    this.gridUtils.dragJoint(
      j2,
      getNewOtherJointPos(j1, newAngle, this.getDistanceBetweenJoints(j1, j2))
    );
  }

  /**
   * Re-place the link's far end after its length or angle was typed.
   *
   * One end holds still and the other swings; which is which is the whole of
   * the decision, and it is made once here rather than in two branches that
   * can disagree. A Lock outranks ground: the reader has said in as many words
   * that this joint does not move, where ground is only the default when
   * nothing has been said. Without that, a typed length on a bar with one
   * pinned end moved the pinned end -- the one thing the mark exists to stop --
   * and the old shape could do it even with the lock read, because a free end
   * that happens to be grounded took the branch that moves the *other* one.
   */
  /** No configuration of the locked bars makes the typed number true. */
  private refuseTypedValue(which: 'length' | 'angle'): void {
    const holds = this.gridUtils.lastHoldRefusal?.bars ?? [];
    // Each bar by the name the canvas tags it with. The bar's own name is its
    // id, and a body welded to a barrel mount carries the buried inner end in
    // its id (D14, S11) -- so this sentence named a joint nothing draws.
    const named = holds
      .map((bar) => `fixed ${bar.hold} ${this.mechanismService.visibleBodyName(bar)}`)
      .join(', ');
    this.notify.refusal(
      'hold.typed',
      `No position of the linkage gives this ${which} while ${named} holds. Release one, or ask for a value they allow.`,
      {
        actions:
          holds.length > 0
            ? [{ label: 'Release', run: () => this.mechanismService.releaseHolds(holds) }]
            : [],
      }
    );
  }

  /**
   * Length and Angle as the selected body has them.
   *
   * A member's two are the part's rather than the link's own: the length is
   * this half of it (S3), and the angle is the one bearing mount to mount
   * (D10), which is not the same reading as the barrel's own joints — its far
   * end is the buried one no reader has ever been shown.
   */
  private patchLinkSize(): void {
    const link = this.activeSrv.selectedLink;
    if (!link) return;
    const sealed = this.selectedCylinder;
    if (!sealed) {
      this.patchLinkLength();
      this.patchLinkAngle();
      return;
    }
    this.linkForm.patchValue(
      {
        length: this.nup.formatModelLength(
          this.memberLength(sealed),
          this.settingsService.lengthUnit.getValue()
        ),
        angle: this.cylinderAngleLabel(sealed),
      },
      { emitEvent: false }
    );
  }

  /** Slider Angle and Starts at, as the cylinder's slide has them (D9, D10). */
  private patchSlideFields(sealed: Cylinder): void {
    this.jointForm.patchValue(
      {
        prisAngle: this.cylinderAngleLabel(sealed),
        cylinderStart: this.cylinderStartLabel(sealed),
      },
      { emitEvent: false }
    );
  }

  /** Put the field back on the length the link actually has. */
  private patchLinkLength(): void {
    this.activeSrv.selectedLink.updateLengthAndAngle();
    this.linkForm.patchValue(
      {
        length: this.nup.formatModelLength(
          this.activeSrv.selectedLink.length,
          this.settingsService.lengthUnit.getValue()
        ),
      },
      { emitEvent: false }
    );
  }

  /** Put the field back on the angle the link actually has. */
  private patchLinkAngle(): void {
    this.activeSrv.selectedLink.updateLengthAndAngle();
    this.linkForm.patchValue(
      {
        angle: this.nup.formatValueAndUnit(
          this.nup.convertAngle(
            this.activeSrv.selectedLink.angleRad,
            AngleUnit.RADIAN,
            this.settingsService.angleUnit.getValue()
          ),
          this.settingsService.angleUnit.getValue()
        ),
      },
      { emitEvent: false }
    );
  }

  resolveNewLink() {
    if (this.editingRefused()) return;
    const joints = this.activeSrv.selectedLink.joints;
    if (joints.length < 2) return;
    const frozenIds = this.gridUtils.frozenJointIds();
    const held = (at: number) => frozenIds.has(joints[at]!.id);
    const grounded = (at: number) => (joints[at] as RevJoint).ground;
    // Which end stays put. Held beats grounded beats "the first one", and the
    // other end is the one that moves.
    const anchor = held(0) ? 0 : held(1) ? 1 : grounded(1) ? 1 : 0;
    const moving = anchor === 0 ? 1 : 0;
    // The link's angle is measured from joint 0 to joint 1, so swinging the
    // near end about the far one is the same angle turned around.
    const bearing =
      anchor === 0
        ? this.activeSrv.selectedLink.angleRad
        : this.activeSrv.selectedLink.angleRad + Math.PI;
    const to = getNewOtherJointPos(joints[anchor], bearing, this.activeSrv.selectedLink.length);
    this.gridUtils.dragJoint(joints[moving] as RevJoint, to);
  }

  resolveNewForceAngle() {
    if (!this.editingRefused()) {
      //Whenever angle is changed, the end point of the force is changed
      const distanceBetweenPoints = getDistance(
        this.activeSrv.selectedForce.startCoord,
        this.activeSrv.selectedForce.endCoord
      );

      const endCoordLocation = getNewOtherJointPos(
        this.activeSrv.selectedForce.startCoord,
        this.activeSrv.selectedForce.angleRad,
        distanceBetweenPoints
      );

      this.gridUtils.dragForce(this.activeSrv.selectedForce, endCoordLocation, 'direction');
    }
  }

  resolveNewForceMagnitude() {
    if (!this.editingRefused()) {
      const endX = this.activeSrv.selectedForce.startCoord.x + this.activeSrv.selectedForce.xComp;
      const endY = this.activeSrv.selectedForce.startCoord.y + this.activeSrv.selectedForce.yComp;

      this.gridUtils.dragForce(this.activeSrv.selectedForce, new Coord(endX, endY), 'direction');
    }
  }

  deleteJoint() {
    this.activeSrv.updateSelectedObj(undefined);
    this.mechanismService.deleteJoint();
  }

  deleteLink() {
    this.activeSrv.updateSelectedObj(undefined);
    this.mechanismService.deleteLink();
  }

  deleteForce() {
    this.activeSrv.updateSelectedObj(undefined);
    this.mechanismService.deleteForce();
  }

  isWeldable(joint: RealJoint) {
    //If there are at least two links that share this joint, return true
    return joint.canBeWelded();
  }

  /** One rule, shared with the right-click menu so the two cannot disagree. */
  canToggleInput(selectedJoint: RealJoint) {
    return this.gridUtils.canToggleInput(selectedJoint);
  }

  /**
   * Why Add Input is gray, from the model that grays it -- the same sentence
   * the right-click menu's row carries, so a button and a row cannot disagree.
   */
  inputRefusal(): string | undefined {
    const joint = this.activeSrv.selectedJoint;
    if (!joint || this.canToggleInput(joint)) return undefined;
    return describeActuatorRefusal(joint)?.long ?? 'This joint cannot be driven.';
  }

  /** Point at a CoM field, see what it states: the CoM mark, plus the
   *  distance drawn from the chosen frame's zero along that axis — the same
   *  show-me the length and angle fields give. */
  setComPreview(axis: 'x' | 'y', on: boolean) {
    const link = this.activeSrv.selectedLink;
    const showing = on && !!link;
    this.settingsService.previewCoMLinkId = showing ? link.id : null;
    canvasHandle()?.setComMeasureOverlay(
      showing
        ? {
            axis,
            origin: this.comFrameOrigin(link),
            com: { x: link.CoM.x, y: link.CoM.y },
            mode: this.comFrame === 'grid' ? 'axis' : 'origin',
          }
        : undefined
    );
  }

  setShowLinkLengthOverlay($event: number) {
    canvasHandle()?.setLinkLengthOverlay($event, this.listOfOtherJoints);
  }

  setShowLinkAngleOverlay($event: number) {
    canvasHandle()?.setLinkAngleOverlay($event, this.listOfOtherJoints);
  }

  /** Show what a grounded slot's angle is measured from, while it is pointed at. */
  setSlotAngleOverlay(showing: boolean) {
    canvasHandle()?.setSlotAngleOverlay(showing);
  }

  /**
   * Show where the rod can get to, while *Starts at* is pointed at.
   *
   * The stretch of grid the rod's end joint covers, with the share of it the
   * field states marked on it — what a reader typing a percentage wants to see
   * is a place on the drawing rather than a number in the abstract.
   */
  setCylinderStartOverlay(showing: boolean) {
    canvasHandle()?.setStartsAtOverlay(showing);
  }

  getOtherJointsInLink(selectedJoint: RealJoint): RealJoint[] {
    //Get the other joint in the link, don't include the selected joint
    //First find all the links that contain this joint

    let links = this.mechanismService.links.filter((link) => {
      return link.joints.includes(selectedJoint);
    });
    //Make a list off all joints in these links that are not the selected joint
    let otherJoints = links
      .map((link) => {
        return (link.joints as RealJoint[]).filter((joint) => {
          return joint != selectedJoint;
        });
      })
      .flat();

    // Remove joints that are prismatic
    otherJoints = otherJoints.filter((joint) => {
      return !(joint instanceof PrisJoint);
    });

    // The barrel's buried end is placed by the part rather than dragged, so a
    // mount's Distance To Joints must not offer a field that would move it.
    // The slide is a `PrisJoint` and the filter above has already taken it
    // out; where it stands is its own panel's *Starts at*.
    otherJoints = otherJoints.filter((joint) => {
      const sealed = this.mechanismService.cylinderAt(joint);
      return !sealed || joint.id === sealed.mountA.id || joint.id === sealed.mountB.id;
    });

    // A mount reads like a binary link's endpoint: its far end is the OTHER
    // mount, which the two filters above removed along with the joints between
    // them. Editing that D drags the far mount, which re-poses the whole part
    // parametrically.
    const mountOf = this.mechanismService.cylinderAt(selectedJoint);
    if (
      mountOf &&
      (selectedJoint.id === mountOf.mountA.id || selectedJoint.id === mountOf.mountB.id)
    ) {
      const far = selectedJoint.id === mountOf.mountA.id ? mountOf.mountB : mountOf.mountA;
      if (far instanceof RealJoint && !otherJoints.some((joint) => joint.id === far.id)) {
        otherJoints.push(far);
      }
    }

    if (otherJoints == undefined) {
      return [];
    }

    return otherJoints as RealJoint[];
  }

  private reloadOtherJointForm() {
    this.listOfOtherJoints = this.getOtherJointsInLink(this.activeSrv.selectedJoint);
    this.jointForm.controls['otherJoints'] = this.fb.array([]);
    this.otherJoitnsSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.otherJoitnsSubscriptions = [];

    this.listOfOtherJoints.forEach((joint, i) => {
      this.otherJoints.push(this.fb.control('', { updateOn: 'blur' }));
      this.otherJoitnsSubscriptions.push(
        this.otherJoints.controls[i * 2].valueChanges.subscribe((val) => {
          const [success, value] = this.nup.parseModelLengthString(
            val!,
            this.settingsService.lengthUnit.getValue()
          );
          // A distance is a distance: a negative one is not a shorter bar, it
          // is the same bar with a minus sign the field then goes on showing
          // over geometry that never took it.
          if (!success || value < 0) {
            this.notify.refusal('value.length', success ? NOT_A.positiveLength : NOT_A.length);
            this.otherJoints.controls[i * 2].patchValue(
              this.nup.formatModelLength(
                this.getDistanceBetweenJoints(this.activeSrv.selectedJoint, joint),
                this.settingsService.lengthUnit.getValue()
              ),
              { emitEvent: false }
            );
          } else {
            this.updateDistanceBetweenJoints(this.activeSrv.selectedJoint, joint, value);
            this.mechanismService.onMechUpdateState.next(2);
            this.otherJoints.controls[i * 2].patchValue(
              this.nup.formatModelLength(value, this.settingsService.lengthUnit.getValue()),
              { emitEvent: false }
            );
          }
        })
      );
      this.otherJoints.push(this.fb.control('', { updateOn: 'blur' }));
      this.otherJoitnsSubscriptions.push(
        this.otherJoints.controls[i * 2 + 1].valueChanges.subscribe((val) => {
          const [success, value] = this.nup.parseAngleString(
            val!,
            this.settingsService.angleUnit.getValue()
          );
          if (!success) {
            this.notify.refusal('value.angle', NOT_A.angle);
            // The bearing between *these two joints*, which is what this field
            // is about. It used to reach for `selectedLink.angleRad` while a
            // joint was selected -- so `selectedLink` was undefined, the throw
            // took the restore with it, and the box sat there still showing
            // whatever had just been refused.
            this.otherJoints.controls[i * 2 + 1].patchValue(
              this.nup.formatValueAndUnit(
                this.nup.convertAngle(
                  this.getAngleBetweenJoints(this.activeSrv.selectedJoint, joint),
                  AngleUnit.RADIAN,
                  this.settingsService.angleUnit.getValue()
                ),
                this.settingsService.angleUnit.getValue()
              ),
              { emitEvent: false }
            );
          } else {
            this.updateAngleBetweenJoints(
              this.activeSrv.selectedJoint,
              joint,
              this.nup.convertAngle(
                value,
                this.settingsService.angleUnit.getValue(),
                AngleUnit.RADIAN
              )
            );
            this.mechanismService.onMechUpdateState.next(2);
            this.otherJoints.controls[i * 2 + 1].patchValue(
              this.nup.formatValueAndUnit(value, this.settingsService.angleUnit.getValue()),
              { emitEvent: false }
            );
          }
        })
      );
    });
  }

  private setFormDistAndAngle(
    currentJoint: RealJoint,
    otherJoint: RealJoint,
    otherJointID: number
  ) {
    let distance = this.getDistanceBetweenJoints(currentJoint, otherJoint);
    let angle = this.getAngleBetweenJoints(currentJoint, otherJoint);

    angle = this.nup.convertAngle(
      angle,
      AngleUnit.RADIAN,
      this.settingsService.angleUnit.getValue()
    );

    this.otherJoints.controls[otherJointID * 2].setValue(
      this.nup.formatModelLength(distance, this.settingsService.lengthUnit.getValue()),
      { emitEvent: false }
    );

    this.otherJoints.controls[otherJointID * 2 + 1].setValue(
      this.nup.formatValueAndUnit(angle, this.settingsService.angleUnit.getValue()),
      { emitEvent: false }
    );
  }

  /** Open the tutorial where the drawing has got to, and show the drawer. */
  startTutorial(): void {
    this.tutorial.start();
  }

  /** Turn the offer down for good, and say where it went. */
  dismissTutorial(): void {
    this.tutorial.dismissOffer();
    this.notify.success(
      'tutorial.dismissed',
      'Tutorial dismissed. It is in the project menu, at the top left, if you change your mind.'
    );
  }
}
