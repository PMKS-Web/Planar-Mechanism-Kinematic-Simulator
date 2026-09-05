import { SelectedTabService, TabID } from '../../selected-tab.service';
import {
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ViewportService } from '../../services/viewport.service';
import { ForceAnalysisMode, ForceReactionIndex } from 'src/app/model/mechanism/force-solver';
import { Mechanism } from 'src/app/model/mechanism/mechanism';
import { PrisJoint, RealJoint } from 'src/app/model/joint';
import { RealLink } from 'src/app/model/link';
import { Cylinder, cylinderJoints, isCylinderInterior } from 'src/app/model/cylinder';
import { ActiveObjService, ActiveObjType } from 'src/app/services/active-obj.service';
import { Force } from 'src/app/model/force';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { MatIcon } from '@angular/material/icon';
import { MechanismPanelComponent } from '../mechanism-panel/mechanism-panel.component';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { AnalysisGraphSectionComponent } from '../analysis-graph-section/analysis-graph-section.component';
import { RadioComponent } from '../BLOCKS/radio/radio.component';
import { ToggleComponent } from '../BLOCKS/toggle/toggle.component';
import { AnalysisCompareService } from '../../services/analysis-compare.service';

/** One expandable force graph: the reaction between `linkId` and `jointId`. */
export interface ForceAnalysisRow {
  jointId: string;
  jointName: string;
  linkId: string;
  linkName: string;
  /**
   * What to head this graph with.
   *
   * Carried rather than composed at the template, because a slider does not
   * read as either of the two names: a pin's second reaction is the force in
   * its slot, and it belongs to the thing the slot is cut into.
   */
  label: string;
}

@Component({
  selector: 'app-analysis-panel',
  templateUrl: './analysis-panel.component.html',
  styleUrls: ['./analysis-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    TitleBlock,
    MatIcon,
    MechanismPanelComponent,
    PanelSectionComponent,
    AnalysisGraphSectionComponent,
    RadioComponent,
    ToggleComponent,
    FormsModule,
    ReactiveFormsModule,
    NgTemplateOutlet,
  ],
})
export class AnalysisPanelComponent implements OnInit, OnDestroy, DoCheck {
  viewport = inject(ViewportService);
  activeSrv = inject(ActiveObjService);
  private fb = inject(FormBuilder);
  mechanismService = inject(MechanismService);
  settingsService = inject(SettingsService);
  private tabs = inject(SelectedTabService);
  private comparison = inject(AnalysisCompareService);

  /**
   * The tuning gesture is polled, not subscribed to: every edit ends in a
   * rebuild that publishes on nothing, which is the idiom the tutorial card
   * uses for the same reason.
   */
  ngDoCheck(): void {
    this.comparison.sync();
  }

  /** A part is under the hand right now. */
  get tuning(): boolean {
    return this.comparison.live && !!this.comparison.record;
  }

  /** What is under the hand -- not necessarily what is graphed. */
  get heldLabel(): string {
    return this.comparison.record?.label ?? '';
  }

  /** Whether any open graph holds the curves from before a drag. */
  get hasComparison(): boolean {
    return this.comparison.hasComparison;
  }

  get compare(): boolean {
    return this.comparison.compare;
  }

  /**
   * The switch's form, mirroring the shared flag the graphs read. A form
   * because the app's toggle block is form-bound, and the panel's switch
   * should be the block every other switch in the app is.
   */
  compareForm = this.fb.group({ compare: [true] });

  /**
   * "Kinematics for Joint C": the mode as a noun, and the part.
   *
   * It said "Kinematic Analysis for Joint C", which is the tab's name again
   * over a panel the reader reached by pressing that tab.
   */
  get panelTitle(): string {
    const part =
      this.shownType === 'Joint' ? `Joint ${this.shownJoint.name}` : this.selectedBodyLabel;
    return `${this.modeNoun} for ${part}`;
  }

  /**
   * The moment the rows read at, or why there is nothing to read.
   *
   * While a part is under the hand the numbers are following it and no time
   * describes them. A force panel with nothing to graph says why here, with
   * the way out in the hint row below.
   */
  get subtitle(): string {
    if (this.tuning) return 'Following your hand';
    if (this.showForce && this.shownType === 'Joint' && !this.jointForceHasGraphs) {
      return `Only one part meets Joint ${this.shownJoint?.name}, so there is no force to graph here.`;
    }
    if (this.showForce && this.shownType === 'Link' && !this.linkForceHasGraphs) {
      return `${this.selectedBodyLabel} does not meet another part at any of its joints, so there is no force to graph here.`;
    }
    return `Readings at ${this.readingsAt.toFixed(2)} s`;
  }

