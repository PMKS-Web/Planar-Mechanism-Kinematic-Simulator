import { Injectable, inject } from '@angular/core';
import { NativeEditorService } from '../../native-editor.service';
import { NativePlaybackService } from '../../native-playback.service';
import { selectionBodies } from '../../../model/body-system/body-joint-interaction';
import type { ChromeSelection } from '../chrome-contracts';

@Injectable({ providedIn: 'root' })
export class NativeChromeSelectionService implements ChromeSelection {
  private readonly editor = inject(NativeEditorService);
  private readonly playback = inject(NativePlaybackService);
  private machineKey?: string;
  private machineSelection?: ReturnType<NativeEditorService['selection']>;
  get objType(): ChromeSelection['objType'] {
    if (this.selectedMechanismIndex >= 0) return 'Mechanism';
    const selected = this.editor.selection();
    if (selected.length > 1) return 'MultiSelection';
    const kind = selected[0]?.kind;
    if (!kind) return 'Nothing';
    if (kind === 'force') return 'Force';
    if (kind === 'attachment' || kind === 'joint' || kind === 'junction') return 'Joint';
    return 'Link';
  }
  getSelectedObjType() {
    return this.objType;
  }
  get selectedLink() {
    const target = this.editor.selection()[0];
    if (!target || this.objType !== 'Link') return undefined;
    return {
      id: selectionBodies(this.editor.document(), [target])[0],
      name: this.editor.name(target),
    };
  }
  get selectedLinkHold() {
    const id = this.selectedLink?.id;
    const holds = this.editor.document().holds.filter((h) => h.bodyId === id);
    return holds.some((h) => h.length !== undefined)
      ? ('length' as const)
      : holds.some((h) => h.angle !== undefined)
        ? ('angle' as const)
        : undefined;
  }
  get selectedMechanismIndex() {
    return this.editor.selection() === this.machineSelection
      ? [...(this.playback.snapshot()?.partitions.keys() ?? [])].indexOf(this.machineKey ?? '')
      : -1;
  }
  selectMechanism(index: number) {
    const partition = [...(this.playback.snapshot()?.partitions.values() ?? [])][index];
    this.machineKey = partition?.key;
    if (partition?.ok) {
      this.editor.select();
      for (const id of partition.frame.partition.materialIds)
        this.editor.select({ kind: 'body', id }, true);
      this.machineSelection = this.editor.selection();
    }
  }
}
