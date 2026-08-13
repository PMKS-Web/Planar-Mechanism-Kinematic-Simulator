import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ForceAnalysisMode, ForceReactionIndex } from 'src/app/model/mechanism/force-solver';
import { Mechanism } from 'src/app/model/mechanism/mechanism';
import { PrisJoint, RealJoint } from 'src/app/model/joint';
import { Cylinder, isCylinderInterior } from 'src/app/model/cylinder';
import { LengthUnit } from 'src/app/model/unit-enums';
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
  /**
   * Which half of the analysis this mode is asking for.
   *
   * The two used to sit one above the other in a single Analyze panel, which
   * meant every reader scrolled past the answer they did not want and neither
   * question could say what *it* needed. They are separate modes now, so the
   * panel shows one at a time.
   */
  /**
   * What the empty analysis panel says, which depends on why it is empty.
   *
   * Nothing selected is a different situation from a selection whose mechanism
   * cannot run, and telling the second reader to select something would send
   * them round a loop they are already standing in.
   */
  get analysisHelpLead(): string {
    const selected = this.activeSrv.getSelectedObjType();
    if (selected === 'Joint' || selected === 'Link') {
      const part =
        this.activeSrv.objType === 'Joint'
          ? this.activeSrv.selectedJoint
          : this.activeSrv.selectedLink;
      const owner = part ? this.mechanismService.indexOfMechanismContaining(part) : -1;
      if (owner !== -1 && !this.mechanismService.mechanisms[owner]?.isMechanismValid()) {
        return `Finish analysis setup on ${this.mechanismService.partitions[owner].id} to see its graphs.`;
      }
    }
    return 'Select a part of the linkage to analyze it.';
  }

  get showKinematic(): boolean {
    return this.tabs.getCurrentTab() !== TabID.FORCE;
  }

  get showForce(): boolean {
    return this.tabs.getCurrentTab() === TabID.FORCE;
  }

  //A dictionary for wether each graph is expanded or not
  graphExpanded: { [key: string]: boolean } = {
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

  /**
   * What the drive is doing, in the terms the drive itself has (§5.5).
   *
   * A driven block does not turn, so neither "RPM" nor "clockwise" says
   * anything true about it — the header used to report a cylinder extending at
   * 5 cm/s as turning at 5.00 RPM clockwise.
   */
  get inputSummary(): string {
    const driven = this.drivenJointOfSelection;
    const signed = this.mechanismService.driveSpeedOf(driven);
    const speed = Math.abs(signed);
    if (driven instanceof PrisJoint) {
      const direction = signed < 0 ? 'retracting' : 'extending';
      return `The input speed is set to ${speed.toFixed(2)} ${this.linearSpeedUnit}, ${direction}.`;
    }
    const direction = signed < 0 ? 'clockwise' : 'counter-clockwise';
    return `The input speed is set to ${speed.toFixed(2)} RPM in the ${direction} direction.`;
  }

  /**
   * Where that speed is actually changed.
   *
   * A cylinder is driven by a joint buried inside it that the canvas gives no
   * hitbox and the Edit panel never lists, so sending the reader to "the input
   * joint" sends them somewhere they cannot go. The field is on the cylinder,
   * under its own name.
   */
  get inputEditHint(): string {
    const driven = this.drivenJointOfSelection;
    const sealed = driven && this.mechanismService.cylinderAt(driven);
    if (sealed) {
      const name = `Cylinder ${sealed.barrelFar.name || sealed.barrelFar.id}${
        sealed.rodFar.name || sealed.rodFar.id
      }`;
      return `This can be changed under Expansion Speed in ${name}'s Edit panel.`;
    }
    return "This can be changed in the input joint's Edit panel.";
  }

  /**
   * The drive of the mechanism the selection belongs to.
   *
   * A drawing can hold several mechanisms turning at different speeds, so the
   * first driven joint in the document is only the right answer when there is
   * one of them.
   */
  private get drivenJointOfSelection(): RealJoint | undefined {
    const selection =
      this.activeSrv.objType === 'Link'
        ? this.activeSrv.selectedLink
        : this.activeSrv.objType === 'Joint'
          ? this.activeSrv.selectedJoint
          : undefined;
    const own = selection && this.mechanismService.partitionContaining(selection);
    const pool = own ? own.joints : this.mechanismService.joints;
    return pool.find((joint): joint is RealJoint => joint instanceof RealJoint && joint.input);
  }

  /** Length per second, spelled the way the mechanism's length unit is. */
  private get linearSpeedUnit(): string {
    const unit = this.settingsService.lengthUnit.value;
    return unit === LengthUnit.INCH ? 'in/s' : unit === LengthUnit.METER ? 'm/s' : 'cm/s';
  }

  constructor(
    public activeSrv: ActiveObjService,
    private fb: FormBuilder,
    public mechanismService: MechanismService,
    public settingsService: SettingsService,
    private tabs: SelectedTabService
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

  /** Joint id -> link ids and back, for one mechanism's reaction set. */
  private reactionIndex(mechanism: Mechanism | undefined): ForceReactionIndex | undefined {
    if (!mechanism?.isMechanismValid()) return undefined;
    return mechanism.getForceAnalysis(this.forceAnalysisMode()).reactionIndex;
  }

  /**
   * The machine the selected part belongs to. Reactions are a property of one
   * machine, so a part in another one -- or in none, as an ungrounded chain is
   * -- must not be answered out of whichever mechanism came first.
   */
  private mechanismFor(kind: 'joint' | 'link', partId: string): Mechanism | undefined {
    const part =
      kind === 'joint'
        ? this.jointById(partId)
        : this.mechanismService.links.find((link) => link.id === partId);
    return part ? this.mechanismService.mechanismContaining(part) : undefined;
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
    const mechanism = this.mechanismFor(kind, partId);
    const key = `${kind}|${partId}|${this.forceAnalysisMode()}`;
    if (this.rowCache?.key === key && this.rowCache.mechanism === mechanism) {
      return this.rowCache.rows;
    }

    const index = this.reactionIndex(mechanism);
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
    const rows = this.cachedRows('link', this.activeSrv.selectedLink?.id ?? '');
    const sealed = this.selectedCylinder;
    if (!sealed) return rows;
    // A cylinder's interior joints are not attachment points. The canvas gives
    // them no hitbox, the Edit panel does not list them, and a pin reaction at
    // the buried barrel end or the slider inside the bore is not a force
    // anything in the world applies -- it is internal to a part the user is
    // being shown as one body.
    return rows.filter((row) => !isCylinderInterior(sealed, this.jointById(row.jointId)!));
  }

  private jointById(id: string) {
    return this.mechanismService.joints.find((joint) => joint.id === id);
  }

  /** The sealed cylinder the selected link is a member of, if any. */
  get selectedCylinder(): Cylinder | undefined {
    if (this.activeSrv.objType !== 'Link') return undefined;
    return this.mechanismService.cylinderAt(this.activeSrv.selectedLink);
  }

  /**
   * What to call the selected body.
   *
   * A cylinder is drawn, selected and edited as one part, so analysing it under
   * the name of its barrel link contradicts everything else the app says about
   * it -- the canvas outlines the whole ram while the panel headed itself
   * "Analysis for Link GN".
   */
  /**
   * Which analysis this panel is showing.
   *
   * It used to be an accordion inside the panel headed "Kinematic Analysis" --
   * a heading that only ever said what mode the reader had already chosen, and
   * one more thing to open before reaching a graph. The panel's own title says
   * it now.
   */
  get modeLabel(): string {
    return this.tabs.getCurrentTab() === TabID.FORCE ? 'Force Analysis' : 'Kinematic Analysis';
  }

  get selectedBodyLabel(): string {
    const sealed = this.selectedCylinder;
    if (!sealed) return `Link ${this.activeSrv.selectedLink.name}`;
    return `Cylinder ${sealed.barrelFar.name || sealed.barrelFar.id}${
      sealed.rodFar.name || sealed.rodFar.id
    }`;
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
