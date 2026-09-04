import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DoCheck,
  OnInit,
  inject,
} from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Force } from '../../model/force';
import { RealJoint } from '../../model/joint';
import { LinkHold, RealLink } from '../../model/link';
import { MODEL_SCALE } from '../../model/render-scale';
import { CommonValue, aggregateCommonValue } from '../../model/selection';
import { AngleUnit, LengthUnit, MassUnit } from '../../model/utils';
import { ActiveObjService } from '../../services/active-obj.service';
import { EditPermissionService } from '../../services/edit-permission.service';
import { MechanismService } from '../../services/mechanism.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { MultiEditResult, MultiEditService } from '../../services/multi-edit.service';
import { NotificationService } from '../../services/notification.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { SelectionBatchService } from '../../services/selection-batch.service';
import { SettingsService } from '../../services/settings.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { CollapsibleSubsecitonComponent } from '../BLOCKS/collapsible-subseciton/collapsible-subseciton.component';
import { ColorPickerComponent } from '../BLOCKS/color-picker/color-picker.component';
import { DualInputComponent } from '../BLOCKS/dual-input/dual-input.component';
import { EditableTitleComponent } from '../BLOCKS/editable-title/editable-title.component';
import { InputComponent } from '../BLOCKS/input/input.component';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { RadioComponent } from '../BLOCKS/radio/radio.component';
import { ToggleComponent } from '../BLOCKS/toggle/toggle.component';

/** The Edit drawer used when more than one typed mechanism part is selected. */
@Component({
  selector: 'app-multi-edit-panel',
  templateUrl: './multi-edit-panel.component.html',
  styleUrls: ['./multi-edit-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    ButtonComponent,
    CollapsibleSubsecitonComponent,
    ColorPickerComponent,
    DualInputComponent,
    EditableTitleComponent,
    InputComponent,
    PanelSectionComponent,
    RadioComponent,
    ToggleComponent,
  ],
})
export class MultiEditPanelComponent implements OnInit, DoCheck {
  readonly active = inject(ActiveObjService);
  private mechanism = inject(MechanismService);
  private multi = inject(MultiEditService);
  private grid = inject(GridUtilsService);
  private batch = inject(SelectionBatchService);
  private nup = inject(NumberUnitParserService);
  private settings = inject(SettingsService);
  private notify = inject(NotificationService);
  private svgGrid = inject(SvgGridService);
  private destroyRef = inject(DestroyRef);
  private permission = inject(EditPermissionService);

  /**
   * Freeze the pose-bound fields while the mechanism is away from its start.
   *
   * The single-part panel does this on its own controls; this one is a separate
   * component inside the same body, and the body's `inert` only covers the
   * states where *nothing* may be touched. Paused mid-cycle, X, Y, length,
   * angle and mass are as pose-bound here as they are there -- and each writes
   * through `valueChanges`, so an unfrozen field is a live one.
   *
   * Trace and Locked are left alone: both are addressed by identity and neither
   * carries a pose.
   */
  ngDoCheck(): void {
    const frozen = !this.permission.may('placement');
    (['x', 'y', 'length', 'angle', 'mass', 'magnitude', 'forceAngle'] as const).forEach((name) => {
      // A Lock on a force holds which way it points, which is what its drag
      // handles edit; how big it is stays typeable, the same rule the one-force
      // panel keeps.
      const held = name === 'forceAngle' && this.forces.some((force) => force.locked);
      const off = frozen || held;
      const control = this.form.controls[name];
      if (off === control.disabled) return;
      if (off) control.disable({ emitEvent: false });
      else control.enable({ emitEvent: false });
    });
  }

  readonly form = new FormGroup({
    x: new FormControl('', { nonNullable: true, updateOn: 'blur' }),
    y: new FormControl('', { nonNullable: true, updateOn: 'blur' }),
    length: new FormControl('', { nonNullable: true, updateOn: 'blur' }),
    angle: new FormControl('', { nonNullable: true, updateOn: 'blur' }),
    mass: new FormControl('', { nonNullable: true, updateOn: 'blur' }),
    trace: new FormControl(false, { nonNullable: true }),
    locked: new FormControl(false, { nonNullable: true }),
    // The structural switches a joint carries, and the two values a bar can
    // hold. Assigned rather than toggled: a mixed group has no one state to
    // flip, so what the switch shows is what the group will be.
    ground: new FormControl(false, { nonNullable: true }),
    weld: new FormControl(false, { nonNullable: true }),
    slider: new FormControl(false, { nonNullable: true }),
    fixedLength: new FormControl(false, { nonNullable: true }),
    fixedAngle: new FormControl(false, { nonNullable: true }),
    // A force's three: how big, which way, and whether it turns with the body.
    magnitude: new FormControl('', { nonNullable: true, updateOn: 'blur' }),
    forceAngle: new FormControl('', { nonNullable: true, updateOn: 'blur' }),
    isGlobal: new FormControl('0', { nonNullable: true }),
  });

