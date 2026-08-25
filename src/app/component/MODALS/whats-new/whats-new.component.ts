import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { WHATS_NEW, WHATS_NEW_ALSO, ReleaseNote } from '../../../model/whats-new';

/**
 * What changed, for somebody who was here before.
 *
 * A list rather than a tour: the reader already knows what PMKS+ is for, and
 * what they need is the shortest thing that will stop them looking for the
 * toolbar that used to be along the top. The notes themselves live in
 * `model/whats-new.ts`, so adding one is a row rather than a block of markup.
 */
@Component({
  selector: 'app-whats-new',
  templateUrl: './whats-new.component.html',
  styleUrls: ['./whats-new.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon],
})
export class WhatsNewComponent {
  private dialogRef = inject<MatDialogRef<WhatsNewComponent>>(MatDialogRef);

  readonly notes: ReleaseNote[] = WHATS_NEW;
  readonly also: string[] = WHATS_NEW_ALSO;

  close(): void {
    this.dialogRef.close();
  }
}
