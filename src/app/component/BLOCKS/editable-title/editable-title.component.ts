import { Component, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { MechanismService } from 'src/app/services/mechanism.service';
import { NotificationService } from '../../../services/notification.service';
import { NgTemplateOutlet } from '@angular/common';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { FocusOnShowDirective } from '../../../focus-on-show.directive';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'editable-title-block',
  templateUrl: './editable-title.component.html',
  styleUrls: ['./editable-title.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    NgTemplateOutlet,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatInput,
    FocusOnShowDirective,
    MatButton,
    MatIcon,
  ],
})
export class EditableTitleComponent {
  private fb = inject(FormBuilder);
  activeObjService = inject(ActiveObjService);
  private mechanismService = inject(MechanismService);
  private notify = inject(NotificationService);

  /** Shown instead of the object's own name — a cylinder displays its mounts. */
  readonly displayName = input<string>();
  readonly deleteAction = input.required<() => void>();

  editMode = false;

  newIDForm = this.fb.group({ newID: [''] });

  gotoEditMode() {
    this.newIDForm.controls['newID'].setValue(this.activeObjService.getSelectedObj().name);
    this.editMode = true;
  }

  isAlphanumeric(str: string): boolean {
    return /^[a-zA-Z0-9]+$/.test(str);
  }

  // Check whether new id name is valid
  // Return empty string if valid, or error message if not
  validateNewID(newID: string): string {
    // If the new ID only contains spaces, don't save it
    if (newID === '') {
      return 'The new ID cannot be empty.';
    }

    // If new ID is not purely alphanumeric, don't save it
    if (!this.isAlphanumeric(newID)) {
      return 'The new ID must only contain letters and numbers.';
    }

    return '';
  }

  saveNewID() {
    let newID = this.newIDForm.value.newID!.trim();

    // If the new ID is not valid, send error notif and do not update to new id
    let error = this.validateNewID(newID);
    if (error !== '') {
      this.notify.refusal('rename.invalid', error);
      this.editMode = false;
      return;
    }

    let activeObj = this.activeObjService.getSelectedObj();
    this.editMode = false;
    if (activeObj.name === newID) return;
    activeObj.name = newID;
    // A name is carried in the URL like everything else, so a rename is an edit
    // and belongs in the history. Without this it was the one change to the
    // drawing that Undo could not take back.
    this.mechanismService.updateMechanism(true);
  }

  exitEditModeWithoutSaving() {
    this.editMode = false;
  }
}
