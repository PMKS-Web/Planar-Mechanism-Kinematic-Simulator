import type { BehaviorSubject, Observable } from 'rxjs';
import type { WritableSignal } from '@angular/core';
import type { AngleUnit, ForceUnit, GlobalUnit, LengthUnit } from '../../model/unit-enums';
import type { EditAction, EditRefusal } from '../../model/edit-permission';
import type { ActiveObjType } from '../../model/active-object-type';
import type { TabID } from '../../selected-tab.service';

/**
 * The shell consumes readings and commands, not the editable graph. These structural
 * views preserve live object identity on the legacy route without requiring a future
 * provider to construct Joint, Link or Mechanism instances merely to draw the chrome.
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
  readonly sampleCount: number;
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
export interface ChromeMechanism {
  animate(progress: number, animationState?: boolean): void;
  animationSpeedMultiplier: number;
  blockerCount(): number;
  clearStartMoved(): void;
  cyclePeriod(): number;
  directionOf(index: number): number;
  easeToStart(durationMs?: number): void;
  forceAnalysisReady(): boolean;
  hoveredMechanismIndex: number;
  inputAngleDegrees(index: number): number | undefined;
  isAtStartPose(): boolean;
  isMechanismPlaying(index: number): boolean;
  isPlaying: boolean;
  mechanismTimeStep: number;
  oneValidMechanismExists(): boolean;
  reverseDrive(index: number): boolean;
  secondsOf(index: number): number;
  seekAllAlong(leader: number, along: number): void;
  seekMechanism(index: number, seconds: number): void;
  seekMechanismTo(index: number, along: number): void;
  setAllPlaying(playing: boolean): void;
  setPlaybackDirection(index: number, direction: number): void;
  setSyncMechanisms(sync: boolean): void;
  solveNow(): void;
  readonly solvingIsDeferred: boolean;
  readonly startMovedOn: string | null;
  syncMechanisms: boolean;
  timeAtStep(step: number): number;
  toggleMechanismPlaying(index: number): void;
  travelOf(index: number): number | undefined;
  travelingForward(index: number): boolean;
  warningCount(): number;
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
  hasParts(): boolean;
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
}
export interface ChromeSettings {
  readonly angleUnit: BehaviorSubject<AngleUnit>;
  readonly forceUnit: BehaviorSubject<ForceUnit>;
  readonly globalUnit: BehaviorSubject<GlobalUnit>;
  readonly lengthUnit: BehaviorSubject<LengthUnit>;
  readonly animating: BehaviorSubject<boolean>;
  readonly isShowCOM: BehaviorSubject<boolean>;
  readonly isShowID: BehaviorSubject<boolean>;
  readonly isShowTraces: BehaviorSubject<boolean>;
  readonly isShowMajorGrid: BehaviorSubject<boolean>;
  readonly isShowMinorGrid: BehaviorSubject<boolean>;
  readonly isSnapToGrid: BehaviorSubject<boolean>;
  readonly isSnapToAlignment: BehaviorSubject<boolean>;
  readonly isGravity: BehaviorSubject<boolean>;
  tempGridDisable: boolean;
}
export interface ChromeHistory {
  canRedo(): boolean;
  canUndo(): boolean;
  redo(): void;
  undo(): void;
}
export interface ChromeTabs {
  readonly tabChanged: Observable<TabID>;
  readonly sheetExpanded: WritableSignal<boolean>;
  getCurrentTab(): TabID;
  isAnalysisMode(tab?: TabID): tab is TabID.ANALYZE | TabID.FORCE;
  isTabVisible(): boolean;
  isWidePanel(tab?: TabID): tab is TabID.SYNTHESIZE | TabID.ANALYZE | TabID.FORCE;
  setTab(tab: TabID): void;
}
export interface ChromePermission {
  refusal(action: EditAction): EditRefusal | null;
  transportHint(): string | null;
}
export interface ChromeGrid {
  readonly cursorAt: { readonly x: number; readonly y: number } | null;
  zoomIn(): void;
  zoomOut(): void;
  scaleToFitLinkage(animate?: boolean): void;
  scaleToFitFullMotion(animate?: boolean): void;
}
export interface ChromeSelection {
  readonly objType: ActiveObjType;
  getSelectedObjType(): ActiveObjType;
  selectMechanism(index: number): void;
  readonly selectedMechanismIndex: number;
  readonly selectedLink: ChromeLink | undefined;
  readonly selectedLinkHold: 'length' | 'angle' | undefined;
}
