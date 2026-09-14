import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { NativeEditorService } from '../../services/native-editor.service';
import { selectionBodies } from '../../model/body-system/body-joint-interaction';

/**
 * The link panel's second line while the link is locked in place.
 *
 * The public panel's lock banner says exactly this, in exactly this strip, and
 * reads the answer off the legacy drawing. This is the same strip over the same
 * stylesheet, reading it off the document model instead.
 *
 * It answers to the same tag, because the panel it heads is the same panel and
 * a reader -- or a parity suite -- comparing the two trees should see one. Two
 * standalone components may share a selector as long as no template imports
 * both, and no template does: the public panel imports `LockBannerComponent`
 * and the native panel imports this.
 */
@Component({
  selector: 'app-lock-banner',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon],
  template: `
    @if (lockedInPlace()) {
      <div class="editBanner" role="status" data-lock-banner>
        <mat-icon class="bannerGlyph">lock</mat-icon>
        <span class="bannerText"
          >Locked in place.
          <button class="bannerAction" type="button" (click)="unlock()">Unlock</button> to move it
          or change its size.</span
        >
      </div>
    }
  `,
  styleUrls: ['../BLOCKS/banner/edit-banner.component.scss'],
})
export class NativeLockBannerComponent {
  private readonly editor = inject(NativeEditorService);

  protected readonly lockedInPlace = computed(() => {
    const document = this.editor.document(),
      selection = this.editor.selection();
    if (selection.length !== 1 || !['body', 'group'].includes(selection[0].kind)) return false;
    const members = selectionBodies(document, selection);
    return (
      members.length > 0 &&
      members.every((id) =>
        document.bodies.some((body) => body.id === id && body.kind === 'material' && body.locked)
      )
    );
  });

  protected unlock() {
    this.editor.commit(this.editor.lockCommand());
  }
}
