import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { MechanismService } from 'src/app/services/mechanism.service';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'editable-title-block',
  templateUrl: './editable-title.component.html',
  styleUrls: ['./editable-title.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditableTitleComponent {
  @Input() showActionButtons: boolean = false;
  /** Shown instead of the object's own name — a cylinder displays its mounts. */
  @Input() displayName?: string;
  @Input() deleteAction!: () => void;

  editMode = false;

  constructor(
    private fb: FormBuilder,
    public activeObjService: ActiveObjService,
    private mechanismService: MechanismService,
    private notify: NotificationService
  ) {}

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
