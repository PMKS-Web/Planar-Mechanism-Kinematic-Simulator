import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ForceAnalysisMode } from 'src/app/model/mechanism/force-solver';
import { PrisJoint } from 'src/app/model/joint';
import { Link } from 'src/app/model/link';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { FormBuilder } from '@angular/forms';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';

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
    LForce: false,
    LStress: false,
    JPos: false,
    JVel: false,
    JAcc: false,
    JForce: false,
    JInputForce: false,
  };

  mechStateSub: any;
  selectedReactionLinkId = '';

  constructor(
    public activeSrv: ActiveObjService,
    private fb: FormBuilder,
    public mechanismService: MechanismService,
    public settingsService: SettingsService
  ) {
    this.inputSpeedFormGroup.patchValue({ speed: '0' });
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
  }

  ngOnDestroy() {
    this.mechStateSub?.unsubscribe();
  }

  forceAnalysisMode(): ForceAnalysisMode {
    return this.inputSpeedFormGroup.value.speed === '1' ? 'dynamic' : 'static';
  }

  selectedJointReactionLinks(): Link[] {
    const joint = this.activeSrv.selectedJoint;
    if (!joint) return [];
    const result: Link[] = [];
    for (const linked of joint.links) {
      const root = this.mechanismService.links.find((candidate) => candidate.id === linked.id);
      if (root && !result.some((candidate) => candidate.id === root.id)) result.push(root);
    }
    return result;
  }

  selectedJointHasIndependentReaction(): boolean {
    const joint = this.activeSrv.selectedJoint;
    return !!joint && (joint.ground || this.selectedJointReactionLinks().length >= 2);
  }

  reactionLinkId(): string {
    const links = this.selectedJointReactionLinks();
    return links.some((link) => link.id === this.selectedReactionLinkId)
      ? this.selectedReactionLinkId
      : links[0]?.id ?? '';
  }

  selectReactionLink(linkId: string): void {
    this.selectedReactionLinkId = linkId;
  }

  inputEffortLabel(): string {
    const joint = this.activeSrv.selectedJoint;
    return joint instanceof PrisJoint ||
      joint?.connectedJoints.some(
        (candidate) => candidate instanceof PrisJoint && candidate.input
      )
      ? 'Force'
      : 'Torque';
  }

  validMechanisms() {
    return this.mechanismService.oneValidMechanismExists();
  }

  inputSpeedFormGroup = this.fb.group({
    speed: ['', { updateOn: 'change' }],
  });
}
