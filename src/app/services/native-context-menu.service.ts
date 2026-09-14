import { Injectable, inject } from '@angular/core';
import {
  ContextMenuModel,
  MenuCrossing,
  MenuGroup,
  MenuRefusal,
  MenuRow,
} from '../component/BLOCKS/context-menu/menu-model';
import { NativeEditorService } from './native-editor.service';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';
import {
  BodyEditCommand,
  BodyRecordRef,
  BodySelectionRef,
} from '../model/body-system/body-edit-types';
import { Point } from '../model/body-system/body-frame';
import { BodyId } from '../model/body-system/body-id';
import { nativeEditRefusalCopy } from '../model/body-system/joint-permission';
import {
  insertNativeAttachment,
  nativeCommand,
  selectionBodies,
} from '../model/body-system/body-joint-interaction';
import {
  bodyConnectionCommand,
  bodyConnectionPairs,
} from '../model/body-system/body-connection-controls';
import { menuRefusal } from '../model/edit-permission';
import { VECTOR_ICON, VECTOR_LABEL, VectorQuantity } from '../model/vector-trace';
import {
  nativeMechanismDelete,
  nativeMechanismOf,
  nativeMechanisms,
} from '../model/body-system/body-mechanism-partition';
import {
  NATIVE_ALL_LOCKED,
  NATIVE_ANALYSIS_MODES,
  NATIVE_BACKGROUND_IMAGE,
  NATIVE_NOTHING_LOCKED,
  NATIVE_NOTHING_TO_LOCK,
  NATIVE_NO_BODY,
  NATIVE_NO_COMMAND,
  NATIVE_NO_MECHANISM,
  NATIVE_NO_PAIR,
  NATIVE_VECTOR_TRACES,
  NativeMenuRefusal,
  nativeAllLocksCommand,
  nativeBarDimensions,
  nativeDiscCommand,
  nativeDriveCommand,
  nativeDriveRefusal,
  nativeDriver,
  nativeDuplicateCommand,
  nativeForceFrameCommand,
  nativeForceOwnerRefusal,
  nativeForceReverseCommand,
  nativeGroundCommand,
  nativeGroundJoint,
  nativeHoldCommand,
  nativeHoldRefusal,
  nativeHoldState,
  nativeIsDisc,
  nativeIsLocked,
  nativeIsTraced,
  nativeLockCommand,
  nativeLockCounts,
  nativeLockTargets,
  nativeMenuJoints,
  nativePairJoint,
  nativeTraceAttachment,
  nativeTraceCommand,
} from '../model/body-system/body-menu-commands';

/**
 * The native right-click menu, assembled.
 *
 * The same menu as the public canvas's: the same groups in the same order, the
 * same labels, the same glyphs and the same destructive footer, built from
 * `ContextMenuBuilderService` as its template of record. What differs is only
 * what the rows are wired to — a body document and its edit commands rather
 * than `MechanismService`.
 *
 * No rule is written here. Every grayed row quotes the model that enforces it:
 * a command's own `preview` where one can be built, and the named refusals in
 * `model/body-system/body-menu-commands.ts` where none can. A row the native
 * model cannot serve yet — the three vector traces, which arrive with the
 * analysis consumers — stays in its place and grays, because a row that is
 * missing on one of two menus teaches a reader nothing about where it went.
 */
@Injectable({ providedIn: 'root' })
export class NativeContextMenuService {
  readonly editor = inject(NativeEditorService);
  private keys = inject(KeyboardShortcutsService);
  /** One preview per distinct command while a single menu is being built. */
  private previews = new Map<string, ReturnType<NativeEditorService['preview']>>();

  build(
    target: BodySelectionRef | undefined,
    point: Point,
    create: (kind: 'link' | 'cylinder' | 'force') => void,
    materialOwner?: BodyId
  ): ContextMenuModel {
    this.previews = new Map();
    const model = this.buildFor(target, point, create, materialOwner);
    return this.freezeWhileRunning(model);
  }

