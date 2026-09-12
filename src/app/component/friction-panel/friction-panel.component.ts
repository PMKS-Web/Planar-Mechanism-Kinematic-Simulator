import {
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { PrisJoint, RealJoint } from '../../model/joint';
import {
  frictionContactsOf,
  guideFrictionRefusal,
  frictionContactName,
} from '../../model/friction-contacts';
import { hasFriction, INERTIA_FRICTION_REFUSAL } from '../../model/joint-friction';
import { MODEL_SCALE } from '../../model/render-scale';
import {
  FrictionService,
  FrictionReading,
  FRICTION_REWIND_MESSAGE,
} from '../../services/friction.service';
import { FrictionOverlayService } from '../../services/friction-overlay.service';
import { ViewButtonComponent } from '../view-controls/view-button.component';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { EditPermissionService } from '../../services/edit-permission.service';
import { InputComponent } from '../BLOCKS/input/input.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';

@Component({
  selector: 'app-friction-panel',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    ReactiveFormsModule,
    InputComponent,
    ButtonComponent,
    CollapsibleSubsectionComponent,
    ViewButtonComponent,
  ],
  templateUrl: './friction-panel.component.html',
  styleUrl: './friction-panel.component.scss',
})
export class FrictionPanelComponent implements DoCheck {
  protected readonly contactName = frictionContactName;
  readonly joint = input.required<RealJoint>();
  readonly readOnly = input(false);
  protected readonly service = inject(FrictionService);
  protected readonly overlay = inject(FrictionOverlayService);
  protected readonly permission = inject(EditPermissionService);
  private settings = inject(SettingsService);
  private parser = inject(NumberUnitParserService);
  protected diagnosticSummary(reading: FrictionReading): string {
    if (reading.state === 'Stationary') return 'Static holding force is not solved.';
    if (reading.message === INERTIA_FRICTION_REFUSAL)
      return 'In-motion inertia scaling issue. Use Static analysis.';
    if (reading.message === FRICTION_REWIND_MESSAGE)
      return 'Playback rewind does not reverse the prescribed drive.';
    return reading.message ?? 'No solved friction result.';
  }
  protected readonly error = signal('');
  protected readonly confirmation = signal('');
  protected readonly feedbackJoint = signal('');
  /** A caller can retain the section's open state when switching property views. */
  readonly expanded = model(false);
  protected readonly contacts = signal<
    { joint: RealJoint; pin: boolean; form: FormGroup; apply: () => void; remove: () => void }[]
  >([]);
  private signature = '';
  private previousJoint?: RealJoint;

  ngDoCheck(): void {
    if (this.previousJoint !== this.joint()) {
      this.confirmation.set('');
      this.previousJoint = this.joint();
    }
    const joints = frictionContactsOf(this.joint());
    const signature = JSON.stringify([
      joints.map((one) => [one.id, one.friction]),
      this.settings.lengthUnit.value,
      this.readOnly(),
      !this.readOnly() && !!this.permission.refusal('properties'),
    ]);
    if (
      signature === this.signature &&
      joints.every((one, index) => one === this.contacts()[index]?.joint)
    )
      return;
    this.signature = signature;
    this.error.set('');
    this.contacts.set(
      joints.map((joint) => {
        const form = new FormGroup({
          static: new FormControl(String(joint.friction.staticCoefficient), { nonNullable: true }),
          kinetic: new FormControl(String(joint.friction.kineticCoefficient), {
            nonNullable: true,
          }),
          radius: new FormControl(String(joint.friction.radius / MODEL_SCALE), {
            nonNullable: true,
          }),
        });
        if (!this.readOnly() && this.permission.refusal('properties')) form.disable();
        return {
          joint,
          pin: !(joint instanceof PrisJoint),
          form,
          apply: () => this.apply(joint, form),
          remove: () =>
            this.commit(joint, { ...joint.friction, staticCoefficient: 0, kineticCoefficient: 0 }),
        };
      })
    );
  }

  protected enabled(joint: RealJoint): boolean {
    return hasFriction(joint.friction);
  }
  protected anyEnabled(): boolean {
    return this.contacts().some((contact) => this.enabled(contact.joint));
  }
  protected collapsedWarning(): string | undefined {
    if (this.expanded()) return undefined;
    for (const contact of this.contacts()) {
      if (this.unsupported(contact.joint)) return 'Unavailable';
      if (!this.enabled(contact.joint)) continue;
      const reading = this.service.reading(contact.joint);
      if (reading.state === 'Stationary') return 'Indeterminate at Rest';
      if (reading.message) return 'Unavailable';
    }
    return undefined;
  }
  protected inputReading() {
    const contact = this.contacts().find(
      (one) => this.enabled(one.joint) && !this.unsupported(one.joint)
    );
    return contact ? this.service.reading(contact.joint) : undefined;
  }
  protected flipOverlay(): void {
    this.overlay.visible.update((shown) => !shown);
  }
  protected radius(joint: RealJoint): number {
    return joint.friction.radius / MODEL_SCALE;
  }
  protected unsupported(joint: RealJoint): string | undefined {
    return guideFrictionRefusal(joint);
  }
  protected get lengthUnit(): string {
    return this.parser.unitLabel(this.settings.lengthUnit.value);
  }
  protected get forceUnit(): string {
    return this.parser.unitLabel(this.settings.forceUnit.value);
  }
  protected effortUnit(pin: boolean): string {
    return pin
      ? this.parser.torqueLabel(this.settings.forceUnit.value, this.settings.lengthUnit.value)
      : this.forceUnit;
  }
  protected number(value: number): string {
    return Number.isFinite(value) ? Number(value.toPrecision(5)).toString() : '—';
  }

  private apply(joint: RealJoint, form: FormGroup): void {
    const typed = form.getRawValue();
    const [validRadius, radius] = this.parser.parseLengthString(
      typed.radius,
      this.settings.lengthUnit.value
    );
    const coefficient = (value: string): number => (value.trim() === '' ? NaN : Number(value));
    this.commit(joint, {
      staticCoefficient: coefficient(typed.static),
      kineticCoefficient: coefficient(typed.kinetic),
      radius: validRadius ? radius * MODEL_SCALE : NaN,
    });
  }
  private commit(joint: RealJoint, value: RealJoint['friction']): void {
    this.feedbackJoint.set(joint.id);
    const error = this.service.set(joint, value);
    this.error.set(error ?? '');
    this.confirmation.set(
      error ? '' : hasFriction(value) ? 'Friction settings saved.' : 'Friction disabled.'
    );
  }
}
