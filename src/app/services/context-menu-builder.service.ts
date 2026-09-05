import { Injectable, inject } from '@angular/core';
import { NumberUnitParserService } from './number-unit-parser.service';
import { AngleUnit } from '../model/utils';
import { heldBarsAt, holdOf, holdableBar } from '../model/link-holds';
import { LinkHold } from '../model/link';
import {
  ContextMenuModel,
  MenuGroup,
  MenuRefusal,
  MenuRow,
} from '../component/context-menu/menu-model';
import { Joint, PrisJoint, RealJoint } from '../model/joint';
import { Link, RealLink, SliderBlock } from '../model/link';
import { Force } from '../model/force';
import { SynthesisPose } from './synthesis/synthesis-util';
import { Cylinder } from '../model/cylinder';
import { labelForBody } from '../model/body-label';
import { describeActuatorRefusal } from '../model/actuator';
import { MechanismService } from './mechanism.service';
import { GridUtilsService } from './grid-utils.service';
import { SettingsService } from './settings.service';
import { ActiveObjService } from './active-obj.service';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';
import { EditPermissionService } from './edit-permission.service';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { VectorQuantity, VECTOR_ICON, VECTOR_LABEL } from '../model/vector-trace';
import { SelectionBatchService } from './selection-batch.service';
import { SelectedPart, SelectedPartRef } from '../model/selection';
import { MultiEditService } from './multi-edit.service';

/** What the canvas does when a row asks for a gesture rather than an edit. */
export interface MenuHandlers {
  attachLink(): void;
  attachCylinder(): void;
  attachTracerPoint(): void;
  attachForce(onLink: RealLink): void;
  backgroundImage(): void;
  deletePosition(id: number): void;
  deleteAllPositions(): void;
  duplicateSelected(): void;
  deleteSelected(): void;
}

/** Anything the right-click can land on. */
export type MenuTarget = Joint | Link | Force | SynthesisPose | string;

/**
 * The right-click menu, assembled.
 *
 * One place, because the menu's whole claim is that it says the same thing the
 * panels and the drag ring say. Every refusal below is fetched from the model
 * that enforces it — `describeActuator` for a driven joint, `weldRefusal` for a
 * weld, `locksHolding` for a lock — rather than written out again here, so the
 * three surfaces cannot end up disagreeing about what is possible.
 *
 * The shape is a fixed ladder in every case: Attach, State, Machine, and a
 * destructive footer. Groups drop out when they are empty and never reorder,
 * so the flick to Delete lands on the last row whether the menu holds two rows
 * or twelve.
 */
@Injectable({ providedIn: 'root' })
export class ContextMenuBuilderService {
  private mechanism = inject(MechanismService);
  private gridUtils = inject(GridUtilsService);
  private multiEdit = inject(MultiEditService);
  private settings = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private activeObj = inject(ActiveObjService);
  private keys = inject(KeyboardShortcutsService);
  private synthesis = inject(SynthesisBuilderService);
  private tabs = inject(SelectedTabService);
  private selectionBatch = inject(SelectionBatchService);
  private permission = inject(EditPermissionService);

  build(target: MenuTarget, handlers: MenuHandlers): ContextMenuModel {
    const model = this.buildFor(target, handlers);
    return this.freezeWhileRunning(model);
  }

  private buildFor(target: MenuTarget, handlers: MenuHandlers): ContextMenuModel {
    if (target instanceof SynthesisPose) return this.forPose(target, handlers);
    // Synthesis mode is a question about a mechanism that does not exist yet:
    // the only things on the grid that belong to anyone are the positions,
    // and the panel owns everything else about them.
    if (this.tabs.getCurrentTab() === TabID.SYNTHESIZE) {
      const rows = this.positionRows(handlers, undefined);
      return rows.length === 0
        ? { groups: [] }
        : { header: { title: 'Grid', subtitle: this.gridSubtitle() }, groups: [{ rows }] };
    }
    if (
      (target instanceof RealJoint || target instanceof RealLink || target instanceof Force) &&
      this.activeObj.selectedParts.length > 1 &&
      this.activeObj.containsPart(target)
    ) {
      return this.forSelection(handlers);
    }
    if (target instanceof Force) return this.forForce(target);
    if (target instanceof Link) return this.forLink(target, handlers);
    if (target instanceof Joint) return this.forJoint(target, handlers);
    return this.forGrid(handlers);
  }

  private forSelection(handlers: MenuHandlers): ContextMenuModel {
    const refs = this.activeObj.selectedPartRefs;
    const count = refs.length;
    const parts = this.activeObj.selectedParts;
    const locked = parts.map((part) => this.mechanism.isLockedTarget(part));
    const allLocked = locked.every(Boolean);
    const someLocked = locked.some(Boolean);
    const duplicate = this.selectionBatch.duplicateRefusal(refs);
    const remove = this.selectionBatch.deleteRefusal(refs);
    const refusal = (value: typeof duplicate): MenuRefusal | undefined =>
      value ? { short: value.short, long: value.message } : undefined;
    return {
      header: {
        title: `${count} selected objects`,
        subtitle: this.selectionSubtitle(parts),
      },
      groups: [
        {
          label: 'State',
          rows: [
            ...this.selectionStateRows(refs, parts).filter((row) => !row.alwaysAllowed),
            new MenuRow({
              label: 'Locked',
              posePolicy: 'preserve',
              icon: 'lock',
              kind: 'toggle',
              checked: allLocked,
              hint: someLocked && !allLocked ? 'Mixed' : undefined,
              action: () => this.mechanism.setLocks(parts, !allLocked),
            }),
          ],
        },
        {
          label: 'Traces',
          rows: this.selectionStateRows(refs, parts).filter((row) => row.alwaysAllowed),
        },
        {
          label: 'Actions',
          rows: [
            new MenuRow({
              label: `Duplicate Selected (${count})`,
              icon: 'content_copy',
              material: true,
              action: () => handlers.duplicateSelected(),
              refusal: refusal(duplicate),
            }),
          ],
        },
        {
          rows: [
            new MenuRow({
              label: `Delete Selected (${count})`,
              icon: 'remove',
              destructive: true,
              shortcut: this.keys.keysFor('edit.delete'),
              action: () => handlers.deleteSelected(),
              refusal: refusal(remove),
            }),
          ],
        },
      ],
    };
  }