  private buildFor(
    target: BodySelectionRef | undefined,
    point: Point,
    create: (kind: 'link' | 'cylinder' | 'force') => void,
    materialOwner?: BodyId
  ): ContextMenuModel {
    if (!target) return this.forGrid(create);
    if (target.kind === 'force') return this.forForce(target);
    if (target.kind === 'assembly') return this.forCylinder(target);
    if (target.kind === 'body' || target.kind === 'group')
      return this.forLink(target, point, create, materialOwner);
    return this.forJoint(target, point, create, materialOwner);
  }

  // ------------------------------------------------------------------ grid

  private forGrid(create: (kind: 'link' | 'cylinder' | 'force') => void): ContextMenuModel {
    const groups: MenuGroup[] = [
      {
        label: 'Add',
        rows: [
          this.creationRow('link', create),
          this.creationRow('cylinder', create),
          new MenuRow({
            label: 'Background Image',
            posePolicy: 'preserve',
            icon: 'background_image',
            action: () => undefined,
            refusal: NATIVE_BACKGROUND_IMAGE,
          }),
        ],
      },
      { label: 'Mechanism', rows: this.machineRows() },
    ];
    return { header: { title: 'Grid', subtitle: this.gridSubtitle() }, groups };
  }

  private gridSubtitle(): string {
    const counts = nativeLockCounts(this.editor.document());
    if (counts.total === 0) return 'Nothing drawn';
    if (counts.locked === 0) return 'Nothing selected';
    if (counts.locked === counts.total) return `All ${counts.total} parts locked`;
    return `${counts.locked} of ${counts.total} parts locked`;
  }

  /** Lock All and Unlock All, each with its own count, and never both gray. */
  private machineRows(): MenuRow[] {
    const document = this.editor.document();
    const counts = nativeLockCounts(document);
    return [
      new MenuRow({
        label: 'Lock All',
        posePolicy: 'preserve',
        icon: 'lock',
        action: () => this.editor.commit(nativeAllLocksCommand(this.editor.document(), true)),
        hint: counts.open > 0 ? `${counts.open} open` : undefined,
        shortcut: this.keys.keysFor('edit.lock'),
        refusal:
          counts.total === 0
            ? NATIVE_NOTHING_TO_LOCK
            : counts.open === 0
              ? NATIVE_ALL_LOCKED
              : undefined,
      }),
      new MenuRow({
        label: 'Unlock All',
        posePolicy: 'preserve',
        icon: 'unlock',
        action: () => this.editor.commit(nativeAllLocksCommand(this.editor.document(), false)),
        hint: counts.locked > 0 ? `${counts.locked} locked` : undefined,
        refusal: counts.locked === 0 ? NATIVE_NOTHING_LOCKED : undefined,
      }),
    ];
  }

  // ----------------------------------------------------------------- joint

  private forJoint(
    target: BodySelectionRef,
    point: Point,
    create: (kind: 'link' | 'cylinder' | 'force') => void,
    materialOwner?: BodyId
  ): ContextMenuModel {
    const document = this.editor.document();
    const body = materialOwner ?? selectionBodies(document, [target])[0];
    return {
      header: {
        title: this.jointTitle(target),
        subtitle: this.jointSubtitle(target),
        crossing: this.crossing(),
      },
      groups: [
        {
          label: 'Attach',
          rows: [
            this.creationRow('link', create),
            this.creationRow('cylinder', create),
            this.forceRow(body, create, target, materialOwner),
          ],
        },
        { label: 'State', rows: this.jointStateRows(target, body, point) },
        {
          label: 'Traces',
          rows: [this.traceRow(target), ...this.vectorRows(['velocity', 'acceleration', 'force'])],
        },
        {
          rows: [
            this.deleteRow('Delete Joint', target),
            this.deleteMechanismRow(body ?? selectionBodies(document, [target])[0]),
          ],
        },
      ],
    };
  }

