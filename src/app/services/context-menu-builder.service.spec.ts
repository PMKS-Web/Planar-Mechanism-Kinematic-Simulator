import { Injector } from '@angular/core';
import { ContextMenuBuilderService, MenuHandlers } from './context-menu-builder.service';
import { ContextMenuModel, MenuRow } from '../component/context-menu/menu-model';
import { ActiveObjService } from './active-obj.service';
import { ColorService } from './color.service';
import { DragStateService } from './drag-state.service';
import { EditPermissionService } from './edit-permission.service';
import { GridUtilsService } from './grid-utils.service';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';
import { MechanismService } from './mechanism.service';
import { NotificationService } from './notification.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SaveHistoryService } from './save-history.service';
import { SettingsService } from './settings.service';
import { SvgGridService } from './svg-grid.service';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { silentNotifications } from '../../test-utils/notification-stub';
import { wireGraph } from '../../test-utils/mechanism-harness';
import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { MODEL_SCALE } from '../model/render-scale';
import { SelectionBatchService } from './selection-batch.service';

/**
 * What the right-click menu offers, and what it says when it cannot.
 *
 * The claim being tested is not "these rows exist" but "the menu says what the
 * model says". Every refusal below is written somewhere else — in
 * `describeActuator`, in `canToggleWeld`, in `deleteLink`'s orphan rule — and
 * the menu is only allowed to quote them. So the assertions check the reason
 * as well as the graying: a row grayed for the wrong reason is a row that will
 * send a student to fix the wrong thing.
 */

const S = MODEL_SCALE;

/** The shortcut registry, minus the window listener a spec has no use for. */
const keysStub = {
  keysFor: (id: string) => (id === 'edit.lock' ? 'K' : id === 'edit.delete' ? 'Delete' : ''),
  tip: (name: string) => name,
};

const noHandlers: MenuHandlers = {
  attachLink: () => {},
  attachCylinder: () => {},
  attachTracerPoint: () => {},
  attachForce: () => {},
  backgroundImage: () => {},
  deletePosition: () => {},
  deleteAllPositions: () => {},
  duplicateSelected: () => {},
  deleteSelected: () => {},
};

function createBuilderHarness() {
  if (!ColorService.instance) new ColorService();
  const injector = Injector.create({
    providers: [
      { provide: SettingsService, deps: [] },
      { provide: NumberUnitParserService, deps: [] },
      { provide: ActiveObjService, deps: [] },
      { provide: DragStateService, deps: [] },
      { provide: SelectedTabService, deps: [] },
      { provide: NotificationService, useFactory: silentNotifications, deps: [] },
      { provide: SaveHistoryService, useValue: { save: () => {} } },
      { provide: SynthesisBuilderService, deps: [] },
      { provide: SvgGridService, deps: [] },
      { provide: GridUtilsService, deps: [] },
      { provide: EditPermissionService, deps: [] },
      { provide: MechanismService, deps: [] },
      { provide: KeyboardShortcutsService, useValue: keysStub },
      { provide: ContextMenuBuilderService, deps: [] },
      { provide: SelectionBatchService, deps: [MechanismService] },
    ],
  });
  return {
    builder: injector.get(ContextMenuBuilderService),
    mechanism: injector.get(MechanismService),
    tabs: injector.get(SelectedTabService),
    synthesis: injector.get(SynthesisBuilderService),
    active: injector.get(ActiveObjService),
    // For the checks that assert the gates agree with each other rather than
    // asserting one of them twice.
    grid: injector.get(GridUtilsService),
  };
}

/** A crank-rocker: ground O, crank OA, coupler ACT with a tracer, rocker CD. */
function fourBar(mechanism: MechanismService) {
  const o = new RevJoint('O', 0, 0, false, true);
  const a = new RevJoint('A', 0, 2 * S);
  const c = new RevJoint('C', 3 * S, 2 * S);
  const d = new RevJoint('D', 3 * S, 0, false, true);
  const t = new RevJoint('T', 2 * S, 3 * S);
  const crank = new RealLink('OA', [o, a], 1, 1);
  const coupler = new RealLink('ACT', [a, c, t], 1, 1);
  const rocker = new RealLink('CD', [c, d], 1, 1);
  mechanism.joints = [o, a, c, d, t];
  mechanism.links = [crank, coupler, rocker];
  mechanism.forces = [];
  wireGraph(mechanism);
  return { o, a, c, d, t, crank, coupler, rocker };
}

