import { ColorPickerComponent } from '../BLOCKS/color-picker/color-picker.component';
import { PART_COLORS } from '../../model/joint-colors';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { NativeEditorService } from '../../services/native-editor.service';
import { MaterialBody, CenterEditAnchor } from '../../model/body-system/material-body';
import { resolveMass } from '../../model/body-system/body-properties';
import { unitFactors } from '../../model/body-system/body-units';
import { nativeLength, nativeNumber } from '../../model/body-system/body-field-values';
import { InputComponent } from '../BLOCKS/input/input.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';

/** Material properties keep their owner when a weld changes the group shown on the grid. */
@Component({
  selector: 'app-native-material-properties',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ColorPickerComponent, InputComponent, CollapsibleSubsectionComponent, MatButton],
  templateUrl: './native-material-properties.component.html',
  styleUrl: './native-material-properties.component.scss',
})
export class NativeMaterialPropertiesComponent {
  readonly body = input.required<MaterialBody>();
  protected readonly colors = PART_COLORS;
  protected readonly editor = inject(NativeEditorService);
  protected readonly fields = new FormGroup(
    Object.fromEntries(
      ['mass', 'inertia', 'cx', 'cy', 'width'].map((key) => [
        key,
        new FormControl('', { nonNullable: true }),
      ])
    )
  );
  protected readonly anchors = computed(() =>
    this.editor.document().attachments.filter((a) => a.bodyId === this.body().id)
  );
  protected readonly mass = computed(() => resolveMass(this.body(), this.editor.document().units));
  private shown = '';
  private presented: Record<string, string> = {};
  constructor() {
    effect(() => {
      const body = this.body(),
        factors = unitFactors(this.editor.document().units),
        mass = this.mass();
      const values = {
        mass: nativeNumber(mass.mass / factors.mass),
        inertia: nativeNumber(mass.inertia / factors.inertia),
        cx: nativeNumber(mass.displayCenter.x / factors.length),
        cy: nativeNumber(mass.displayCenter.y / factors.length),
        width: body.geometry.kind === 'bar' ? nativeNumber(body.geometry.width) : '',
      };
      const key = JSON.stringify([body.id, values]);
      if (key === this.shown) return;
      this.shown = key;
      this.presented = values;
      this.fields.patchValue(values, { emitEvent: false });
    });
  }
  protected commit(field: string) {
    const text = this.fields.controls[field].value;
    if (text === this.presented[field]) return;
    const value = ['cx', 'cy', 'width'].includes(field)
      ? nativeLength(text, this.editor.document().units.length)
      : Number(text);
    if (value === undefined || !Number.isFinite(value) || !text.trim()) {
      this.editor.report('Type a finite number.');
      return;
    }
    const body = this.body();
    if (field === 'width') {
      if (body.geometry.kind === 'bar')
        this.editor.apply({
          kind: 'body-geometry',
          bodyId: body.id,
          geometry: { ...body.geometry, width: value },
        });
    } else if (field === 'mass' || field === 'inertia')
      this.editor.apply({
        kind: 'body-properties',
        bodyId: body.id,
        change: { mass: { [field]: { mode: 'explicit', value } } },
      });
    else {
      const center = body.mass.center,
        factors = unitFactors(this.editor.document().units);
      const point =
        center.mode === 'explicit'
          ? center.point
          : {
              x: this.mass().displayCenter.x / factors.length,
              y: this.mass().displayCenter.y / factors.length,
            };
      this.editor.apply({
        kind: 'body-properties',
        bodyId: body.id,
        change: {
          mass: {
            center: {
              mode: 'explicit',
              point: { ...point, [field === 'cx' ? 'x' : 'y']: value },
              editAnchor: center.mode === 'explicit' ? center.editAnchor : 'body',
            },
          },
        },
      });
    }
  }
  protected automatic(which: 'center' | 'inertia') {
    this.editor.apply({
      kind: 'body-properties',
      bodyId: this.body().id,
      change: { mass: { [which]: { mode: 'automatic' } } },
    });
  }
  protected anchor(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    const anchor: CenterEditAnchor =
      id === 'body' || id === 'grid'
        ? id
        : { attachmentId: this.anchors().find((a) => a.id === id)!.id };
    const center = this.body().mass.center;
    if (center.mode === 'explicit')
      this.editor.apply({
        kind: 'body-properties',
        bodyId: this.body().id,
        change: { mass: { center: { ...center, editAnchor: anchor } } },
      });
  }
  protected anchorValue() {
    const center = this.body().mass.center;
    return center.mode === 'automatic'
      ? 'body'
      : typeof center.editAnchor === 'string'
        ? center.editAnchor
        : center.editAnchor.attachmentId;
  }
  protected color(color: string) {
    this.editor.apply({
      kind: 'body-properties',
      bodyId: this.body().id,
      change: { presentation: { fill: color } },
    });
  }
}
