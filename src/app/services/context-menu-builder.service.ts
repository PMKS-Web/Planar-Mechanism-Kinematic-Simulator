import { Injectable, inject } from '@angular/core';
import { NumberUnitParserService } from './number-unit-parser.service';
import { AngleUnit } from '../model/utils';
import { heldBarsAt, holdOf, holdableBar } from '../model/link-holds';
import { LinkHold } from '../model/link';
import {
  ContextMenuModel,
  MenuChoice,
  MenuGroup,
  MenuRefusal,
  MenuRow,
} from '../component/BLOCKS/context-menu/menu-model';
import { JOINT_TYPES, JointType, JointTypeChoice, NOWHERE_TO_SLIDE } from '../model/joint-type';
import { Joint, PrisJoint, RealJoint } from '../model/joint';
import { Link, RealLink } from '../model/link';
import { Force } from '../model/force';
import { SynthesisPose } from './synthesis/synthesis-util';
import { Cylinder } from '../model/cylinder';
import { labelForBody } from '../model/body-label';
import { describeActuatorRefusal } from '../model/actuator';
import { OperationRefusal, refuseAttach } from '../model/joint-operation-permission';
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
import { JointTypeService } from './joint-type.service';

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
 * that enforces it — `describeActuator` for a driven joint, `refuseJointType`
 * for a type, `locksHolding` for a lock — rather than written out again here, so the
 * three surfaces cannot end up disagreeing about what is possible.
 *
 * The shape is a fixed ladder in every case: Attach, State, Machine, and a
 * destructive footer. Groups drop out when they are empty and never reorder,
 * so the flick to Delete lands on the last row whether the menu holds two rows
 * or twelve.
 */
