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
import { RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { MODEL_SCALE } from '../../model/render-scale';
import { CommonValue, aggregateCommonValue } from '../../model/selection';
import { AngleUnit, LengthUnit, MassUnit } from '../../model/utils';
import { ActiveObjService } from '../../services/active-obj.service';
import { EditPermissionService } from '../../services/edit-permission.service';
import { MechanismService } from '../../services/mechanism.service';
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
    ToggleComponent,
  ],
})
export class MultiEditPanelComponent implements OnInit, DoCheck {
  readonly active = inject(ActiveObjService);
  private mechanism = inject(MechanismService);
  private multi = inject(MultiEditService);
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
    (['x', 'y', 'length', 'angle', 'mass'] as const).forEach((name) => {
      const control = this.form.controls[name];
      if (frozen === control.disabled) return;
      if (frozen) control.disable({ emitEvent: false });
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
    const joints = this.joints.length;
    const links = this.links.length;
    if (joints && links) {
      return `${joints} ${joints === 1 ? 'joint' : 'joints'} · ${links} ${links === 1 ? 'link' : 'links'} selected`;
    }
    if (joints) return `${joints} ${joints === 1 ? 'joint' : 'joints'} selected`;
    return `${links} ${links === 1 ? 'link' : 'links'} selected`;
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
      },
      { emitEvent: false }
    );
  }
}