  /** "2 joints · 1 force": only the kinds the selection actually holds. */
  private selectionSubtitle(parts: readonly SelectedPart[]): string {
    const counted: [number, string, string][] = [
      [parts.filter((part) => part instanceof RealJoint).length, 'joint', 'joints'],
      [parts.filter((part) => part instanceof RealLink).length, 'link', 'links'],
      [parts.filter((part) => part instanceof Force).length, 'force', 'forces'],
    ];
    return counted
      .filter(([howMany]) => howMany > 0)
      .map(([howMany, one, many]) => `${howMany} ${howMany === 1 ? one : many}`)
      .join(' · ');
  }

  /**
   * The switches a whole selection carries, in the words one part carries them
   * in.
   *
   * The Edit panel grew these first; a row here that said something else about
   * the same action would be the third place a reader has to learn the rule.
   * Both quote the same model -- `MultiEditService`'s own preflight -- so a
   * grayed row and a refused press give one sentence.
   */
  private selectionStateRows(
    refs: readonly SelectedPartRef[],
    parts: readonly SelectedPart[]
  ): MenuRow[] {
    const joints = parts.filter((part): part is RealJoint => part instanceof RealJoint);
    const links = parts.filter((part): part is RealLink => part instanceof RealLink);
    const rows: MenuRow[] = [];
    const state = (values: readonly boolean[]) => ({
      all: values.every(Boolean),
      mixed: values.some(Boolean) && !values.every(Boolean),
    });
    const said = (refusal: { short: string; message: string } | undefined) =>
      refusal ? { short: refusal.short, long: refusal.message } : undefined;

    if (joints.length === parts.length) {
      const ground = state(
        joints.map((joint) => (this.mechanism.sliderFor(joint)?.ground ?? joint.ground) === true)
      );
      const slider = state(joints.map((joint) => this.gridUtils.isAttachedToSlider(joint)));
      const weld = state(joints.map((joint) => joint.isWelded === true));
      const trace = state(joints.map((joint) => joint.showCurve === true));
      rows.push(
        new MenuRow({
          label: 'Grounded',
          icon: 'add_ground',
          kind: 'toggle',
          checked: ground.all,
          hint: ground.mixed ? 'Mixed' : undefined,
          action: () => this.multiEdit.setGrounded(refs, !ground.all),
        }),
        // Named and grayed rather than left out. A reader who has learned the
        // one-joint menu comes looking for it, and a row that is missing
        // teaches nothing; the machine having exactly one input is the answer.
        new MenuRow({
          label: 'Driven Input',
          icon: 'add_input',
          kind: 'toggle',
          checked: joints.every((joint) => this.gridUtils.isVisuallyInput(joint)),
          refusal: {
            short: 'one input per machine',
            long: 'A machine is driven at one joint, so the input is set on one joint at a time.',
          },
          action: () => undefined,
        }),
        new MenuRow({
          label: 'Slider',
          icon: 'add_slider',
          kind: 'toggle',
          checked: slider.all,
          hint: slider.mixed ? 'Mixed' : undefined,
          refusal: said(this.multiEdit.sliderRefusal(refs, !slider.all)),
          action: () => this.multiEdit.setSlider(refs, !slider.all),
        }),
        new MenuRow({
          label: 'Welded',
          icon: 'weld_joint',
          kind: 'toggle',
          checked: weld.all,
          hint: weld.mixed ? 'Mixed' : undefined,
          refusal: said(this.multiEdit.weldRefusal(refs, !weld.all)),
          action: () => this.multiEdit.setWelded(refs, !weld.all),
        }),
        new MenuRow({
          label: 'Trace Path',
          alwaysAllowed: true,
          icon: 'show_path',
          kind: 'toggle',
          checked: trace.all,
          hint: trace.mixed ? 'Mixed' : undefined,
          action: () => this.multiEdit.setTracePath(refs, !trace.all),
        })
      );
    }

    const forces = parts.filter((part): part is Force => part instanceof Force);
    if (forces.length === parts.length) {
      const global = state(forces.map((force) => !force.local));
      rows.push(
        new MenuRow({
          label: 'Global Frame',
          posePolicy: 'preserve',
          icon: 'public',
          material: true,
          kind: 'toggle',
          checked: global.all,
          hint: global.mixed ? 'Mixed' : undefined,
          action: () => this.multiEdit.setForceFrame(refs, global.all),
        })
      );
    }

    if (links.length === parts.length) {
      const refused = said(this.multiEdit.holdRefusal(refs));
      for (const which of ['length', 'angle'] as const) {
        const held = state(links.map((link) => link.hold === which));
        rows.push(
          new MenuRow({
            label: which === 'length' ? 'Fixed Length' : 'Fixed Angle',
            posePolicy: 'preserve',
            icon: which === 'length' ? 'straighten' : 'architecture',
            material: true,
            kind: 'toggle',
            checked: held.all,
            hint: held.mixed ? 'Mixed' : undefined,
            refusal: refused,
            action: () => this.multiEdit.setHold(refs, held.all ? undefined : which),
          })
        );
      }
    }
    return rows;
  }

  // ------------------------------------------------------------------ grid

  private forGrid(handlers: MenuHandlers): ContextMenuModel {
    const groups: MenuGroup[] = [];
    groups.push({
      label: 'Add',
      rows: [
        new MenuRow({ label: 'Link', icon: 'new_link', action: () => handlers.attachLink() }),
        new MenuRow({
          label: 'Cylinder',
          icon: 'add_cylinder',
          action: () => handlers.attachCylinder(),
        }),
        new MenuRow({
          label: 'Background Image',
          posePolicy: 'preserve',
          icon: 'background_image',
          action: () => handlers.backgroundImage(),
        }),
      ],
    });
    groups.push({ label: 'Mechanism', rows: this.machineRows() });
    groups.push({ rows: this.positionRows(handlers, undefined) });
    if (groups.every((group) => group.rows.length === 0)) return { groups: [] };
    return { header: { title: 'Grid', subtitle: this.gridSubtitle() }, groups };
  }

  // The surface is the grid everywhere else in the app -- the tutorial says
  // "right-click the empty grid", every refusal says grid -- so the header says
  // grid too, and the subtitle no longer has to repeat it.
  private gridSubtitle(): string {
    const counts = this.mechanism.lockCounts();
    if (counts.total === 0) return 'Nothing drawn';
    if (counts.locked === 0) return 'Nothing selected';
    if (counts.locked === counts.total) return `All ${counts.total} parts locked`;
    return `${counts.locked} of ${counts.total} parts locked`;
  }

