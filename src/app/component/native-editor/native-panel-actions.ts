import { Injectable, computed, inject } from '@angular/core';
import { CHROME_PERMISSION } from '../../services/chrome/chrome-tokens';
import { NativeEditorService } from '../../services/native-editor.service';
import { speedTurning, turnsClockwise } from '../../model/drive-direction';
import { BodyEditCommand } from '../../model/body-system/body-edit-types';
import { AttachmentId } from '../../model/body-system/body-id';
import { nativeCommand } from '../../model/body-system/body-joint-interaction';
import { nativeDeleteCommand } from '../../model/body-system/body-menu-commands';
import { nativeEditRefusalCopy } from '../../model/body-system/joint-permission';

/**
 * The rows every branch of the Edit panel carries, answered once.
 *
 * The title row's Rename, Lock and Delete mean the same thing to a joint, a
 * link, a cylinder and a force; so does the freeze that grays the card, and so
 * do the Add Input button and the Input Settings section, which a joint and a
 * cylinder both have. The public panel keeps all of that in one component
 * because it is one file; the native route draws the cylinder in a component of
 * its own, so the shared half lives here rather than being written twice and
 * drifting.
 */
@Injectable({ providedIn: 'root' })
export class NativePanelActions {
  readonly editor = inject(NativeEditorService);
  private readonly permission = inject(CHROME_PERMISSION);

  // ---- the card ------------------------------------------------------------

  /** Why nothing in the card may be touched, or nothing when it may. */
  panelIsFrozen(): boolean {
    return !!this.permission.refusal('structure');
  }

  /** A mass is typed at any pose, but not while the machine runs. */
  playingNow(): boolean {
    return this.editor.playing();
  }

  /** Turning the drive round moves the visible pose, so it waits for the start. */
  driveIsFrozen(): boolean {
    return !!this.permission.refusal('drive');
  }

  // ---- the title row -------------------------------------------------------

  readonly titleSubject = computed(() => ({
    name: this.subjectName(),
    rename: (name: string) => this.editor.rename(name),
  }));

  /**
   * What the title row calls the selection.
   *
   * A joint record carries no label of its own until somebody renames it, and
   * the letter a reader knows it by -- the one drawn on the canvas -- belongs to
   * the attachment under it. The public panel heads that panel "Edit Joint A",
   * so this one says A rather than the record's own bare "Joint".
   */
  private subjectName(): string {
    const named = this.editor.name();
    const target = this.editor.selection()[0];
    if (!target) return named;
    const document = this.editor.drawing();
    // A force nobody has renamed is F1, F2 ... in the order the drawing holds
    // them, which is what the public route calls them.
    if (target.kind === 'force' && (named === 'Force' || !named)) {
      const at = document.forces.findIndex((force) => force.id === target.id);
      return at < 0 ? named : `F${at + 1}`;
    }
    if (named !== 'Joint') return named;
    const hub =
      target.kind === 'junction'
        ? document.junctions.find((pin) => pin.id === target.id)?.hub
        : target.kind === 'joint'
          ? document.joints.find((joint) => joint.id === target.id)?.frameB.attachmentId
          : undefined;
    return document.attachments.find((a) => a.id === hub)?.label || named;
  }

  readonly deleteCommand = computed(() =>
    nativeDeleteCommand(this.editor.drawing(), this.editor.selection())
  );
  readonly deleteAction = () => this.editor.commit(this.deleteCommand());
  readonly lockAction = () => this.editor.commit(this.editor.lockCommand());
  readonly lockState = computed(() => {
    const operation = this.editor.lockCommand().operations[0];
    return operation?.kind === 'lock' && !operation.locked;
  });

  // ---- why a control is gray ----------------------------------------------

  /** One preview per command per document version, because a preview is a solve. */
  private readonly refusalCache = computed(() => {
    this.editor.drawing();
    this.editor.state();
    return new Map<string, { short: string; long: string } | undefined>();
  });

  refused(command: BodyEditCommand | undefined) {
    if (!command) return undefined;
    const cache = this.refusalCache(),
      key = JSON.stringify(command.operations);
    if (!cache.has(key)) {
      const result = this.editor.preview(command);
      cache.set(key, result.ok ? undefined : nativeEditRefusalCopy(result));
    }
    return cache.get(key);
  }

