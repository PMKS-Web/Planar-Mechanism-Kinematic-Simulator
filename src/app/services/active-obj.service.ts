import { Injectable, EventEmitter } from '@angular/core';
import { Force } from '../model/force';
import { Joint, RealJoint } from '../model/joint';
import { Link, RealLink } from '../model/link';
import { Coord } from '../model/coord';
import { SynthesisPose } from './synthesis/synthesis-util';
import {
  PartSelectionSnapshot,
  PartSelectionState,
  SelectedPart,
  SelectedPartRef,
} from '../model/selection';

export type ActiveObjType =
  | 'Nothing'
  | 'Joint'
  | 'Force'
  | 'Link'
  | 'Grid'
  | 'SynthesisPose'
  | 'Mechanism'
  | 'MultiSelection'
  /** The tracing underlay, which is scenery rather than part of the linkage. */
  | 'BackgroundImage';

@Injectable({
  providedIn: 'root',
})
export class ActiveObjService {
  objType: ActiveObjType = 'Nothing';
  selectedJoint!: RealJoint;
  prevSelectedJoint!: RealJoint;
  selectedForce!: Force;
  selectedLink!: RealLink;
  selectedPose!: SynthesisPose;
  selectedForceEndPoint: string = '';
  /**
   * Which machine is selected, by its place in MechanismService.partitions.
   *
   * An index rather than the object, because a mechanism is rebuilt from
   * scratch on every edit — holding the old one would pin a selection to
   * something that no longer exists.
   */
  selectedMechanismIndex: number = -1;

  private readonly partSelection = new PartSelectionState();

  constructor() {}

  onActiveObjChange = new EventEmitter<string>();

  get selectedParts(): readonly SelectedPart[] {
    return this.partSelection.parts;
  }

  get selectedPartRefs(): SelectedPartRef[] {
    return this.partSelection.refs;
  }

  get primaryPartRef(): SelectedPartRef | undefined {
    return this.partSelection.primaryRef;
  }

  get primaryPart(): SelectedPart | undefined {
    return this.partSelection.primary;
  }

  /**
   * What the panels should be *about* while a gesture is in flight.
   *
   * Click selects, drag tunes. A drag in an analysis mode is an edit now, and
   * the drag machinery works through the selection -- so grabbing a joint to
   * tune it would swap the graphs to that joint for the length of the gesture.
   * Which is backwards for the move the unlock exists for: watch the output's
   * acceleration, tune the coupler pivot, watch the peak come down.
   *
   * Held here rather than in the panel, because the panel cannot see the press
   * early enough: the selection changes on pointer-down, and the drag state
   * that would have gated it is not armed until after. Set from the same line
   * that changes the selection, there is no ordering to get wrong.
   */
  private gestureHold?: {
    type: ActiveObjType;
    joint: RealJoint;
    link: RealLink;
    force: Force;
  };

  /** Remember what the panels are about, before a gesture moves the selection. */
  holdGraphSubject(): void {
    if (this.gestureHold) return;
    this.gestureHold = {
      type: this.objType,
      joint: this.selectedJoint,
      link: this.selectedLink,
      force: this.selectedForce,
    };
  }

  /**
   * Let the panels see the selection again.
   *
   * After a click that is all there is to do -- the new selection is the point
   * of a click. After a drag the caller puts the old one back first, so this
   * releases onto what was already showing.
   */
  releaseGraphSubject(): void {
    this.gestureHold = undefined;
  }

  get graphType(): ActiveObjType {
    return this.gestureHold?.type ?? this.objType;
  }

  get graphJoint(): RealJoint {
    return this.gestureHold?.joint ?? this.selectedJoint;
  }

  get graphLink(): RealLink {
    return this.gestureHold?.link ?? this.selectedLink;
  }

  get graphForce(): Force {
    return this.gestureHold?.force ?? this.selectedForce;
  }

  getSelectedObj(): RealJoint | Force | RealLink {
    switch (this.objType) {
      case 'Joint':
        return this.selectedJoint;
      case 'Force':
        return this.selectedForce;
      case 'Link':
        return this.selectedLink;
      case 'MultiSelection': {
        const primary = this.primaryPart;
        if (primary) return primary;
        throw new Error('No object selected');
      }
      default:
        throw new Error('No object selected');
    }
  }

  getSelectedObjType(): ActiveObjType {
    return this.objType;
  }

  fakeUpdateSelectedObj() {
    //Don't actually update the selected object, just emit the event so subscribers can update
    this.onActiveObjChange.emit(this.objType);
  }

  /**
   * Put the background image in the edit panel.
   *
   * It is not a mechanism object and has no entry in getSelectedObj(): the only
   * thing this selection does is decide which panel is showing, and the panel
   * reads the picture from its own service.
   */
  selectBackgroundImage() {
    this.resetPartSelection();
    this.selectedMechanismIndex = -1;
    this.objType = 'BackgroundImage';
    this.onActiveObjChange.emit(this.objType);
  }

