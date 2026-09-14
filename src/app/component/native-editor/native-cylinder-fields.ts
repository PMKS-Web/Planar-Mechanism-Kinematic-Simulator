import { Injectable, computed, effect, inject } from '@angular/core';
import { FormBuilder } from '@angular/forms';

import { NativePanelActions } from './native-panel-actions';
import { AttachmentId } from '../../model/body-system/body-id';
import { attachmentWorld } from '../../model/body-system/body-joint-interaction';
import { bodyJointMarks } from '../../model/body-system/body-joint-marks';
import { jointCoordinate } from '../../model/body-system/joint-coordinate';
import { resolveMass } from '../../model/body-system/body-properties';
import { unitFactors } from '../../model/body-system/body-units';
import { nativeAngle, nativeLength } from '../../model/body-system/body-field-values';
import {
  NOT_BUILT_YET,
  NativeCylinderSpan,
  NativeTravelMode,
  nativeRounded,
  nativeScalar,
  nativeStartTravel,
  nativeStartValue,
  nativeStrokeFor,
  nativeTravelValue,
  nativeUnitText,
} from '../../model/body-system/native-panel-fields';

/**
 * The cylinder branch of the Edit panel: what it reads and what a typed number
 * does.
 *
 * Selecting any of a cylinder's geometry selects the body, and the body edits
 * as one part -- its size, where the rod starts, where it points, and the drive
 * of its own joint.
 *
 * A service rather than a component, because the branch is drawn inside the
 * Edit panel's own card and a component here would put an element of its own
 * where the public panel has `panel-section` itself.
 */
@Injectable({ providedIn: 'root' })
export class NativeCylinderFields {
  readonly actions = inject(NativePanelActions);
  readonly editor = this.actions.editor;
  private readonly fb = inject(FormBuilder);

  readonly travelUnitOptions = [
    { value: 'stroke', label: 'stroke' },
    { value: 'ret', label: 'closed' },
    { value: 'ext', label: 'open' },
  ];

  /**
   * One size number and one position number, each with a picker instead of a
   * second field: stroke, closed and open are three ways of saying one number,
   * and % and a length are two ways of saying one position. The pickers commit
   * on change and the numbers on blur, as everywhere else.
   */
  readonly fields = this.fb.group(
    {
      travel: [''],
      travelUnit: ['stroke', { updateOn: 'change' as const }],
      start: [''],
      startUnit: ['pct', { updateOn: 'change' as const }],
      angle: [''],
      inputSpeed: [''],
      barrelMass: [''],
      rodMass: [''],
      headMass: [''],
    },
    { updateOn: 'blur' as const }
  );

  /** A cylinder has nothing to hold: joint to joint is the stroke the drive moves. */
  readonly holdSubject = {
    dimensions: [] as ('length' | 'angle')[],
    holdable: false,
    toggle: () => undefined,
  };

  readonly assembly = computed(() => {
    const target = this.editor.selection()[0];
    return target?.kind === 'assembly'
      ? this.editor.drawing().assemblies.find((c) => c.id === target.id)
      : undefined;
  });

  /**
   * A cylinder shows its two joints rather than a name, as the public panel
   * does.
   *
   * The letter is the one drawn on the canvas at that end, which need not be on
   * the cylinder's own attachment: a joint shared with a bar carries its letter
   * on whichever attachment a reader named.
   */
  readonly displayName = computed(() => {
    const cylinder = this.assembly();
    if (!cylinder) return undefined;
    const document = this.editor.drawing();
    const marks = bodyJointMarks(document);
    const label = (id: AttachmentId) => {
      const own = document.attachments.find((a) => a.id === id);
      if (own?.label) return own.label;
      const at = attachmentWorld(document, id);
      const near = marks.find(
        (mark) => mark.label && Math.hypot(mark.point.x - at.x, mark.point.y - at.y) < 1e-9
      );
      return near?.label ?? '';
    };
    return label(cylinder.barrelMount) + label(cylinder.rodMount);
  });

  readonly barrel = computed(() => {
    const body = this.editor.drawing().bodies.find((b) => b.id === this.assembly()?.barrel);
    return body?.kind === 'material' ? body : undefined;
  });

  startUnitOptions() {
    return [
      { value: 'pct', label: '%' },
      { value: 'len', label: this.editor.drawing().units.length },
    ];
  }

  /**
   * Why Travel cannot be typed into right now.
   *
   * Stroke and open both resolve to a stroke this model can write. The closed
   * length is set by the barrel and the rod, and resizing two members around an
   * unchanged stroke is an edit that does not exist yet.
   */
  travelRefusal() {
    return this.fields.controls.travelUnit.value === 'ret' ? NOT_BUILT_YET : undefined;
  }

  /** A cylinder's three bodies, of which this model has two. */
  readonly slidingBodyRefusal = NOT_BUILT_YET;

  cylinderHasCustomInertia(): boolean {
    const cylinder = this.assembly();
    if (!cylinder) return false;
    return this.editor
      .drawing()
      .bodies.some(
        (b) =>
          [cylinder.barrel, cylinder.rod].includes(b.id) &&
          b.kind === 'material' &&
          b.mass.inertia.mode === 'explicit'
      );
  }

  readonly deriveCylinderInertiaFromShape = () => {
    const cylinder = this.assembly();
    if (!cylinder) return;
    this.editor.apply(
      ...[cylinder.barrel, cylinder.rod].map((bodyId) => ({
        kind: 'body-properties' as const,
        bodyId,
        change: { mass: { inertia: { mode: 'automatic' as const } } },
      }))
    );
  };