  /**
   * "Joint A": the mark's own name, which is the pin's label where it has one
   * and its point's otherwise — the same fallback the canvas's marks use.
   */
  private jointTitle(target: BodySelectionRef): string {
    const document = this.editor.document();
    const name = this.editor.name(target);
    const point = nativeTraceAttachment(document, target);
    const fallback = document.attachments.find((one) => one.id === point)?.label;
    const said = name === 'Joint' ? (fallback ?? '') : name;
    return said ? `Joint ${said}` : 'Joint';
  }

  private jointSubtitle(target: BodySelectionRef): string {
    const document = this.editor.document();
    const joints = nativeMenuJoints(document, target);
    const bodies = selectionBodies(document, [target]);
    const kind = joints.some((joint) => joint.kind === 'weld')
      ? 'Welded'
      : joints.some((joint) => joint.kind !== 'revolute')
        ? 'Slider'
        : nativeDriver(document, target)
          ? 'Driven pin'
          : nativeGroundJoint(document, target)
            ? 'Ground pin'
            : bodies.length === 1
              ? 'Tracer'
              : 'Pin';
    return `${kind} · ${this.bodyList(bodies)}`;
  }

  /** The bodies a mark sits on: "Links AB, BC", or a cylinder member's own name. */
  private bodyList(bodies: readonly BodyId[]): string {
    if (bodies.length === 0) return 'not on a link';
    const labels = bodies.map((id) => this.bodyLabel(id));
    const plain = labels.every((label) => label.startsWith('Link '));
    if (!plain) return labels.join(', ');
    const names = labels.map((label) => label.slice('Link '.length));
    return `${names.length === 1 ? 'Link' : 'Links'} ${names.join(', ')}`;
  }

  /**
   * What a panel calls a body: "Link AB", or "Barrel"/"Rod" where "Link" would
   * be a lie about a cylinder's own members.
   */
  private bodyLabel(id: BodyId): string {
    const document = this.editor.document();
    const assembly = document.assemblies.find((one) => one.barrel === id || one.rod === id);
    if (assembly) return assembly.barrel === id ? 'Barrel' : 'Rod';
    const name = this.editor.bodyName(id);
    return name.startsWith('Link ') || name === 'Ground' ? name : `Link ${name}`;
  }

  private jointStateRows(
    target: BodySelectionRef,
    body: BodyId | undefined,
    point: Point
  ): MenuRow[] {
    const document = this.editor.document();
    const pairs = bodyConnectionPairs(document, target);
    const pair = pairs.find((one) => one.key === this.editor.connectionPair()) ?? pairs[0];
    const joint = nativePairJoint(document, target, pair);
    const kindRow = (label: string, icon: string, kind: 'prismatic' | 'weld') => {
      const on = joint?.kind === (kind === 'prismatic' ? 'prismatic' : 'weld');
      // Pin-in-slot is a slider too: the row reads the state it names.
      const slider = kind === 'prismatic' && joint?.kind === 'pin-in-slot';
      const checked = on || slider;
      return this.commandRow({
        label,
        icon,
        kind: 'toggle',
        checked,
        command: bodyConnectionCommand(document, target, pair, checked ? 'revolute' : kind),
        missing: NATIVE_NO_PAIR,
      });
    };
    return [
      this.commandRow({
        label: 'Grounded',
        icon: 'add_ground',
        kind: 'toggle',
        checked: !!nativeGroundJoint(document, target),
        command: nativeGroundCommand(document, target, body, point),
        missing: NATIVE_NO_BODY,
      }),
      this.commandRow({
        label: 'Driven Input',
        icon: 'add_input',
        kind: 'toggle',
        checked: !!nativeDriver(document, target),
        command: nativeDriveCommand(document, target),
        refusal: nativeDriveRefusal(document, target),
      }),
      kindRow('Slider', 'add_slider', 'prismatic'),
      kindRow('Welded', 'weld_joint', 'weld'),
      this.lockRow(target),
    ];
  }

