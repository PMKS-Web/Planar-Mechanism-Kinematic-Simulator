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
import { frictionContactsOf, guideFrictionRefusal } from '../../model/friction-contacts';
import { hasFriction } from '../../model/joint-friction';
import { MODEL_SCALE } from '../../model/render-scale';
import { FrictionService } from '../../services/friction.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { EditPermissionService } from '../../services/edit-permission.service';
import { InputComponent } from '../BLOCKS/input/input.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';

@Component({
  selector: 'app-friction-panel',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ReactiveFormsModule, InputComponent, ButtonComponent, CollapsibleSubsectionComponent],
  templateUrl: './friction-panel.component.html',
  styleUrl: './friction-panel.component.scss',
})
export class FrictionPanelComponent implements DoCheck {
  readonly joint = input.required<RealJoint>();
  readonly readOnly = input(false);
  protected readonly service = inject(FrictionService);
  protected readonly permission = inject(EditPermissionService);
  private settings = inject(SettingsService);
  private parser = inject(NumberUnitParserService);
  protected readonly error = signal('');
  /** A caller can retain the section's open state when switching property views. */
  readonly expanded = model(false);
  protected readonly contacts = signal<
    { joint: RealJoint; pin: boolean; form: FormGroup; apply: () => void; remove: () => void }[]
  >([]);
  private signature = '';

  ngDoCheck(): void {
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
            this.error.set(
              this.service.set(joint, {
                ...joint.friction,
                staticCoefficient: 0,
                kineticCoefficient: 0,
              }) ?? ''
            ),
        };
      })
    );
  }

  protected enabled(joint: RealJoint): boolean {
    return hasFriction(joint.friction);
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
    this.error.set(
      this.service.set(joint, {
        staticCoefficient: coefficient(typed.static),
        kineticCoefficient: coefficient(typed.kinetic),
        radius: validRadius ? radius * MODEL_SCALE : NaN,
      }) ?? ''
    );
  }
}
