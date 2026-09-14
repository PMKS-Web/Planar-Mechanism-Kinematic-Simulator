import { Injectable, computed, effect, inject } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { CHROME_PERMISSION } from '../../services/chrome/chrome-tokens';
import { NativeEditorService } from '../../services/native-editor.service';
import { MaterialBody, CenterEditAnchor } from '../../model/body-system/material-body';
import { resolveMass } from '../../model/body-system/body-properties';
import { unitFactors } from '../../model/body-system/body-units';
import { nativeLength } from '../../model/body-system/body-field-values';
import {
  nativeScalar,
  nativeUnitLabel,
  nativeUnitText,
} from '../../model/body-system/native-panel-fields';
import {
  Point,
  add,
  localToWorld,
  scale,
  subtract,
  worldToLocal,
} from '../../model/body-system/body-frame';

/**
 * Mass Settings: what the section reads and what a typed number does.
 *
 * Mass is always typed; everything under it describes how that mass is spread,
 * so a massless bar has nothing for those fields to describe and the panel does
 * not draw them. A hollow dot means the value follows the shape, a filled one
 * means somebody typed it.
 *
 * A service rather than a component, because the section is drawn inside the
 * Edit panel's own card: a component here would put an element of its own
 * between `panel-section` and the subsection, and the panel is a copy of the
 * public one down to the tree.
 */
@Injectable({ providedIn: 'root' })
export class NativeMassFields {
  readonly editor = inject(NativeEditorService);
  readonly permission = inject(CHROME_PERMISSION);

  /** The one material body the Link branch is about, when there is one. */
  readonly body = computed<MaterialBody | undefined>(() => {
    const target = this.editor.selection()[0];
    if (target?.kind !== 'body') return undefined;
    const found = this.editor.drawing().bodies.find((b) => b.id === target.id);
    return found?.kind === 'material' ? found : undefined;
  });

  readonly fields = new FormGroup(
    Object.fromEntries(
      ['mass', 'massMoI', 'comX', 'comY'].map((key) => [
        key,
        new FormControl('', { nonNullable: true, updateOn: 'blur' }),
      ])
    )
  );

  readonly anchors = computed(() => {
    const body = this.body();
    return body ? this.editor.document().attachments.filter((a) => a.bodyId === body.id) : [];
  });
  readonly mass = computed(() => {
    const body = this.body();
    return body
      ? resolveMass(body, this.editor.document().units)
      : { mass: 0, center: null, displayCenter: { x: 0, y: 0 }, inertia: 0 };
  });
  readonly moiIsCustom = computed(() => this.body()?.mass.inertia.mode === 'explicit');
  readonly comIsCustom = computed(() => this.body()?.mass.center.mode === 'explicit');
  readonly hasMass = computed(() => this.mass().mass > 0);

  private presented: Record<string, string> = {};
  private shown = '';

  constructor() {
    effect(() => {
      const body = this.body();
      if (!body) return;
      const factors = unitFactors(this.editor.document().units),
        mass = this.mass();
      const units = this.editor.document().units;
      const center = this.centerIn(this.comFrame());
      // The pair stays bare, as the public panel's does: its unit is the frame's.
      const values = {
        mass: nativeUnitText(mass.mass / factors.mass, units.mass),
        massMoI: nativeUnitText(mass.inertia / factors.inertia, nativeUnitLabel(units.inertia)),
        comX: center.x.toFixed(2),
        comY: center.y.toFixed(2),
      };
      const key = JSON.stringify([body.id, values]);
      // A selection or pose change refreshes the readouts; an unrelated paint
      // leaves half-typed text where the reader put it.
      if (key === this.shown) return;
      this.shown = key;
      this.presented = values;
      this.fields.patchValue(values, { emitEvent: false });
    });
    for (const name of ['mass', 'massMoI', 'comX', 'comY'])
      this.fields.controls[name].valueChanges.subscribe(() => this.commit(name));
  }

