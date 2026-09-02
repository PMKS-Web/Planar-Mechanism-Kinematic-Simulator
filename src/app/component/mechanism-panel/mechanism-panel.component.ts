import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { MechanismService } from '../../services/mechanism.service';
import { Mechanism } from '../../model/mechanism/mechanism';
import { ActiveObjService } from '../../services/active-obj.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { MechanismFact } from '../../model/mechanism/readiness';
import { MatIcon } from '@angular/material/icon';

/** One line of the Links section: what a link is, and how long. */
interface LinkRow {
  name: string;
  role: string;
  length: string;
}

/**
 * How much of a turn a link makes about its ground pivot over one cycle, as
 * "all the way round" or not.
 *
 * Unwrapped, so a bar that swings out and back reads as the arc it covered
 * rather than as ending where it started -- the same reason drive-profile
 * unwraps the input's own turn. Undefined when the cycle cannot say: too few
 * samples, or a link the solved copies do not carry.
 */
function sweepOf(link: RealLink, solved: Mechanism): boolean | undefined {
  const frames = solved.joints;
  if (frames.length < 3) return undefined;
  const pivot = link.joints.find((joint) => (joint as RealJoint).ground);
  const arm = link.joints.find((joint) => joint !== pivot);
  if (!pivot || !arm) return undefined;
  const atPivot = frames[0].findIndex((joint) => joint.id === pivot.id);
  const atArm = frames[0].findIndex((joint) => joint.id === arm.id);
  if (atPivot === -1 || atArm === -1) return undefined;

  let turned = 0;
  let least = 0;
  let most = 0;
  let previous: number | undefined;
  for (const frame of frames) {
    const angle = Math.atan2(frame[atArm].y - frame[atPivot].y, frame[atArm].x - frame[atPivot].x);
    if (previous !== undefined) {
      let step = angle - previous;
      // One sample is a degree of input, so a jump of more than half a turn is
      // the branch cut of atan2 rather than the link having gone that far.
      if (step > Math.PI) step -= 2 * Math.PI;
      if (step < -Math.PI) step += 2 * Math.PI;
      turned += step;
      least = Math.min(least, turned);
      most = Math.max(most, turned);
    }
    previous = angle;
  }
  // Short of a whole turn by the width of the last sample or two still counts:
  // the cycle stops a step before it repeats its first pose.
  return most - least >= 2 * Math.PI * 0.98;
}

/**
 * What a whole machine is, for when the selection is the machine rather than a
 * part of it.
 *
 * The same panel serves both modes because the facts do not change with the
 * question being asked — only the title above them and, in Edit, the two
 * buttons for acting on the thing as a whole.
 */
