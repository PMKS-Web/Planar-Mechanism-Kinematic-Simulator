import type { MechanismService } from '../mechanism.service';
import type { SettingsService } from '../settings.service';
import type { SaveHistoryService } from '../save-history.service';
import type { SvgGridService } from '../svg-grid.service';
import type { SelectedTabService } from '../../selected-tab.service';
import type { ActiveObjService } from '../active-obj.service';
import type { EditPermissionService } from '../edit-permission.service';
import type { Observable } from 'rxjs';
import type { LinkHold } from '../../model/link';

/**
 * The shell consumes readings and commands, not the editable graph. These structural
 * views preserve live object identity on the legacy route without requiring a future
 * provider to construct Joint, Link or Mechanism instances merely to draw the chrome.
 * Pick keeps scalar command signatures in sync; graph-valued members are narrowed here.
 */
/** Pass references received from these views back unchanged; do not synthesize a legacy part. */
export interface ChromePart {
  readonly id: string;
}
export interface ChromeJoint extends ChromePart {
  readonly showCurve?: boolean;
}
export interface ChromeLink extends ChromePart {
  readonly name: string;
}
export interface ChromeCycle {
  readonly dof: number;
  readonly cyclePeriod: number;
  readonly reciprocates: boolean;
  readonly hasAddedSamples: boolean;
  readonly joints: readonly unknown[];
  isMechanismValid(): boolean;
}
export interface ChromePartition {
  readonly id: string;
  readonly ownJoints: readonly ChromePart[];
}
export interface ChromeReadiness {
  readonly id: string;
  readonly checks: readonly { readonly state: string; readonly title: string }[];
}
export interface ChromeMechanism extends Pick<
  MechanismService,
  | 'animate'
  | 'animationSpeedMultiplier'
  | 'blockerCount'
  | 'clearStartMoved'
  | 'cyclePeriod'
  | 'directionOf'
  | 'easeToStart'
  | 'forceAnalysisReady'
  | 'hoveredMechanismIndex'
  | 'inputAngleDegrees'
  | 'isAtStartPose'
  | 'isMechanismPlaying'
  | 'isPlaying'
  | 'mechanismTimeStep'
  | 'oneValidMechanismExists'
  | 'reverseDrive'
  | 'secondsOf'
  | 'seekAllAlong'
  | 'seekMechanism'
  | 'seekMechanismTo'
  | 'setAllPlaying'
  | 'setPlaybackDirection'
  | 'setSyncMechanisms'
  | 'solveNow'
  | 'solvingIsDeferred'
  | 'startMovedOn'
  | 'syncMechanisms'
  | 'timeAtStep'
  | 'toggleMechanismPlaying'
  | 'travelOf'
  | 'travelingForward'
  | 'warningCount'
> {
  readonly onMechPositionChange: Observable<number>;
  driveProfileOf(index: number):
    | {
        readonly along: readonly number[];
        readonly continuous: boolean;
        readonly linear: boolean;
        readonly span: number;
      }
    | undefined;
  readonly joints: readonly ChromeJoint[];
  readonly links: readonly unknown[];
  readonly mechanisms: readonly ChromeCycle[];
  readonly partitions: readonly ChromePartition[];
  forceAnalysisRequirements(): readonly { readonly met: boolean; readonly warning?: boolean }[];
  masterMechanism(): ChromeCycle | undefined;
  readinessOfEachMechanism(): readonly ChromeReadiness[];
  isLockedTarget(target: ChromePart): boolean;
  setCurrentPoseAsStart(part: ChromePart): boolean;
  driveSpeedOf(joint: ChromePart | undefined): number;
  drivenJointOf(index: number): ChromePart | undefined;
  hasMassiveLink(): boolean;
  redrawLinks(): void;
}
export interface ChromeSettings extends Pick<
  SettingsService,
  | 'angleUnit'
  | 'animating'
  | 'forceUnit'
  | 'globalUnit'
  | 'isGridDebugOn'
  | 'isShowCOM'
  | 'isShowID'
  | 'isShowTraces'
  | 'lengthUnit'
> {}
export interface ChromeHistory extends Pick<
  SaveHistoryService,
  'canRedo' | 'canUndo' | 'redo' | 'undo'
> {}
export interface ChromeTabs extends Pick<
  SelectedTabService,
  'getCurrentTab' | 'isAnalysisMode' | 'isTabVisible' | 'isWidePanel' | 'setTab' | 'sheetExpanded'
> {}
export interface ChromePermission extends Pick<
  EditPermissionService,
  'refusal' | 'transportHint'
> {}
export interface ChromeGrid extends Pick<
  SvgGridService,
  'cursorAt' | 'zoomIn' | 'zoomOut' | 'scaleToFitLinkage' | 'scaleToFitFullMotion'
> {
  readonly panZoomObject: Pick<SvgGridService['panZoomObject'], 'zoomAtPoint'>;
}
export interface ChromeSelection extends Pick<
  ActiveObjService,
  'objType' | 'getSelectedObjType' | 'selectMechanism' | 'selectedMechanismIndex'
> {
  readonly selectedLink: ChromeLink | undefined;
  readonly selectedJoint: ChromePart | undefined;
  readonly prevSelectedJoint: ChromePart | undefined;
  readonly selectedForce:
    | (ChromePart & { readonly isStartSelected: boolean; readonly isEndSelected: boolean })
    | undefined;
  readonly selectedLinkHold: LinkHold;
}
