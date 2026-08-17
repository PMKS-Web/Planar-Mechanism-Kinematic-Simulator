import { Injectable, EventEmitter } from '@angular/core';
import { Force } from '../model/force';
import { Joint, RealJoint } from '../model/joint';
import { Link, RealLink } from '../model/link';
import { Coord } from '../model/coord';
import { SynthesisPose } from './synthesis/synthesis-util';

export type ActiveObjType =
  | 'Nothing'
  | 'Joint'
  | 'Force'
  | 'Link'
  | 'Grid'
  | 'SynthesisPose'
  | 'Mechanism'
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

  constructor() {}

  onActiveObjChange = new EventEmitter<string>();

  getSelectedObj(): RealJoint | Force | RealLink {
    switch (this.objType) {
      case 'Joint':
        return this.selectedJoint;
      case 'Force':
        return this.selectedForce;
      case 'Link':
        return this.selectedLink;
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
    this.selectedMechanismIndex = -1;
    this.objType = 'BackgroundImage';
    this.onActiveObjChange.emit(this.objType);
  }

  /** Select a whole machine: everything in it, rather than one part of it. */
  selectMechanism(index: number) {
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
      this.objType = 'Grid';
    } else if (newActiveObj instanceof RealJoint) {
      this.objType = 'Joint';
      this.selectedJoint = newActiveObj;
    } else if (newActiveObj instanceof RealLink) {
      this.objType = 'Link';
      this.selectedLink = newActiveObj;
    } else if (newActiveObj instanceof Force) {
      this.objType = 'Force';
      this.selectedForce = newActiveObj;
      this.selectedForce.isStartSelected = false;
      this.selectedForce.isEndSelected = false;
    } else if (newActiveObj instanceof SynthesisPose) {
      this.objType = 'SynthesisPose';
      this.selectedPose = newActiveObj;
    } else if (newActiveObj instanceof Coord) {
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
}