  /** Where the shown part's own machine stands in its cycle, in seconds. */
  private get readingsAt(): number {
    const part = this.selectedPart;
    const mechanism = part && this.mechanismService.mechanismForId(part.id);
    const at = mechanism ? this.mechanismService.mechanisms.indexOf(mechanism) : -1;
    return at === -1 ? 0 : this.mechanismService.secondsOf(at);
  }

  /**
   * What the empty analysis panel says, which depends on why it is empty.
   *
   * Nothing selected is a different situation from a selection whose mechanism
   * cannot run, and telling the second reader to select something would send
   * them round a loop they are already standing in.
   */
  get analysisHelpLead(): string {
    const part = this.selectedPart;
    if (part) {
      const owner = this.mechanismService.indexOfMechanismContaining(part);
      if (owner !== -1 && !this.mechanismService.mechanisms[owner]?.isMechanismValid()) {
        return `Finish analysis setup on ${this.mechanismService.partitions[owner].id} to see its graphs.`;
      }
      return 'This joint or link is not in a mechanism that can be solved, so it has no graphs.';
    }
    return 'Select a joint or link to analyze it.';
  }

  /**
   * What this mode has to offer, which is not what the other one offers.
   *
   * Force mode showed the kinematic sentence on entry -- a promise of position,
   * velocity and acceleration graphs made by the panel that draws reactions.
   */
  get analysisHelpHint(): string {
    // The verb the reader's device gives them, as everywhere else in the app.
    const pick = this.viewport.isTouch() ? 'Tap' : 'Click';
    return this.showForce
      ? `${pick} a joint for the reactions it carries, or a link for the forces at its joints. The input joint carries the effort that drives the mechanism.`
      : `${pick} a joint for position, velocity and acceleration graphs, or a link for its angular kinematics.`;
  }

  /**
   * The other thing a hand can do here, on its own line with its own mark.
   *
   * Dragging edits here now, and it deliberately does *not* move what is
   * graphed -- so without saying so, a drag that leaves the heading on another
   * joint reads as a stale panel rather than as the point. One idea per row,
   * as the Edit panel's empty state has it: selecting and tuning are two
   * gestures, and one icon for both said only "the pointer".
   */
  get analysisTuneHint(): string {
    return this.viewport.isTouch()
      ? 'Drag a joint or link to tune it. The graphs stay on whatever you tapped.'
      : 'Drag a joint or link to tune it. The graphs stay on whatever you clicked.';
  }

  /**
   * What this panel is graphing, which a drag does not change.
   *
   * Click selects, drag tunes -- see `ActiveObjService.holdGraphSubject`. The
   * hold lives on the service because the panel cannot see a press early
   * enough: the selection changes on pointer-down, and the drag state that
   * would have gated it here is not armed until after.
   */
  get shownType(): ActiveObjType {
    return this.activeSrv.graphType;
  }

  get shownJoint(): RealJoint {
    return this.activeSrv.graphJoint;
  }

  get shownLink(): RealLink {
    return this.activeSrv.graphLink;
  }

  get shownForce(): Force {
    return this.activeSrv.graphForce;
  }

  /**
   * Show the reactions on the part this force pushes.
   *
   * The same selection a click on that link would make, so the panel that
   * follows is the ordinary one rather than a second view of it.
   */
  graphTheLinkUnder(): void {
    const link = this.shownForce?.link;
    if (link) this.activeSrv.updateSelectedObj(link);
  }

  /** Whether the force graphs this card points at exist in the mode we are in. */
  get inForceAnalysis(): boolean {
    return this.tabs.getCurrentTab() === TabID.FORCE;
  }

  /**
   * The way to the reactions from Kinematic Analysis: the other mode.
   *
   * The selection is kept, so the reader lands on the same force's card there
   * -- the one that offers the link to graph.
   */
  goToForceAnalysis(): void {
    this.tabs.setTab(TabID.FORCE);
  }

  /** The selected joint or link, when the selection is one of those. */
  private get selectedPart(): RealJoint | RealLink | undefined {
    if (this.shownType === 'Joint') return this.shownJoint;
    if (this.shownType === 'Link') return this.shownLink;
    return undefined;
  }