@Component({
  selector: 'app-mechanism-panel',
  templateUrl: './mechanism-panel.component.html',
  styleUrls: ['./mechanism-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon],
})
export class MechanismPanelComponent {
  mechanism = inject(MechanismService);
  activeObj = inject(ActiveObjService);
  private settings = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private tabs = inject(SelectedTabService);

  /** Edit offers to rename and delete; analysis only reports. */
  readonly editable = input(false);

  overviewOpen = true;
  linksOpen = true;

  get index(): number {
    return this.activeObj.selectedMechanismIndex;
  }

  get id(): string {
    return this.mechanism.partitions[this.index]?.id ?? '';
  }

  get exists(): boolean {
    return this.index >= 0 && this.index < this.mechanism.partitions.length;
  }

  get ready(): boolean {
    return this.mechanism.mechanisms[this.index]?.isMechanismValid() ?? false;
  }

  get blockers(): number {
    return (
      this.mechanism
        .readinessOfEachMechanism()
        [this.index]?.checks.filter((check) => check.state === 'blocker').length ?? 0
    );
  }

  get statusText(): string {
    if (this.ready) {
      return 'Ready';
    }
    const count = this.blockers;
    return count === 1 ? '1 blocker' : `${count} blockers`;
  }

  get facts(): MechanismFact[] {
    return this.mechanism.readinessOfEachMechanism()[this.index]?.facts ?? [];
  }

  /**
   * Every link in the machine, with what it does.
   *
   * The role is read off the geometry rather than stored: a bar with one end on
   * ground is a crank or a rocker depending on whether it can go all the way
   * round, and one with neither end grounded couples the two.
   */
  get links(): LinkRow[] {
    const partition = this.mechanism.partitions[this.index];
    if (!partition) {
      return [];
    }
    return partition.links
      .filter((link): link is RealLink => link instanceof RealLink)
      .map((link) => ({
        name: link.name || link.id,
        role: this.roleOf(link),
        length: this.lengthOf(link),
      }));
  }

  /**
   * What one link does, in the words a reader of a four-bar expects.
   *
   * "Grounded" is reserved for a body that genuinely cannot move: two of its
   * joints pinned to the frame leave it nowhere to go. One pinned joint is a
   * pivot, not a fixture -- the output of an ordinary crank-rocker has one, and
   * calling it grounded describes it as fixed while it swings on screen.
   */
  private roleOf(link: RealLink): string {
    if (link.joints.some((joint) => (joint as RealJoint).input)) {
      return 'Input';
    }
    const grounded = link.joints.filter((joint) => (joint as RealJoint).ground).length;
    if (grounded === 0) {
      return 'Coupler';
    }
    if (grounded > 1 || link.joints.length < 2) {
      return 'Grounded';
    }
    const full = this.turnsFully(link);
    // Whether it revolves is a fact about the solved cycle, and a machine that
    // does not run has no cycle to read it from. Say what is known -- it turns
    // on ground -- rather than pick one of the two names at random.
    return full === undefined ? 'Grounded pivot' : full ? 'Crank' : 'Rocker';
  }

  /**
   * Does this link carry all the way round its ground pivot?
   *
   * Measured off the solved cycle rather than from link lengths: Grashof
   * answers this for a four-bar and says nothing about the six-bars and
   * slider chains the same panel has to describe. Cached against the Mechanism
   * object, which is replaced whenever the drawing changes, because the
   * template asks for every row on every change-detection pass.
   */
  private turnsFully(link: RealLink): boolean | undefined {
    const solved = this.mechanism.mechanisms[this.index];
    if (!solved?.isMechanismValid()) return undefined;
    if (this.rotationCache?.mechanism !== solved) {
      this.rotationCache = { mechanism: solved, byLink: new Map() };
    }
    const known = this.rotationCache.byLink.get(link.id);
    if (known !== undefined) return known;
    const answer = sweepOf(link, solved);
    this.rotationCache.byLink.set(link.id, answer);
    return answer;
  }

  private rotationCache?: { mechanism: Mechanism; byLink: Map<string, boolean | undefined> };

  /** End to end, in the units the mechanism is drawn in. */
  private lengthOf(link: RealLink): string {
    const ends = link.joints;
    if (ends.length < 2) {
      return '—';
    }
    const span = Math.hypot(
      ends[ends.length - 1].x - ends[0].x,
      ends[ends.length - 1].y - ends[0].y
    );
    return this.nup.formatModelLength(span, this.settings.lengthUnit.value);
  }

  /** The drawer that answers the question this mode is asking. */
  openSetup(): void {
    RightPanelComponent.tabClicked(
      this.tabs.getCurrentTab() === TabID.FORCE
        ? RightPanelComponent.FORCE_SETUP_TAB
        : RightPanelComponent.KINEMATIC_SETUP_TAB
    );
  }

  /** What the panel points a reader at next, which differs by analysis. */
  get footerHint(): string {
    if (this.editable()) {
      return 'Select one of its joints or links on the grid to edit that part.';
    }
    if (!this.ready) {
      const count = this.blockers;
      return count === 1
        ? 'This mechanism cannot run yet. Press the blocker above to see what it needs.'
        : 'This mechanism cannot run yet. Press the blockers above to see what it needs.';
    }
    return this.tabs.getCurrentTab() === TabID.FORCE
      ? 'Select a joint or link on the grid for the reactions it carries, or the input for the effort that drives this mechanism.'
      : 'Select a joint or link on the grid for its position, velocity and acceleration graphs.';
  }

  /** Select one of its parts instead, so the reader can edit that. */
  clearSelection(): void {
    this.activeObj.updateSelectedObj(null);
  }

  deleteMechanism(): void {
    this.mechanism.deleteMechanism(this.index);
  }
}
