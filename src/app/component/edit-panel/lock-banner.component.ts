import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ActiveObjService } from '../../services/active-obj.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { MechanismService } from '../../services/mechanism.service';

/**
 * The link panel's second line while the link is locked in place.
 *
 * The same strip, in the same slot and the same stylesheet, as the one the
 * playback puts under the title: a state the panel is in, said once, with
 * the way out as a word in the sentence. It used to sit inside Basic
 * Settings beneath the length and angle fields, which made it read as a note
 * about those two fields rather than about the link.
 *
 * Shown only for a link every joint of which a Lock holds -- the case the
 * fields' own padlocks step aside for, since locked in place already holds
 * both. A bar with one locked end is not locked in place and gets no strip.
 */
@Component({
  selector: 'app-lock-banner',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon],
  template: `
    @if (lockedInPlace()) {
      <div class="editBanner" role="status" data-lock-banner>
        <mat-icon class="bannerGlyph">lock</mat-icon>
        <!-- Written to the strip's two lines, like the playback's sentences:
             the box is a fixed height, and a third line falls out of it. -->
        <span class="bannerText"
          >Locked in place.
          <button class="bannerAction" type="button" (click)="unlock()">Unlock</button> to move it
          or change its size.</span
        >
      </div>
    }
  `,
  styleUrls: ['./edit-banner.component.scss'],
})
export class LockBannerComponent {
  private active = inject(ActiveObjService);
  private gridUtils = inject(GridUtilsService);
  private mechanism = inject(MechanismService);

  lockedInPlace(): boolean {
    if (this.active.objType !== 'Link' || !this.active.selectedLink) return false;
    const frozen = this.gridUtils.frozenJointIds();
    const joints = this.active.selectedLink.joints;
    return joints.length > 0 && joints.every((joint) => frozen.has(joint.id));
  }

  unlock(): void {
    this.mechanism.toggleLock(this.active.selectedLink);
  }
}