  /**
   * Lock All and Unlock All, each with its own count.
   *
   * The pair never both gray at once — one of them always has something to do
   * on a drawing that holds anything — so there is always a way out of a
   * fully locked mechanism.
   */
  private machineRows(): MenuRow[] {
    const counts = this.mechanism.lockCounts();
    const lockKey = this.keys.keysFor('edit.lock');
    return [
      new MenuRow({
        label: 'Lock All',
        posePolicy: 'preserve',
        icon: 'lock',
        action: () => this.mechanism.setAllLocks(true),
        hint: counts.open > 0 ? `${counts.open} open` : undefined,
        shortcut: lockKey,
        refusal:
          counts.total === 0
            ? { short: 'nothing to lock', long: 'There is nothing on the grid yet.' }
            : counts.open === 0
              ? { short: 'all locked', long: 'Every part is already locked.' }
              : undefined,
      }),
      new MenuRow({
        label: 'Unlock All',
        posePolicy: 'preserve',
        icon: 'unlock',
        action: () => this.mechanism.setAllLocks(false),
        hint: counts.locked > 0 ? `${counts.locked} locked` : undefined,
        refusal:
          counts.locked === 0 ? { short: 'nothing locked', long: 'No part is locked.' } : undefined,
      }),
    ];
  }

  // --------------------------------------------------------------- position

  /**
   * The synthesis positions, on every menu that can reach them.
   *
   * They are drawn in every mode, because they are a note about what the
   * mechanism was designed to do rather than a part of it — so clearing them
   * is not an edit and does not have to wait for the start pose.
   */
  private positionRows(handlers: MenuHandlers, pose: SynthesisPose | undefined): MenuRow[] {
    const placed = this.synthesis.getAllPoses().length;
    if (placed === 0) return [];
    const rows: MenuRow[] = [];
    if (pose) {
      rows.push(
        new MenuRow({
          label: `Delete Position ${pose.id}`,
          icon: 'remove',
          action: () => handlers.deletePosition(pose.id),
          destructive: true,
          alwaysAllowed: true,
          shortcut: this.keys.keysFor('edit.delete'),
        })
      );
    }
    rows.push(
      new MenuRow({
        label: pose
          ? `Delete All ${placed} Positions`
          : `Delete ${placed} Synthesis ${placed === 1 ? 'Position' : 'Positions'}`,
        icon: 'remove',
        action: () => handlers.deleteAllPositions(),
        destructive: true,
        alwaysAllowed: true,
      })
    );
    return rows;
  }

  private forPose(pose: SynthesisPose, handlers: MenuHandlers): ContextMenuModel {
    const placed = this.synthesis.getAllPoses().length;
    return {
      header: { title: `Position ${pose.id}`, subtitle: `Synthesis · ${placed} placed` },
      groups: [{ rows: this.positionRows(handlers, pose) }],
    };
  }
  // ----------------------------------------------------------------- joint

  private forJoint(joint: Joint, handlers: MenuHandlers): ContextMenuModel {
    const header = {
      title: `Joint ${this.nameOf(joint)}`,
      subtitle: this.jointSubtitle(joint),
      crossing: this.crossing(joint),
    };
    if (!(joint instanceof RealJoint)) return { header, groups: [] };
    const sealed = this.mechanism.cylinderAt(joint);
    return {
      header,
      groups: [
        { label: 'Attach', rows: this.jointAttachRows(joint, handlers) },
        {
          label: 'State',
          rows: this.jointStateRows(joint, sealed),
        },
        { label: 'Traces', rows: [this.traceRow(joint), ...this.vectorRows(joint)] },
        { rows: this.positionRows(handlers, undefined) },
        { rows: [this.deleteJointRow(joint, sealed), this.deleteMechanismRow(joint)] },
      ],
    };
  }

  // Where "Set This Pose as Start" used to be.
  //
  // It was never a fact about whichever joint the pointer happened to be over:
  // what it changes is the machine's *clock*, and the rest of that clock is on
  // the transport. Here it also appeared and vanished on a condition the menu
  // could not explain -- one row above Delete, on whatever the pointer was on.
  // It now lives on the transport row's displacement chip, beside the reading
  // it is about. See `PlaybackBarComponent.moveStartHere`.

  private jointAttachRows(joint: RealJoint, handlers: MenuHandlers): MenuRow[] {
    const driven = this.gridUtils.isVisuallyInput(joint);
    // A third body at a driven joint is what "driven" stops being able to
    // describe: an input prescribes the freedom between *two* bodies.
    const crowds: MenuRefusal | undefined = driven
      ? {
          short: 'it is driven',
          long: 'An input prescribes the freedom between two bodies, so a third arriving here would leave "driven" naming no pair. Remove the input first.',
        }
      : undefined;
    // A Lock is not among the reasons below. It says where this joint is, and a
    // new bar, cylinder or load built onto it moves nothing that is held: the
    // joint keeps its coordinate and the new part is drawn out from it. The
    // rows used to gray anyway, which made the mark mean "nothing may touch
    // this" -- a second rule the padlock never claimed. What still refuses
    // here is what a third body would actually break.
    const rows: MenuRow[] = [
      new MenuRow({
        label: 'Link',
        icon: 'new_link',
        action: () => handlers.attachLink(),
        refusal: crowds,
      }),
    ];
    // Offered on a joint that already carries one: a mount is a pin like any
    // other, and two rams sharing an anchor is an ordinary thing to draw -- a
    // boom lifted by one and curled by another. `dragJoint` already agrees the
    // move between every ram on a shared mount before any of them takes it.
    // What a cylinder's *interior* joints refuse is a third member, and those
    // are not reachable by the pointer.
    {
      rows.push(
        new MenuRow({
          label: 'Cylinder',
          icon: 'add_cylinder',
          action: () => handlers.attachCylinder(),
          // A weld says everything meeting here is one rigid body; a cylinder's
          // joint arriving would be a third body joining that statement without
          // being part of it, and the reconcilers then disagree about what the
          // compound is.
          refusal:
            crowds ??
            (joint.isWelded
              ? {
                  short: 'it is welded',
                  long: 'A weld says the bodies meeting here are one rigid piece. Unweld the joint before attaching a cylinder to it.',
                }
              : undefined),
        })
      );
    }
    // A load has to say which body carries it. At a joint two links share there
    // is no answer, so the row is grayed here and offered on the bar, where the
    // anchor can be placed unambiguously.
    const bars = joint.links.filter((link): link is RealLink => link instanceof RealLink);
    // The block a slider pin rides is a body as much as the bar is: a load put
    // on the pin could be pushing the bar or pushing the block, and the two
    // answer differently. So a slider pin is refused for the same reason two
    // bars meeting are, and sent to the bar.
    const bodiesHere = bars.length + (this.mechanism.sliderFor(joint) ? 1 : 0);
    // On every joint, grayed where it cannot land. The joint menu is one menu:
    // a row that is there on one joint and gone on the next is a row a reader
    // cannot learn the place of, so nothing here comes and goes -- it grays,
    // and says why.
    const bar = bars[0];
    rows.push(
      new MenuRow({
        label: 'Force',
        icon: 'add_force',
        posePolicy: 'attachment',
        poseGuard: () => (bar ? this.attachmentRefusal(bar) : undefined),
        action: () => {
          if (bar) handlers.attachForce(bar);
        },
        refusal: !bar
          ? {
              short: 'not on a link',
              long: 'A load has to have a body to push on, and this joint is on none. Attach a link here first.',
            }
          : bodiesHere > 1
            ? {
                short: bars.length > 1 ? `${bars.length} links share it` : 'a block shares it',
                long: 'A load applied where several bodies meet does not say which one carries it. Attach it to the link instead.',
              }
            : undefined,
      })
    );
    return rows;
  }