  /**
   * The trace switch: a view of the mechanism rather than a part of it, so it
   * stays live in every mode while paused.
   */
  private traceRow(target: BodySelectionRef): MenuRow {
    const document = this.editor.document();
    return this.commandRow({
      label: 'Trace path',
      icon: 'show_path',
      kind: 'toggle',
      checked: nativeIsTraced(document, target),
      alwaysAllowed: true,
      command: nativeTraceCommand(document, target),
      missing: NATIVE_NO_COMMAND,
    });
  }

  /**
   * Velocity, acceleration and the reaction carried here.
   *
   * Present and gray on every part: the quantities are read off a solved cycle,
   * and the native route's analysis consumers are not built yet.
   */
  private vectorRows(quantities: readonly VectorQuantity[]): MenuRow[] {
    return quantities.map(
      (quantity) =>
        new MenuRow({
          label: VECTOR_LABEL[quantity],
          icon: VECTOR_ICON[quantity],
          kind: 'toggle',
          alwaysAllowed: true,
          action: () => undefined,
          refusal: NATIVE_VECTOR_TRACES,
        })
    );
  }

  // ------------------------------------------------------------------ link

  private forLink(
    target: BodySelectionRef,
    point: Point,
    create: (kind: 'link' | 'cylinder' | 'force') => void,
    materialOwner?: BodyId
  ): ContextMenuModel {
    const document = this.editor.document();
    const body = materialOwner ?? selectionBodies(document, [target])[0];
    return {
      header: {
        title:
          target.kind === 'body'
            ? this.bodyLabel(target.id)
            : titled('Link', this.editor.name(target)),
        subtitle: this.linkSubtitle(target, body),
        crossing: this.crossing(),
      },
      groups: [
        {
          label: 'Attach',
          rows: [
            this.creationRow('link', create),
            this.creationRow('cylinder', create),
            this.commandRow({
              label: 'Tracer Point',
              icon: 'add_tracer',
              posePolicy: 'attachment',
              command: body
                ? insertNativeAttachment(this.editor.drawing(), body, point)
                : undefined,
              missing: NATIVE_NO_BODY,
            }),
            this.forceRow(body, create, target, materialOwner),
            this.commandRow({
              label: 'Duplicate Link',
              icon: 'content_copy',
              material: true,
              tip: 'Set a free-standing copy of this link down beside it.',
              command: nativeDuplicateCommand(document, selectionBodies(document, [target])),
              missing: NATIVE_NO_COMMAND,
            }),
          ],
        },
        { label: 'State', rows: this.linkStateRows(target, body) },
        { label: 'Traces', rows: this.vectorRows(['velocity', 'acceleration']) },
        {
          rows: [this.deleteRow('Delete Link', target), this.deleteMechanismRow(body)],
        },
      ],
    };
  }

  private linkSubtitle(target: BodySelectionRef, body: BodyId | undefined): string {
    const document = this.editor.document();
    const bodies = selectionBodies(document, [target]);
    const shape = document.bodies.find((one) => one.id === body);
    const points = document.attachments.filter((one) => bodies.includes(one.bodyId));
    const kind =
      target.kind === 'group'
        ? 'Compound'
        : shape?.kind === 'material' && shape.geometry.kind === 'bar'
          ? 'Bar'
          : 'Body';
    const locked = nativeIsLocked(document, nativeLockTargets(document, [target]))
      ? ' · locked'
      : '';
    const held = !locked ? nativeHoldState(document, body).dimensions : [];
    // Named where the points carry names, counted where they do not, so the
    // line reads "Joints A, B" on a drawing whose pins are lettered.
    const named = points.every((one) => one.label);
    const joints = named
      ? `Joints ${points.map((one) => one.label).join(', ')}`
      : `${points.length} ${points.length === 1 ? 'joint' : 'joints'}`;
    return `${kind} · ${joints}${locked}${held.length ? ` · fixed ${held.join(' and ')}` : ''}`;
  }