  setColor(color: string) {
    const cylinder = this.assembly();
    if (!cylinder) return;
    this.editor.apply(
      ...[cylinder.barrel, cylinder.rod].map((bodyId) => ({
        kind: 'body-properties' as const,
        bodyId,
        change: { presentation: { fill: color } },
      }))
    );
  }

  private presented: Record<string, string> = {};
  private shown = '';

  constructor() {
    effect(() => {
      const values = this.values(),
        key = JSON.stringify([this.editor.selection(), values]);
      if (key === this.shown) return;
      this.shown = key;
      this.presented = values;
      for (const [name, value] of Object.entries(values)) {
        const control = this.fields.get(name);
        if (control && control.value !== value) control.setValue(value, { emitEvent: false });
      }
    });
    for (const name of ['travel', 'start', 'angle', 'inputSpeed', 'barrelMass', 'rodMass'])
      this.fields.get(name)!.valueChanges.subscribe(() => this.commit(name));
    for (const name of ['travelUnit', 'startUnit'])
      this.fields.get(name)!.valueChanges.subscribe(() => this.editor.refresh());
  }

  /** Joint to joint, where the rod stands, and the ends of its travel. */
  private span(): NativeCylinderSpan | undefined {
    const cylinder = this.assembly(),
      document = this.editor.drawing();
    if (!cylinder) return undefined;
    const joint = document.joints.find((j) => j.id === cylinder.internalJoint);
    const limit = document.limits.find((l) => l.id === cylinder.strokeLimit);
    if (!joint || !limit) return undefined;
    const a = attachmentWorld(document, cylinder.barrelMount),
      b = attachmentWorld(document, cylinder.rodMount);
    return {
      span: Math.hypot(b.x - a.x, b.y - a.y),
      travel: jointCoordinate(
        joint,
        'travel',
        new Map(document.bodies.map((body) => [body.id, body.pose])),
        new Map(document.attachments.map((p) => [p.id, p]))
      ),
      lower: limit.lower,
      upper: limit.upper,
    };
  }

  private values(): Record<string, string> {
    const cylinder = this.assembly(),
      at = this.span(),
      document = this.editor.drawing();
    if (!cylinder || !at) return {};
    const length = (v: number) => nativeUnitText(v, document.units.length);
    const factors = unitFactors(document.units);
    const a = attachmentWorld(document, cylinder.barrelMount),
      b = attachmentWorld(document, cylinder.rodMount);
    const bearing = Math.atan2(b.y - a.y, b.x - a.x);
    const asShare = this.fields.controls.startUnit.value === 'pct';
    const values: Record<string, string> = {
      travel: length(
        nativeTravelValue(at, this.fields.controls.travelUnit.value as NativeTravelMode)
      ),
      start: asShare
        ? nativeRounded(nativeStartValue(at, true))
        : length(nativeStartValue(at, false)),
      angle: nativeUnitText(
        document.settings.angleUnit === 'deg' ? (bearing * 180) / Math.PI : bearing,
        document.settings.angleUnit
      ),
      headMass: '',
    };
    for (const [name, id] of [
      ['barrelMass', cylinder.barrel],
      ['rodMass', cylinder.rod],
    ] as const) {
      const member = document.bodies.find((body) => body.id === id);
      if (member?.kind === 'material')
        values[name] = nativeUnitText(
          resolveMass(member, document.units).mass / factors.mass,
          document.units.mass
        );
    }
    const driver = this.actions.driver();
    if (driver) values['inputSpeed'] = nativeRounded(Math.abs(driver.profile.speed));
    return values;
  }

  private commit(name: string) {
    const control = this.fields.get(name)!,
      text = String(control.value ?? '');
    if (text === this.presented[name]) return;
    const document = this.editor.drawing(),
      cylinder = this.assembly(),
      at = this.span();
    const asShare = this.fields.controls.startUnit.value === 'pct';
    const scalar =
      ['inputSpeed', 'barrelMass', 'rodMass'].includes(name) || (name === 'start' && asShare);
    const value =
      name === 'angle'
        ? nativeAngle(text, document.settings.angleUnit)
        : scalar
          ? nativeScalar(text)
          : nativeLength(text, document.units.length);
    if (value === undefined || !Number.isFinite(value) || !text.trim()) {
      // Half-typed text stays where the reader put it: the message says what is
      // wrong, and the next change to the drawing is what refreshes the readout.
      this.editor.report('Type a number, with or without a unit — 2, 2 cm, 0.75 in.');
      return;
    }
    if (name === 'inputSpeed') {
      this.actions.setDriveSpeed(value);
      return;
    }
    if (!cylinder || !at) return;
    if (name === 'travel') {
      const stroke = nativeStrokeFor(
        at,
        this.fields.controls.travelUnit.value as NativeTravelMode,
        value
      );
      if (stroke === undefined) {
        this.editor.report(NOT_BUILT_YET.long);
        control.setValue(this.presented[name] ?? '', { emitEvent: false });
        return;
      }
      this.editor.apply({
        kind: 'cylinder-dimensions',
        assemblyId: cylinder.id,
        dimensions: { ...cylinder.dimensions, stroke },
      });
      return;
    }
    if (name === 'start') {
      this.editor.apply({
        kind: 'move-coordinate',
        coordinate: { jointId: cylinder.internalJoint, coordinate: 'travel' },
        target: nativeStartTravel(at, asShare, value),
      });
      return;
    }
    if (name === 'angle') {
      this.editor.apply({
        kind: 'guide-axis',
        jointId: cylinder.internalJoint,
        worldAxis: value,
      });
      return;
    }
    this.editor.apply({
      kind: 'body-properties',
      bodyId: name === 'barrelMass' ? cylinder.barrel : cylinder.rod,
      change: { mass: { mass: { mode: 'explicit', value } } },
    });
  }
}