  private jointStateRows(joint: RealJoint, sealed: Cylinder | undefined): MenuRow[] {
    const rows: MenuRow[] = [
      new MenuRow({
        label: 'Grounded',
        icon: 'add_ground',
        kind: 'toggle',
        checked: this.groundedNow(joint),
        action: () => this.mechanism.toggleGround(),
      }),
      new MenuRow({
        label: 'Driven Input',
        icon: 'add_input',
        kind: 'toggle',
        checked: this.gridUtils.isVisuallyInput(joint),
        action: () => this.mechanism.adjustInput(),
        refusal: this.inputRefusal(joint),
      }),
    ];
    // Every row below is on every joint. A cylinder's joint used to lose the
    // Slider row and a slider its Weld row -- two menus wearing one name, and
    // a reader who had learned where a row sits finding it gone. They gray
    // now, each with its reason, and the menu is the same shape on every
    // joint. (A joint on a held bar says so in its subtitle, "on fixed AB";
    // the hold itself is released on the bar.)
    const isSlider = this.gridUtils.isAttachedToSlider(joint);
    rows.push(
      new MenuRow({
        label: 'Slider',
        icon: 'add_slider',
        kind: 'toggle',
        checked: isSlider,
        action: () => this.mechanism.toggleSlider(),
        refusal: sealed
          ? {
              short: 'part of a cylinder',
              long: 'A cylinder is one sealed part with a slider of its own inside it, so its joints take no second one. Attach a link here instead.',
            }
          : // A block is a body too, so adding one to a driven pin puts a third
            // at the joint. Taking one away is always allowed.
            !isSlider && this.gridUtils.isVisuallyInput(joint)
            ? {
                short: 'it is driven',
                long: 'A block is a body of its own, so adding one to a driven joint would put three there. Remove the input first.',
              }
            : undefined,
      })
    );
    // The model says whether a weld can stand here -- `weldRefusal` in
    // grid-utils, which is also what the panel quotes -- so the row is offered
    // on a cylinder mount and on the slider itself and refused with the reason,
    // rather than hidden on a rule of the menu's own.
    rows.push(
      new MenuRow({
        label: 'Welded',
        icon: 'weld_joint',
        kind: 'toggle',
        checked: joint.isWelded,
        action: () => this.mechanism.toggleWeldedJoint(),
        refusal: this.gridUtils.weldRefusal(joint),
      })
    );
    rows.push(this.lockRow(joint, joint));
    return rows;
  }

  /** Whether this joint reads as grounded — a slider's ground lives on its guide. */
  private groundedNow(joint: RealJoint): boolean {
    if (this.gridUtils.isAttachedToSlider(joint)) {
      return (this.gridUtils.getSliderJoint(joint) as RealJoint).ground;
    }
    return joint.ground;
  }

  /** Why this joint will not take an input, in the model's own words. */
  private inputRefusal(joint: RealJoint): MenuRefusal | undefined {
    if (this.gridUtils.canToggleInput(joint)) return undefined;
    const driven = this.gridUtils.isAttachedToSlider(joint)
      ? (this.gridUtils.getSliderJoint(joint) as RealJoint)
      : joint;
    return describeActuatorRefusal(driven);
  }

  /**
   * The trace switch: a view of the mechanism rather than a part of it, so it
   * stays live in every drawing mode while paused.
   *
   * Turning one on turns the global switch on with it. A per-joint trace that
   * draws nothing because the view control is off is a switch that lies.
   */
  private traceRow(joint: RealJoint): MenuRow {
    return new MenuRow({
      label: 'Trace path',
      icon: 'show_path',
      kind: 'toggle',
      checked: this.gridUtils.getJointShowCurve(joint),
      alwaysAllowed: true,
      action: () => {
        this.gridUtils.toggleCurve(joint);
        if (!this.settings.isShowTraces.value) this.settings.isShowTraces.next(true);
      },
    });
  }

  /**
   * The vector switches: which way this part's velocity, acceleration or the
   * force it carries points, drawn on the mechanism itself.
   *
   * These are available in every drawing mode. Reactions belong to joints,
   * so a link offers only velocity and acceleration at its center of mass.
   */
  private vectorRows(part: RealJoint | RealLink): MenuRow[] {
    const quantities: VectorQuantity[] = ['velocity', 'acceleration'];
    if (part instanceof RealJoint) quantities.push('force');
    return quantities.map((quantity) => this.vectorRow(part, quantity));
  }

  private vectorRow(part: RealJoint | RealLink, quantity: VectorQuantity): MenuRow {
    return new MenuRow({
      label: VECTOR_LABEL[quantity],
      icon: VECTOR_ICON[quantity],
      kind: 'toggle',
      checked: this.mechanism.isVectorTraceOn(part, quantity),
      // A view of the mechanism rather than a change to it, like the trace
      // beside it: it stays live at a paused mid-cycle pose.
      alwaysAllowed: true,
      action: () => this.mechanism.toggleVectorTrace(part, quantity),
      // The machine's own readiness first: on one that does not solve there is
      // no cycle to take a vector from, and "one part meets it" would send the
      // reader to fix the wrong thing.
      refusal: this.analysisRefusal(part) ?? this.mechanism.vectorTraceRefusal(part, quantity),
    });
  }

