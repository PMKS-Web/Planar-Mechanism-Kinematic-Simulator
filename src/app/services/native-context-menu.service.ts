import {
  bodyConnectionPairs,
  bodyConnectionCommand,
} from '../model/body-system/body-connection-controls';
import { jointKindLabel } from '../model/body-system/body-joint-marks';
import { Injectable, inject } from '@angular/core';
import { NativeEditorService } from './native-editor.service';
import { ContextMenuModel, MenuRow } from '../component/BLOCKS/context-menu/menu-model';
import { BodyEditCommand, BodySelectionRef } from '../model/body-system/body-edit-types';
import { Point, worldToLocal } from '../model/body-system/body-frame';
import { BodyId, WORLD, newRecordId } from '../model/body-system/body-id';
import { nativeEditRefusalCopy } from '../model/body-system/joint-permission';
import {
  insertNativeAttachment,
  insertNativeGround,
  nativeCommand,
  selectionBodies,
} from '../model/body-system/body-joint-interaction';
import { refusalFor } from '../model/edit-permission';

@Injectable({ providedIn: 'root' })
export class NativeContextMenuService {
  readonly editor = inject(NativeEditorService);
  commandRow(label: string, command: BodyEditCommand, icon = 'edit', destructive = false): MenuRow {
    const preview = this.editor.preview(command);
    const explicit = command.operations.flatMap((op) => (op.kind === 'delete' ? op.targets : []));
    const cascade = preview.ok
      ? preview.effects.removed.filter(
          (r) => !explicit.some((t) => t.kind === r.kind && 'id' in t && 'id' in r && t.id === r.id)
        )
      : [];
    const names = (['assembly', 'force'] as const).flatMap((kind) => {
      const count = cascade.filter((r) => r.kind === kind).length;
      return count
        ? [
            `${count} ${kind === 'assembly' ? (count === 1 ? 'Cylinder' : 'Cylinders') : count === 1 ? 'Force' : 'Forces'}`,
          ]
        : [];
    });
    const suffix = destructive && names.length ? ` (and ${names.join(', ')})` : '';
    return new MenuRow({
      label: label + suffix,
      icon,
      material: true,
      destructive,
      refusal: preview.ok ? undefined : nativeEditRefusalCopy(preview),
      action: () => this.editor.commit(command),
    });
  }
  build(
    target: BodySelectionRef | undefined,
    point: Point,
    create: (kind: 'link' | 'cylinder') => void,
    materialOwner?: BodyId
  ): ContextMenuModel {
    const d = this.editor.document(),
      body = materialOwner ?? selectionBodies(d, target ? [target] : [])[0];
    const creation = (kind: 'link' | 'cylinder') =>
      new MenuRow({
        label: kind === 'link' ? 'Link' : 'Cylinder',
        icon: kind === 'link' ? 'link' : 'open_in_full',
        material: true,
        refusal: refusalFor('build', this.editor.state()) ?? undefined,
        action: () => create(kind),
      });
    const attach = [creation('link'), creation('cylinder')];
    if (body) {
      attach.push(
        this.commandRow(
          'Tracer Point',
          insertNativeAttachment(this.editor.drawing(), body, point),
          'add_circle_outline'
        )
      );
      const owner = this.editor.drawing().bodies.find((b) => b.id === body)!;
      attach.push(
        this.commandRow(
          'Force',
          nativeCommand({
            kind: 'insert',
            records: {
              forces: [
                {
                  id: newRecordId<'force'>(),
                  bodyId: body,
                  point: worldToLocal(owner.pose, point),
                  label: 'Force',
                  frame: 'world',
                  vector: { x: 10, y: 0 },
                  couple: 0,
                },
              ],
            },
          }),
          'arrow_forward'
        )
      );
    }
    const pairs = bodyConnectionPairs(d, target);
    const pair = pairs.find((p) => p.key === this.editor.connectionPair()) ?? pairs[0];
    const connections: MenuRow[] = [];
    if (pairs.length > 1) {
      for (const pair of pairs)
        connections.push(
          new MenuRow({
            label: `${this.editor.bodyName(d.attachments.find((a) => a.id === pair.a)!.bodyId)} ↔ ${this.editor.bodyName(d.attachments.find((a) => a.id === pair.b)!.bodyId)}`,
            icon: 'edit',
            material: true,
            action: () => this.editor.connectionPair.set(pair.key),
            tip: 'Edit this pair in the panel.',
          })
        );
    } else if (pair) {
      for (const kind of ['revolute', 'prismatic', 'pin-in-slot', 'weld'] as const) {
        const command = bodyConnectionCommand(this.editor.drawing(), target, pair, kind);
        if (command) connections.push(this.commandRow(jointKindLabel(kind), command));
      }
    }
    const state: MenuRow[] = [];
    const ground = this.editor.joints().find((j) => j.bodyA === WORLD || j.bodyB === WORLD);
    if (ground)
      state.push(
        this.commandRow(
          'Remove Ground',
          nativeCommand({ kind: 'delete', targets: [{ kind: 'joint', id: ground.id }] }),
          'vertical_align_bottom'
        )
      );
    else if (body)
      state.push(
        this.commandRow(
          'Add Ground',
          insertNativeGround(this.editor.drawing(), body, point),
          'vertical_align_bottom'
        )
      );
    if (target) {
      const lock = this.commandRow('Locked', this.editor.lockCommand(), 'lock');
      lock.kind = 'toggle';
      const operation = this.editor.lockCommand().operations[0];
      lock.checked = operation.kind === 'lock' && !operation.locked;
      state.push(lock);
    }
    const footer: MenuRow[] = [];
    if (target) {
      const label =
        target.kind === 'assembly'
          ? 'Delete Cylinder'
          : target.kind === 'group'
            ? 'Delete Welded Group'
            : target.kind === 'body'
              ? 'Delete Link'
              : target.kind === 'force'
                ? 'Delete Force'
                : 'Delete Joint';
      footer.push(
        this.commandRow(label, nativeCommand({ kind: 'delete', targets: [target] }), 'delete', true)
      );
      if (target.kind === 'group')
        for (const id of target.members)
          footer.push(
            this.commandRow(
              `Delete Link ${this.editor.bodyName(id)}`,
              nativeCommand({ kind: 'delete', targets: [{ kind: 'body', id }] }),
              'delete',
              true
            )
          );
    }
    return {
      header: target
        ? {
            title: this.editor.name(target),
            subtitle: target.kind === 'junction' ? 'Choose a pair in the Edit panel.' : '',
          }
        : undefined,
      groups: [
        { label: target ? 'Attach' : 'Add', rows: attach },
        { label: 'Connection', rows: connections },
        { label: 'State', rows: state },
        { rows: footer },
      ],
    };
  }
}