function rows(model: ContextMenuModel): MenuRow[] {
  return model.groups.flatMap((group) => group.rows);
}

function row(model: ContextMenuModel, label: string): MenuRow | undefined {
  return rows(model).find((one) => one.label === label);
}

function labels(model: ContextMenuModel): string[] {
  return rows(model).map((one) => one.label);
}

describe('the right-click menu', () => {
  let harness: ReturnType<typeof createBuilderHarness>;

  beforeEach(() => {
    harness = createBuilderHarness();
    harness.tabs.setTab(TabID.EDIT);
  });

  describe('multi-selection target', () => {
    it('preserves group scope and offers count-aware atomic actions', () => {
      const parts = fourBar(harness.mechanism);
      harness.active.replacePartSelection(parts.a);
      harness.active.togglePartSelection(parts.coupler);
      const duplicateSelected = vi.fn();
      const deleteSelected = vi.fn();
      const model = harness.builder.build(parts.a, {
        ...noHandlers,
        duplicateSelected,
        deleteSelected,
      });

      expect(model.header?.title).toBe('2 Selected Parts');
      expect(labels(model)).toContain('Duplicate Selected (2)');
      expect(labels(model)).toContain('Delete Selected (2)');
      row(model, 'Duplicate Selected (2)')!.action();
      row(model, 'Delete Selected (2)')!.action();
      expect(duplicateSelected).toHaveBeenCalledTimes(1);
      expect(deleteSelected).toHaveBeenCalledTimes(1);
    });

    it('quotes an atomic lock refusal for destructive group actions', () => {
      const parts = fourBar(harness.mechanism);
      parts.a.locked = true;
      harness.mechanism.updateMechanism(false);
      harness.active.replacePartSelection(parts.a);
      harness.active.togglePartSelection(parts.coupler);

      const model = harness.builder.build(parts.a, noHandlers);

      expect(row(model, 'Delete Selected (2)')!.refusal?.short).toBe('unlock first');
      expect(row(model, 'Delete Selected (2)')!.refusal?.long).toContain('locked');
    });
  });

  describe('the ladder', () => {
    it('runs Attach, then State, then the destructive footer', () => {
      const parts = fourBar(harness.mechanism);
      const model = harness.builder.build(parts.a, noHandlers);
      expect(model.groups.map((group) => group.label)).toEqual(['Attach', 'State', undefined]);
    });

    it('puts Delete last, whatever else the menu holds', () => {
      const parts = fourBar(harness.mechanism);
      for (const target of [parts.a, parts.t, parts.crank, parts.coupler]) {
        const all = rows(harness.builder.build(target, noHandlers));
        expect(all[all.length - 1].destructive).toBe(true);
        // The footer is the part's own deletion and then the machine's, and
        // nothing destructive appears above it.
        const destructive = all.filter((one) => one.destructive);
        expect(destructive.length).toBe(2);
        expect(all.slice(-2)).toEqual(destructive);
        expect(destructive[1].label.startsWith('Delete Mechanism')).toBe(true);
      }
    });

    it('names the target rather than leaving the reader to guess', () => {
      const parts = fourBar(harness.mechanism);
      const model = harness.builder.build(parts.a, noHandlers);
      expect(model.header?.title).toBe('Joint A');
      expect(model.header?.subtitle).toBe('Pin · Links OA, ACT');
    });

    it('writes states as states, not as verbs that rewrite themselves', () => {
      const parts = fourBar(harness.mechanism);
      const model = harness.builder.build(parts.o, noHandlers);
      expect(labels(model)).toContain('Grounded');
      expect(labels(model)).not.toContain('Remove Ground');
      expect(row(model, 'Grounded')!.checked).toBe(true);
      expect(row(model, 'Grounded')!.kind).toBe('toggle');
    });
  });

  describe('refusals come from the model', () => {
    it('grays the input on a joint where three bodies meet, and says so', () => {
      const parts = fourBar(harness.mechanism);
      // A fourth body at A: three links now meet there.
      const extra = new RevJoint('X', -2 * S, 2 * S);
      const spur = new RealLink('AX', [parts.a, extra], 1, 1);
      harness.mechanism.joints.push(extra);
      harness.mechanism.links.push(spur);
      wireGraph(harness.mechanism);

      const driven = row(harness.builder.build(parts.a, noHandlers), 'Driven Input')!;
      expect(driven.disabled).toBe(true);
      expect(driven.refusal!.short).toBe('3 bodies meet');
      expect(driven.refusal!.long).toContain('would not say which pair moves');
    });

    it('grays the weld on a joint with nothing to fuse', () => {
      const parts = fourBar(harness.mechanism);
      const weld = row(harness.builder.build(parts.t, noHandlers), 'Welded')!;
      expect(weld.disabled).toBe(true);
      expect(weld.refusal!.short).toBe('needs 2 links');
    });

    it('leaves both directions of a mutually exclusive pair usable', () => {
      const parts = fourBar(harness.mechanism);
      parts.a.input = true;
      const model = harness.builder.build(parts.a, noHandlers);
      // Weld grays on a driven joint...
      expect(row(model, 'Welded')!.refusal!.short).toBe('it is driven');
      // ...and the switch that resolves it stays live.
      expect(row(model, 'Driven Input')!.disabled).toBe(false);
      expect(row(model, 'Driven Input')!.checked).toBe(true);
    });

    it('will not anchor a load where two links share the pin', () => {
      const parts = fourBar(harness.mechanism);
      expect(row(harness.builder.build(parts.a, noHandlers), 'Force')!.refusal!.short).toBe(
        '2 links share it'
      );
      // And offers it where the answer is unambiguous.
      expect(row(harness.builder.build(parts.t, noHandlers), 'Force')!.disabled).toBe(false);
    });

    it('grays a disc on a link with no fixed pin to sweep about', () => {
      const parts = fourBar(harness.mechanism);
      const disc = row(harness.builder.build(parts.coupler, noHandlers), 'Drawn as a Disc')!;
      expect(disc.refusal!.short).toBe('needs a fixed pin');
      // The crank turns about a grounded pin, so it may be drawn as one.
      expect(row(harness.builder.build(parts.crank, noHandlers), 'Drawn as a Disc')!.disabled).toBe(
        false
      );
    });
  });

  describe('locks', () => {
    it('stops a locked part being deleted, and says which way out', () => {
      const parts = fourBar(harness.mechanism);
      parts.a.locked = true;
      const model = harness.builder.build(parts.a, noHandlers);
      expect(row(model, 'Locked')!.checked).toBe(true);
      const remove = rows(model).find((one) => one.destructive)!;
      expect(remove.refusal!.short).toBe('unlock first');
      // Its own switch stays live: one click here frees it.
      expect(row(model, 'Locked')!.disabled).toBe(false);
    });

    it('will not let a link deletion sweep up a locked joint', () => {
      const parts = fourBar(harness.mechanism);
      // O is on the crank alone, so deleting the crank would orphan it. The
      // crank is not itself "locked" -- that needs every joint -- so the lock
      // was being ignored by the longer route.
      parts.o.locked = true;
      expect(harness.mechanism.deleteRefusal(parts.crank)).toContain('locked');
      harness.mechanism.activeObjService.updateSelectedObj(parts.crank);
      harness.mechanism.deleteLink();
      expect(harness.mechanism.links.some((one) => one.id === 'OA')).toBe(true);
      expect(harness.mechanism.joints.some((one) => one.id === 'O')).toBe(true);
      const remove = rows(harness.builder.build(parts.crank, noHandlers)).find(
        (one) => one.destructive
      )!;
      expect(remove.refusal!.short).toBe('unlock first');
    });

    it('still attaches a link, a tracer, a cylinder and a force to a locked link', () => {
      // A lock holds the link where it is; a new part built onto it moves
      // nothing that is held.
      const parts = fourBar(harness.mechanism);
      parts.o.locked = true;
      parts.a.locked = true;
      const model = harness.builder.build(parts.crank, noHandlers);
      for (const label of ['Link', 'Cylinder', 'Tracer Point', 'Force']) {
        expect(row(model, label)!.refusal, label).toBeUndefined();
      }
    });

    it('refuses to attach to a locked joint for the same reason', () => {
      const parts = fourBar(harness.mechanism);
      parts.a.locked = true;
      const model = harness.builder.build(parts.a, noHandlers);
      expect(row(model, 'Link')!.refusal!.short).toBe('unlock first');
    });

    it('counts what Lock All and Unlock All would touch', () => {
      const parts = fourBar(harness.mechanism);
      parts.a.locked = true;
      const model = harness.builder.build('grid', noHandlers);
      expect(row(model, 'Lock All')!.hint).toBe('4 open');
      expect(row(model, 'Unlock All')!.hint).toBe('1 locked');
      // The pair never both gray at once, so there is always a way out.
      expect(row(model, 'Lock All')!.disabled).toBe(false);
      expect(row(model, 'Unlock All')!.disabled).toBe(false);
    });
  });

  describe('duplicating a link', () => {
    it('copies a link of any shape, set down beside the original', () => {
      const parts = fourBar(harness.mechanism);
      const before = harness.mechanism.links.length;
      // Three joints, not two: the first cut of this quietly did nothing here,
      // which is exactly what "Duplicate does nothing" looked like.
      harness.mechanism.duplicateLink(parts.coupler);
      expect(harness.mechanism.links.length).toBe(before + 1);
      const copy = harness.mechanism.links[harness.mechanism.links.length - 1];
      expect(copy.joints.length).toBe(3);
      // Beside it, not on it: a copy that lands under the original reads as
      // nothing having happened.
      const moved = copy.joints[0];
      const from = parts.coupler.joints[0];
      expect(Math.hypot(moved.x - from.x, moved.y - from.y)).toBeGreaterThan(0.5 * S);
      // And free-standing: it shares no joint with what it was copied from.
      const shared = copy.joints.filter((one) =>
        parts.coupler.joints.some((other) => other.id === one.id)
      );
      expect(shared.length).toBe(0);
    });

    it('copies the body, including what makes those numbers custom', () => {
      const parts = fourBar(harness.mechanism);
      parts.crank.mass = 7;
      parts.crank.massMoI = 123.456;
      parts.crank.moiIsCustom = true;
      parts.crank.placeCustomCoM({ x: parts.crank.CoM.x + 37, y: parts.crank.CoM.y - 21 });

      harness.mechanism.duplicateLink(parts.crank);
      const copy = harness.mechanism.links[harness.mechanism.links.length - 1] as RealLink;
      expect(copy.mass).toBe(7);
      expect(copy.massMoI).toBe(123.456);
      // The flags, not just the values: without them the next rebuild treats
      // the copy as an ordinary body and computes both back over.
      expect(copy.moiIsCustom).toBe(true);
      expect(copy.comIsCustom).toBe(true);
      // And the offsets are held against joint letters, which have to be the
      // copy's own or the point rides a bar it is not on.
      expect(copy.comOffset?.frame).toEqual(
        copy.joints.map((joint) => joint.id) as [string, string]
      );
    });

    it('grays the row on a welded compound rather than doing nothing', () => {
      const parts = fourBar(harness.mechanism);
      // A compound: several links and the welds between them.
      (parts.coupler as RealLink).subset = [parts.crank, parts.rocker];
      const duplicate = row(harness.builder.build(parts.coupler, noHandlers), 'Duplicate Link')!;
      expect(duplicate.disabled).toBe(true);
      expect(duplicate.refusal!.short).toBe('welded compound');
    });
  });

  describe('cascades are named, not confirmed', () => {
    it('counts the joints deleting a link would sweep up', () => {
      const parts = fourBar(harness.mechanism);
      const remove = rows(harness.builder.build(parts.crank, noHandlers)).find(
        (one) => one.destructive
      )!;
      // O is on the crank alone and goes with it; A is on two links and stays.
      expect(remove.label).toBe('Delete Link and Joint O');
    });

    it('names the links deleting a joint would take with it', () => {
      const parts = fourBar(harness.mechanism);
      const remove = rows(harness.builder.build(parts.a, noHandlers)).find(
        (one) => one.destructive
      )!;
      // The crank is left with one end; the three-joint coupler survives.
      expect(remove.label).toBe('Delete Joint (and Link OA)');
    });

    it('says plain Delete Joint when nothing else goes with it', () => {
      const parts = fourBar(harness.mechanism);
      const remove = rows(harness.builder.build(parts.c, noHandlers)).find(
        (one) => one.destructive
      )!;
      expect(remove.label).toBe('Delete Joint (and Link CD)');
      expect(
        rows(harness.builder.build(parts.t, noHandlers)).find((one) => one.destructive)!.label
      ).toBe('Delete Joint');
    });

    it('counts the joints Delete Mechanism would take, on a joint or a link', () => {
      const parts = fourBar(harness.mechanism);
      harness.mechanism.updateMechanism();
      for (const target of [parts.a, parts.coupler]) {
        const machine = row(harness.builder.build(target, noHandlers), 'Delete Mechanism')!;
        expect(machine.destructive).toBe(true);
        expect(machine.hint).toBe('5 joints');
        expect(machine.disabled).toBe(false);
      }
    });

    it('will not offer to delete a machine a loose part is in no part of', () => {
      const parts = fourBar(harness.mechanism);
      // Nothing partitioned, so no part belongs to a machine — the state a
      // bar dropped on the grid on its own is in.
      const machine = row(harness.builder.build(parts.a, noHandlers), 'Delete Mechanism')!;
      expect(machine.refusal!.short).toBe('not in a mechanism');
    });

    it('takes the whole machine when the row is used', () => {
      const parts = fourBar(harness.mechanism);
      harness.mechanism.updateMechanism();
      row(harness.builder.build(parts.crank, noHandlers), 'Delete Mechanism')!.action();
      expect(harness.mechanism.joints.length).toBe(0);
      expect(harness.mechanism.links.length).toBe(0);
    });
  });

  describe('words the reader has to live with', () => {
    it('never writes a state as a verb that flips', () => {
      const parts = fourBar(harness.mechanism);
      for (const target of [parts.a, parts.o, parts.crank]) {
        for (const one of rows(harness.builder.build(target, noHandlers))) {
          expect(one.label).not.toMatch(/^(Add|Remove|Make|Un)[A-Z ]/);
        }
      }
    });
  });

  describe('what the row promises, the model does', () => {
    it('will not delete a locked part, whichever surface asks', () => {
      const parts = fourBar(harness.mechanism);
      parts.a.locked = true;
      harness.mechanism.activeObjService.updateSelectedObj(parts.a);
      harness.mechanism.deleteJoint();
      // The menu grays the row; the Delete key and the panel button reach the
      // same joint, so the rule has to live where all three can ask it.
      expect(harness.mechanism.joints.some((one) => one.id === 'A')).toBe(true);
      expect(harness.mechanism.deleteRefusal(parts.a)).toContain('locked');
    });

    it('names the sub-link a welded compound would lose', () => {
      const parts = fourBar(harness.mechanism);
      // A compound of the crank and the coupler, as welding A makes.
      const compound = parts.coupler;
      compound.subset = [parts.crank, parts.coupler];
      parts.o.links = [compound];
      // The compound has four joints, so asking only its own count says
      // nothing is doomed -- while the two-joint leaf inside it is.
      const doomed = harness.mechanism.linksRemovedByDeleting(parts.o).map((one) => one.id);
      expect(doomed).toContain('OA');
    });
  });

  describe('modes', () => {
    it('offers only the view of a joint in an analysis mode', () => {
      const parts = fourBar(harness.mechanism);
      harness.tabs.setTab(TabID.ANALYZE);
      const model = harness.builder.build(parts.a, noHandlers);
      // Views of the mechanism, all of them: the path it traces and the two
      // rates drawn along it. Nothing here changes the drawing.
      expect(labels(model)).toEqual(['Trace Path', 'Velocity Vectors', 'Acceleration Vectors']);
      // Geometry is frozen there, so Attach and the footer are absent rather
      // than grayed — and the way back into Edit rides the header.
      expect(model.header?.crossing?.icon).toBe('edit_outline');
    });

    it('offers the two rates in both analysis modes, and the force only in Force', () => {
      const parts = fourBar(harness.mechanism);
      // Motion is the same in either mode, and a reader checking what a joint
      // carries usually wants to know which way it is accelerating while they
      // do it. A force is only solved in Force, so it stays there.
      const vectorRows = (part: Parameters<typeof harness.builder.build>[0]) =>
        labels(harness.builder.build(part, noHandlers)).filter((one) => one.endsWith('Vectors'));
      harness.tabs.setTab(TabID.FORCE);
      expect(vectorRows(parts.a)).toEqual([
        'Velocity Vectors',
        'Acceleration Vectors',
        'Force Vectors',
      ]);
      harness.tabs.setTab(TabID.ANALYZE);
      expect(vectorRows(parts.a)).toEqual(['Velocity Vectors', 'Acceleration Vectors']);
    });

    it('offers a link the two rates at its CoM in either mode, and no force of its own', () => {
      const parts = fourBar(harness.mechanism);
      const rates = ['Velocity Vectors', 'Acceleration Vectors'];
      const vectorRows = () =>
        labels(harness.builder.build(parts.coupler, noHandlers)).filter((one) =>
          one.endsWith('Vectors')
        );
      harness.tabs.setTab(TabID.ANALYZE);
      expect(vectorRows()).toEqual(rates);
      // A reaction is carried at a joint, so the row is absent rather than
      // grayed — a fact about the kind of part, not about this drawing.
      harness.tabs.setTab(TabID.FORCE);
      expect(vectorRows()).toEqual(rates);
    });

    it('grays a vector on a machine that does not solve, with its own reason', () => {
      const parts = fourBar(harness.mechanism);
      harness.mechanism.updateMechanism();
      harness.tabs.setTab(TabID.ANALYZE);
      // No input, so nothing has a cycle to take a velocity from — and the
      // reason is the readiness list's, not one written here.
      const velocity = row(harness.builder.build(parts.a, noHandlers), 'Velocity Vectors')!;
      expect(velocity.disabled).toBe(!harness.mechanism.isPartSimulatable(parts.a));
      expect(velocity.refusal?.short).toBe('not ready');
    });

    it('keeps the switch it was given', () => {
      const parts = fourBar(harness.mechanism);
      harness.tabs.setTab(TabID.ANALYZE);
      row(harness.builder.build(parts.a, noHandlers), 'Velocity Vectors')!.action();
      expect(harness.mechanism.isVectorTraceOn(parts.a, 'velocity')).toBe(true);
      expect(harness.mechanism.isVectorTraceOn(parts.a, 'acceleration')).toBe(false);
      expect(row(harness.builder.build(parts.a, noHandlers), 'Velocity Vectors')!.checked).toBe(
        true
      );
      row(harness.builder.build(parts.a, noHandlers), 'Velocity Vectors')!.action();
      expect(harness.mechanism.isVectorTraceOn(parts.a, 'velocity')).toBe(false);
    });

    it('crosses into analysis from Edit, and the canvas has nowhere to cross to', () => {
      fourBar(harness.mechanism);
      expect(harness.builder.build('grid', noHandlers).header?.crossing).toBeUndefined();
    });

    it('will not offer analysis of a part that is in no mechanism', () => {
      const parts = fourBar(harness.mechanism);
      // Nothing has been partitioned, so no part belongs to a machine yet —
      // which is exactly the state a loose bar dropped on the grid is in.
      const crossing = harness.builder.build(parts.a, noHandlers).header?.crossing;
      expect(crossing?.refusal?.short).toBe('not in a mechanism');
    });

    it('asks the part which machine it is in, not the drawing', () => {
      const parts = fourBar(harness.mechanism);
      harness.mechanism.updateMechanism();
      const inside = harness.builder.build(parts.a, noHandlers).header?.crossing;
      const readiness = harness.mechanism.readinessOfPart(parts.a);
      // Whatever this machine's state is, the crossing agrees with it rather
      // than with whether *something* on the grid can be analyzed.
      expect(!!inside?.refusal).toBe(!harness.mechanism.isPartSimulatable(parts.a));
      if (inside?.refusal) {
        expect(readiness).toBeDefined();
        expect(inside.refusal.short).toBe('not ready');
      }
    });

    it('offers nothing but the positions in Synthesis', () => {
      fourBar(harness.mechanism);
      harness.tabs.setTab(TabID.SYNTHESIZE);
      expect(rows(harness.builder.build('grid', noHandlers)).length).toBe(0);
    });
  });

  describe('away from the start pose', () => {
    it('offers the structural rows at a paused pose, and grays them while playing', () => {
      // Phase 2 of the plan changed this answer, not the plumbing behind it.
      // Grounding a joint is addressed by identity -- it applies to the design
      // without needing the pose -- so parking mid-cycle is no longer a reason
      // to refuse it. Playing still is: nothing can be aimed at while it moves.
      const parts = fourBar(harness.mechanism);
      harness.mechanism.mechanismTimeStep = 12;
      const paused = harness.builder.build(parts.t, noHandlers);
      expect(row(paused, 'Grounded')!.refusal).toBeUndefined();
      expect(row(paused, 'Trace Path')!.disabled).toBe(false);

      // A trace is a view of the mechanism, not a change to it -- so parking
      // mid-cycle, which is exactly when a reader wants one, leaves it live.
      expect(row(paused, 'Trace Path')!.refusal).toBeUndefined();

      harness.mechanism.isPlaying = true;
      const running = harness.builder.build(parts.t, noHandlers);
      expect(row(running, 'Grounded')!.refusal!.short).toBe('animation running');
      // Including the trace, while it runs. `showCurve` is serialized, and
      // undo is blocked here -- so a toggle made now could not be taken back.
      expect(row(running, 'Trace Path')!.refusal!.short).toBe('animation running');
      harness.mechanism.isPlaying = false;
    });

    /** A driven crank-rocker lettered from `from`, appended at `offset`. */
    function crankRocker(mechanism: MechanismService, from: string, offset: number) {
      const letter = (n: number) => String.fromCharCode(from.charCodeAt(0) + n);
      const at: [number, number][] = [
        [offset, 0],
        [offset, S],
        [offset + 3 * S, 2 * S],
        [offset + 4 * S, 0],
      ];
      const joints = at.map(([x, y], i) => new RevJoint(letter(i), x, y));
      joints[0].ground = true;
      joints[3].ground = true;
      joints[0].input = true;
      const links = [0, 1, 2].map(
        (i) => new RealLink(joints[i].id + joints[i + 1].id, [joints[i], joints[i + 1]], 1, 1)
      );
      mechanism.joints.push(...joints);
      mechanism.links.push(...links);
      return { joints, links };
    }

    it('agrees with every other gate when an unsynced machine is parked off zero', () => {
      // Scrubbing a non-master row leaves the shared clock at zero. Before the
      // permission model this menu read that clock and offered live rows while
      // undo -- gated on isAnimating() -- refused. They now give one answer,
      // whatever that answer is; the point of the check is the agreement, not
      // which way it falls.
      const first = crankRocker(harness.mechanism, 'A', 0);
      crankRocker(harness.mechanism, 'E', 10 * S);
      wireGraph(harness.mechanism);
      harness.mechanism.updateMechanism();
      expect(harness.mechanism.mechanisms.map((m) => m.isMechanismValid())).toEqual([true, true]);

      harness.mechanism.setSyncMechanisms(false);
      const other = harness.mechanism.masterMechanismIndex() === 0 ? 1 : 0;
      harness.mechanism.seekMechanism(other, harness.mechanism.mechanisms[other].cyclePeriod / 3);
      expect(harness.mechanism.isPlaying).toBe(false);
      expect(harness.mechanism.mechanismTimeStep).toBe(0);

      const model = harness.builder.build(first.joints[1], noHandlers);
      // Paused, so the structural rows are live -- and undo agrees, which is
      // the whole point. It used to refuse here while the menu did not.
      expect(row(model, 'Grounded')!.refusal).toBeUndefined();
      expect(harness.grid.canRestoreHistory()).toBe(true);
      expect(row(model, 'Trace Path')!.disabled).toBe(false);

      // And while it runs, both refuse, with the words that name the machine
      // rather than the shared clock the reader can see reading zero.
      harness.mechanism.isPlaying = true;
      const running = harness.builder.build(first.joints[1], noHandlers);
      expect(running.groups.flatMap((g) => g.rows).some((r) => r.refusal)).toBe(true);
      expect(harness.grid.canRestoreHistory()).toBe(false);
      harness.mechanism.isPlaying = false;
    });
  });
});