  private deleteJointRow(joint: RealJoint, sealed: Cylinder | undefined): MenuRow {
    // The cascade is named, not confirmed: a cylinder's joint takes the whole
    // assembly, and an ordinary one takes any bar left with a single end. The
    // row says which, before the click rather than after it.
    //
    // A lock does not gray this. It holds the joint where it is, and a part
    // that is going does not need holding -- see `isLockedTarget`.
    const label = this.deleteJointLabel(joint, sealed);
    return new MenuRow({
      label,
      posePolicy: this.mechanism.canDeleteTracerAtPose(joint) ? 'attachment' : 'start',
      poseGuard: () =>
        this.mechanism.canDeleteTracerAtPose(joint)
          ? undefined
          : {
              short: 'return to the start',
              long: 'This joint constrains the mechanism. Return to the start before deleting it.',
            },
      icon: 'remove',
      destructive: true,
      shortcut: this.keys.keysFor('edit.delete'),
      action: () => this.mechanism.deleteJoint(),
    });
  }

  private deleteJointLabel(joint: RealJoint, sealed: Cylinder | undefined): string {
    // A slider's block is not named: it is drawn *on* this joint rather than
    // beside it, so "and the block at C" describes no second thing the reader
    // can see going. Nor are a cylinder's own members, which the word
    // "cylinder" already covers -- what is left is the neighboring bar the
    // mount was also holding, and that one the reader has to be told about.
    const inside = new Set<string>(
      sealed ? [sealed.barrel.id, sealed.rod.id, sealed.block.id] : []
    );
    const doomed = this.mechanism
      .linksRemovedByDeleting(joint)
      .filter((link) => !(link instanceof SliderBlock) && !inside.has(link.id));
    // The thing named goes; what goes with it is in brackets, so the row reads
    // as one action with a consequence rather than a list of three things.
    //
    // One casualty is named, several are counted. "and Links AB, BG, BH" was
    // already the widest row in the menu at three, and a joint on a plate can
    // take more -- the menu grew to fit the sentence and pushed everything else
    // out of reach of the pointer.
    const also = this.casualties(doomed, 'link');
    if (!sealed) {
      return also ? `Delete Joint (and ${also})` : 'Delete Joint';
    }
    return also ? `Delete Joint (and Cylinder, ${also})` : 'Delete Joint (and Cylinder)';
  }

  /**
   * "Link AB" for one, "3 links" for more -- what a delete takes with it.
   *
   * A cylinder among the casualties keeps its own word, because "2 links" for
   * a bar and a ram would be wrong about one of them.
   */
  private casualties(bodies: readonly (Link | Joint)[], kind: 'link' | 'joint'): string {
    if (bodies.length === 0) return '';
    if (bodies.length === 1) {
      const one = bodies[0];
      return one instanceof Joint
        ? `Joint ${this.nameOf(one)}`
        : labelForBody(one, this.mechanism.cylinderAt(one));
    }
    return `${bodies.length} ${kind}s`;
  }

  private jointSubtitle(joint: Joint): string {
    const sealed = this.mechanism.cylinderAt(joint);
    if (sealed) {
      const end = joint.id === sealed.rodFar.id ? 'Rod joint' : 'Barrel joint';
      return `${end} · ${this.cylinderName(sealed)}`;
    }
    const bodies = joint instanceof RealJoint ? joint.links : [];
    const holding = heldBarsAt(joint, this.mechanism.links, this.mechanism.sealedStructures());
    const held =
      holding.length > 0
        ? ` · on fixed ${holding.map((bar) => bar.name || bar.id).join(', ')}`
        : '';
    return `${this.jointKind(joint, bodies)} · ${this.bodyList(bodies)}${held}`;
  }

  /**
   * What kind of joint this is, in one word.
   *
   * Ordered by how much the word tells a reader: a driven joint is a driven
   * joint whether or not it is also grounded, and "tracer" is only true of a
   * free point on a single body — a ground pivot with one link is not one.
   */
  private jointKind(joint: Joint, bodies: Link[]): string {
    if (joint instanceof PrisJoint) return 'Slider';
    if (this.gridUtils.isAttachedToSlider(joint)) return 'Slider pin';
    if (joint instanceof RealJoint && joint.isWelded) return 'Welded';
    if (joint instanceof RealJoint && joint.input) return 'Driven pin';
    if (joint instanceof RealJoint && joint.ground) return 'Ground pin';
    if (bodies.length === 1) return 'Tracer';
    return 'Pin';
  }

  /**
   * The bodies a joint is on: "Links OA, ACT", or their own names where a
   * cylinder part or a block is among them and "Link" would be a lie.
   */
  private bodyList(bodies: Link[]): string {
    if (bodies.length === 0) return 'not on a link';
    const labels = bodies.map((link) => labelForBody(link, this.mechanism.cylinderAt(link)));
    const plain = labels.every((label) => label.startsWith('Link '));
    if (!plain) return labels.join(', ');
    const names = labels.map((label) => label.slice('Link '.length));
    return `${names.length === 1 ? 'Link' : 'Links'} ${names.join(', ')}`;
  }

  // ------------------------------------------------------------------ link

  private forLink(link: Link, handlers: MenuHandlers): ContextMenuModel {
    const sealed = this.mechanism.cylinderAt(link);
    const header = {
      title: sealed ? this.cylinderName(sealed) : labelForBody(link, undefined),
      subtitle: this.linkSubtitle(link, sealed),
      crossing: this.crossing(link),
    };
    if (sealed) {
      // No Attach group at all: a sealed assembly takes no third body, and a
      // copy of one would land a second cylinder on the same joints.
      return {
        header,
        groups: [
          {
            label: 'State',
            rows: [
              new MenuRow({
                label: 'Driven Input',
                icon: 'add_input',
                kind: 'toggle',
                checked: sealed.slider.input,
                action: () => this.mechanism.toggleCylinderInput(sealed),
              }),
              ...this.cylinderHoldRows(link as RealLink),
              this.lockRow(link as RealLink, undefined),
            ],
          },
          { label: 'Traces', rows: this.vectorRows(link as RealLink) },
          {
            rows: [
              new MenuRow({
                label: 'Delete Cylinder',
                icon: 'remove',
                destructive: true,
                shortcut: this.keys.keysFor('edit.delete'),
                action: () => this.mechanism.deleteCylinder(sealed),
              }),
              this.deleteMechanismRow(link),
            ],
          },
        ],
      };
    }
    // A slider's block is a body in the model and not one on the drawing: it
    // has no bar to attach to and no disc to be drawn as, and the pin sitting
    // on top of it is what a reader can see and click. Not reachable by
    // pointer -- the block's hitbox hands back its pin -- but the builder
    // takes any Link, and one that throws on a shape it was handed is worse
    // than one that says little.
    if (!(link instanceof RealLink)) {
      return { header, groups: [{ rows: this.positionRows(handlers, undefined) }] };
    }
    const bar = link;
    return {
      header,
      groups: [
        { label: 'Attach', rows: this.linkAttachRows(bar, handlers) },
        { label: 'State', rows: this.linkStateRows(bar) },
        { label: 'Traces', rows: this.vectorRows(bar) },
        { rows: this.positionRows(handlers, undefined) },
        { rows: [this.deleteLinkRow(bar), this.deleteMechanismRow(bar)] },
      ],
    };
  }

