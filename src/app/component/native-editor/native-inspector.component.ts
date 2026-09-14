import { DualInputComponent } from '../BLOCKS/dual-input/dual-input.component';
import { ColorPickerComponent } from '../BLOCKS/color-picker/color-picker.component';
import { PART_COLORS } from '../../model/joint-colors';
import { EmptySelectionComponent } from '../empty-selection/empty-selection.component';
import { bodyBarFieldCommand } from '../../model/body-system/body-bar-field-command';
import { bodyBarHoldPair } from '../../model/body-system/body-bar-hold';
import { bodyGroupPresentation } from '../../model/body-system/body-group-presentation';
import { NativeJointLimitsComponent } from './native-joint-limits.component';
import { NativeMaterialPropertiesComponent } from './native-material-properties.component';
import {
  bodyConnectionPairs,
  bodyConnectionCommand,
} from '../../model/body-system/body-connection-controls';
import { compileWeldFrames } from '../../model/body-system/weld-frames';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { NativeEditorService } from '../../services/native-editor.service';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { EditableTitleComponent } from '../BLOCKS/editable-title/editable-title.component';
import { HoldFieldComponent } from '../BLOCKS/hold-field/hold-field.component';
import { InputComponent } from '../BLOCKS/input/input.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { BodyEditCommand } from '../../model/body-system/body-edit-types';
import { nativeCommand, attachmentWorld } from '../../model/body-system/body-joint-interaction';
import { BodyJoint } from '../../model/body-system/joint-record';
import { jointKindLabel } from '../../model/body-system/body-joint-marks';
import { jointCoordinate } from '../../model/body-system/joint-coordinate';
import { nativeEditRefusalCopy } from '../../model/body-system/joint-permission';
import { nativeNumber, nativeLength, nativeAngle } from '../../model/body-system/body-field-values';
import { MaterialBody } from '../../model/body-system/material-body';
import { menuRefusal } from '../../model/edit-permission';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-native-inspector',
  imports: [
    DualInputComponent,
    ColorPickerComponent,
    EmptySelectionComponent,
    NativeJointLimitsComponent,
    NativeMaterialPropertiesComponent,
    ReactiveFormsModule,
    MatButton,
    PanelSectionComponent,
    EditableTitleComponent,
    HoldFieldComponent,
    InputComponent,
    CollapsibleSubsectionComponent,
  ],
  templateUrl: './native-inspector.component.html',
  styleUrl: './native-inspector.component.scss',
})
export class NativeInspectorComponent {
  protected readonly colors = PART_COLORS;
  protected readonly editor = inject(NativeEditorService);
  protected readonly pair = this.editor.connectionPair;
  protected readonly kinds: readonly BodyJoint['kind'][] = [
    'revolute',
    'prismatic',
    'pin-in-slot',
    'weld',
  ];
  protected readonly kindLabel = jointKindLabel;
  protected readonly bulkFills = computed(() => [
    ...new Set(
      this.editor
        .bodies()
        .map((id) => {
          const body = this.editor.document().bodies.find((b) => b.id === id);
          return body?.kind === 'material' ? body.presentation.fill : undefined;
        })
        .filter((fill): fill is string => !!fill)
    ),
  ]);
  protected readonly selected = computed(() => this.editor.selection()[0]);
  protected readonly pointId = computed(() => {
    const target = this.selected(),
      document = this.editor.document();
    if (target?.kind === 'attachment') return target.id;
    if (target?.kind === 'junction')
      return document.junctions.find((pin) => pin.id === target.id)?.hub;
    if (target?.kind === 'joint') {
      const joint = document.joints.find((joint) => joint.id === target.id);
      if (joint?.kind === 'revolute' || joint?.kind === 'weld') return joint.frameB.attachmentId;
    }
    return undefined;
  });
  protected readonly body = computed(() => {
    const target = this.selected();
    const b =
      target?.kind === 'body'
        ? this.editor.drawing().bodies.find((b) => b.id === target.id)
        : undefined;
    return b?.kind === 'material' ? b : undefined;
  });
  protected readonly assembly = computed(() => {
    const s = this.selected();
    return s?.kind === 'assembly'
      ? this.editor.drawing().assemblies.find((c) => c.id === s.id)
      : undefined;
  });
  protected readonly pairs = computed(() =>
    bodyConnectionPairs(this.editor.document(), this.selected()).map((pair) => ({
      ...pair,
      label: `${this.editor.bodyName(this.editor.document().attachments.find((a) => a.id === pair.a)!.bodyId)} ↔ ${this.editor.bodyName(this.editor.document().attachments.find((a) => a.id === pair.b)!.bodyId)}`,
    }))
  );
  protected readonly chosenPair = computed(
    () => this.pairs().find((p) => p.key === this.pair()) ?? this.pairs()[0]
  );
  protected readonly joint = computed(() => {
    const pair = this.chosenPair();
    if (!pair) return;
    return this.editor
      .document()
      .joints.find(
        (j) =>
          [j.frameA.attachmentId, j.frameB.attachmentId].includes(pair.a) &&
          [j.frameA.attachmentId, j.frameB.attachmentId].includes(pair.b)
      );
  });
  protected readonly selectedKind = computed(() => {
    const joint = this.joint();
    if (joint) return joint.kind;
    const pair = this.chosenPair(),
      document = this.editor.document(),
      frames = compileWeldFrames(document);
    if (!pair || !frames.ok) return 'revolute';
    const a = document.attachments.find((p) => p.id === pair.a)!,
      b = document.attachments.find((p) => p.id === pair.b)!;
    return frames.groupOf.get(a.bodyId) === frames.groupOf.get(b.bodyId) ? 'weld' : 'revolute';
  });
  protected readonly coordinateJoint = computed(() => {
    const c = this.assembly();
    return c ? this.editor.drawing().joints.find((j) => j.id === c.internalJoint) : this.joint();
  });
  protected readonly fields = new FormGroup(
    Object.fromEntries(
      [
        'x',
        'y',
        'length',
        'angle',
        'travel',
        'axis',
        'speed',
        'barrelLength',
        'rodLength',
        'bore',
        'rodDiameter',
        'stroke',
        'mass',
        'forceX',
        'forceY',
        'couple',
      ].map((name) => [name, new FormControl('', { nonNullable: true })])
    )
  );
  protected readonly title = computed(() => ({
    name:
      this.editor.selection().length > 1
        ? `${this.editor.selection().length} Selected Objects`
        : this.editor.name(),
    rename: (name: string) => this.editor.rename(name),
  }));
  protected readonly heading = computed(() => {
    if (this.editor.selection().length > 1) return 'Edit ' + this.title().name;
    const target = this.editor.selection()[0],
      name = this.editor.name();
    const kind =
      target?.kind === 'body'
        ? 'Link'
        : target?.kind === 'assembly'
          ? 'Cylinder'
          : target?.kind === 'group'
            ? 'Welded Group'
            : target?.kind === 'force'
              ? 'Force'
              : 'Joint';
    return 'Edit ' + kind + (name === kind ? '' : ' ' + name);
  });
  protected readonly deleteCommand = computed(() =>
    nativeCommand({ kind: 'delete', targets: this.editor.selection() })
  );
  protected readonly deleteAction = () => this.editor.commit(this.deleteCommand());
  protected readonly lockState = computed(() => {
    const operation = this.editor.lockCommand().operations[0];
    return operation.kind === 'lock' && !operation.locked;
  });
  protected readonly lockAction = () => this.editor.commit(this.editor.lockCommand());
  protected readonly refusal = computed(() =>
    menuRefusal(this.editor.state(), this.editor.store.display ? 'attachment' : 'start')
  );
  protected readonly holdSubject = computed(() => {
    const body = this.body(),
      hold = this.editor.document().holds.find((h) => h.bodyId === body?.id);
    return {
      dimensions: [
        ...(hold?.length !== undefined ? ['length'] : []),
        ...(hold?.angle !== undefined ? ['angle'] : []),
      ] as ('length' | 'angle')[],
      holdable:
        !!body &&
        body.geometry.kind === 'bar' &&
        !body.locked &&
        !!bodyBarHoldPair(this.editor.document(), body.id),
      toggle: (which: 'length' | 'angle') => this.hold(which),
    };
  });
  private shown = '';
  constructor() {
    effect(() => {
      const values = this.values(),
        key = JSON.stringify([this.selected(), values]);
      // A selection or displayed pose change refreshes measurements; unrelated paints keep unfinished text.
      if (key === this.shown) return;
      this.shown = key;
      for (const [field, value] of Object.entries(values))
        this.fields.controls[field].setValue(value, { emitEvent: false });
    });
  }
  private values(): Record<string, string> {
    const d = this.editor.drawing(),
      body = this.body(),
      assembly = this.assembly(),
      joint = this.coordinateJoint();
    const values: Record<string, string> = {};
    const length = (v: number) => `${nativeNumber(v)} ${d.units.length}`;
    const angle = (v: number) =>
      `${nativeNumber(d.settings.angleUnit === 'deg' ? (v * 180) / Math.PI : v)} ${d.settings.angleUnit}`;
    if (body) {
      values['x'] = length(body.pose.x);
      values['y'] = length(body.pose.y);
      values['angle'] = angle(body.pose.angle);
      if (body.geometry.kind === 'bar') {
        const [a, b] = body.geometry.vertices;
        values['length'] = length(Math.hypot(b.x - a.x, b.y - a.y));
        values['angle'] = angle(body.pose.angle + Math.atan2(b.y - a.y, b.x - a.x));
      }
      if (body.mass.mass.mode === 'explicit') values['mass'] = nativeNumber(body.mass.mass.value);
    }
    const target = this.selected();
    if (this.pointId()) {
      const p = attachmentWorld(d, this.pointId()!);
      values['x'] = length(p.x);
      values['y'] = length(p.y);
    }
    if (target?.kind === 'force') {
      const force = d.forces.find((f) => f.id === target.id)!;
      values['forceX'] = nativeNumber(force.vector.x);
      values['forceY'] = nativeNumber(force.vector.y);
      values['couple'] = nativeNumber(force.couple);
    }
    if (assembly) {
      for (const [key, value] of Object.entries(assembly.dimensions)) values[key] = length(value);
      values['stroke'] = length(d.limits.find((l) => l.id === assembly.strokeLimit)!.upper);
    }
    if (joint) {
      const display = d.joints.find((j) => j.id === joint.id)!;
      if (display.kind === 'prismatic' || display.kind === 'pin-in-slot') {
        values['travel'] = length(
          jointCoordinate(
            display,
            'travel',
            new Map(d.bodies.map((b) => [b.id, b.pose])),
            new Map(d.attachments.map((a) => [a.id, a]))
          )
        );
        values['axis'] = angle(
          d.bodies.find((b) => b.id === display.bodyA)!.pose.angle + display.frameA.angle
        );
      }
      const drive = d.drivers.find((driver) => driver.coordinate.jointId === joint.id);
      values['speed'] = nativeNumber(
        (drive?.profile.speed ??
          (joint.kind === 'revolute'
            ? d.settings.defaultDrive.angular
            : d.settings.defaultDrive.linear)) * (joint.kind === 'revolute' ? 30 / Math.PI : 1)
      );
    }
    return values;
  }
  protected setPair(event: Event) {
    this.pair.set((event.target as HTMLSelectElement).value);
  }
  protected kindCommand(kind: BodyJoint['kind']): BodyEditCommand | undefined {
    return bodyConnectionCommand(this.editor.drawing(), this.selected(), this.chosenPair(), kind);
  }