  private commit(field: string) {
    const text = this.fields.controls[field].value;
    if (text === this.presented[field]) return;
    const value = ['comX', 'comY'].includes(field)
      ? nativeLength(text, this.editor.document().units.length)
      : nativeScalar(text);
    if (value === undefined || !Number.isFinite(value) || !text.trim()) {
      // Half-typed text stays where the reader put it: the message says what is
      // wrong, and the next change to the drawing is what refreshes the readout.
      this.editor.report('Type a number, with or without a unit — 2, 2 cm, 0.75 in.');
      return;
    }
    const body = this.body();
    if (!body) return;
    if (field === 'mass' || field === 'massMoI') {
      this.editor.apply({
        kind: 'body-properties',
        bodyId: body.id,
        change: {
          mass: { [field === 'mass' ? 'mass' : 'inertia']: { mode: 'explicit', value } },
        },
      });
      return;
    }
    // The typed pair is read in the frame the row above names, so it is turned
    // back into the body's own coordinates before it is written.
    const frame = this.comFrame();
    const shown = this.centerIn(frame);
    const wanted = { ...shown, [field === 'comX' ? 'x' : 'y']: value };
    const factors = unitFactors(this.editor.document().units);
    const local = scale(this.mass().displayCenter, 1 / factors.length);
    const point =
      frame === 'grid' ? worldToLocal(body.pose, wanted) : add(subtract(local, shown), wanted);
    const center = body.mass.center;
    this.editor.apply({
      kind: 'body-properties',
      bodyId: body.id,
      change: {
        mass: {
          center: {
            mode: 'explicit',
            point,
            editAnchor: center.mode === 'explicit' ? center.editAnchor : 'body',
          },
        },
      },
    });
  }

  /** Both derived values back to the shape's own, which is what Reset All means. */
  useUniformBody() {
    const body = this.body();
    if (!body) return;
    this.editor.apply({
      kind: 'body-properties',
      bodyId: body.id,
      change: { mass: { center: { mode: 'automatic' }, inertia: { mode: 'automatic' } } },
    });
  }

  useUniformBodyCoM() {
    const body = this.body();
    if (body)
      this.editor.apply({
        kind: 'body-properties',
        bodyId: body.id,
        change: { mass: { center: { mode: 'automatic' } } },
      });
  }

  useUniformBodyMoI() {
    const body = this.body();
    if (body)
      this.editor.apply({
        kind: 'body-properties',
        bodyId: body.id,
        change: { mass: { inertia: { mode: 'automatic' } } },
      });
  }

  /**
   * The center of mass as the chosen frame reads it, in document length.
   *
   * Centroid is an offset from the shape's own center, so an automatic center
   * reads zero; a joint is an offset from that pin; Grid is where the center
   * sits on the drawing.
   */
  private centerIn(frame: string): Point {
    const document = this.editor.document(),
      body = this.body();
    if (!body) return { x: 0, y: 0 };
    const factors = unitFactors(document.units);
    const local = scale(this.mass().displayCenter, 1 / factors.length);
    if (frame === 'grid') return localToWorld(body.pose, local);
    const origin =
      frame === 'centroid'
        ? scale(
            resolveMass(
              { ...body, mass: { ...body.mass, center: { mode: 'automatic' } } },
              document.units
            ).displayCenter,
            1 / factors.length
          )
        : (this.anchors().find((a) => frame === 'joint:' + a.id)?.point ?? { x: 0, y: 0 });
    return subtract(local, origin);
  }

  /** What the two numbers below are read in, in the panel's own words. */
  comFrame(): string {
    const center = this.body()?.mass.center;
    if (!center || center.mode === 'automatic') return 'centroid';
    if (center.editAnchor === 'grid') return 'grid';
    if (center.editAnchor === 'body') return 'centroid';
    return 'joint:' + center.editAnchor.attachmentId;
  }

  setComFrame(value: string) {
    const body = this.body(),
      center = body?.mass.center;
    if (!body || center?.mode !== 'explicit') return;
    const chosen = this.anchors().find((a) => value === 'joint:' + a.id);
    const anchor: CenterEditAnchor = chosen
      ? { attachmentId: chosen.id }
      : value === 'grid'
        ? 'grid'
        : 'body';
    this.editor.apply({
      kind: 'body-properties',
      bodyId: body.id,
      change: { mass: { center: { ...center, editAnchor: anchor } } },
    });
  }
}
