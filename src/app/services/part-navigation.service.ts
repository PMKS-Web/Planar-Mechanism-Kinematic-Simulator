import { inject, Injectable } from '@angular/core';
import { PartLinkTarget } from '../component/BLOCKS/part-link/part-link-target';
import { Joint, RealJoint } from '../model/joint';
import { Link, RealLink } from '../model/link';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { ActiveObjService } from './active-obj.service';
import { MechanismService } from './mechanism.service';

/**
 * What a `part-link` does in the app: pointing lights the part on the grid,
 * and pressing takes the reader to it.
 *
 * Pressing switches to Edit before selecting, because a part link names a part
 * the reader is being asked to change, and Edit is the mode whose panel changes
 * it. It is deliberately not an undo step: being shown where a part is has not
 * changed the mechanism, and Undo should take back the last edit rather than
 * the last time the reader looked at something.
 */
@Injectable({ providedIn: 'root' })
export class PartNavigationService implements PartLinkTarget {
  private mechanism = inject(MechanismService);
  private tabs = inject(SelectedTabService);
  private activeObj = inject(ActiveObjService);

  /**
   * Through the grid's list-pointing mark, the one the export drawer uses, but
   * lit whatever is selected (`MechanismService.linkedPart`): the reader is
   * finding the parts a list of fixes names, one after another.
   */
  point(part: Joint | Link | undefined): void {
    this.mechanism.linkedPart = part;
  }

  open(part: Joint | Link): void {
    this.mechanism.linkedPart = undefined;
    this.tabs.setTab(TabID.EDIT);
    if (part instanceof RealJoint || part instanceof RealLink) {
      this.activeObj.updateSelectedObj(part);
    }
  }
}
