import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatTooltip } from '@angular/material/tooltip';

import { ButtonComponent } from '../BLOCKS/button/button.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { ColorPickerComponent } from '../BLOCKS/color-picker/color-picker.component';
import { DualButtonComponent } from '../BLOCKS/dual-button/dual-button.component';
import { DualInputComponent } from '../BLOCKS/dual-input/dual-input.component';
import { EditBannerComponent } from '../BLOCKS/banner/edit-banner.component';
import { EditableTitleComponent } from '../BLOCKS/editable-title/editable-title.component';
import { EmptySelectionComponent } from '../empty-selection/empty-selection.component';
import { HoldFieldComponent } from '../BLOCKS/hold-field/hold-field.component';
import { InputComponent } from '../BLOCKS/input/input.component';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { RadioComponent } from '../BLOCKS/radio/radio.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { StateInputComponent } from '../BLOCKS/state-input/state-input.component';
import { ToggleComponent } from '../BLOCKS/toggle/toggle.component';

import { NativeCylinderFields } from './native-cylinder-fields';
import { NativeJointTypeComponent } from './native-joint-type.component';
import { NativeLockBannerComponent } from './native-lock-banner.component';
import { NativeMassFields } from './native-mass-fields';
import { NativePanelActions } from './native-panel-actions';

import { ColorService } from '../../services/color.service';
import { DEFAULT_FORCE_COLOR, JOINT_FAMILIES, PART_COLORS } from '../../model/joint-colors';

import { AttachmentId, BodyId, WORLD, newRecordId } from '../../model/body-system/body-id';
import { MaterialBody } from '../../model/body-system/material-body';
import { bodyBarFieldCommand } from '../../model/body-system/body-bar-field-command';
import { bodyDiscRefusal, bodyDrawnAsDisc } from '../../model/body-system/body-disc-shape';
import { bodyJointMarks } from '../../model/body-system/body-joint-marks';
import { bodyBarHoldPair } from '../../model/body-system/body-bar-hold';
import { resolveMass } from '../../model/body-system/body-properties';
import { unitFactors } from '../../model/body-system/body-units';
import { nativeAngle, nativeLength } from '../../model/body-system/body-field-values';
import {
  attachmentWorld,
  insertNativeAttachment,
  nativeCommand,
  selectionBodies,
} from '../../model/body-system/body-joint-interaction';
import { worldToLocal } from '../../model/body-system/body-frame';
import {
  NATIVE_SPEED_UNITS,
  NOT_BUILT_YET,
  nativeAngularSpeedFrom,
  nativeAngularSpeedIn,
  nativeForcePolar,
  nativeForceVector,
  nativeRounded,
  nativeScalar,
  nativeUnitText,
} from '../../model/body-system/native-panel-fields';

/** Which branch of the panel the selection asks for, in the public panel's own terms. */
type PanelBranch = 'none' | 'multi' | 'joint' | 'link' | 'cylinder' | 'force';