  /**
   * Whether the selected part's own machine can be solved.
   *
   * Not "does the drawing hold a valid mechanism": with a four-bar beside a
   * half-drawn chain, that question says yes for a joint on the chain, and the
   * panel answered it with a full set of graph cards whose every header read
   * "—" over an all-null plot. `isPartSimulatable` is the per-part question,
   * and it is the one the context menu already asks before offering analysis.
   */
  get selectionIsSimulatable(): boolean {
    const part = this.selectedPart;
    return part ? this.mechanismService.isPartSimulatable(part) : false;
  }

  /** The empty state stands in wherever the selection has no graphs to show. */
  get showAnalysisHelp(): boolean {
    const selected = this.shownType;
    if (selected === 'Grid' || selected === 'Nothing') return true;
    return (selected === 'Joint' || selected === 'Link') && !this.selectionIsSimulatable;
  }

  /**
   * Which half of the analysis this mode is asking for.
   *
   * The two used to sit one above the other in a single Analyze panel, which
   * meant every reader scrolled past the answer they did not want and neither
   * question could say what *it* needed. They are separate modes now, so the
   * panel shows one at a time.
   */
  get showKinematic(): boolean {
    return this.tabs.getCurrentTab() !== TabID.FORCE;
  }

  get showForce(): boolean {
    return this.tabs.getCurrentTab() === TabID.FORCE;
  }

  /**
   * Whether a card is open, for a key that may not be in the map yet.
   *
   * The force rows are keyed by the part they are about (`JForce_AB`), so they
   * are absent until the reader first opens one — and the card was handed
   * `undefined`, which drops `aria-expanded` from the button entirely rather
   * than reporting it collapsed. A screen reader was told nothing about the
   * one kind of row whose state it could not otherwise guess.
   */
  isExpanded(key: string): boolean {
    return this.graphExpanded[key] ?? false;
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
    LInputForce: false,
  };

  mechStateSub?: Subscription;
  private subscriptions = new Subscription();
  private rowCache?: { key: string; mechanism: unknown; rows: ForceAnalysisRow[] };