  private linkAttachRows(link: RealLink, handlers: MenuHandlers): MenuRow[] {
    // A welded compound is several links; clicking its fillet rather than one
    // of them says which body the new member should join.
    const fillet: MenuRefusal | undefined =
      link.isWelded && link.lastSelectedSublink == null
        ? {
            short: 'pick a sub-link',
            long: 'This is a welded compound. Click one of the links it is made of, so the new member knows which body it joins.',
          }
        : undefined;
    // A lock holds the link where it is, and attaching a new part to it moves
    // nothing that is held -- the new link, block, tracer or force is built
    // onto the link as it stands. So the lock refuses none of these.
    const rows = [
      new MenuRow({
        label: 'Link',
        icon: 'new_link',
        action: () => handlers.attachLink(),
        refusal: fillet,
      }),
      new MenuRow({
        label: 'Cylinder',
        icon: 'add_cylinder',
        action: () => handlers.attachCylinder(),
        refusal: fillet,
      }),
      new MenuRow({
        label: 'Tracer Point',
        posePolicy: 'attachment',
        poseGuard: () => this.attachmentRefusal(link),
        icon: 'add_tracer',
        action: () => handlers.attachTracerPoint(),
        refusal: fillet,
      }),
      new MenuRow({
        label: 'Force',
        icon: 'add_force',
        posePolicy: 'attachment',
        poseGuard: () => this.attachmentRefusal(link),
        action: () => handlers.attachForce(link),
        refusal: fillet,
      }),
    ];
    rows.push(
      new MenuRow({
        label: 'Duplicate Link',
        icon: 'content_copy',
        material: true,
        action: () => this.mechanism.duplicateLink(link),
        tip: 'Set a free-standing copy of this link down beside it.',
        // A welded compound is several links and the welds between them, so
        // there is no single link for this to copy. Grayed rather than
        // hidden: copying one is a thing a reader can reasonably expect, and
        // the row says which link to ask instead.
        refusal: this.mechanism.canDuplicate(link)
          ? undefined
          : {
              short: 'welded compound',
              long: 'This is several links welded together. Copy one of the links it is made of instead.',
            },
      })
    );
    return rows;
  }

  private linkStateRows(link: RealLink): MenuRow[] {
    return [
      new MenuRow({
        label: 'Drawn as a Disc',
        posePolicy: 'preserve',
        icon: 'make_circular',
        kind: 'toggle',
        checked: link.isCircle,
        action: () => this.mechanism.toggleLinkCircular(),
        // Only where there is a fixed pin to draw the disc about — a crank.
        refusal: link.canBeCircular()
          ? undefined
          : {
              short: 'needs a fixed pin',
              long: 'A disc is the shape a link sweeps about a fixed pin, and this link turns about none.',
            },
      }),
      ...this.holdRows(link),
      this.lockRow(link, undefined),
    ];
  }

  /**
   * Fixed Length and Fixed Angle: the two numbers a bar can hold against
   * edits. Each row carries the value it would hold, so what is held is what
   * is named. A link holds one or the other -- both is what Lock means -- so
   * the row for the other says it moves the hold rather than adding one, and
   * a locked link, which already holds both, offers neither.
   */
  /**
   * A cylinder holds the direction it points in, the way a bar holds its angle.
   *
   * Only the angle. The distance between a cylinder's mounts is its stroke,
   * which is the quantity its drive moves, so a hold on that would be a hold
   * against the drive rather than a constraint on the drawing -- which is why
   * this is one row where the bar's pair is two.
   */
  private cylinderHoldRows(link: RealLink): MenuRow[] {
    const on = this.mechanism.holdOf(link) === 'angle';
    return [
      new MenuRow({
        label: 'Fixed Angle',
        posePolicy: 'preserve',
        icon: 'architecture',
        material: true,
        kind: 'toggle',
        checked: on,
        hint: on ? undefined : this.cylinderAngle(link),
        action: () => this.mechanism.setHold(link, on ? undefined : 'angle'),
        refusal: this.mechanism.isLockedTarget(link)
          ? { short: 'locked in place', long: 'Locked in place already holds the angle.' }
          : undefined,
        tip: 'Hold this cylinder at the angle it points now. Dragging a mount slides it along that line.',
      }),
    ];
  }

  /** A cylinder's bearing, mount to mount -- the number the row would hold. */
  private cylinderAngle(link: RealLink): string {
    const sealed = this.mechanism.cylinderOfLink(link);
    if (!sealed) return '';
    const degrees =
      (Math.atan2(sealed.rodFar.y - sealed.barrelFar.y, sealed.rodFar.x - sealed.barrelFar.x) *
        180) /
      Math.PI;
    return this.nup.formatValueAndUnit(
      this.nup.convertAngle(degrees, AngleUnit.DEGREE, this.settings.angleUnit.getValue()),
      this.settings.angleUnit.getValue()
    );
  }

