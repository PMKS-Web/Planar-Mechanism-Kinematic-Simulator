import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';
import { NativeEditorService } from '../../services/native-editor.service';
import {
  bodyConnectionCommand,
  bodyConnectionPairs,
} from '../../model/body-system/body-connection-controls';
import { BodyJoint } from '../../model/body-system/joint-record';
import { jointKindLabel } from '../../model/body-system/body-joint-marks';
import { bodyEditRefusal, nativeEditRefusalCopy } from '../../model/body-system/joint-permission';
import { compileWeldFrames } from '../../model/body-system/weld-frames';

/**
 * The one place the native Edit panel differs from the public one.
 *
 * The public joint panel offers three switches -- Grounded, Slider, Welded --
 * because the legacy model keeps those as three flags. This document model
 * keeps one answer instead: what kind of joint holds a given pair of parts
 * together. So the three switches are one pick-one, in the same place in Basic
 * Settings and in the same block every other pick-one in the app uses, with the
 * pair it applies to named above it.
 *
 * Grounding is not here: it is the context menu's Grounded row, exactly as it
 * is on the public route.
 *
 * `data-native-only` marks the whole block, so the paired parity suite can mask
 * this and nothing else.
 */
@Component({
  selector: 'app-native-joint-type',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SegmentedComponent, MatIcon, MatTooltip],
  templateUrl: './native-joint-type.component.html',
  styleUrl: './native-joint-type.component.scss',
})
export class NativeJointTypeComponent {
  private readonly editor = inject(NativeEditorService);

  /** In the order the plan names them. */
  protected readonly kinds: readonly BodyJoint['kind'][] = [
    'revolute',
    'prismatic',
    'pin-in-slot',
    'weld',
  ];
  protected readonly options = this.kinds.map(jointKindLabel);

  protected readonly pairs = computed(() =>
    bodyConnectionPairs(this.editor.document(), this.editor.selection()[0]).map((pair) => ({
      ...pair,
      label: `${this.nameOf(pair.a)} ↔ ${this.nameOf(pair.b)}`,
    }))
  );

  protected readonly chosenPair = computed(
    () => this.pairs().find((pair) => pair.key === this.editor.connectionPair()) ?? this.pairs()[0]
  );

  /**
   * Which kind holds the chosen pair now.
   *
   * A pair with no joint record of its own is two attachments at one pin: they
   * are welded if they already share a rigid group, and pinned otherwise.
   */
  protected readonly selected = computed(() => {
    const pair = this.chosenPair(),
      document = this.editor.document();
    if (!pair) return 0;
    const joint = document.joints.find(
      (candidate) =>
        [candidate.frameA.attachmentId, candidate.frameB.attachmentId].includes(pair.a) &&
        [candidate.frameA.attachmentId, candidate.frameB.attachmentId].includes(pair.b)
    );
    if (joint) return this.kinds.indexOf(joint.kind);
    const frames = compileWeldFrames(document);
    if (!frames.ok) return 0;
    const a = document.attachments.find((p) => p.id === pair.a),
      b = document.attachments.find((p) => p.id === pair.b);
    if (!a || !b) return 0;
    return frames.groupOf.get(a.bodyId) === frames.groupOf.get(b.bodyId)
      ? this.kinds.indexOf('weld')
      : 0;
  });

  /** The refusal each kind carries, from the model that refuses it. */
  private readonly refusals = computed(() =>
    this.kinds.map((kind, index) => {
      if (index === this.selected()) return undefined;
      const command = bodyConnectionCommand(
        this.editor.drawing(),
        this.editor.selection()[0],
        this.chosenPair(),
        kind
      );
      if (!command) return nativeEditRefusalCopy(bodyEditRefusal('invalid-command'));
      const result = this.editor.preview(command);
      return result.ok ? undefined : nativeEditRefusalCopy(result);
    })
  );

  protected readonly disabledAt = computed(() =>
    this.refusals()
      .map((why, index) => (why ? index : -1))
      .filter((index) => index >= 0)
  );

  /**
   * Why some of the choices are gray, said once on the block that carries them.
   *
   * A disabled button answers no pointer, so its own tooltip would be the one
   * explanation nobody could reach -- the same trap the public panel's Draw as
   * a Disc row is built around. The wrapper takes the hover instead, and the
   * stylesheet moves the disabled buttons out of its way.
   */
  protected readonly refusal = computed(() => this.refusals().find((why) => why));

  protected setPair(event: Event) {
    this.editor.connectionPair.set((event.target as HTMLSelectElement).value);
  }

  protected choose(index: number) {
    const command = bodyConnectionCommand(
      this.editor.drawing(),
      this.editor.selection()[0],
      this.chosenPair(),
      this.kinds[index]
    );
    if (command) this.editor.commit(command);
  }

  private nameOf(attachmentId: string) {
    const attachment = this.editor.document().attachments.find((a) => a.id === attachmentId);
    return attachment ? this.editor.bodyName(attachment.bodyId) : '';
  }
}