  constructor() {
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

    this.subscriptions.add(
      this.compareForm.valueChanges.subscribe((value) => {
        if (!!value.compare !== this.comparison.compare) this.comparison.toggleCompare();
      })
    );

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
   * What a row calls the body it graphs -- the name the reader has seen on the
   * canvas, not the internal one.
   *
   * A cylinder's rod carries the id of the pin buried inside it, and a slider
   * block's ends in the letter of the sliding joint under it. Both were
   * printed straight into the label, so the panel offered a force on a link
   * the reader had never been shown and could not find.
   */
  private linkName(linkId: string): string {
    const body = this.mechanismService.links.find((link) => link.id === linkId);
    return body ? this.mechanismService.bodyLabel(body) : linkId;
  }

  /**
   * One reaction a joint carries, named for what is on the other side of it.
   *
   * A slider's block is not one of them. It is a zero-length link between the
   * pin and its slot, so the force between the pin and the block is the force
   * between the pin and the bar, negated -- already on this panel under the
   * bar's own name. What the block has of its own is the force in the slot,
   * which is what sizes a slide and is reachable from nowhere else.
   */
  private jointRow(jointId: string, linkId: string): ForceAnalysisRow {
    const slider = this.mechanismService.slotReactionOf(this.jointById(jointId));
    if (slider && slider.block.id === linkId) {
      return {
        jointId: slider.slot.id,
        jointName: this.jointName(slider.slot.id),
        linkId,
        linkName: slider.on,
        label: `Force on ${slider.on}`,
      };
    }
    return {
      jointId,
      jointName: this.jointName(jointId),
      linkId,
      linkName: this.linkName(linkId),
      label: `Force on ${this.linkName(linkId)}`,
    };
  }

  private jointName(jointId: string): string {
    return this.mechanismService.joints.find((joint) => joint.id === jointId)?.name ?? jointId;
  }

  /**
   * Rows are rebuilt only when the selection, the mode, or the mechanism
   * changes; the template reads them on every change-detection pass.
   */
  private cachedRows(kind: 'joint' | 'link', partId: string): ForceAnalysisRow[] {
    // The machine the selected part belongs to. Reactions are a property of one
    // machine, so a part in another one -- or in none, as an ungrounded chain is
    // -- must not be answered out of whichever mechanism came first.
    const mechanism = this.mechanismService.mechanismForId(partId);
    const key = `${kind}|${partId}|${this.forceAnalysisMode()}`;
    if (this.rowCache?.key === key && this.rowCache.mechanism === mechanism) {
      return this.rowCache.rows;
    }

    const index = this.reactionIndex(mechanism);
    let rows: ForceAnalysisRow[] = [];
    if (index && partId) {
      rows =
        kind === 'joint'
          ? (index.linksByJoint.get(partId) ?? []).map((linkId) => this.jointRow(partId, linkId))
          : this.bodyMemberIds(partId).flatMap((memberId) =>
              (index.jointsByLink.get(memberId) ?? []).map((jointId) => {
                // A slot is named after the slider it belongs to: it has no
                // marker of its own and no name a reader has ever seen.
                const where =
                  this.mechanismService.slotName(jointId) ?? `Joint ${this.jointName(jointId)}`;
                return {
                  jointId,
                  jointName: this.jointName(jointId),
                  // The member that actually meets this joint, not the body the
                  // reader selected: it is what the reaction is asked of.
                  linkId: memberId,
                  linkName: this.linkName(memberId),
                  label: `Force at ${where}`,
                };
              })
            );
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
    return this.cachedRows('joint', this.shownJoint?.id ?? '');
  }

  /** In Force mode, does the selected joint have any graph to offer? */
  get jointForceHasGraphs(): boolean {
    return this.jointForceRows().length > 0 || !!this.shownJoint?.input;
  }

  /** In Force mode, does the selected link have any graph to offer? */
  get linkForceHasGraphs(): boolean {
    return this.linkForceRows().length > 0 || !!this.inputEffortJoint();
  }

  /**
   * The links a selected body is made of.
   *
   * One for an ordinary bar. A cylinder is one body to the reader and three
   * links to the solver, and its two mounts sit on different ones -- the
   * barrel carries the far mount, the rod carries the other. Asking only the
   * link the canvas hands over (the barrel) listed the barrel's mount and
   * silently dropped the rod's, so a ram showed a force at one end and nothing
   * at the end it is pushing.
   */
  private bodyMemberIds(partId: string): string[] {
    const body = this.mechanismService.links.find((link) => link.id === partId);
    const sealed = body && this.mechanismService.cylinderAt(body);
    if (!sealed) return [partId];
    return [sealed.barrel.id, sealed.rod.id, sealed.block.id];
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

  /** Point at the thing on the grid these numbers describe, while asked to. */
  highlightCoM(on: boolean): void {
    this.settingsService.previewCoMLinkId = on ? (this.activeSrv.selectedLink?.id ?? null) : null;
  }

  /**
   * Which analysis this panel is showing, as the noun the title starts with.
   *
   * It used to be an accordion inside the panel headed "Kinematic Analysis" --
   * a heading that only ever said what mode the reader had already chosen, and
   * one more thing to open before reaching a graph. The panel's own title says
   * it now.
   */
  get modeNoun(): string {
    return this.tabs.getCurrentTab() === TabID.FORCE ? 'Forces' : 'Kinematics';
  }

  /**
   * What to call the selected body.
   *
   * A cylinder is drawn, selected and edited as one part, so analyzing it under
   * the name of its barrel link contradicts everything else the app says about
   * it -- the canvas outlines the whole ram while the panel headed itself
   * "Analysis for Link GN".
   */
  get selectedBodyLabel(): string {
    const sealed = this.selectedCylinder;
    if (!sealed) return `Link ${this.activeSrv.selectedLink.name}`;
    return `Cylinder ${sealed.barrelFar.name || sealed.barrelFar.id}${
      sealed.rodFar.name || sealed.rodFar.id
    }`;
  }

  inputEffortLabel(driven?: RealJoint): string {
    const joint = driven ?? this.activeSrv.selectedJoint;
    return joint instanceof PrisJoint ||
      joint?.connectedJoints.some((candidate) => candidate instanceof PrisJoint && candidate.input)
      ? 'Force'
      : 'Torque';
  }

  /**
   * The driven joint a selected body carries, for the bodies whose drive the
   * reader cannot select on its own.
   *
   * A ram is driven by a joint buried inside the part: no marker, no hitbox,
   * no row in the Edit panel. The graph of the effort that drive has to supply
   * lived on the joint panel, so for a ram it lived on a panel nobody could
   * open -- the one input in the app whose own force could not be read. Every
   * other input sits on a joint a reader can click, and the joint panel
   * already carries it there.
   */
  inputEffortJoint(): RealJoint | undefined {
    const sealed = this.selectedCylinder;
    if (!sealed) return undefined;
    return cylinderJoints(sealed).find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    );
  }

  validMechanisms() {
    return this.mechanismService.oneValidMechanismExists();
  }

  forceAnalysisFormGroup = this.fb.group({
    mode: ['0', { updateOn: 'change' }],
  });
}