  constructor() {
    this.form.controls.x.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.commitJointCoordinate('x', value));
    this.form.controls.y.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.commitJointCoordinate('y', value));
    this.form.controls.length.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.commitLinkGeometry('length', value));
    this.form.controls.angle.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.commitLinkGeometry('angle', value));
    this.form.controls.mass.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.commitMass(value));
    this.form.controls.trace.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.setTracePath(value));
    this.form.controls.locked.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.setLocked(value));
    this.form.controls.ground.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) =>
        this.apply(this.multi.setGrounded(this.active.selectedPartRefs, value))
      );
    this.form.controls.weld.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.apply(this.multi.setWelded(this.active.selectedPartRefs, value)));
    this.form.controls.slider.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.apply(this.multi.setSlider(this.active.selectedPartRefs, value)));
    this.form.controls.fixedLength.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.setHold('length', value));
    this.form.controls.fixedAngle.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.setHold('angle', value));
    this.form.controls.magnitude.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.commitForceMagnitude(value));
    this.form.controls.forceAngle.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.commitForceAngle(value));
    this.form.controls.isGlobal.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) =>
        this.apply(this.multi.setForceFrame(this.active.selectedPartRefs, value === '0'))
      );
    this.active.onActiveObjChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncForm());
  }

  ngOnInit(): void {
    this.syncForm();
  }

  get joints(): RealJoint[] {
    return this.active.selectedParts.filter((part): part is RealJoint => part instanceof RealJoint);
  }

  get links(): RealLink[] {
    return this.active.selectedParts.filter((part): part is RealLink => part instanceof RealLink);
  }

  get homogeneousJoints(): boolean {
    return this.joints.length > 0 && this.joints.length === this.active.selectedParts.length;
  }

  get homogeneousLinks(): boolean {
    return this.links.length > 0 && this.links.length === this.active.selectedParts.length;
  }

  get forces(): Force[] {
    return this.active.selectedParts.filter((part): part is Force => part instanceof Force);
  }

  get homogeneousForces(): boolean {
    return this.forces.length > 0 && this.forces.length === this.active.selectedParts.length;
  }

  /**
   * Which link every selected force is on, when they agree.
   *
   * The Local option names it -- "Local (Link AB)" -- and eight forces spread
   * over four bars have no one bar to name, so the word stands on its own.
   */
  get sharedForceLink(): string | undefined {
    const names = this.forces.map((force) => force.link.name || force.link.id);
    return names.length > 0 && names.every((name) => name === names[0]) ? names[0] : undefined;
  }

  get localOptionLabel(): string {
    const link = this.sharedForceLink;
    // Named when they share one, because the one-force panel names it. Eight
    // forces spread over four bars have no one bar to name, so the word carries
    // the meaning on its own -- and the field is narrow enough that a longer
    // phrase would be clipped rather than read.
    return link ? `Local (Link ${link})` : 'Local (own link)';
  }

  forceValue(field: 'magnitude' | 'angle'): CommonValue<number> {
    return this.common(
      this.forces.map((force) => (field === 'angle' ? force.angleRad : force.mag)),
      (left, right) => Math.abs(left - right) < 1e-6
    );
  }

  forceFrameState(): CommonValue<boolean> {
    return this.common(this.forces.map((force) => force.local === true));
  }

  magnitudeText(value: CommonValue<number>): string {
    return value.kind === 'common'
      ? this.nup.formatStoredForce(
          value.value,
          this.settings.lengthUnit.value,
          this.settings.forceUnit.value
        )
      : '';
  }

  commitForceMagnitude(text: string): void {
    const [valid, value] = this.nup.parseStoredForce(
      text,
      this.settings.lengthUnit.value,
      this.settings.forceUnit.value
    );
    if (!valid || value < 0) {
      return this.invalid('force', 'A force magnitude must be zero or greater.');
    }
    this.apply(this.multi.setForceValue(this.active.selectedPartRefs, 'magnitude', value));
  }

  commitForceAngle(text: string): void {
    const [valid, value] = this.nup.parseAngleString(text, this.settings.angleUnit.value);
    if (!valid) return this.invalid('angle', 'Enter a valid angle.');
    this.apply(
      this.multi.setForceValue(
        this.active.selectedPartRefs,
        'angle',
        this.nup.convertAngle(value, this.settings.angleUnit.value, AngleUnit.RADIAN)
      )
    );
  }

  get ordinaryBinaryLinks(): boolean {
    return (
      this.homogeneousLinks &&
      this.links.every(
        (link) =>
          link.joints.length === 2 && link.subset.length === 0 && !this.mechanism.cylinderAt(link)
      )
    );
  }

  get selectionLabel(): string {
    const counted = [
      [this.joints.length, 'joint', 'joints'],
      [this.links.length, 'link', 'links'],
      [this.forces.length, 'force', 'forces'],
    ] as const;
    const said = counted
      .filter(([count]) => count > 0)
      .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
    return `${said.join(' · ')} selected`;
  }

  /**
   * What the delete button promises, counted.
   *
   * It said "Delete All", which reads as the whole drawing and is not what it
   * does -- and the right-click menu's own row for the same action says
   * "Delete Selected (2)". Two surfaces, one action, one sentence.
   */
  get deleteLabel(): string {
    const count = this.active.selectedParts.length;
    return count > 0 ? `Delete Selected (${count})` : 'Delete Selected';
  }

  private common<T>(values: readonly T[], equals: (left: T, right: T) => boolean = Object.is) {
    return aggregateCommonValue(values, equals);
  }

  jointValue(axis: 'x' | 'y'): CommonValue<number> {
    return this.common(
      this.joints.map((joint) => joint[axis]),
      (left, right) => Math.abs(left - right) < 1e-6
    );
  }

  linkValue(field: 'length' | 'angle' | 'mass'): CommonValue<number> {
    return this.common(
      this.links.map((link) => (field === 'angle' ? link.angleRad : link[field])),
      (left, right) => Math.abs(left - right) < 1e-6
    );
  }

  lockState(): CommonValue<boolean> {
    return this.common(
      this.active.selectedParts.map((part) => this.mechanism.isLockedTarget(part))
    );
  }

  lockChecked(): boolean {
    const state = this.lockState();
    return state.kind === 'common' && state.value;
  }

  /**
   * What the header's padlock shows.
   *
   * Mixed reads as unlocked, because pressing it locks the rest -- which is the
   * useful half of the gesture when some of a group is already held.
   */
  lockDisplay(): boolean | 'mixed' {
    const state = this.lockState();
    return state.kind === 'mixed' ? 'mixed' : this.lockChecked();
  }

  toggleLock(): void {
    this.setLocked(!this.lockChecked());
    this.form.patchValue({ locked: this.lockChecked() }, { emitEvent: false });
  }

  /**
   * Grounded, read the way the one-joint panel reads it: a joint that carries a
   * block is asking about its *slot*, which is the thing that can be bolted to
   * the frame.
   */
  groundState(): CommonValue<boolean> {
    return this.common(
      this.joints.map((joint) => this.mechanism.sliderFor(joint)?.ground ?? joint.ground === true)
    );
  }

  weldState(): CommonValue<boolean> {
    return this.common(this.joints.map((joint) => joint.isWelded === true));
  }

  sliderState(): CommonValue<boolean> {
    return this.common(this.joints.map((joint) => this.grid.isAttachedToSlider(joint)));
  }

  holdState(which: LinkHold): CommonValue<boolean> {
    return this.common(this.links.map((link) => link.hold === which));
  }

  private checked(state: CommonValue<boolean>): boolean {
    return state.kind === 'common' && state.value;
  }

  groundChecked(): boolean {
    return this.checked(this.groundState());
  }

  weldChecked(): boolean {
    return this.checked(this.weldState());
  }

  sliderChecked(): boolean {
    return this.checked(this.sliderState());
  }

  holdChecked(which: LinkHold): boolean {
    return this.checked(this.holdState(which));
  }

  /**
   * A bar holds one value or the other, so switching one on takes the other
   * off -- which is what the one-bar padlocks do, and what the menu's two rows
   * mean side by side.
   */
  setHold(which: LinkHold, on: boolean): void {
    this.apply(this.multi.setHold(this.active.selectedPartRefs, on ? which : undefined));
  }

  private apply(result: MultiEditResult): void {
    this.report(result);
    this.active.fakeUpdateSelectedObj();
    this.syncForm();
  }

  traceState(): CommonValue<boolean> {
    return this.common(this.joints.map((joint) => joint.showCurve === true));
  }

  traceChecked(): boolean {
    const state = this.traceState();
    return state.kind === 'common' && state.value;
  }

  setTracePath(traced: boolean): void {
    this.report(this.multi.setTracePath(this.active.selectedPartRefs, traced));
    this.active.fakeUpdateSelectedObj();
  }

  lengthText(value: CommonValue<number>): string {
    return value.kind === 'common'
      ? this.nup.formatModelLength(value.value, this.settings.lengthUnit.value)
      : '';
  }

  angleText(value: CommonValue<number>): string {
    if (value.kind !== 'common') return '';
    const displayed = this.nup.convertAngle(
      value.value,
      AngleUnit.RADIAN,
      this.settings.angleUnit.value
    );
    return this.nup.formatValueAndUnit(displayed, this.settings.angleUnit.value);
  }

  massText(value: CommonValue<number>): string {
    return value.kind === 'common' ? this.nup.formatValueAndUnit(value.value, this.massUnit()) : '';
  }

  placeholder(value: CommonValue<unknown>): string {
    return value.kind === 'mixed' ? 'Mixed' : '';
  }

  commitJointCoordinate(axis: 'x' | 'y', text: string): void {
    const [valid, value] = this.nup.parseModelLengthString(text, this.settings.lengthUnit.value);
    if (!valid) return this.invalid('length', 'Enter a coordinate with a valid length unit.');
    this.report(this.multi.assignJointCoordinate(this.active.selectedPartRefs, axis, value));
    this.active.fakeUpdateSelectedObj();
  }

  commitLinkGeometry(field: 'length' | 'angle', text: string): void {
    if (field === 'length') {
      const [valid, value] = this.nup.parseModelLengthString(text, this.settings.lengthUnit.value);
      if (!valid || !(value > 0))
        return this.invalid('length', 'Link length must be greater than zero.');
      this.report(this.multi.assignLinkGeometry(this.active.selectedPartRefs, field, value));
    } else {
      const [valid, value] = this.nup.parseAngleString(text, this.settings.angleUnit.value);
      if (!valid) return this.invalid('angle', 'Enter a valid angle.');
      this.report(
        this.multi.assignLinkGeometry(
          this.active.selectedPartRefs,
          field,
          this.nup.convertAngle(value, this.settings.angleUnit.value, AngleUnit.RADIAN)
        )
      );
    }
    this.active.fakeUpdateSelectedObj();
  }

  commitMass(text: string): void {
    const [valid, value] = this.nup.parseMassString(text, this.massUnit());
    if (!valid || value < 0) return this.invalid('mass', 'Mass must be zero or greater.');
    this.report(this.multi.assignLinkMass(this.active.selectedPartRefs, value));
    this.active.fakeUpdateSelectedObj();
  }

  setLocked(locked: boolean): void {
    this.report(this.multi.setLocked(this.active.selectedPartRefs, locked));
    this.active.fakeUpdateSelectedObj();
  }

  duplicate(): void {
    const step = this.svgGrid.minorCellSize || MODEL_SCALE;
    const result = this.batch.duplicateSelected(this.active.selectedPartRefs, { x: step, y: step });
    if (!result.ok) {
      this.notify.refusal(result.refusal.code, result.refusal.message);
      return;
    }
    this.active.restorePartSelection(
      { refs: result.selection, primary: result.selection.at(-1) },
      this.mechanism.joints,
      this.mechanism.links
    );
  }

  delete(): void {
    const result = this.batch.deleteSelected(this.active.selectedPartRefs);
    if (!result.ok) {
      this.notify.refusal(result.refusal.code, result.refusal.message);
      return;
    }
    this.active.clearPartSelection();
  }

  private report(result: MultiEditResult): void {
    if (!result.ok) this.notify.refusal(result.refusal.code, result.refusal.message);
  }

  private invalid(field: string, message: string): void {
    this.notify.refusal(`value.${field}`, message);
  }

  /** Local when they agree on it; Global when they do not, which is the neutral reading. */
  private forceLocal(): boolean {
    const state = this.forceFrameState();
    return state.kind === 'common' && state.value;
  }

  private massUnit(): MassUnit {
    switch (this.settings.lengthUnit.value) {
      case LengthUnit.INCH:
        return MassUnit.LBM;
      case LengthUnit.METER:
        return MassUnit.KG;
      default:
        return MassUnit.GRAM;
    }
  }

  private syncForm(): void {
    this.form.patchValue(
      {
        x: this.lengthText(this.jointValue('x')),
        y: this.lengthText(this.jointValue('y')),
        length: this.lengthText(this.linkValue('length')),
        angle: this.angleText(this.linkValue('angle')),
        mass: this.massText(this.linkValue('mass')),
        trace: this.traceChecked(),
        locked: this.lockChecked(),
        ground: this.groundChecked(),
        weld: this.weldChecked(),
        slider: this.sliderChecked(),
        fixedLength: this.holdChecked('length'),
        fixedAngle: this.holdChecked('angle'),
        magnitude: this.magnitudeText(this.forceValue('magnitude')),
        forceAngle: this.angleText(this.forceValue('angle')),
        isGlobal: this.forceLocal() ? '0' : '1',
      },
      { emitEvent: false }
    );
  }
}