  lockRefusal() {
    return this.refused(this.editor.lockCommand());
  }

  deleteRefusal() {
    return this.refused(this.deleteCommand());
  }

  // ---- the drive -----------------------------------------------------------

  /** Every attachment the selected joint is made of; a cylinder answers its own. */
  readonly ownAttachments = computed<AttachmentId[]>(() => {
    const target = this.editor.selection()[0],
      document = this.editor.drawing();
    if (target?.kind === 'attachment') return [target.id];
    if (target?.kind === 'junction')
      return [...(document.junctions.find((pin) => pin.id === target.id)?.attachments ?? [])];
    if (target?.kind === 'joint') {
      const joint = document.joints.find((joint) => joint.id === target.id);
      return joint ? [joint.frameA.attachmentId, joint.frameB.attachmentId] : [];
    }
    return [];
  });

  /** The joint whose drive the panel is editing: a cylinder's is its own. */
  readonly drivenJoint = computed(() => {
    const target = this.editor.selection()[0],
      document = this.editor.drawing();
    if (target?.kind === 'assembly') {
      const cylinder = document.assemblies.find((c) => c.id === target.id);
      return document.joints.find((j) => j.id === cylinder?.internalJoint);
    }
    const own = this.ownAttachments();
    return document.joints.find(
      (joint) =>
        joint.kind !== 'weld' &&
        own.includes(joint.frameA.attachmentId) &&
        own.includes(joint.frameB.attachmentId)
    );
  });

  readonly driver = computed(() =>
    this.editor.drawing().drivers.find((d) => d.coordinate.jointId === this.drivenJoint()?.id)
  );

  isDriven(): boolean {
    return !!this.driver();
  }

  /** A block on a slot translates: it has no sense of rotation and no RPM. */
  isSliderInput(): boolean {
    return this.drivenJoint()?.kind !== 'revolute';
  }

  linearSpeedUnitLabel(): string {
    return this.editor.drawing().units.length + '/s';
  }

  drivenClockwise(): boolean {
    return turnsClockwise(this.driver()?.profile.speed ?? 1);
  }

  /** Which way the drive sets off, said in the terms that drive has. */
  inputDirectionLabel(): string {
    if (this.editor.selection()[0]?.kind === 'assembly')
      return this.drivenClockwise() ? 'Closing' : 'Opening';
    if (!this.isSliderInput()) return this.drivenClockwise() ? 'Clockwise' : 'Counter-clockwise';
    return this.drivenClockwise() ? 'Backward along slot' : 'Forward along slot';
  }

  inputDirectionIcon(): string {
    if (!this.isSliderInput()) return this.drivenClockwise() ? 'rotate_right' : 'rotate_left';
    return this.drivenClockwise() ? 'arrow_back' : 'arrow_forward';
  }

  readonly flipInputDirection = () => {
    const driver = this.driver();
    if (!driver) return;
    this.editor.apply({
      kind: 'driver-speed',
      driverId: driver.id,
      speed: speedTurning(!this.drivenClockwise(), driver.profile.speed),
    });
  };

  driveCommand(): BodyEditCommand | undefined {
    const joint = this.drivenJoint();
    if (!joint || joint.kind === 'weld') return undefined;
    const driver = this.driver();
    if (driver) return nativeCommand({ kind: 'remove-driver', driverId: driver.id });
    const settings = this.editor.drawing().settings;
    return nativeCommand({
      kind: 'add-driver',
      coordinate: {
        jointId: joint.id,
        coordinate: joint.kind === 'revolute' ? 'angle' : 'travel',
      },
      speed:
        joint.kind === 'revolute' ? settings.defaultDrive.angular : settings.defaultDrive.linear,
    });
  }

  driveRefusal() {
    return this.refused(this.driveCommand());
  }

  readonly toggleDrive = () => {
    const command = this.driveCommand();
    if (command) this.editor.commit(command);
  };

  /** The signed speed a typed magnitude means, keeping the direction it had. */
  setDriveSpeed(magnitude: number) {
    const driver = this.driver();
    if (!driver) return;
    this.editor.apply({
      kind: 'driver-speed',
      driverId: driver.id,
      speed: speedTurning(this.drivenClockwise(), Math.abs(magnitude)),
    });
  }
}
