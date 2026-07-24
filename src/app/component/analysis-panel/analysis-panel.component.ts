import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ForceAnalysisMode, ForceReactionIndex } from 'src/app/model/mechanism/force-solver';
import { PrisJoint } from 'src/app/model/joint';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { FormBuilder } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';

/** One expandable force graph: the reaction between `linkId` and `jointId`. */
export interface ForceAnalysisRow {
  jointId: string;
  jointName: string;
  linkId: string;
  linkName: string;
}

@Component({
  selector: 'app-analysis-panel',
  templateUrl: './analysis-panel.component.html',
  styleUrls: ['./analysis-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AnalysisPanelComponent {
  //A dictionary for wether each graph is expanded or not
  graphExpanded: { [key: string]: boolean } = {
    LKineAna: true,
    LForceAna: true,
    JKineAna: true,
    JForceAna: true,
    LAng: false,
    LAngVel: false,
    LAngAcc: false,
    LPos: false,
    LVel: false,
    LAcc: false,
    LStress: false,
    JPos: false,
    JVel: false,
    JAcc: false,
    JInputForce: false,
  };

  mechStateSub: any;
  private subscriptions = new Subscription();
  private rowCache?: { key: string; mechanism: unknown; rows: ForceAnalysisRow[] };

  constructor(
    public activeSrv: ActiveObjService,
    private fb: FormBuilder,
    public mechanismService: MechanismService,
    public settingsService: SettingsService
  ) {
    this.forceAnalysisFormGroup.patchValue(
      { mode: this.settingsService.forceAnalysisMode.value === 'dynamic' ? '1' : '0' },
      { emitEvent: false }
    );
  }

  ngOnInit(): void {
    this.mechStateSub = this.mechanismService.onMechUpdateState.subscribe((data) => {
      switch (data) {
        case 3:
          if (this.mechanismService.oneValidMechanismExists()) {
            this.mechanismService.onMechUpdateState.next(2);
          }
          break;
      }
    });

    // The toggle is one mechanism-wide setting, so the control and the service
    // mirror each other instead of the panel owning the value.
    this.subscriptions.add(
      this.forceAnalysisFormGroup.valueChanges.subscribe((value) => {
        const mode: ForceAnalysisMode = value.mode === '1' ? 'dynamic' : 'static';
        if (this.settingsService.forceAnalysisMode.value !== mode) {
          this.settingsService.forceAnalysisMode.next(mode);
        }
      })
    );
    this.subscriptions.add(
      this.settingsService.forceAnalysisMode.subscribe((mode) => {
        const control = mode === 'dynamic' ? '1' : '0';
        if (this.forceAnalysisFormGroup.value.mode !== control) {
          this.forceAnalysisFormGroup.patchValue({ mode: control }, { emitEvent: false });
        }
      })
    );
  }

  ngOnDestroy() {
    this.mechStateSub?.unsubscribe();
    this.subscriptions.unsubscribe();
  }

  forceAnalysisMode(): ForceAnalysisMode {
    return this.settingsService.forceAnalysisMode.value;
  }

  /** Joint id -> link ids and back, for the single mechanism-wide reaction set. */
  private reactionIndex(): ForceReactionIndex | undefined {
    if (!this.mechanismService.oneValidMechanismExists()) return undefined;
    return this.mechanismService.mechanisms[0]?.getForceAnalysis(this.forceAnalysisMode())
      .reactionIndex;
  }

  private linkName(linkId: string): string {
    return this.mechanismService.links.find((link) => link.id === linkId)?.name ?? linkId;
  }

  private jointName(jointId: string): string {
    return this.mechanismService.joints.find((joint) => joint.id === jointId)?.name ?? jointId;
  }

  /**
   * Rows are rebuilt only when the selection, the mode, or the mechanism
   * changes; the template reads them on every change-detection pass.
   */
  private cachedRows(kind: 'joint' | 'link', partId: string): ForceAnalysisRow[] {
    const mechanism = this.mechanismService.mechanisms[0];
    const key = `${kind}|${partId}|${this.forceAnalysisMode()}`;
    if (this.rowCache?.key === key && this.rowCache.mechanism === mechanism) {
      return this.rowCache.rows;
    }

    const index = this.reactionIndex();
    let rows: ForceAnalysisRow[] = [];
    if (index && partId) {
      rows =
        kind === 'joint'
          ? (index.linksByJoint.get(partId) ?? []).map((linkId) => ({
              jointId: partId,
              jointName: this.jointName(partId),
              linkId,
              linkName: this.linkName(linkId),
            }))
          : (index.jointsByLink.get(partId) ?? []).map((jointId) => ({
              jointId,
              jointName: this.jointName(jointId),
              linkId: partId,
              linkName: this.linkName(partId),
            }));
      rows.sort((a, b) =>
        kind === 'joint'
          ? a.linkName.localeCompare(b.linkName)
          : a.jointName.localeCompare(b.jointName)
      );
    }
    this.rowCache = { key, mechanism, rows };
    return rows;
  }

  /** One row per link that reacts at the selected joint. */
  jointForceRows(): ForceAnalysisRow[] {
    return this.cachedRows('joint', this.activeSrv.selectedJoint?.id ?? '');
  }

  /** One row per external joint of the selected link. */
  linkForceRows(): ForceAnalysisRow[] {
    return this.cachedRows('link', this.activeSrv.selectedLink?.id ?? '');
  }

  inputEffortLabel(): string {
    const joint = this.activeSrv.selectedJoint;
    return joint instanceof PrisJoint ||
      joint?.connectedJoints.some((candidate) => candidate instanceof PrisJoint && candidate.input)
      ? 'Force'
      : 'Torque';
  }

  validMechanisms() {
    return this.mechanismService.oneValidMechanismExists();
  }

  forceAnalysisFormGroup = this.fb.group({
    mode: ['0', { updateOn: 'change' }],
  });
}