  private linkStateRows(target: BodySelectionRef, body: BodyId | undefined): MenuRow[] {
    const document = this.editor.document();
    const held = nativeHoldState(document, body).dimensions;
    const refusal = nativeHoldRefusal(document, body);
    const size = nativeBarDimensions(document, body);
    const holdRow = (which: 'length' | 'angle', label: string, icon: string, value: string) =>
      this.commandRow({
        label,
        posePolicy: 'preserve',
        icon,
        material: true,
        kind: 'toggle',
        checked: held.includes(which),
        hint: held.includes(which) ? undefined : value,
        command: nativeHoldCommand(document, body, which),
        refusal,
        tip:
          which === 'length'
            ? 'Fix this link at its current length. Dragging either joint slides it on the arc about the other.'
            : 'Fix this link at its current angle from the grid. Dragging either joint slides it along that line.',
      });
    return [
      this.commandRow({
        label: 'Drawn as a Disc',
        posePolicy: 'preserve',
        icon: 'make_circular',
        kind: 'toggle',
        checked: nativeIsDisc(document, body),
        command: nativeDiscCommand(document, body),
        missing: NATIVE_NO_COMMAND,
      }),
      holdRow('length', 'Fixed Length', 'straighten', this.lengthText(size?.length)),
      holdRow('angle', 'Fixed Angle', 'architecture', this.angleText(size?.angle)),
      this.lockRow(target),
    ];
  }

  // -------------------------------------------------------------- cylinder

  private forCylinder(target: BodySelectionRef & { kind: 'assembly' }): ContextMenuModel {
    const document = this.editor.document();
    const assembly = document.assemblies.find((one) => one.id === target.id);
    const barrel = assembly?.barrel;
    const held = nativeHoldState(document, barrel).dimensions;
    const size = nativeBarDimensions(document, barrel);
    return {
      header: {
        title: this.cylinderTitle(target),
        subtitle: `Barrel and rod · ${this.cylinderEnds(target)}`,
        crossing: this.crossing(),
      },
      groups: [
        {
          label: 'State',
          rows: [
            this.commandRow({
              label: 'Driven Input',
              icon: 'add_input',
              kind: 'toggle',
              checked: !!nativeDriver(document, target),
              command: nativeDriveCommand(document, target),
              refusal: nativeDriveRefusal(document, target),
            }),
            this.commandRow({
              label: 'Fixed Angle',
              posePolicy: 'preserve',
              icon: 'architecture',
              material: true,
              kind: 'toggle',
              checked: held.includes('angle'),
              hint: held.includes('angle') ? undefined : this.angleText(size?.angle),
              command: nativeHoldCommand(document, barrel, 'angle'),
              refusal: nativeHoldRefusal(document, barrel),
              tip: 'Hold this cylinder at the angle it points now. Dragging a mount slides it along that line.',
            }),
            this.lockRow(target),
          ],
        },
        { label: 'Traces', rows: this.vectorRows(['velocity', 'acceleration']) },
        {
          rows: [
            this.deleteRow('Delete Cylinder', target),
            this.deleteMechanismRow(selectionBodies(document, [target])[0]),
          ],
        },
      ],
    };
  }

  private cylinderTitle(target: BodySelectionRef & { kind: 'assembly' }): string {
    return titled('Cylinder', this.editor.name(target));
  }

  /** The two mounts a reader can see and click, not the pin sealed between them. */
  private cylinderEnds(target: BodySelectionRef & { kind: 'assembly' }): string {
    const document = this.editor.document();
    const assembly = document.assemblies.find((one) => one.id === target.id);
    const ends = [assembly?.barrelMount, assembly?.rodMount].map((id) => this.pointName(id));
    return ends.every((label) => label) ? `Joints ${ends.join(', ')}` : '2 joints';
  }