  /** Select a whole machine: everything in it, rather than one part of it. */
  selectMechanism(index: number) {
    this.resetPartSelection();
    this.selectedMechanismIndex = index;
    this.objType = 'Mechanism';
    this.onActiveObjChange.emit(this.objType);
  }

  updateSelectedObj(
    // The grid canvas hands its empty-string sentinel through here for a
    // background click, and a force's endpoint Coord for an endpoint drag, so
    // both are part of the contract.
    newActiveObj: Joint | Link | Force | Coord | SynthesisPose | string | undefined | null,
    forceParent: Force | null = null
  ) {
    this.prevSelectedJoint = this.selectedJoint;
    this.selectedMechanismIndex = -1;
    if (newActiveObj === undefined || newActiveObj === null) {
      this.resetPartSelection();
      this.objType = 'Grid';
    } else if (newActiveObj instanceof RealJoint) {
      this.partSelection.replace(newActiveObj);
      this.syncPartSelection();
    } else if (newActiveObj instanceof RealLink) {
      this.partSelection.replace(newActiveObj);
      this.syncPartSelection();
    } else if (newActiveObj instanceof Force) {
      this.resetPartSelection();
      this.objType = 'Force';
      this.selectedForce = newActiveObj;
      this.selectedForce.isStartSelected = false;
      this.selectedForce.isEndSelected = false;
    } else if (newActiveObj instanceof SynthesisPose) {
      this.resetPartSelection();
      this.objType = 'SynthesisPose';
      this.selectedPose = newActiveObj;
    } else if (newActiveObj instanceof Coord) {
      this.resetPartSelection();
      this.objType = 'Force';
      this.selectedForce = forceParent!;
      this.selectedForce.isStartSelected = false;
      this.selectedForce.isEndSelected = false;
      if (this.selectedForce.startCoord === newActiveObj) {
        this.selectedForce.isStartSelected = true;
      } else if (this.selectedForce.endCoord === newActiveObj) {
        this.selectedForce.isEndSelected = true;
      }
    }
    this.onActiveObjChange.emit(this.objType);
  }

  /** Replace any selected parts with exactly this joint or link. */
  replacePartSelection(part: SelectedPart): void {
    this.prevSelectedJoint = this.selectedJoint;
    this.selectedMechanismIndex = -1;
    this.partSelection.replace(part);
    this.syncPartSelection();
    this.onActiveObjChange.emit(this.objType);
  }

  /** Add a part, or remove it when it is already selected. */
  togglePartSelection(part: SelectedPart): void {
    this.prevSelectedJoint = this.selectedJoint;
    this.selectedMechanismIndex = -1;
    this.partSelection.toggle(part);
    this.syncPartSelection();
    this.onActiveObjChange.emit(this.objType);
  }

  containsPart(partOrRef: SelectedPart | SelectedPartRef): boolean {
    return this.partSelection.contains(partOrRef);
  }

  clearPartSelection(nextType: 'Grid' | 'Nothing' = 'Grid'): void {
    this.prevSelectedJoint = this.selectedJoint;
    this.resetPartSelection();
    this.selectedMechanismIndex = -1;
    this.objType = nextType;
    this.onActiveObjChange.emit(this.objType);
  }

  snapshotPartSelection(): PartSelectionSnapshot {
    return this.partSelection.snapshot();
  }

  restorePartSelection(
    snapshot: PartSelectionSnapshot,
    joints: readonly Joint[],
    links: readonly Link[]
  ): void {
    this.partSelection.restore(snapshot, joints, links);
    this.syncPartSelection();
    this.onActiveObjChange.emit(this.objType);
  }

  reconcilePartSelection(joints: readonly Joint[], links: readonly Link[]): void {
    const snapshot = this.snapshotPartSelection();
    if (snapshot.refs.length === 0) return;
    this.restorePartSelection(snapshot, joints, links);
  }

  private resetPartSelection(): void {
    this.partSelection.clear();
  }

  private syncPartSelection(): void {
    this.selectedParts.forEach((part) => {
      if (part instanceof RealJoint) this.selectedJoint = part;
      else this.selectedLink = part;
    });
    const primaryPart = this.primaryPart;
    if (primaryPart instanceof RealJoint) this.selectedJoint = primaryPart;
    else if (primaryPart instanceof RealLink) this.selectedLink = primaryPart;
    this.objType =
      this.selectedParts.length === 0
        ? 'Grid'
        : this.selectedParts.length > 1
          ? 'MultiSelection'
          : this.selectedParts[0] instanceof RealJoint
            ? 'Joint'
            : 'Link';
  }
}