/**
 * The Edit panel on the native route.
 *
 * It is `component/edit-panel/edit-panel.component.html` -- the same blocks in
 * the same order with the same labels, help marks and section names -- reading
 * the document model instead of the legacy drawing. One difference is allowed
 * and marks itself as such: the joint branch offers the joint-type choice where
 * the public panel offers Grounded, Slider and Welded.
 *
 * The cylinder branch is `app-native-cylinder-panel`; the rows every branch
 * shares are `NativePanelActions`.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-native-inspector',
  imports: [
    ButtonComponent,
    CollapsibleSubsectionComponent,
    ColorPickerComponent,
    DualButtonComponent,
    DualInputComponent,
    EditBannerComponent,
    EditableTitleComponent,
    EmptySelectionComponent,
    InputComponent,
    MatTooltip,
    HoldFieldComponent,
    NativeJointTypeComponent,
    NativeLockBannerComponent,
    StateInputComponent,
    PanelSectionComponent,
    RadioComponent,
    ReactiveFormsModule,
    TitleBlock,
    ToggleComponent,
  ],
  // No stylesheet: the panel is the public Edit panel, whose own stylesheet is
  // emitted once into the theme and already dresses every row below. A rule of
  // our own would be a pixel the public panel does not have.
  templateUrl: './native-inspector.component.html',
})
export class NativeInspectorComponent {
  protected readonly actions = inject(NativePanelActions);
  protected readonly massFields = inject(NativeMassFields);
  protected readonly cylinder = inject(NativeCylinderFields);
  protected readonly editor = this.actions.editor;
  private readonly colors = inject(ColorService);
  private readonly fb = inject(FormBuilder);

  protected readonly jointColors = this.colors.getJointColorOptions();
  protected readonly linkColors = [...PART_COLORS];
  protected readonly speedUnitOptions = NATIVE_SPEED_UNITS;
  protected readonly notBuiltYet = NOT_BUILT_YET;

  /** Which sections are open, keyed exactly as the public panel keys them. */
  protected sectionExpanded: Record<string, boolean> = {
    JBasic: true,
    JInput: true,
    JMass: true,
    JVisual: false,
    JDistToJ: true,
    LBasic: true,
    LVisual: false,
    LMass: true,
    LCompound: true,
    FBasic: true,
    FVisual: false,
  };

  // ---- forms, written the way the public panel writes them -----------------

  protected readonly jointForm = this.fb.group(
    {
      xPos: [''],
      yPos: [''],
      curve: [false, { updateOn: 'change' as const }],
      inputSpeed: [''],
      inputSpeedUnit: ['0', { updateOn: 'change' as const }],
      sliderMass: [''],
      otherJoints: this.fb.array([] as FormControl<string | null>[]),
    },
    { updateOn: 'blur' as const }
  );

  protected readonly linkForm = this.fb.group(
    {
      length: [''],
      angle: [''],
      drawAsDisc: [false, { updateOn: 'change' as const }],
    },
    { updateOn: 'blur' as const }
  );

  protected readonly forceForm = this.fb.group(
    {
      magnitude: [''],
      angle: [''],
      xComp: [''],
      yComp: [''],
      isGlobal: ['0', { updateOn: 'change' as const }],
    },
    { updateOn: 'blur' as const }
  );

  protected readonly bulkForm = this.fb.group({ mass: [''] }, { updateOn: 'blur' as const });

  // ---- what is selected ----------------------------------------------------

  protected readonly branch = computed<PanelBranch>(() => {
    const selection = this.editor.selection();
    if (!selection.length) return 'none';
    if (selection.length > 1) return 'multi';
    switch (selection[0].kind) {
      case 'assembly':
        return 'cylinder';
      case 'force':
        return 'force';
      case 'body':
      case 'group':
        return 'link';
      default:
        return 'joint';
    }
  });

  /** The single material body behind a Link selection, where there is one. */
  protected readonly body = computed<MaterialBody | undefined>(() => {
    const target = this.editor.selection()[0];
    if (target?.kind !== 'body') return undefined;
    const found = this.editor.drawing().bodies.find((b) => b.id === target.id);
    return found?.kind === 'material' ? found : undefined;
  });

  protected readonly force = computed(() => {
    const target = this.editor.selection()[0];
    return target?.kind === 'force'
      ? this.editor.drawing().forces.find((f) => f.id === target.id)
      : undefined;
  });

  /** Whose point the Joint Position pair reads and writes. */
  protected readonly pointId = computed<AttachmentId | undefined>(() => {
    const target = this.editor.selection()[0],
      document = this.editor.drawing();
    if (target?.kind === 'attachment') return target.id;
    if (target?.kind === 'junction')
      return document.junctions.find((pin) => pin.id === target.id)?.hub;
    if (target?.kind === 'joint')
      return document.joints.find((joint) => joint.id === target.id)?.frameA.attachmentId;
    return undefined;
  });

  /**
   * The joints a link's length away from this one, which is what the section
   * names.
   *
   * Only the ones a reader can point at: the marks the canvas draws. A
   * cylinder's interior attachments are machinery -- placed by the layout and
   * re-derived on every normalize -- and listing one as "Joint" beside the two
   * a reader named is how the section came to show a row with no name.
   */
  protected readonly listOfOtherJoints = computed(() => {
    const document = this.editor.drawing(),
      own = new Set<string>(this.actions.ownAttachments());
    // The body a slot is cut into is not a link this joint is *in*: the pin
    // rides it. The public panel says the same by dropping prismatic joints
    // from the list it builds from the links a joint belongs to.
    const carriers = new Set<string>(
      document.joints
        .filter((joint) => joint.kind === 'prismatic' || joint.kind === 'pin-in-slot')
        .filter((joint) => own.has(joint.frameA.attachmentId) || own.has(joint.frameB.attachmentId))
        .map((joint) => joint.frameA.attachmentId)
    );
    const bodies = new Set(
      this.actions
        .ownAttachments()
        .filter((id) => !carriers.has(id))
        .map((id) => document.attachments.find((a) => a.id === id)?.bodyId)
        .filter((id): id is BodyId => !!id && id !== WORLD)
    );
    // A cylinder is one part to a reader, so its far joint is as much "the
    // other joint in this link" as a bar's is.
    for (const assembly of document.assemblies)
      if (bodies.has(assembly.barrel) || bodies.has(assembly.rod)) {
        bodies.add(assembly.barrel);
        bodies.add(assembly.rod);
      }
    const interior = new Set<string>(
      document.assemblies.flatMap((assembly) => {
        const joint = document.joints.find((j) => j.id === assembly.internalJoint);
        return joint ? [joint.frameA.attachmentId, joint.frameB.attachmentId] : [];
      })
    );
    // The letter is the one the canvas draws at that point, which may sit on
    // whichever attachment a reader named rather than on this body's own.
    const marks = bodyJointMarks(document);
    const named = new Map<string, string>();
    for (const a of document.attachments) {
      if (!bodies.has(a.bodyId) || own.has(a.id) || interior.has(a.id)) continue;
      const at = attachmentWorld(document, a.id);
      const label =
        a.label ||
        marks.find(
          (mark) => mark.label && Math.hypot(mark.point.x - at.x, mark.point.y - at.y) < 1e-9
        )?.label;
      if (label && ![...named.values()].includes(label)) named.set(a.id, label);
    }
    return document.attachments
      .filter((a) => named.has(a.id))
      .map((a) => ({ ...a, label: named.get(a.id)! }));
  });

  /**
   * The body that rides this joint's slot, where it has one.
   *
   * The public panel puts its mass here because its block is a link nobody can
   * select -- clicking one picks the pin it rides on. This model has no hidden
   * block, but the panel is the same panel, so the number is offered in the
   * same place.
   */
  protected readonly slidingBody = computed<MaterialBody | undefined>(() => {
    const joint = this.actions.drivenJoint();
    if (joint?.kind !== 'prismatic' && joint?.kind !== 'pin-in-slot') return undefined;
    const document = this.editor.drawing();
    const rider = joint.bodyB === WORLD ? joint.bodyA : joint.bodyB;
    const body = document.bodies.find((b) => b.id === rider);
    return body?.kind === 'material' ? body : undefined;
  });

  protected gridIsEmpty(): boolean {
    return this.editor.document().bodies.length === 1;
  }

  // ---- the link ------------------------------------------------------------

  protected readonly isBar = computed(() => this.body()?.geometry.kind === 'bar');

  protected readonly holdSubject = computed(() => {
    const body = this.body(),
      hold = this.editor.document().holds.find((h) => h.bodyId === body?.id);
    return {
      dimensions: [
        ...(hold?.length !== undefined ? ['length' as const] : []),
        ...(hold?.angle !== undefined ? ['angle' as const] : []),
      ],
      holdable:
        !!body &&
        body.geometry.kind === 'bar' &&
        !body.locked &&
        !!bodyBarHoldPair(this.editor.document(), body.id),
      toggle: (which: 'length' | 'angle') => this.hold(which),
    };
  });

  private hold(which: 'length' | 'angle') {
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

  private members(): BodyId[] {
    return selectionBodies(this.editor.drawing(), this.editor.selection());
  }

  /** Where a new tracer point or force lands: the body's own center of mass. */
  private centerOf(bodyId: BodyId) {
    const document = this.editor.drawing();
    const body = document.bodies.find((b) => b.id === bodyId);
    if (body?.kind !== 'material') return { x: 0, y: 0 };
    const factors = unitFactors(document.units),
      center = resolveMass(body, document.units).displayCenter;
    return {
      x: body.pose.x + center.x / factors.length,
      y: body.pose.y + center.y / factors.length,
    };
  }

  protected readonly addTracer = () => {
    const bodyId = this.members()[0];
    if (!bodyId) return;
    this.editor.commit(
      insertNativeAttachment(this.editor.drawing(), bodyId, this.centerOf(bodyId))
    );
  };

  protected readonly addForce = () => {
    const document = this.editor.drawing(),
      bodyId = this.members()[0];
    const owner = document.bodies.find((b) => b.id === bodyId);
    if (!owner) return;
    this.editor.apply({
      kind: 'insert',
      records: {
        forces: [
          {
            id: newRecordId<'force'>(),
            bodyId,
            point: worldToLocal(owner.pose, this.centerOf(bodyId)),
            label: 'Force',
            frame: 'world',
            vector: { x: 10, y: 0 },
            couple: 0,
          },
        ],
      },
    });
  };

  protected readonly linkFill = computed(() => {
    const target = this.editor.selection()[0];
    if (target?.kind === 'group') {
      const group = this.editor
        .drawing()
        .groups.find(
          (g) =>
            g.members.length === target.members.length &&
            g.members.every((id) => target.members.includes(id))
        );
      if (group?.presentation?.fill) return group.presentation.fill;
    }
    const body = this.editor.drawing().bodies.find((b) => b.id === this.members()[0]);
    return body?.kind === 'material' ? body.presentation.fill : undefined;
  });

  protected setLinkColor(color: string) {
    const target = this.editor.selection()[0];
    if (target?.kind === 'group') {
      this.editor.apply({
        kind: 'group-properties',
        members: target.members,
        change: { presentation: { fill: color } },
      });
      return;
    }
    const member = this.members()[0];
    if (member)
      this.editor.apply({
        kind: 'body-properties',
        bodyId: member,
        change: { presentation: { fill: color } },
      });
  }

  /** Why this link cannot be drawn as a disc, or nothing when it can. */
  protected readonly discRefusal = computed(() => {
    const body = this.body();
    return body ? bodyDiscRefusal(this.editor.drawing(), body.id) : this.notBuiltYet;
  });

  protected readonly drawnAsDisc = computed(() => {
    const body = this.body();
    return !!body && bodyDrawnAsDisc(this.editor.drawing(), body.id);
  });

  private setDrawnAsDisc(on: boolean) {
    const body = this.body();
    if (!body || on === this.drawnAsDisc()) return;
    this.editor.apply({
      kind: 'body-properties',
      bodyId: body.id,
      change: { presentation: { outline: on ? 'circle' : 'geometry' } },
    });
  }

  /** Whether the selection is several links welded into one rigid body. */
  protected readonly isCompound = computed(() => this.editor.selection()[0]?.kind === 'group');

  protected readonly unweldAll = () => {
    const target = this.editor.selection()[0];
    if (target?.kind !== 'group') return;
    const members = new Set<string>(target.members);
    const welds = this.editor
      .drawing()
      .joints.filter((j) => j.kind === 'weld' && members.has(j.bodyA) && members.has(j.bodyB));
    if (!welds.length) return;
    this.editor.commit(
      nativeCommand(
        ...welds.map((joint) => ({
          kind: 'joint-kind' as const,
          jointId: joint.id,
          jointKind: 'revolute' as const,
        }))
      )
    );
  };

  // ---- colors --------------------------------------------------------------

  protected readonly jointColor = computed(() => {
    const stored =
      this.editor.drawing().attachments.find((a) => a.id === this.pointId())?.color ?? '';
    return (JOINT_FAMILIES.find((f) => f.id === stored) ?? JOINT_FAMILIES[0]).normal;
  });

  protected setJointColor(normal: string) {
    const id = this.pointId();
    if (!id) return;
    const family = JOINT_FAMILIES.find((f) => f.normal === normal) ?? JOINT_FAMILIES[0];
    this.editor.apply({
      kind: 'attachment-properties',
      attachmentId: id,
      change: { color: family.id },
    });
  }

  protected readonly forceColor = computed(
    () => this.force()?.presentation?.color || DEFAULT_FORCE_COLOR
  );

  protected setForceColor(color: string) {
    const force = this.force();
    if (!force) return;
    this.editor.apply({
      kind: 'force-properties',
      forceId: force.id,
      change: { presentation: { ...force.presentation, color } },
    });
  }

  protected readonly forceOwnerName = computed(() => {
    const force = this.force();
    return force ? this.editor.bodyName(force.bodyId) : '';
  });

  protected forceUnitLabel(): string {
    return this.editor.drawing().units.force;
  }

  protected readonly bulkFills = computed(() => [
    ...new Set(
      this.members()
        .map((id) => {
          const body = this.editor.drawing().bodies.find((b) => b.id === id);
          return body?.kind === 'material' ? body.presentation.fill : undefined;
        })
        .filter((fill): fill is string => !!fill)
    ),
  ]);

  protected bulkColor(color: string) {
    this.editor.apply(
      ...this.members().map((bodyId) => ({
        kind: 'body-properties' as const,
        bodyId,
        change: { presentation: { fill: color } },
      }))
    );
  }

  // ---- reading the document into the fields --------------------------------

  private presented: Record<string, string> = {};
  private shown = '';

  constructor() {
    effect(() => {
      const values = this.values(),
        key = JSON.stringify([this.editor.selection(), values]);
      // A selection or displayed pose change refreshes measurements; unrelated
      // paints keep unfinished text where the reader left it.
      if (key === this.shown) return;
      this.shown = key;
      this.presented = values;
      this.rebuildOtherJoints();
      for (const [name, value] of Object.entries(values)) {
        const control = this.control(name);
        if (control && control.value !== value) control.setValue(value, { emitEvent: false });
      }
      this.jointForm.controls.curve.setValue(this.tracing(), { emitEvent: false });
      this.linkForm.controls.drawAsDisc.setValue(this.drawnAsDisc(), { emitEvent: false });
      this.forceForm.controls.isGlobal.setValue(this.force()?.frame === 'world' ? '1' : '0', {
        emitEvent: false,
      });
    });
    const typed: [FormGroup, string[]][] = [
      [this.jointForm, ['xPos', 'yPos', 'inputSpeed', 'sliderMass']],
      [this.linkForm, ['length', 'angle']],
      [this.forceForm, ['magnitude', 'angle', 'xComp', 'yComp']],
    ];
    for (const [group, names] of typed)
      for (const name of names) group.get(name)!.valueChanges.subscribe(() => this.commit(name));
    this.bulkForm.controls.mass.valueChanges.subscribe(() => this.bulkMass());
    this.jointForm.controls.curve.valueChanges.subscribe((on) => this.setTrace(!!on));
    this.linkForm.controls.drawAsDisc.valueChanges.subscribe((on) => this.setDrawnAsDisc(!!on));
    this.jointForm.controls.inputSpeedUnit.valueChanges.subscribe(() => this.editor.refresh());
    this.forceForm.controls.isGlobal.valueChanges.subscribe((value) => {
      const force = this.force();
      if (force)
        this.editor.apply({
          kind: 'force-properties',
          forceId: force.id,
          change: { frame: value === '1' ? 'world' : 'body' },
        });
    });
  }

  /**
   * The form the branch on screen is bound to.
   *
   * `angle` names a different number on a link and on a force -- each branch
   * binds its own group, exactly as the public panel does -- so the name alone
   * does not identify a control.
   */
  private formFor(): FormGroup {
    const branch = this.branch();
    if (branch === 'force') return this.forceForm;
    if (branch === 'link') return this.linkForm;
    return this.jointForm;
  }

  private control(name: string) {
    if (name.startsWith('otherJoints.'))
      return this.otherJoints.at(Number(name.split('.')[1])) ?? null;
    return this.formFor().get(name);
  }

  protected get otherJoints(): FormArray<FormControl<string | null>> {
    return this.jointForm.controls.otherJoints;
  }

  private rebuildOtherJoints() {
    const wanted = this.listOfOtherJoints().length * 2;
    while (this.otherJoints.length > wanted) this.otherJoints.removeAt(this.otherJoints.length - 1);
    while (this.otherJoints.length < wanted) {
      const at = this.otherJoints.length,
        control = this.fb.control('', { updateOn: 'blur' as const });
      control.valueChanges.subscribe(() => this.commit(`otherJoints.${at}`));
      this.otherJoints.push(control);
    }
  }

  /** Every field this selection has a number for, in the fields' own text. */
  private values(): Record<string, string> {
    const document = this.editor.drawing(),
      values: Record<string, string> = {};
    const unit = document.settings.angleUnit;
    const length = (v: number) => nativeUnitText(v, document.units.length);
    const angle = (v: number) => nativeUnitText(unit === 'deg' ? (v * 180) / Math.PI : v, unit);

    const point = this.pointId();
    if (point) {
      const from = attachmentWorld(document, point);
      values['xPos'] = length(from.x);
      values['yPos'] = length(from.y);
      this.listOfOtherJoints().forEach((other, i) => {
        const to = attachmentWorld(document, other.id);
        values[`otherJoints.${i * 2}`] = length(Math.hypot(to.x - from.x, to.y - from.y));
        values[`otherJoints.${i * 2 + 1}`] = angle(Math.atan2(to.y - from.y, to.x - from.x));
      });
    }

    const body = this.body();
    if (body?.geometry.kind === 'bar') {
      const [a, b] = body.geometry.vertices;
      values['length'] = length(Math.hypot(b.x - a.x, b.y - a.y));
      values['angle'] = angle(body.pose.angle + Math.atan2(b.y - a.y, b.x - a.x));
    }

    const driver = this.actions.driver();
    if (driver) {
      const unitIndex = Number(this.jointForm.controls.inputSpeedUnit.value) || 0;
      const magnitude = Math.abs(driver.profile.speed);
      values['inputSpeed'] = nativeRounded(
        this.actions.isSliderInput() ? magnitude : nativeAngularSpeedIn(magnitude, unitIndex)
      );
    }

    const sliding = this.slidingBody();
    if (sliding)
      values['sliderMass'] = nativeUnitText(
        resolveMass(sliding, document.units).mass / unitFactors(document.units).mass,
        document.units.mass
      );

    const force = this.force();
    if (force) {
      const polar = nativeForcePolar(force.vector);
      values['magnitude'] = nativeUnitText(polar.magnitude, document.units.force);
      values['angle'] = angle(polar.angle);
      values['xComp'] = nativeUnitText(force.vector.x, document.units.force);
      values['yComp'] = nativeUnitText(force.vector.y, document.units.force);
    }
    return values;
  }

  private tracing(): boolean {
    return !!this.editor.drawing().attachments.find((a) => a.id === this.pointId())?.trace;
  }

  private setTrace(on: boolean) {
    const id = this.pointId();
    if (!id || on === this.tracing()) return;
    this.editor.apply({ kind: 'attachment-properties', attachmentId: id, change: { trace: on } });
  }

  // ---- writing a typed field back ------------------------------------------

  private commit(name: string) {
    const control = this.control(name);
    if (!control) return;
    const text = String(control.value ?? '');
    if (text === this.presented[name]) return;
    const document = this.editor.drawing();
    const scalar = ['inputSpeed', 'sliderMass', 'magnitude', 'xComp', 'yComp'].includes(name);
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

    if (name === 'xPos' || name === 'yPos') {
      const id = this.pointId();
      if (!id) return;
      this.editor.apply({
        kind: 'move-point',
        attachmentId: id,
        target: { ...attachmentWorld(document, id), [name === 'xPos' ? 'x' : 'y']: value },
      });
      return;
    }
    if (name === 'sliderMass') {
      const sliding = this.slidingBody();
      if (sliding)
        this.editor.apply({
          kind: 'body-properties',
          bodyId: sliding.id,
          change: { mass: { mass: { mode: 'explicit', value } } },
        });
      return;
    }
    if (name === 'inputSpeed') {
      const unitIndex = Number(this.jointForm.controls.inputSpeedUnit.value) || 0;
      this.actions.setDriveSpeed(
        this.actions.isSliderInput() ? value : nativeAngularSpeedFrom(value, unitIndex)
      );
      return;
    }
    if (this.force()) {
      this.commitForce(name, value);
      return;
    }
    const body = this.body();
    if (body && (name === 'length' || name === 'angle')) {
      const command = bodyBarFieldCommand(document, body.id, name, value);
      if ('operations' in command) this.editor.commit(command);
      else this.editor.report(command.message);
      return;
    }
    if (name.startsWith('otherJoints.')) this.commitOtherJoint(Number(name.split('.')[1]), value);
  }

  private commitForce(name: string, value: number) {
    const force = this.force()!,
      polar = nativeForcePolar(force.vector);
    const vector =
      name === 'magnitude'
        ? nativeForceVector(value, polar.angle)
        : name === 'angle'
          ? nativeForceVector(polar.magnitude, value)
          : { ...force.vector, [name === 'xComp' ? 'x' : 'y']: value };
    this.editor.apply({ kind: 'force-properties', forceId: force.id, change: { vector } });
  }

  /** A distance or a bearing to another joint, which is what moves that joint. */
  private commitOtherJoint(index: number, value: number) {
    const other = this.listOfOtherJoints()[Math.floor(index / 2)],
      document = this.editor.drawing(),
      hub = this.pointId();
    if (!other || !hub) return;
    const from = attachmentWorld(document, hub),
      to = attachmentWorld(document, other.id);
    const distance = Math.hypot(to.x - from.x, to.y - from.y),
      bearing = Math.atan2(to.y - from.y, to.x - from.x);
    const radius = index % 2 === 0 ? value : distance,
      angle = index % 2 === 0 ? bearing : value;
    this.editor.apply({
      kind: 'move-point',
      attachmentId: other.id,
      target: { x: from.x + radius * Math.cos(angle), y: from.y + radius * Math.sin(angle) },
    });
  }

  private bulkMass() {
    const text = this.bulkForm.controls.mass.value ?? '',
      value = nativeScalar(text) ?? NaN;
    if (!text.trim() || !Number.isFinite(value)) {
      this.editor.report('Type a number for the mass.');
      return;
    }
    this.editor.apply(
      ...this.members().map((bodyId) => ({
        kind: 'body-properties' as const,
        bodyId,
        change: { mass: { mass: { mode: 'explicit' as const, value } } },
      }))
    );
  }
}
