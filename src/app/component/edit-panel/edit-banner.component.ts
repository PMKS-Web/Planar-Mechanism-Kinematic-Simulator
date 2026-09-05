import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { EditRefusal } from '../../model/edit-permission';
import { EditPermissionService } from '../../services/edit-permission.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';

/**
 * Why the panel below cannot be typed into, attached to the card it is about.
 *
 * The panel used to replace itself with a placeholder and an animated GIF the
 * moment anything moved, so pressing Play took away the thing the reader was in
 * the middle of reading. Then it was a card: same width, same corner, same
 * shadow as the panel -- which made it a second card inside the first, reading
 * as a notification that had landed there rather than as something the panel is
 * saying about itself.
 *
 * It is now the panel's own second line, full-bleed, directly under the title.
 *
 * It sits in `panel-section`'s attached slot rather than among the card's
 * contents, because the contents are what the freeze covers: `inert` cannot be
 * un-inherited, so a strip inside it could state the refusal but not offer the
 * word that clears it.
 *
 * A caller with a refusal of its own hands it in through `refusal`. The
 * Settings drawer does: what it refuses is not the edit permission this
 * component asks about by default, but it is the same *kind* of thing to say
 * and it deserves the same strip rather than a second one that drifts.
 */
@Component({
  selector: 'app-edit-banner',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon],
  template: `
    @if (banner(); as why) {
      <div class="editBanner" role="status">
        <mat-icon class="bannerGlyph">{{ why.glyph }}</mat-icon>
        <!-- The way out is a word *inside* the sentence. The panel is 250px
             wide, so a sentence and a button sharing a line left the sentence
             four words deep with the button hard against it, and a button
             stacked under it made the strip a different height in every state.
             Written as prose with one word underlined, every message is the
             same two lines. -->
        <span class="bannerText"
          >{{ why.lead }}
          @if (why.action) {
            &#32;<button class="bannerAction" type="button" (click)="take(why)">
              {{ why.action }}</button
            >{{ tailOf(why) }}
          }
        </span>
      </div>
    }
  `,
  styleUrls: ['./edit-banner.component.scss'],
})
export class EditBannerComponent {
  private permission = inject(EditPermissionService);
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private tabs = inject(SelectedTabService);

  /** A refusal to state instead of the one this component would ask for. */
  readonly refusal = input<EditRefusal | null>(null);

  banner(): EditRefusal | null {
    return this.refusal() ?? this.permission.editingBanner();
  }

  /**
   * The rest of the sentence, spaced off the word that was underlined.
   *
   * The space belongs here rather than in the string: written into the model it
   * would double up in `long`, which joins the three pieces itself -- and a full
   * stop that follows the link directly wants no space at all.
   */
  tailOf(why: EditRefusal): string {
    const tail = why.tail ?? '';
    return /^[.,;:!?]/.test(tail) ? tail : ` ${tail}`;
  }

  /**
   * What the word in the sentence does.
   *
   * Two answers only, because there are two ways out of any of these: get the
   * mechanism back to where it started, or leave the mode that locked it.
   */
  take(why: EditRefusal): void {
    if (why.actionKind === 'toEdit') {
      this.tabs.setTab(TabID.EDIT);
      return;
    }
    // Stopped, then walked home. `easeToStart` only moves the pose; pressed
    // while the mechanism was running it would be racing the playback still
    // advancing underneath it.
    this.mechanism.pauseInPlace();
    this.settings.animating.next(false);
    this.mechanism.easeToStart();
  }
}