/** One of the four switches the analysis panel draws under its graphs. */
export interface DrawingSwitch {
  key: 'traces' | 'velocity' | 'force' | 'acceleration';
  row: MenuRow;
  /** What the switch draws, for the help icon beside an available one. */
  help: string;
}

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
  private jointTypes = inject(JointTypeService);

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
      choice: this.selectionJointTypeChoice(refs),
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
      choice: this.jointTypeChoice(joint),
      groups: [
        { label: 'Attach', rows: this.jointAttachRows(joint, handlers) },
        {
          label: 'State',
          rows: this.jointStateRows(joint),
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
    const drivenCrowds: MenuRefusal | undefined = driven
      ? {
          short: 'it is driven',
          long: 'An input prescribes the freedom between two bodies, so a third arriving here would leave "driven" naming no pair. Remove the input first.',
        }
      : undefined;
    // The joint a cylinder slides on takes nothing at all, in the same four
    // words the model's other four refusals use there (D9). First, because a
    // reader pointing at the square wants to be told what the square is before
    // being told about the input it happens to be carrying.
    const closed = this.quote(refuseAttach(joint, this.gridUtils.operationContext()));
    const crowds = closed ?? drivenCrowds;
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
          // A weld used to veto this here, on the grounds that a cylinder's
          // joint arriving would be a third body inside one rigid statement.
          // It joins that body instead, which `createCylinderFrom` has allowed
          // since the mount boundary came off -- so the row was graying itself
          // for a rule nothing enforced any more, and telling the reader to
          // unweld first to do something they could already do.
          refusal: crowds,
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
        refusal:
          closed ??
          (!bar
            ? {
                short: 'not on a link',
                long: 'A load has to have a body to push on, and this joint is on none. Attach a link here first.',
              }
            : bodiesHere > 1
              ? {
                  short: bars.length > 1 ? `${bars.length} links share it` : 'a block shares it',
                  long: 'A load applied where several bodies meet does not say which one carries it. Attach it to the link instead.',
                }
              : undefined),
      })
    );
    return rows;
  }

  private jointStateRows(joint: RealJoint): MenuRow[] {
    const rows: MenuRow[] = [
      new MenuRow({
        label: 'Grounded',
        icon: 'add_ground',
        kind: 'toggle',
        checked: this.groundedNow(joint),
        action: () => this.mechanism.toggleGround(),
        // A cylinder is bolted to the world at the joints at its two ends, so
        // the one in the middle of it says where to go instead. Named and
        // grayed rather than left off the card: D9 drew it as a missing row,
        // and a row that is there on one joint and gone on the next is a row
        // a reader cannot learn the place of.
        refusal: this.quote(this.gridUtils.groundRefusal(joint)),
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
    // Slider and Welded were rows here. They are two facts about one thing --
    // what kind of joint this is -- so they are the choice at the top of the
    // card now, where all four values are visible at once and each carries its
    // own refusal (D8). (A joint on a held bar says so in its subtitle, "on
    // fixed AB"; the hold itself is released on the bar.)
    rows.push(this.lockRow(joint, joint));
    return rows;
  }

  /**
   * The four things a joint can be, as the card's top block.
   *
   * Every value, its glyph and its refusal come from `JointTypeService`, which
   * is what the Edit panel draws from as well -- so a value the panel grays is
   * one the menu grays, in the same words.
   */
  private jointTypeChoice(joint: RealJoint): MenuChoice {
    return this.choiceFrom(this.jointTypes.choiceFor(joint), (type) =>
      this.jointTypes.set(joint, type)
    );
  }

  /** The same choice for a whole selection of joints, refused as a group. */
  private selectionJointTypeChoice(refs: readonly SelectedPartRef[]): MenuChoice | undefined {
    const choice = this.multiEdit.jointTypeChoice(refs);
    return choice
      ? this.choiceFrom(choice, (type) => this.multiEdit.setJointType(refs, type))
      : undefined;
  }

  private choiceFrom(choice: JointTypeChoice, act: (type: JointType) => void): MenuChoice {
    return {
      label: 'Joint Type',
      chosen: choice.chosen,
      // The Edit panel gates this same named control on `may('structure')`, and
      // `JointTypeService.set` stages through `capturingPose` the way welding
      // does, so a paused Edit pose re-anchors correctly (`joint-type.mjs` §4).
      // Asking anything narrower here would gray on the card what is live in
      // the panel, for one control with one name.
      posePolicy: 'structure',
      // The one thing about a slot the drawing cannot show, said on the chosen
      // value's hover rather than printed under the grid.
      fault: choice.invalid
        ? {
            short: 'nowhere to slide',
            long: `${NOWHERE_TO_SLIDE.lead} ${NOWHERE_TO_SLIDE.sentence}`,
          }
        : undefined,
      options: JOINT_TYPES.map((type, index) => ({
        label: choice.labels[index],
        icon: choice.icons[index],
        refusal: choice.refusals[index],
        action: () => act(type),
      })),
    };
  }

  /**
   * Whether this joint reads as grounded.
   *
   * Its own flag. A slider's ground is its guide's, and the guide used to be a
   * prismatic joint beside the pin this menu was built for -- so this had to hop
   * to it. One joint is both now.
   */
  private groundedNow(joint: RealJoint): boolean {
    return joint.ground;
  }

  /** Why this joint will not take an input, in the model's own words. */
  private inputRefusal(joint: RealJoint): MenuRefusal | undefined {
    if (this.gridUtils.canToggleInput(joint)) return undefined;
    return describeActuatorRefusal(joint);
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
      refusal: this.vectorSwitchRefusal(part, quantity),
    });
  }

  /**
   * Why this part's vector switch is grayed, if it is.
   *
   * The machine's own readiness first: on one that does not solve there is
   * no cycle to take a vector from, and "one part meets it" would send the
   * reader to fix the wrong thing. One answer for the menu's row and the
   * analysis panel's switch, so the two cannot disagree.
   */
  vectorSwitchRefusal(
    part: RealJoint | RealLink,
    quantity: VectorQuantity
  ): MenuRefusal | undefined {
    return this.analysisRefusal(part) ?? this.mechanism.vectorTraceRefusal(part, quantity);
  }

  /**
   * The switches the analysis panel offers under its graphs: the part's own
   * Traces rows, in the menu's order and with the menu's refusals, so a
   * switch the panel grays is one the menu grays. A link has no path of its
   * own to trace and carries its reactions at its joints, so the menu leaves
   * those two rows off a link; the panel keeps every switch in its place and
   * says why instead, because a switch that comes and goes with the
   * selection is harder to find than one that is there and gray.
   */
  drawingSwitches(part: RealJoint | RealLink): DrawingSwitch[] {
    const jointsOnly = (what: string): MenuRefusal => ({
      short: 'joints only',
      long: `${what} Pick one of this link’s joints.`,
    });
    const trace =
      part instanceof RealJoint
        ? this.traceRow(part)
        : new MenuRow({
            label: 'Trace path',
            icon: 'show_path',
            kind: 'toggle',
            action: () => undefined,
            refusal: jointsOnly('A path is traced by a joint.'),
          });
    const vector = (quantity: VectorQuantity): MenuRow =>
      part instanceof RealJoint || quantity !== 'force'
        ? this.vectorRow(part, quantity)
        : new MenuRow({
            label: VECTOR_LABEL[quantity],
            icon: VECTOR_ICON[quantity],
            kind: 'toggle',
            action: () => undefined,
            refusal: jointsOnly('A reaction is carried at a joint.'),
          });
    return [
      { key: 'traces', row: trace, help: 'Draws the path this joint follows through the cycle.' },
      {
        key: 'velocity',
        row: vector('velocity'),
        help: 'Draws which way this part is moving, and how fast, along its path.',
      },
      {
        key: 'acceleration',
        row: vector('acceleration'),
        help: 'Draws which way this part’s velocity is changing, along its path.',
      },
      {
        key: 'force',
        row: vector('force'),
        help: 'Draws the reaction carried at this joint, along its path.',
      },
    ];
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
    // A cylinder's own members are not named: the word "cylinder" already covers
    // them, and what is left is the neighboring bar the mount was also holding,
    // which the reader does have to be told about.
    //
    // A slider's block was filtered out here for the same reason -- it was drawn
    // *on* the joint rather than beside it, so "and the block at C" named no
    // second thing the reader could see going. A slider is one joint now, and
    // there is no block among the casualties to hide.
    const inside = new Set<string>(sealed ? [sealed.barrel.id, sealed.rod.id] : []);
    const doomed = this.mechanism
      .linksRemovedByDeleting(joint)
      .filter((link) => !inside.has(link.id));
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
        : labelForBody(one, this.mechanism.cylinderOfBar(one), this.mechanism.sealedStructures());
    }
    return `${bodies.length} ${kind}s`;
  }

  private jointSubtitle(joint: Joint): string {
    const sealed = this.mechanism.cylinderAt(joint);
    // The seal names the whole part. It is the one joint of a cylinder that is
    // not on the drawing anywhere else, and "Slider · Rod SB" would name the
    // half of the part it happens to hang on rather than the thing that slides.
    //
    // Every *other* joint of a cylinder is one of its ends, and an end is a pin
    // like any other (D13): it says what kind of pin it is and which body it is
    // on, exactly as a pin on a bar does, with the member named as the member.
    // All four used to read "Barrel joint · Cylinder AB", which told a reader
    // neither.
    if (sealed && joint.id === sealed.seal.id) {
      return `${this.jointKind(joint, [])} · ${this.cylinderName(sealed)}`;
    }
    const bodies = joint instanceof RealJoint ? joint.links : [];
    const holding = heldBarsAt(joint, this.mechanism.links, this.mechanism.sealedStructures());
    const held =
      holding.length > 0
        ? ` · on fixed ${holding.map((bar) => this.heldName(bar)).join(', ')}`
        : '';
    return `${this.jointKind(joint, bodies)} · ${this.bodyList(bodies)}${held}`;
  }

  /**
   * What a hold is called where it is named rather than described.
   *
   * A cylinder by its two ends, the way its panel and `describeHold` name it: a
   * hold on one is written on whichever member was free, and that member's id is
   * a pair of letters no reader has been shown.
   */
  private heldName(bar: RealLink): string {
    const sealed = this.mechanism.cylinderOfBar(bar);
    return sealed
      ? `${this.nameOf(sealed.mountA)}${this.nameOf(sealed.mountB)}`
      : bar.name || bar.id;
  }

  /**
   * What kind of joint this is, in one word.
   *
   * Ordered by how much the word tells a reader: a driven joint is a driven
   * joint whether or not it is also grounded, and "tracer" is only true of a
   * free point on a single body — a ground pivot with one link is not one.
   */
  private jointKind(joint: Joint, bodies: Link[]): string {
    // "Slider pin" was a kind of its own while a slider was a prismatic joint
    // and a coincident pin: the pin was what a reader clicked and the slot sat
    // under it. One joint is both, and it is a slider.
    if (joint instanceof PrisJoint) return 'Slider';
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
    const cylinders = this.mechanism.sealedStructures();
    const labels = bodies.map((link) =>
      labelForBody(link, this.mechanism.cylinderOfBar(link), cylinders)
    );
    const plain = labels.every((label) => label.startsWith('Link '));
    if (!plain) return labels.join(', ');
    const names = labels.map((label) => label.slice('Link '.length));
    return `${names.length === 1 ? 'Link' : 'Links'} ${names.join(', ')}`;
  }

  // ------------------------------------------------------------------ link

  private forLink(link: Link, handlers: MenuHandlers): ContextMenuModel {
    // The ram this body *is*, not one it is carrying. A bracket welded to a
    // mount is a body of its own: it wore the cylinder's title, lost its own
    // Attach group and its Fixed Length and Angle rows, and offered a Delete
    // Cylinder that took the ram and left the bracket standing -- while Delete
    // on that same selection took the whole body.
    const sealed = this.mechanism.cylinderOfBar(link);
    if (sealed && link instanceof RealLink) return this.forCylinderMember(link, sealed);
    const header = {
      title: labelForBody(link, undefined, this.mechanism.sealedStructures()),
      subtitle: this.linkSubtitle(link),
      crossing: this.crossing(link),
    };
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

  /**
   * A cylinder's barrel or its rod: the body the pointer is on, not the part it
   * is half of.
   *
   * One card stood here for the whole cylinder until Stage 2c of
   * `docs/joint-type-and-cylinder-plan.md`: either member opened it, it was
   * headed `Cylinder AB`, and two bodies with two lengths and two padlocks
   * answered to one name. The seal wears a letter now, so each member can say
   * which half of the part it is (decisions S10, D12) and the card is that
   * member's.
   *
   * Nothing is left of the whole-cylinder card. There is no Attach group --
   * a member takes no third body, and a copy of one would land a second
   * cylinder on the same joints -- and no Driven Input row, because the drive
   * belongs to the joint that slides and is offered on its card (D9). Nor is
   * there a display-shape row: a cylinder is drawn as a cylinder.
   */
  private forCylinderMember(member: RealLink, sealed: Cylinder): ContextMenuModel {
    return {
      header: {
        title: this.mechanism.bodyLabel(member),
        subtitle: this.cylinderName(sealed),
        crossing: this.crossing(member),
      },
      groups: [
        {
          label: 'State',
          rows: [...this.memberHoldRows(member), this.lockRow(member, undefined)],
        },
        { label: 'Traces', rows: this.vectorRows(member) },
        {
          rows: [
            new MenuRow({
              label: 'Delete Cylinder',
              icon: 'remove',
              destructive: true,
              shortcut: this.keys.keysFor('edit.delete'),
              action: () => this.mechanism.deleteCylinder(sealed),
            }),
            this.deleteMechanismRow(member),
          ],
        },
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
   * Fixed Length and Fixed Angle on one member of a cylinder: the pair a bar
   * carries, reading what decision S5 says they read.
   *
   * The length is this member's own; the angle is the *part's*, written on
   * whichever member was free to take it and ticked on both. So both rows of
   * one member can be on at once, and pressing either member's angle row is the
   * same press. `holdOf` answers with one value and cannot say either of those,
   * which is why these ask `memberHoldOf`.
   *
   * There was one row here, Fixed Angle, while a cylinder was one body: the
   * distance between its two ends is the stroke, which is what the drive moves,
   * so the part has no length to hold. Each member does, and holding one is what
   * decides which half gives when a mount is dragged past a stop (decision S4).
   */
  private memberHoldRows(member: RealLink): MenuRow[] {
    // The same sentence a bar's padlocks are refused with, because it is the
    // same rule: a Lock holds the part where it is, which is both values at
    // once. One mark, on the seal, stands for the whole cylinder (S8).
    const refusal: MenuRefusal | undefined = this.mechanism.isLockedTarget(member)
      ? {
          short: 'locked in place',
          long: 'Locked in place already holds the length and the angle.',
        }
      : undefined;
    const row = (which: 'length' | 'angle', label: string, icon: string, value: string) => {
      const on = this.mechanism.memberHoldOf(member, which);
      return new MenuRow({
        label,
        posePolicy: 'preserve',
        icon,
        material: true,
        kind: 'toggle',
        checked: on,
        // The value it would hold, so what is held is what is named -- the
        // same right-hand slot a bar's rows carry.
        hint: on ? undefined : value,
        refusal,
        action: () => this.mechanism.setMemberHold(member, which, !on),
        tip:
          which === 'length'
            ? 'Fix this half of the cylinder at its current length. A mount dragged past a stop then takes it all out of the other half.'
            : 'Hold this cylinder at the angle it points now. Dragging a mount slides it along that line.',
      });
    };
    return [
      row('length', 'Fixed Length', 'straighten', this.lengthOf(member)),
      row('angle', 'Fixed Angle', 'architecture', this.cylinderAngle(member)),
    ];
  }

  /** A cylinder's bearing, mount to mount -- the number the row would hold. */
  private cylinderAngle(link: RealLink): string {
    const sealed = this.mechanism.cylinderOfBar(link);
    if (!sealed) return '';
    const degrees =
      (Math.atan2(sealed.mountB.y - sealed.mountA.y, sealed.mountB.x - sealed.mountA.x) * 180) /
      Math.PI;
    return this.nup.formatValueAndUnit(
      this.nup.convertAngle(degrees, AngleUnit.DEGREE, this.settings.angleUnit.getValue()),
      this.settings.angleUnit.getValue()
    );
  }

  /**
   * Fixed Length and Fixed Angle: the two numbers a bar can hold against
   * edits. Each row carries the value it would hold, so what is held is what
   * is named. A link holds one or the other -- both is what Lock means -- so
   * the row for the other says it moves the hold rather than adding one, and
   * a locked link, which already holds both, offers neither.
   *
   * It had drifted up above the cylinder's rows, one function too early, and
   * described neither of the two it was sitting between.
   */
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
    // A body can hold a ram and a bracket at once, and deleting it takes both.
    // The row says so, the way the joint row does: what is named goes, and
    // what goes with it is the consequence.
    const rams = this.mechanism.cylindersOfLink(link).length;
    const part = rams === 1 ? 'Cylinder' : rams > 1 ? `${rams} cylinders` : '';
    const takes = [part, also].filter((one) => one).join(', ');
    const label = takes ? `Delete Link (and ${takes})` : 'Delete Link';
    return new MenuRow({
      label,
      icon: 'remove',
      destructive: true,
      shortcut: this.keys.keysFor('edit.delete'),
      action: () => this.mechanism.deleteLink(),
    });
  }

  private linkSubtitle(link: Link): string {
    // A slider's block has no subsets and no bar to describe.
    //
    // A cylinder's own members never reach here: each has a card of its own
    // (`forCylinderMember`), headed with the half of the part it is and
    // subtitled with the part. "Barrel and rod · Joints A, B" stood here while
    // one card served both.
    if (!(link instanceof RealLink)) {
      const joints = this.jointsShownOn(link);
      return `Block · Joints ${joints}`;
    }
    const bar = link;
    // "Bar" is only true of two joints. Past that the link is drawn as a filled
    // shape and behaves as one rigid body carrying three or more pins, so it is
    // called what it is rather than what the two-joint case is called.
    const kind = bar.subset.length > 0 ? 'Compound' : bar.joints.length > 2 ? 'Body' : 'Bar';
    const joints = this.jointsShownOn(bar);
    const locked = this.mechanism.isLockedTarget(bar) ? ' · locked' : '';
    const held = !locked && holdOf(bar) ? ` · fixed ${holdOf(bar)}` : '';
    return `${kind} · Joints ${joints}${locked}${held}`;
  }

  // ----------------------------------------------------------------- force

  private forForce(force: Force): ContextMenuModel {
    const header = {
      title: `Force ${force.name || force.id}`,
      subtitle: `On ${labelForBody(force.link, undefined, this.mechanism.sealedStructures())} · ${
        force.local ? 'local' : 'global'
      } frame`,
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
    // What the reader can see, which is what they can check the number against:
    // a cylinder's derived inner end is not drawn and is not counted (D14).
    const joints = partition ? this.mechanism.visibleJoints(partition.ownJoints).length : 0;
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
    // The choice is a change of topology, so it is refused wherever a Slider or
    // a Welded row would have been -- value by value, since each value carries
    // its own reason, and rechecked when one is pressed.
    const choice = model.choice;
    if (choice) {
      for (const [index, option] of choice.options.entries()) {
        // Every value but the one already chosen. `jointTypeChoice` in
        // `model/joint-type.ts` never refuses the chosen value -- there is
        // nothing to refuse, since choosing it changes nothing -- and graying
        // it here drew the chosen cell with its pill but in disabled ink,
        // a state the block has no story for and the panel never shows.
        const refusal =
          index === choice.chosen ? null : this.permission.menuRefusal(choice.posePolicy);
        if (refusal && !option.refusal) option.refusal = refusal;
        const action = option.action;
        option.action = () => {
          if (!this.permission.menuRefusal(choice.posePolicy)) action();
        };
      }
    }
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

  /**
   * The joints of a body a reader could point at, named.
   *
   * A cylinder's buried inner end is not one of them: it has no marker, no
   * letter and no hitbox, and is left out of every count the app shows (D14,
   * S11) -- so a bracket welded to a barrel mount was subtitled "Compound ·
   * Joints A, A1, D" over a canvas showing two.
   */
  private jointsShownOn(body: Link): string {
    return this.mechanism
      .visibleJoints(body.joints)
      .map((joint) => this.nameOf(joint))
      .join(', ');
  }

  /**
   * A permission model's answer as a row wears it.
   *
   * The two lengths are already the two the row has a slot for; what is dropped
   * is the code, which is for a notification to deduplicate on and means nothing
   * on a card.
   */
  private quote(refused: OperationRefusal | undefined): MenuRefusal | undefined {
    return refused ? { short: refused.short, long: refused.long } : undefined;
  }

  private cylinderName(sealed: Cylinder): string {
    return `Cylinder ${this.nameOf(sealed.mountA)}${this.nameOf(sealed.mountB)}`;
  }
}
