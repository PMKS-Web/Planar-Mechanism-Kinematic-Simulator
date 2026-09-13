import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { BodyJoint } from '../../model/body-system/joint-record';
import { NativeEditorService } from '../../services/native-editor.service';
import { InputComponent } from '../BLOCKS/input/input.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { nativeCommand } from '../../model/body-system/body-joint-interaction';
import { nativeEditRefusalCopy } from '../../model/body-system/joint-permission';
import { nativeLength, nativeAngle, nativeNumber } from '../../model/body-system/body-field-values';
import { jointCoordinate } from '../../model/body-system/joint-coordinate';
import { BodyEditCommand } from '../../model/body-system/body-edit-types';
import { CoordinateLimit } from '../../model/body-system/body-document';

@Component({
  selector: 'app-native-joint-limits',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [InputComponent, CollapsibleSubsectionComponent, MatButton],
  templateUrl: './native-joint-limits.component.html',
  styleUrl: './native-material-properties.component.scss',
})
export class NativeJointLimitsComponent {
  readonly joint = input.required<BodyJoint>();
  protected readonly editor = inject(NativeEditorService);
  protected readonly limits = computed(() =>
    this.editor.document().limits.filter((l) => l.coordinate.jointId === this.joint().id)
  );
  protected readonly fields = new Map<
    string,
    FormGroup<{ lower: FormControl<string>; upper: FormControl<string> }>
  >();
  constructor() {
    effect(() => {
      for (const limit of this.limits()) {
        const values = { lower: this.format(limit.lower), upper: this.format(limit.upper) };
        const existing = this.fields.get(limit.id);
        if (existing) existing.patchValue(values, { emitEvent: false });
        else
          this.fields.set(
            limit.id,
            new FormGroup({
              lower: new FormControl(values.lower, { nonNullable: true }),
              upper: new FormControl(values.upper, { nonNullable: true }),
            })
          );
      }
      for (const key of this.fields.keys())
        if (!this.limits().some((l) => l.id === key)) this.fields.delete(key);
    });
  }
  private format(value: number) {
    const d = this.editor.document();
    return this.joint().kind === 'revolute'
      ? `${nativeNumber(d.settings.angleUnit === 'deg' ? (value * 180) / Math.PI : value)} ${d.settings.angleUnit}`
      : `${nativeNumber(value)} ${d.units.length}`;
  }
  protected addCommand() {
    const d = this.editor.drawing(),
      joint = this.joint();
    if (joint.kind === 'weld') return;
    const coordinate = joint.kind === 'revolute' ? 'angle' : 'travel';
    const current = jointCoordinate(
      joint,
      coordinate,
      new Map(d.bodies.map((b) => [b.id, b.pose])),
      new Map(d.attachments.map((a) => [a.id, a]))
    );
    const range = coordinate === 'angle' ? Math.PI / 2 : d.settings.objectScale;
    return nativeCommand({
      kind: 'add-limit',
      coordinate: { jointId: joint.id, coordinate },
      lower: current - range,
      upper: current + range,
    });
  }
  protected removeCommand(limit: CoordinateLimit) {
    return nativeCommand({ kind: 'remove-limit', limitId: limit.id });
  }
  protected refused(command: BodyEditCommand | undefined) {
    if (!command) return;
    const result = this.editor.preview(command);
    return result.ok ? undefined : nativeEditRefusalCopy(result);
  }
  protected run(command: BodyEditCommand | undefined) {
    if (command) this.editor.commit(command);
  }
  protected commit(limit: CoordinateLimit) {
    const fields = this.fields.get(limit.id)!,
      d = this.editor.document();
    if (
      fields.controls.lower.value === this.format(limit.lower) &&
      fields.controls.upper.value === this.format(limit.upper)
    )
      return;
    const parse = (text: string) =>
      this.joint().kind === 'revolute'
        ? nativeAngle(text, d.settings.angleUnit)
        : nativeLength(text, d.units.length);
    const lower = parse(fields.controls.lower.value),
      upper = parse(fields.controls.upper.value);
    if (lower === undefined || upper === undefined) {
      this.editor.report('Type both limits as numbers.');
      return;
    }
    this.editor.apply({ kind: 'limit-bounds', limitId: limit.id, lower, upper });
  }
}