  private holdRows(link: RealLink): MenuRow[] {
    const refusal: MenuRefusal | undefined = !holdableBar(link)
      ? {
          short: 'bars only',
          long: 'Only a bar between two joints has one length and one angle to hold.',
        }
      : this.mechanism.isLockedTarget(link)
        ? {
            short: 'locked in place',
            long: 'Locked in place already holds the length and the angle.',
          }
        : undefined;
    const held = holdOf(link);
    const row = (
      hold: Exclude<LinkHold, undefined>,
      label: string,
      icon: string,
      value: string
    ) => {
      const on = held === hold;
      const moves = !on && held !== undefined;
      return new MenuRow({
        label,
        posePolicy: 'preserve',
        icon,
        material: true,
        kind: 'toggle',
        checked: on,
        action: () => this.mechanism.setHold(link, on ? undefined : hold),
        refusal,
        // Never the word "lock" here: this row sits directly above the Locked
        // row, which is the joint mark and a different rule. A bar keeps one
        // value or the other fixed; a Lock holds a part where it is.
        hint: on ? undefined : moves ? 'moves the fix' : value,
        tip: moves
          ? 'A link fixes one or the other, never both. Choosing this releases the one already fixed.'
          : hold === 'length'
            ? 'Fix this link at its current length. Dragging either joint slides it on the arc about the other.'
            : 'Fix this link at its current angle from the grid. Dragging either joint slides it along that line.',
      });
    };
    return [
      row('length', 'Fixed Length', 'straighten', this.lengthOf(link)),
      row('angle', 'Fixed Angle', 'architecture', this.angleOf(link)),
    ];
  }

  private lengthOf(link: RealLink): string {
    const [a, b] = link.joints;
    if (!a || !b) return '';
    return this.nup.formatModelLength(
      Math.hypot(b.x - a.x, b.y - a.y),
      this.settings.lengthUnit.getValue()
    );
  }

  private angleOf(link: RealLink): string {
    const [a, b] = link.joints;
    if (!a || !b) return '';
    // Signed, as the panel's field reads it, so the row names the number the
    // field will show once the angle is locked.
    const degrees = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    return this.nup.formatValueAndUnit(
      this.nup.convertAngle(degrees, AngleUnit.DEGREE, this.settings.angleUnit.getValue()),
      this.settings.angleUnit.getValue()
    );
  }

  private deleteLinkRow(link: RealLink): MenuRow {
    // Deleting a link sweeps up the joints no other link holds. The row counts
    // them and names them rather than opening a dialog after the click.
    const orphans = this.mechanism.jointsOrphanedByDeleting(link);
    // Bracketed, like the joint row's cascade above: the thing named goes,
    // and what goes with it is the consequence rather than a second item in a
    // list. Both rows read the same way round, and both count past one.
    const also = this.casualties(orphans, 'joint');
    const label = also ? `Delete Link (and ${also})` : 'Delete Link';
    return new MenuRow({
      label,
      icon: 'remove',
      destructive: true,
      shortcut: this.keys.keysFor('edit.delete'),
      action: () => this.mechanism.deleteLink(),
    });
  }

  private linkSubtitle(link: Link, sealed: Cylinder | undefined): string {
    // A slider's block has no subsets and no bar to describe.
    if (!sealed && !(link instanceof RealLink)) {
      const joints = link.joints.map((joint) => this.nameOf(joint)).join(', ');
      return `Block · Joints ${joints}`;
    }
    // Not "sealed assembly": to a reader a cylinder is one part, and how it
    // is built out of a slider and a weld underneath is not their business.
    if (sealed) {
      const ends = [sealed.barrelFar, sealed.rodFar].map((joint) => this.nameOf(joint));
      return `Barrel and rod · Joints ${ends.join(', ')}`;
    }
    const bar = link as RealLink;
    // "Bar" is only true of two joints. Past that the link is drawn as a filled
    // shape and behaves as one rigid body carrying three or more pins, so it is
    // called what it is rather than what the two-joint case is called.
    const kind = bar.subset.length > 0 ? 'Compound' : bar.joints.length > 2 ? 'Body' : 'Bar';
    const joints = bar.joints.map((joint) => this.nameOf(joint)).join(', ');
    const locked = this.mechanism.isLockedTarget(bar) ? ' · locked' : '';
    const held = !locked && holdOf(bar) ? ` · fixed ${holdOf(bar)}` : '';
    return `${kind} · Joints ${joints}${locked}${held}`;
  }

  // ----------------------------------------------------------------- force

  private forForce(force: Force): ContextMenuModel {
    const header = {
      title: `Force ${force.name || force.id}`,
      subtitle: `On ${labelForBody(force.link, undefined)} · ${force.local ? 'local' : 'global'} frame`,
      crossing: this.crossing(force),
    };
    return {
      header,
      groups: [
        {
          label: 'Set',
          rows: [
            new MenuRow({
              label: 'Reverse Direction',
              posePolicy: 'attachment',
              poseGuard: () => this.attachmentRefusal(force.link),
              refusal: force.locked
                ? {
                    short: 'locked direction',
                    long: 'Unlock this force before changing its direction.',
                  }
                : undefined,
              icon: 'switch_force_dir',
              // A property of the force, not of the linkage's shape.
              action: () => {
                if (!force.locked) this.mechanism.changeForceDirection();
              },
            }),
          ],
        },
        {
          label: 'State',
          rows: [
            // "Make Force Global" was a verb whose label flipped as it was
            // used. The frame is a state, so it reads as one.
            new MenuRow({
              label: 'Global Frame',
              posePolicy: 'attachment',
              poseGuard: () => this.attachmentRefusal(force.link),
              // The app's own force_global glyph carries its own colors, so
              // it stays blue on an unticked row and reads as already on --
              // the one icon in the menu that does not take the row's color.
              icon: 'public',
              material: true,
              kind: 'toggle',
              checked: !force.local,
              // The service maps a local direction back into the authored body frame.
              action: () => this.mechanism.changeForceLocal(),
            }),
            this.lockRow(force, undefined),
          ],
        },
        {
          rows: [
            new MenuRow({
              label: 'Delete Force',
              posePolicy: 'preserve',
              icon: 'remove',
              destructive: true,
              shortcut: this.keys.keysFor('edit.delete'),
              action: () => this.mechanism.deleteForce(force),
            }),
          ],
        },
      ],
    };
  }

  // ------------------------------------------------------------- mechanism