  // ----------------------------------------------------------------- force

  private forForce(target: BodySelectionRef & { kind: 'force' }): ContextMenuModel {
    const document = this.editor.document();
    const force = document.forces.find((one) => one.id === target.id);
    return {
      header: {
        title: titled('Force', this.editor.name(target)),
        subtitle: force
          ? `On ${this.bodyLabel(force.bodyId)} · ${force.frame === 'world' ? 'global' : 'local'} frame`
          : '',
        crossing: this.crossing(),
      },
      groups: [
        {
          label: 'Set',
          rows: [
            this.commandRow({
              label: 'Reverse Direction',
              posePolicy: 'attachment',
              icon: 'switch_force_dir',
              command: force ? nativeForceReverseCommand(document, target.id) : undefined,
              missing: NATIVE_NO_COMMAND,
            }),
          ],
        },
        {
          label: 'State',
          rows: [
            this.commandRow({
              label: 'Global Frame',
              posePolicy: 'attachment',
              icon: 'public',
              material: true,
              kind: 'toggle',
              checked: force?.frame === 'world',
              command: force ? nativeForceFrameCommand(document, target.id) : undefined,
              missing: NATIVE_NO_COMMAND,
            }),
            this.lockRow(target),
          ],
        },
        { rows: [this.deleteRow('Delete Force', target)] },
      ],
    };
  }

  // ---------------------------------------------------------------- shared

  /**
   * The way into the other mode, as one icon beside the target's name.
   *
   * Present and gray, like the trace rows below it: the analysis modes arrive
   * with the analysis consumers, and an icon that is missing from one of two
   * menus is a place a reader has to learn twice.
   */
  private crossing(): MenuCrossing {
    return {
      icon: 'query_stats',
      material: true,
      tip: this.keys.tip('Kinematic Analysis', 'mode.kinematic'),
      refusal: { short: NATIVE_ANALYSIS_MODES.short, long: NATIVE_ANALYSIS_MODES.long },
      action: () => undefined,
    };
  }

  private creationRow(
    kind: 'link' | 'cylinder',
    create: (kind: 'link' | 'cylinder' | 'force') => void
  ): MenuRow {
    return new MenuRow({
      label: kind === 'link' ? 'Link' : 'Cylinder',
      icon: kind === 'link' ? 'new_link' : 'add_cylinder',
      action: () => create(kind),
    });
  }

  /**
   * A load, drawn rather than dropped.
   *
   * The canvas takes the gesture from here, the way it does for a Link or a
   * Cylinder: the arrow starts where the menu opened and follows the pointer
   * until a click. A load is a direction as much as a place, so landing one at
   * a default heading would leave the reader something to go and fix.
   */
  private forceRow(
    body: BodyId | undefined,
    create: (kind: 'link' | 'cylinder' | 'force') => void,
    target?: BodySelectionRef,
    materialOwner?: BodyId
  ): MenuRow {
    const refusal =
      nativeForceOwnerRefusal(this.editor.document(), target, materialOwner) ??
      (body ? undefined : NATIVE_NO_BODY);
    return new MenuRow({
      label: 'Force',
      icon: 'add_force',
      posePolicy: 'attachment',
      action: () => create('force'),
      refusal: refusal ? { short: refusal.short, long: refusal.long } : undefined,
    });
  }

  private lockRow(target: BodySelectionRef): MenuRow {
    const document = this.editor.document();
    const targets = nativeLockTargets(document, [target]);
    return this.commandRow({
      label: 'Locked',
      posePolicy: 'preserve',
      icon: 'lock',
      kind: 'toggle',
      checked: nativeIsLocked(document, targets),
      shortcut: this.keys.keysFor('edit.lock'),
      command: nativeLockCommand(document, [target]),
      missing: NATIVE_NO_COMMAND,
    });
  }

