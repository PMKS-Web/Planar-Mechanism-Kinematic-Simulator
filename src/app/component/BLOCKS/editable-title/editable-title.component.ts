import { Component, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { MechanismService } from 'src/app/services/mechanism.service';
import { NotificationService } from '../../../services/notification.service';
import { RealJoint } from '../../../model/joint';
import { Link } from '../../../model/link';
import { Force } from '../../../model/force';
import { NgTemplateOutlet } from '@angular/common';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { FocusOnShowDirective } from '../../../focus-on-show.directive';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { KeyboardShortcutsService } from '../../../services/keyboard-shortcuts.service';
import { ShortcutTipDirective } from '../../../shortcut-tip.directive';

@Component({
  selector: 'editable-title-block',
  templateUrl: './editable-title.component.html',
  styleUrls: ['./editable-title.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    ShortcutTipDirective,
    NgTemplateOutlet,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatInput,
    FocusOnShowDirective,
    MatButton,
    MatIcon,
    MatTooltip,
  ],
})
export class EditableTitleComponent {
  readonly deleteDisabled = input(false);
  readonly shortcuts = inject(KeyboardShortcutsService);
  private fb = inject(FormBuilder);
  activeObjService = inject(ActiveObjService);
  private mechanismService = inject(MechanismService);
  private notify = inject(NotificationService);

  /** Shown instead of the object's own name — a cylinder displays its mounts. */
  readonly displayName = input<string>();
  readonly deleteAction = input.required<() => void>();

  /**
   * Off for a group, which has no one name to change.
   *
   * The rest of the row is the point: Lock and Delete mean the same thing to a
   * selection of eight joints as to one, and a reader who has learned where
   * they are should not have to learn again. So the group panel heads itself
   * with this same block rather than with buttons of its own that would have to
   * be kept looking alike by hand.
   */
  readonly renamable = input(true);

  /**
   * A word for the trash can, for a row that has room for one.
   *
   * Icon-only is right when Rename and Lock are already taking the row: three
   * labels do not fit. With Rename gone the row has a gap, and a lone square
   * next to a button stretched across the rest of the width is a lopsided pair
   * -- so a group names its delete, and the two share the row evenly.
   */
  readonly deleteLabel = input<string>();

  /**
   * A lock that is not one object's — a group's, where some members may be held
   * and others not. `'mixed'` shows the open padlock, because pressing it locks
   * the rest rather than unlocking the ones that are held.
   */
  readonly lockState = input<boolean | 'mixed'>();
  readonly toggleLockAction = input<() => void>();

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
      return 'The name cannot be empty.';
    }

    // If new ID is not purely alphanumeric, don't save it
    if (!this.isAlphanumeric(newID)) {
      return 'Use one word made of English letters (A–Z) and numbers (0–9).';
    }

    // Names appear together in selections, graphs, and exported files. Treat
    // case as presentation rather than identity so `Crank` and `crank` cannot
    // silently describe two different objects in the same drawing.
    const active = this.activeObjService.getSelectedObj();
    const normalized = newID.toLowerCase();
    const taken = [
      ...this.mechanismService.joints,
      ...this.mechanismService.links,
      ...this.mechanismService.forces,
    ].some(
      (candidate) =>
        candidate !== active &&
        String(candidate.name || candidate.id)
          .trim()
          .toLowerCase() === normalized
    );
    if (taken) {
      return `The name ${newID} is already in use. Use a unique name.`;
    }

    return '';
  }

  saveNewID() {
    let newID = this.newIDForm.value.newID!.trim();

    // If the new ID is not valid, send error notif and do not update to new id
    let error = this.validateNewID(newID);
    if (error !== '') {
      this.notify.refusal('rename.invalid', error);
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

  /**
   * What the Lock button acts on — the selected object, when it is a kind
   * that can be locked. Self-serve rather than an input, like the rename:
   * every panel this block heads is about the selected object anyway.
   */
  lockTarget(): RealJoint | Link | Force | undefined {
    const obj = this.activeObjService.getSelectedObj();
    if (obj instanceof RealJoint || obj instanceof Link || obj instanceof Force) return obj;
    return undefined;
  }

  /** Whether there is a lock to show at all, from either source. */
  showsLock(): boolean {
    return this.toggleLockAction() !== undefined || this.lockTarget() !== undefined;
  }

  isLocked(): boolean {
    const given = this.lockState();
    if (given !== undefined) return given === true;
    const target = this.lockTarget();
    return target !== undefined && this.mechanismService.isLockedTarget(target);
  }

  toggleLock() {
    const given = this.toggleLockAction();
    if (given) {
      given();
      return;
    }
    const target = this.lockTarget();
    if (target) this.mechanismService.toggleLock(target);
  }
}