  private readonly refusalCache = computed(() => {
    this.editor.drawing();
    this.editor.state();
    return new Map<string, ReturnType<typeof nativeEditRefusalCopy> | undefined>();
  });
  protected refused(command: BodyEditCommand | undefined) {
    if (!command) return undefined;
    const cache = this.refusalCache(),
      key = JSON.stringify(command.operations);
    if (!cache.has(key)) {
      const result = this.editor.preview(command);
      cache.set(key, result.ok ? undefined : nativeEditRefusalCopy(result));
    }
    return cache.get(key);
  }
  protected changeKind(kind: BodyJoint['kind']) {
    const command = this.kindCommand(kind);
    if (command) this.editor.commit(command);
  }
  protected hold(which: 'length' | 'angle') {
    const body = this.body();
    if (!body) return;
    const pair = bodyBarHoldPair(this.editor.document(), body.id);
    if (!pair) return;
    this.editor.apply({
      kind: 'hold',
      bodyId: body.id,
      ...pair,
      dimension: which,
      enabled: !this.holdSubject().dimensions.includes(which),
    });
  }
  protected commitPoint(event: FocusEvent) {
    const field = (event.target as HTMLInputElement).dataset['field'];
    if (field === 'x' || field === 'y') this.commit(field);
  }
  protected commit(field: string) {
    if (!this.fields.controls[field]) return;
    const d = this.editor.drawing(),
      text = this.fields.controls[field].value;
    if (text === this.values()[field]) return;
    const angular = field === 'angle' || field === 'axis';
    const scalar = ['speed', 'mass', 'forceX', 'forceY', 'couple'].includes(field);
    const value = angular
      ? nativeAngle(text, d.settings.angleUnit)
      : scalar
        ? Number(text)
        : nativeLength(text, d.units.length);
    if (value === undefined || !Number.isFinite(value) || !text.trim()) {
      this.editor.report('Type a number, with or without a unit — 2, 2 cm, 0.75 in.');
      return;
    }
    const body = this.body(),
      assembly = this.assembly(),
      joint = this.coordinateJoint(),
      target = this.selected();
    if (
      assembly &&
      ['barrelLength', 'rodLength', 'bore', 'rodDiameter', 'stroke'].includes(field)
    ) {
      this.editor.apply({
        kind: 'cylinder-dimensions',
        assemblyId: assembly.id,
        dimensions: {
          ...assembly.dimensions,
          stroke: d.limits.find((l) => l.id === assembly.strokeLimit)!.upper,
          [field]: value,
        },
      });
      return;
    }
    if (joint && field === 'travel') {
      this.editor.apply({
        kind: 'move-coordinate',
        coordinate: { jointId: joint.id, coordinate: 'travel' },
        target: value,
      });
      return;
    }
    if (joint && field === 'axis') {
      this.editor.apply({ kind: 'guide-axis', jointId: joint.id, worldAxis: value });
      return;
    }
    if (joint && field === 'speed') {
      const driver = d.drivers.find((driver) => driver.coordinate.jointId === joint.id);
      if (driver)
        this.editor.apply({
          kind: 'driver-speed',
          driverId: driver.id,
          speed: value * (joint.kind === 'revolute' ? Math.PI / 30 : 1),
        });
      return;
    }
    if (this.pointId() && (field === 'x' || field === 'y')) {
      this.editor.apply({
        kind: 'move-point',
        attachmentId: this.pointId()!,
        target: { ...attachmentWorld(d, this.pointId()!), [field]: value },
      });
      return;
    }
    if (target?.kind === 'force') {
      const force = d.forces.find((f) => f.id === target.id)!;
      this.editor.apply({
        kind: 'force-properties',
        forceId: target.id,
        change:
          field === 'couple'
            ? { couple: value }
            : { vector: { ...force.vector, [field === 'forceX' ? 'x' : 'y']: value } },
      });
      return;
    }
    if (!body) return;
    if (field === 'x' || field === 'y') {
      this.editor.apply({
        kind: 'move-body',
        mode: 'exact',
        bodyId: body.id,
        grab: { x: 0, y: 0 },
        target: { ...body.pose, [field]: value },
      });
      return;
    }
    if ((field === 'length' || field === 'angle') && body.geometry.kind === 'bar')
      this.changeBar(body, field, value);
  }
  private changeBar(body: MaterialBody, field: 'length' | 'angle', value: number) {
    const command = bodyBarFieldCommand(this.editor.drawing(), body.id, field, value);
    if ('operations' in command) this.editor.commit(command);
    else this.editor.report(command.message);
  }
  protected driveCommand() {
    const joint = this.coordinateJoint();
    if (!joint || joint.kind === 'weld') return;
    const driver = this.editor.document().drivers.find((d) => d.coordinate.jointId === joint.id);
    return driver
      ? nativeCommand({ kind: 'remove-driver', driverId: driver.id })
      : nativeCommand({
          kind: 'add-driver',
          coordinate: {
            jointId: joint.id,
            coordinate: joint.kind === 'revolute' ? 'angle' : 'travel',
          },
          speed:
            Number(this.fields.controls['speed'].value) *
            (joint.kind === 'revolute' ? Math.PI / 30 : 1),
        });
  }
  protected isDriven() {
    return this.editor
      .document()
      .drivers.some((d) => d.coordinate.jointId === this.coordinateJoint()?.id);
  }
  protected run(command: BodyEditCommand | undefined) {
    if (command) this.editor.commit(command);
  }
  protected force() {
    const target = this.selected();
    return target?.kind === 'force'
      ? this.editor.document().forces.find((f) => f.id === target.id)
      : undefined;
  }
  protected forceFrame(event: Event) {
    const force = this.force();
    if (force)
      this.editor.apply({
        kind: 'force-properties',
        forceId: force.id,
        change: { frame: (event.target as HTMLSelectElement).value as 'world' | 'body' },
      });
  }
  protected forceOwner(event: Event) {
    const force = this.force(),
      body = this.editor
        .document()
        .bodies.find((b) => b.id === (event.target as HTMLSelectElement).value);
    if (force && body)
      this.editor.apply({ kind: 'force-owner', forceId: force.id, bodyId: body.id });
  }
  protected traceCommand() {
    const target = this.selected();
    const id = target?.kind === 'attachment' ? target.id : this.joint()?.frameB.attachmentId;
    const point = this.editor.document().attachments.find((p) => p.id === id);
    return point
      ? nativeCommand({
          kind: 'attachment-properties',
          attachmentId: point.id,
          change: { trace: !point.trace },
        })
      : undefined;
  }
  protected isTraced() {
    const op = this.traceCommand()?.operations[0];
    return op?.kind === 'attachment-properties' && !op.change.trace;
  }
  protected bulkMass() {
    const value = Number(this.fields.controls['mass'].value);
    if (!this.fields.controls['mass'].value.trim() || !Number.isFinite(value)) {
      this.editor.report('Type a number for the mass.');
      return;
    }
    this.editor.apply(
      ...this.editor.bodies().map((bodyId) => ({
        kind: 'body-properties' as const,
        bodyId,
        change: { mass: { mass: { mode: 'explicit' as const, value } } },
      }))
    );
  }
  protected bulkColor(color: string) {
    const fill = color;
    this.editor.apply(
      ...this.editor.bodies().map((bodyId) => ({
        kind: 'body-properties' as const,
        bodyId,
        change: { presentation: { fill } },
      }))
    );
  }
  protected readonly groupFill = computed(() => {
    const document = this.editor.document(),
      frames = compileWeldFrames(document);
    const member = this.editor.bodies()[0];
    const group = frames.ok && frames.groupOf.get(member);
    return group ? bodyGroupPresentation(document, group).presentation?.fill : undefined;
  });
  protected groupColor(color: string) {
    const target = this.selected();
    if (target?.kind !== 'group') return;
    this.editor.apply({
      kind: 'group-properties',
      members: target.members,
      change: { presentation: { fill: color } },
    });
  }
  protected resetGroupCommand() {
    const member = this.editor.bodies()[0];
    return member ? nativeCommand({ kind: 'reset-group-mass', member }) : undefined;
  }
  protected chooseMember(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    const body = this.editor.document().bodies.find((b) => b.id === id);
    if (body) this.editor.select({ kind: 'body', id: body.id });
  }
}