  /**
   * The whole machine this part belongs to, gone.
   *
   * Named only where the drawing holds more than one, and counted before the
   * click, as the public row is.
   */
  private deleteMechanismRow(body: BodyId | undefined): MenuRow {
    const document = this.editor.document();
    const machine = nativeMechanismOf(document, body);
    const named = machine && nativeMechanisms(document).length > 1 ? ` ${machine.id}` : '';
    return this.commandRow({
      label: `Delete entire mechanism${named}`,
      icon: 'delete_mechanism',
      destructive: true,
      hint: machine ? `${machine.joints} ${machine.joints === 1 ? 'joint' : 'joints'}` : undefined,
      tip: 'Deletes the whole mechanism this part belongs to — every joint, link and force in it.',
      command: machine ? nativeMechanismDelete(document, machine) : undefined,
      missing: NATIVE_NO_MECHANISM,
    });
  }

  /**
   * A delete, with what it takes named in brackets before the click.
   *
   * One casualty is named and several are counted, the way the public rows do
   * it: "and Link 2" at one, "and 3 links" past it.
   */
  private deleteRow(label: string, target: BodySelectionRef): MenuRow {
    const document = this.editor.document();
    const command = nativeCommand({ kind: 'delete', targets: [target] });
    const preview = this.preview(command);
    const named = new Set(selectionBodies(document, [target]));
    const takes: string[] = [];
    if (preview.ok) {
      const ids = (kind: BodyRecordRef['kind']) =>
        preview.effects.removed.flatMap((ref) =>
          ref.kind === kind && 'id' in ref ? [ref.id as string] : []
        );
      // The cylinder the row already names is not one of its casualties.
      const cylinders = ids('assembly').filter(
        (id) => !(target.kind === 'assembly' && target.id === id)
      );
      const inside = new Set(
        ids('assembly').flatMap((id) => {
          const assembly = document.assemblies.find((one) => one.id === id);
          return assembly ? [assembly.barrel, assembly.rod] : [];
        })
      );
      const gone = ids('body') as BodyId[];
      const links = gone.filter((id) => !inside.has(id) && !named.has(id));
      // A pin only counts as gone when the body it was on is still standing:
      // the marks that vanish with the part itself are what the row already
      // names. A joint's own row never counts pins at all — the pin it names
      // is the one being deleted — and neither does a cylinder's, whose two
      // mounts are part of the word "cylinder".
      const standing = new Set(gone);
      const joints = ['joint', 'junction', 'attachment', 'assembly'].includes(target.kind)
        ? []
        : ids('attachment').filter((id) => {
            const owner = document.attachments.find((one) => one.id === id)?.bodyId;
            return !!owner && !standing.has(owner);
          });
      if (cylinders.length === 1) takes.push('Cylinder');
      else if (cylinders.length > 1) takes.push(`${cylinders.length} cylinders`);
      if (links.length === 1) takes.push(this.bodyLabel(links[0]));
      else if (links.length > 1) takes.push(`${links.length} links`);
      if (joints.length === 1) takes.push(this.jointName(joints[0]));
      else if (joints.length > 1) takes.push(`${joints.length} joints`);
    }
    return this.commandRow({
      label: takes.length ? `${label} (and ${takes.join(', ')})` : label,
      icon: 'remove',
      destructive: true,
      shortcut: this.keys.keysFor('edit.delete'),
      command,
    });
  }

