import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { MODEL_SCALE } from '../../model/render-scale';
import { CommonValue, aggregateCommonValue } from '../../model/selection';
import { AngleUnit, LengthUnit, MassUnit } from '../../model/utils';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { MultiEditResult, MultiEditService } from '../../services/multi-edit.service';
import { NotificationService } from '../../services/notification.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { SelectionBatchService } from '../../services/selection-batch.service';
import { SettingsService } from '../../services/settings.service';
import { SvgGridService } from '../../services/svg-grid.service';

/** The Edit drawer used when more than one typed mechanism part is selected. */
@Component({
  selector: 'app-multi-edit-panel',
  templateUrl: './multi-edit-panel.component.html',
  styleUrls: ['./multi-edit-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon],
})
export class MultiEditPanelComponent {
  readonly active = inject(ActiveObjService);
  private mechanism = inject(MechanismService);
  private multi = inject(MultiEditService);
  private batch = inject(SelectionBatchService);
  private nup = inject(NumberUnitParserService);
  private settings = inject(SettingsService);
  private notify = inject(NotificationService);
  private svgGrid = inject(SvgGridService);

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
}
