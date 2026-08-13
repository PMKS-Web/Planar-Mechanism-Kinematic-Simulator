import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { MODEL_SCALE } from '../../model/render-scale';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { MechanismService } from '../../services/mechanism.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { MechanismFact } from '../../model/mechanism/readiness';

/** One line of the Links section: what a link is, and how long. */
interface LinkRow {
  name: string;
  role: string;
  length: string;
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
  standalone: false,
})
export class MechanismPanelComponent {
  /** Edit offers to rename and delete; analysis only reports. */
  @Input() editable = false;

  overviewOpen = true;
  linksOpen = true;

  constructor(
    public mechanism: MechanismService,
    public activeObj: ActiveObjService,
    private settings: SettingsService,
    private nup: NumberUnitParserService
  ) {}

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
      .map((link) => {
        const grounded = link.joints.filter((joint) => (joint as RealJoint).ground).length;
        const driven = link.joints.some((joint) => (joint as RealJoint).input);
        const role = driven ? 'Input' : grounded > 0 ? 'Grounded' : 'Coupler';
        return {
          name: link.name || link.id,
          role,
          length: this.lengthOf(link),
        };
      });
  }

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
    return `${(span / MODEL_SCALE).toFixed(2)} ${this.nup.unitLabel(this.settings.lengthUnit.value)}`;
  }

  openSetup(): void {
    RightPanelComponent.tabClicked(RightPanelComponent.KINEMATIC_SETUP_TAB);
  }

  /** Select one of its parts instead, so the reader can edit that. */
  clearSelection(): void {
    this.activeObj.updateSelectedObj(null);
  }

  deleteMechanism(): void {
    const partition = this.mechanism.partitions[this.index];
    if (!partition) {
      return;
    }
    // Deleting its joints takes the links with them, which is what "delete this
    // mechanism" means: nothing of it is left, and nothing else is touched.
    //
    // The joints go one at a time, but the gesture is a single press: none of
    // them saves, and the removal is minted as one undo entry below. Otherwise
    // restoring the mechanism would cost one undo per joint it happened to have.
    [...partition.ownJoints].forEach((joint) => {
      this.activeObj.updateSelectedObj(joint);
      this.mechanism.deleteJoint(false);
    });
    this.activeObj.updateSelectedObj(null);
    this.mechanism.finishStructuralEdit(true);
  }
}