/**
 * Fixed Length and Fixed Angle: a bar's two holds, in the State group.
 *
 * The rows carry the value they would hold, so what is held is what is
 * named; a link holds one or the other, so the second says it moves the hold;
 * and a locked link, or a body that is not a bar, gets the model's refusal.
 */
describe('the right-click menu, on a bar that can hold a value', () => {
  let harness: ReturnType<typeof createBuilderHarness>;

  beforeEach(() => {
    harness = createBuilderHarness();
    harness.tabs.setTab(TabID.EDIT);
  });

  it('offers both holds with the value each would hold', () => {
    const parts = fourBar(harness.mechanism);
    const model = harness.builder.build(parts.crank, noHandlers);
    const length = row(model, 'Fixed Length')!;
    const angle = row(model, 'Fixed Angle')!;
    expect(length.kind).toBe('toggle');
    expect(length.checked).toBe(false);
    expect(length.refusal).toBeUndefined();
    expect(length.hint).toMatch(/^2/);
    expect(angle.hint).toMatch(/^90/);
  });

  it('checks the held one and says the other would move the hold', () => {
    const parts = fourBar(harness.mechanism);
    parts.crank.hold = 'length';
    const model = harness.builder.build(parts.crank, noHandlers);
    expect(row(model, 'Fixed Length')!.checked).toBe(true);
    expect(row(model, 'Fixed Length')!.hint).toBeUndefined();
    expect(row(model, 'Fixed Angle')!.hint).toBe('moves the lock');
    expect(model.header?.subtitle).toContain('fixed length');
  });

  it('sets and releases the hold through the mechanism', () => {
    const parts = fourBar(harness.mechanism);
    row(harness.builder.build(parts.crank, noHandlers), 'Fixed Angle')!.action();
    expect(parts.crank.hold).toBe('angle');
    row(harness.builder.build(parts.crank, noHandlers), 'Fixed Angle')!.action();
    expect(parts.crank.hold).toBeUndefined();
  });

  it('refuses both on a locked link, and on a body that is not a bar', () => {
    const parts = fourBar(harness.mechanism);
    parts.o.locked = true;
    parts.a.locked = true;
    const locked = harness.builder.build(parts.crank, noHandlers);
    expect(row(locked, 'Fixed Length')!.refusal?.short).toBe('locked in place');
    const body = harness.builder.build(parts.coupler, noHandlers);
    expect(row(body, 'Fixed Angle')!.refusal?.short).toBe('bars only');
  });

  it('tells a joint on a held bar what confines it', () => {
    const parts = fourBar(harness.mechanism);
    parts.crank.hold = 'length';
    const model = harness.builder.build(parts.a, noHandlers);
    const free = row(model, 'Free to Move')!;
    expect(free.refusal?.short).toBe('locked by OA');
    expect(free.refusal?.long).toContain('fixed length OA');
    expect(model.header?.subtitle).toContain('on fixed OA');
    expect(row(harness.builder.build(parts.d, noHandlers), 'Free to Move')).toBeUndefined();
  });
});
