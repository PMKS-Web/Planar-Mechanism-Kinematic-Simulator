import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Joint, RealJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { MechanismService } from '../../services/mechanism.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { MechanismReadiness, ReadinessCheck } from '../../model/mechanism/readiness';
import { MatIcon } from '@angular/material/icon';

/**
 * What stands between this drawing and its animation, mechanism by mechanism.
 *
 * The app used to answer "why is nothing happening?" with one sentence about
 * the whole document, first blocker wins — which for a drawing holding several
 * machines is a sentence about whichever of them the loop reached first. Each
 * is now listed on its own, with its own blockers, and each blocker says the
 * way out rather than only naming the wall.
 *
 * Anything that is fine says nothing at all. A list of green ticks reads as
 * reassurance the first time and as noise every time after, and it buries the
 * one line that matters.
 */
@Component({
  selector: 'app-analysis-setup',
  templateUrl: './analysis-setup.component.html',
  styleUrls: ['./analysis-setup.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon],
})
export class AnalysisSetupComponent {
  mechanism = inject(MechanismService);
  activeObj = inject(ActiveObjService);
  private tabs = inject(SelectedTabService);

  /**
   * Which question this drawer is answering.
   *
   * The two are separate drawers because they have different fixes: a
   * mechanism that will not run and a force analysis with nothing to react
   * against are not the same problem, and a reader refused by one mode should
   * not have to read past the other's list to find out why.
   */
  readonly mode = input<'kinematic' | 'force'>('kinematic');
  /** Which mechanisms the reader has folded away, by id. */
  private collapsed = new Set<string>();
  unassignedOpen = false;
  forceOpen = true;

  get readiness(): MechanismReadiness[] {
    return this.mechanism.readinessOfEachMechanism();
  }

  get unassigned() {
    return this.mechanism.unassignedReports();
  }

  /**
   * What force analysis still wants, listed beside the kinematic blockers
   * rather than in a drawer of its own.
   *
   * The two questions have different answers but the same shape, and a reader
   * who has just been refused by one tab is well served by seeing what the
   * other would say too. Only shown while something is outstanding: a met
   * requirement is a tick nobody needs to read twice.
   */
  get forceRequirements() {
    return this.mechanism.forceAnalysisRequirements();
  }

  get forceOutstanding(): number {
    return this.forceRequirements.filter((requirement) => !requirement.met && !requirement.warning)
      .length;
  }

  get forceWarnings(): number {
    return this.forceRequirements.filter((requirement) => !requirement.met && requirement.warning)
      .length;
  }

  /**
   * One line for the whole drawing.
   *
   * Counted rather than listed, because the list is right underneath it.
   */
  get title(): string {
    return this.mode() === 'force' ? 'Force analysis setup' : 'Analysis setup';
  }

  get summary(): string {
    if (this.mode() === 'force') {
      const outstanding = this.forceOutstanding;
      if (outstanding > 0) {
        return `${outstanding} ${outstanding === 1 ? 'thing has' : 'things have'} to be set before forces can be solved.`;
      }
      const warnings = this.forceWarnings;
      return warnings > 0
        ? `Force analysis runs. ${warnings === 1 ? 'One thing below is' : `${warnings} things below are`} worth a look before trusting the numbers.`
        : 'Force analysis is ready to run.';
    }
    const all = this.readiness;
    if (all.length === 0) {
      return this.unassigned.length > 0
        ? 'Nothing here is a mechanism yet. A chain has to reach ground before it has a position to solve for.'
        : 'Draw a linkage to analyse it.';
    }
    const blockers = this.mechanism.blockerCount();
    if (blockers > 0) {
      return `${blockers} ${blockers === 1 ? 'thing has' : 'things have'} to change before ${
        all.length === 1 ? 'this mechanism' : 'every mechanism'
      } will run.`;
    }
    const warnings = all.reduce(
      (n, r) => n + r.checks.filter((c) => c.state === 'warning').length,
      0
    );
    if (warnings > 0) {
      return `Everything runs. ${warnings === 1 ? 'One result is' : `${warnings} results are`} worth a look before trusting the numbers.`;
    }
    return all.length === 1
      ? 'Ready to animate.'
      : `All ${all.length} mechanisms are ready to animate.`;
  }

  isOpen(readiness: MechanismReadiness): boolean {
    // Open when something is wrong, closed when nothing is — so a drawing that
    // is fine collapses to a list of names. What a mechanism *is* lives in its
    // own panel now; this drawer carries only what is in the way.
    return this.collapsed.has(readiness.id) ? false : readiness.checks.length > 0;
  }

  toggle(readiness: MechanismReadiness): void {
    if (readiness.checks.length === 0) {
      return;
    }
    if (this.isOpen(readiness)) {
      this.collapsed.add(readiness.id);
    } else {
      this.collapsed.delete(readiness.id);
    }
  }

  chipFor(readiness: MechanismReadiness): { text: string; kind: 'blocker' | 'warning' | 'ok' } {
    const blockers = readiness.checks.filter((c) => c.state === 'blocker').length;
    if (blockers > 0) {
      return { text: `${blockers} ${blockers === 1 ? 'blocker' : 'blockers'}`, kind: 'blocker' };
    }
    const warnings = readiness.checks.length;
    if (warnings > 0) {
      return { text: `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`, kind: 'warning' };
    }
    return { text: 'Ready', kind: 'ok' };
  }

  /**
   * Select the whole machine this section is about.
   *
   * The way to a mechanism's own panel in *either* mode: the transport chip
   * only exists while analysing, and Edit needs a route too.
   */
  select(index: number, event: Event): void {
    event.stopPropagation();
    this.activeObj.selectMechanism(index);
  }

  iconFor(check: ReadinessCheck): string {
    return check.state === 'blocker' ? 'error_outline' : 'warning_amber';
  }

  /**
   * Go to the part a check is about: select it, and switch to the mode where it
   * can be changed.
   *
   * Deliberately not an undo step. Being shown where a problem is has not
   * changed the mechanism, and pressing Undo afterwards should take back the
   * last edit rather than the last time the reader looked at something.
   */
  goTo(part: Joint | Link | undefined): void {
    if (!part) return;
    this.tabs.setTab(TabID.EDIT);
    if (part instanceof RealJoint || part instanceof RealLink) {
      this.activeObj.updateSelectedObj(part);
    }
  }

  nameOf(part: Joint | Link | undefined): string {
    if (!part) return '';
    return (part as RealJoint).name || part.id;
  }
}