  /**
   * One row bound to one command.
   *
   * Three sources of a gray row, in order: a precondition the model already
   * answers (`refusal`), the command's own `preview`, and — where no command
   * could be built at all — what the caller says is missing. Nothing about why
   * is decided here.
   */
  private commandRow(init: {
    label: string;
    icon: string;
    command: BodyEditCommand | undefined;
    /** A model answer that stands whether or not a command could be built. */
    refusal?: NativeMenuRefusal;
    /** What to say when there is no command to preview. */
    missing?: NativeMenuRefusal;
    material?: boolean;
    kind?: 'action' | 'toggle';
    checked?: boolean;
    hint?: string;
    tip?: string;
    shortcut?: string;
    destructive?: boolean;
    alwaysAllowed?: boolean;
    posePolicy?: MenuRow['posePolicy'];
  }): MenuRow {
    const { command, refusal, missing, ...rest } = init;
    const preview = command ? this.preview(command) : undefined;
    const said: NativeMenuRefusal | undefined =
      refusal ??
      (!command
        ? (missing ?? NATIVE_NO_COMMAND)
        : preview && !preview.ok
          ? nativeEditRefusalCopy(preview)
          : undefined);
    return new MenuRow({
      ...rest,
      action: () => {
        if (command) this.editor.commit(command);
      },
      refusal: said ? ({ short: said.short, long: said.long } as MenuRefusal) : undefined,
    });
  }

  /**
   * "Joint O" for a pin a delete would take with it.
   *
   * A ground anchor carries no name of its own, so the pin is named by the
   * material point it was joined to — which is the letter the reader sees on
   * the drawing.
   */
  private jointName(id: string): string {
    const label = this.pointName(id);
    return label ? `Joint ${label}` : '1 joint';
  }

  /**
   * The letter a reader sees on a pin.
   *
   * A ground anchor and a cylinder's own mount carry no name, so each is named
   * by the material point it is joined to — which is the letter on the drawing.
   */
  private pointName(id: string | undefined): string {
    const document = this.editor.document();
    const named = (attachment: string | undefined) =>
      document.attachments.find((one) => one.id === attachment)?.label;
    const joint = document.joints.find((one) =>
      [one.frameA.attachmentId, one.frameB.attachmentId].includes(id as never)
    );
    const paired = joint
      ? named(
          joint.frameA.attachmentId === id ? joint.frameB.attachmentId : joint.frameA.attachmentId
        )
      : undefined;
    return named(id) || paired || '';
  }

  private preview(command: BodyEditCommand) {
    const key = JSON.stringify(command.operations);
    if (!this.previews.has(key)) this.previews.set(key, this.editor.preview(command));
    return this.previews.get(key)!;
  }

  /**
   * The number a hold row would hold, written the way the public row writes it:
   * two decimals for a length, whole degrees for an angle.
   */
  private lengthText(value: number | undefined): string {
    const document = this.editor.document();
    return value === undefined ? '' : `${value.toFixed(2)} ${document.units.length}`;
  }

  private angleText(value: number | undefined): string {
    const document = this.editor.document();
    if (value === undefined) return '';
    const degrees = document.settings.angleUnit === 'deg';
    const shown = degrees ? (value * 180) / Math.PI : value;
    return `${shown.toFixed(degrees ? 0 : 2)} ${document.settings.angleUnit}`;
  }

  /** The same pose rules the public menu applies, in every mode and at activation. */
  private freezeWhileRunning(model: ContextMenuModel): ContextMenuModel {
    for (const group of model.groups) {
      for (const row of group.rows) {
        const said = () =>
          menuRefusal(this.editor.state(), row.alwaysAllowed ? 'view' : row.posePolicy);
        const refusal = said();
        if (refusal && !row.refusal) row.refusal = { short: refusal.short, long: refusal.long };
        const action = row.action;
        // A menu can stay open across a keyboard seek or a play, so the check
        // is made again when the row is pressed rather than when it was drawn.
        row.action = () => {
          if (!said()) action();
        };
      }
    }
    return model;
  }
}

/**
 * "Force F1", or just "Force" when the part carries no name of its own.
 *
 * A drawing imported without letters would otherwise read "Force Force": the
 * kind word is the fallback, not a prefix to stack on top of itself.
 */
function titled(kind: string, name: string): string {
  return !name || name === kind ? kind : `${kind} ${name}`;
}