  /**
   * The whole machine this part belongs to, gone.
   *
   * The panel that owns a selected mechanism has offered this all along; the
   * menu offers it on any part of one, because "delete this mechanism" is a
   * thing a reader wants while pointing at the bar they are looking at rather
   * than after selecting the machine. Both call the same service method.
   *
   * The cascade is named before the click, as every other delete row here
   * names its own: the machine's letter and how many joints go with it. It
   * passes locks by — see `MechanismService.deleteMechanism` — so the row says
   * so rather than letting a reader find out afterwards.
   */
  private deleteMechanismRow(part: Joint | Link): MenuRow {
    const index = this.mechanism.indexOfMechanismContaining(part);
    const partition = index === -1 ? undefined : this.mechanism.partitions[index];
    // Named only where there is more than one machine: "M1" on a drawing
    // holding exactly one says nothing the reader did not know.
    const named = this.mechanism.partitions.length > 1 && partition ? ` ${partition.id}` : '';
    const joints = partition?.ownJoints.length ?? 0;
    return new MenuRow({
      // Named and marked apart from the row above it. Both were "remove" in
      // red, one line apart, and the one that takes the whole machine was
      // being pressed by hand aiming for the one that takes a part. "Entire"
      // is the word doing the work, and a different glyph is what a reader
      // moving quickly actually reads.
      label: `Delete entire mechanism${named}`,
      // A ternary body with the trash as its badge: the same trash as the row
      // above, behind something that is more than one link, so a reader
      // moving quickly reads the difference before the word "entire".
      icon: 'delete_mechanism',
      destructive: true,
      hint: joints > 0 ? `${joints} ${joints === 1 ? 'joint' : 'joints'}` : undefined,
      tip: 'Deletes the whole mechanism this part belongs to — every joint, link and force in it.',
      action: () => this.mechanism.deleteMechanism(index),
      refusal: partition
        ? undefined
        : {
            short: 'not in a mechanism',
            long: 'This part is not joined into a mechanism, so there is no mechanism here to delete. Delete the part itself.',
          },
    });
  }

  // ----------------------------------------------------------------- locks

  private lockRow(target: RealJoint | RealLink | Force, joint: RealJoint | undefined): MenuRow {
    const locked = this.mechanism.isLockedTarget(target);
    // A joint can be held still without carrying a mark of its own: the marks
    // on its neighbors close over it. The switch says so and names them,
    // because the fix is on them rather than here.
    const held = joint && !locked ? this.heldRefusal(joint) : undefined;
    return new MenuRow({
      label: 'Locked',
      posePolicy: 'preserve',
      icon: 'lock',
      kind: 'toggle',
      checked: locked || !!held,
      shortcut: this.keys.keysFor('edit.lock'),
      action: () => this.mechanism.toggleLock(target),
      refusal: held,
    });
  }

  /** The marks that hold this joint still, when none of them is its own. */
  private heldRefusal(joint: RealJoint): MenuRefusal | undefined {
    if (this.mechanism.isLockedTarget(joint)) return undefined;
    const holders = this.gridUtils.locksHolding(joint);
    if (holders.length === 0) return undefined;
    const named = holders.map((held) => this.nameOf(held as Joint | Force)).join(', ');
    return {
      short: `held by ${named}`,
      long: `${holders.length === 1 ? 'A lock' : 'Locks'} on ${named} ${holders.length === 1 ? 'holds' : 'hold'} this joint still. Unlock ${holders.length === 1 ? 'it' : 'them'} to move it.`,
    };
  }

  // ---------------------------------------------------------------- shared

  /**
   * The way into the other mode, as one icon beside the target's name.
   *
   * A row of its own would cost height on every menu; this costs none. In the
   * analysis modes it goes back to Edit, which is where the geometry can be
   * changed; in Edit it goes to Kinematic Analysis, and grays with the
   * readiness reason when there is nothing that can be analyzed yet.
   */
  private crossing(part: Joint | Link | Force) {
    if (this.tabs.isAnalysisMode()) {
      return {
        icon: 'edit_outline',
        tip: this.keys.tip('Edit', 'mode.edit'),
        action: () => this.tabs.setTab(TabID.EDIT),
      };
    }
    return {
      icon: 'query_stats',
      material: true,
      tip: this.keys.tip('Kinematic Analysis', 'mode.kinematic'),
      action: () => this.tabs.setTab(TabID.ANALYZE),
      refusal: this.analysisRefusal(part),
    };
  }

  /**
   * Why *this part* cannot be analyzed — its own machine's answer, not the
   * drawing's.
   *
   * A grid can hold a four-bar that runs beside a half-drawn chain that does
   * not, and asking "is anything here analyzable" would offer the crossing
   * from the half-drawn one on the strength of the four-bar next to it. The
   * modes themselves would then gray that part out on arrival, which is an
   * offer taken back after it was accepted.
   */
  private analysisRefusal(part: Joint | Link | Force): MenuRefusal | undefined {
    if (this.mechanism.isPartSimulatable(part)) return undefined;
    const readiness = this.mechanism.readinessOfPart(part);
    if (!readiness) {
      return {
        short: 'not in a mechanism',
        long: 'This part is not joined into a mechanism that can be analyzed. Connect it to a grounded chain.',
      };
    }
    const several = this.mechanism.partitions.length > 1;
    const blocker = readiness.checks.find((check) => check.state === 'blocker');
    return {
      // Named when there is more than one machine on the grid: "not ready" on
      // a drawing holding two of them does not say which one is meant.
      short: several ? `${readiness.id} is not ready` : 'not ready',
      long: blocker
        ? `${blocker.title}. ${blocker.body}`
        : `${several ? readiness.id : 'This mechanism'} cannot be analyzed yet.`,
    };
  }

  /** Attaching needs a known rigid-body transform between this pose and t=0. */
  private attachmentRefusal(link: RealLink): MenuRefusal | undefined {
    return this.mechanism.canAttachAtPose(link)
      ? undefined
      : {
          short: 'return to the start',
          long: 'This body has no reliable mapping to its start pose. Return to the start to attach a point or force.',
        };
  }

  private rowPoseRefusal(row: MenuRow): MenuRefusal | null {
    return (
      this.permission.menuRefusal(row.alwaysAllowed ? 'view' : row.posePolicy) ??
      (!this.mechanism.isAtStartPose() ? (row.poseGuard?.() ?? null) : null)
    );
  }

  /** Apply the same pose-preservation rules in every mode, including at activation. */
  private freezeWhileRunning(model: ContextMenuModel): ContextMenuModel {
    for (const group of model.groups) {
      for (const row of group.rows) {
        const refusal = this.rowPoseRefusal(row);
        if (refusal && !row.refusal) row.refusal = refusal;
        const action = row.action;
        // A menu can remain open across a keyboard seek/play. Recheck rather
        // than trusting the state captured when the pointer opened it.
        row.action = () => {
          if (!this.rowPoseRefusal(row)) action();
        };
      }
    }
    return model;
  }

  private nameOf(part: Joint | Force): string {
    return (part as { name?: string }).name || part.id;
  }

  private cylinderName(sealed: Cylinder): string {
    return `Cylinder ${this.nameOf(sealed.barrelFar)}${this.nameOf(sealed.rodFar)}`;
  }
}
