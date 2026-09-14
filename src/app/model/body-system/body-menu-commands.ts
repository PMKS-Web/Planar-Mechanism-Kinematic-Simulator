import { BodyDocument, BodyDriver } from './body-document';
import { BodyEditCommand, BodyEditOperation, BodySelectionRef } from './body-edit-types';
import { AttachmentId, BodyId, ForceId, WORLD, newRecordId } from './body-id';
import { Point, worldToLocal } from './body-frame';
import { BodyJoint } from './joint-record';
import { bodyBarHoldPair } from './body-bar-hold';
import { BodyConnectionPair } from './body-connection-controls';
import {
  nativeCommand,
  insertNativeGround,
  selectionBodies,
  selectionJoints,
} from './body-joint-interaction';

/**
 * What the right-click menu may do to a native drawing, and why not.
 *
 * The menu itself builds no rules. Every row on the native canvas binds to one
 * of the commands below and quotes one of the refusals below, the same way the
 * public builder quotes `describeActuatorRefusal`, `weldRefusal` and
 * `locksHolding` — so the menu, the Edit panel and the canvas cannot end up
 * saying different things about the same joint.
 *
 * Refusals are written structurally rather than as the menu's `MenuRefusal`,
 * because the model has no business importing a component's type. `short` is
 * the three or four words the row's right-hand slot holds; `long` is the whole
 * sentence the hover chip shows.
 */
export interface NativeMenuRefusal {
  readonly short: string;
  readonly long: string;
}

/**
 * A row the public menu has and this route cannot serve yet.
 *
 * Present and gray rather than dropped: the two menus are one menu, and a row
 * that is missing on one of them teaches a reader nothing about where it went.
 */
export const NATIVE_VECTOR_TRACES: NativeMenuRefusal = {
  short: 'not built yet',
  long: 'Vector traces are not built yet on this route. They arrive with the analysis modes.',
};

export const NATIVE_BACKGROUND_IMAGE: NativeMenuRefusal = {
  short: 'not built yet',
  long: 'A background image is not built yet on this route.',
};

export const NATIVE_NO_BODY: NativeMenuRefusal = {
  short: 'not on a link',
  long: 'A load has to have a body to push on, and this joint is on none. Attach a link here first.',
};

export const NATIVE_ANALYSIS_MODES: NativeMenuRefusal = {
  short: 'not built yet',
  long: 'The analysis modes are not built yet on this route.',
};

/**
 * A load applied where several bodies meet does not say which one carries it.
 *
 * The same rule the public menu keeps: offered on the bar, where the anchor can
 * be placed unambiguously, and refused on the pin two bars share. A gesture
 * that already named a material owner has its answer and is not asked.
 */
export function nativeForceOwnerRefusal(
  document: BodyDocument,
  target: BodySelectionRef | undefined,
  materialOwner: BodyId | undefined
): NativeMenuRefusal | undefined {
  if (materialOwner || !target) return undefined;
  const bodies = selectionBodies(document, [target]);
  if (bodies.length === 0) return NATIVE_NO_BODY;
  if (bodies.length === 1) return undefined;
  return {
    short: `${bodies.length} links share it`,
    long: 'A load applied where several bodies meet does not say which one carries it. Attach it to the link instead.',
  };
}

export const NATIVE_WELD_HAS_NO_FREEDOM: NativeMenuRefusal = {
  short: 'welded, no freedom',
  long: 'A weld leaves no freedom to drive. Release the weld before setting an input here.',
};

export const NATIVE_NO_COORDINATE: NativeMenuRefusal = {
  short: 'no freedom here',
  long: 'An input prescribes a freedom between two bodies, and this mark has none to prescribe.',
};

export const NATIVE_BARS_ONLY: NativeMenuRefusal = {
  short: 'bars only',
  long: 'Only a bar between two joints has one length and one angle to hold.',
};

export const NATIVE_HELD_BY_LOCK: NativeMenuRefusal = {
  short: 'locked in place',
  long: 'Locked in place already holds the length and the angle.',
};

export const NATIVE_NO_MECHANISM: NativeMenuRefusal = {
  short: 'not in a mechanism',
  long: 'This part is not joined into a mechanism, so there is no mechanism here to delete. Delete the part itself.',
};

export const NATIVE_NOTHING_TO_LOCK: NativeMenuRefusal = {
  short: 'nothing to lock',
  long: 'There is nothing on the grid yet.',
};

export const NATIVE_ALL_LOCKED: NativeMenuRefusal = {
  short: 'all locked',
  long: 'Every part is already locked.',
};

export const NATIVE_NOTHING_LOCKED: NativeMenuRefusal = {
  short: 'nothing locked',
  long: 'No part is locked.',
};

/** No command could be built at all: the switch has nothing here to change. */
export const NATIVE_NO_COMMAND: NativeMenuRefusal = {
  short: 'nothing to change',
  long: 'There is nothing here for this to change.',
};

export const NATIVE_NO_PAIR: NativeMenuRefusal = {
  short: 'choose connection point',
  long: 'Choose the connection point first.',
};

// ------------------------------------------------------------------- joints

/** Every joint the mark a reader right-clicked stands for. */
export function nativeMenuJoints(
  document: BodyDocument,
  target: BodySelectionRef | undefined
): readonly BodyJoint[] {
  if (!target) return [];
  if (target.kind === 'joint' || target.kind === 'junction')
    return selectionJoints(document, target);
  if (target.kind === 'attachment')
    return document.joints.filter((joint) =>
      [joint.frameA.attachmentId, joint.frameB.attachmentId].includes(target.id)
    );
  if (target.kind === 'assembly') {
    const assembly = document.assemblies.find((one) => one.id === target.id);
    return document.joints.filter((joint) => joint.id === assembly?.internalJoint);
  }
  return [];
}

/** The joint that ties this mark to ground, when one does. */
export function nativeGroundJoint(
  document: BodyDocument,
  target: BodySelectionRef | undefined
): BodyJoint | undefined {
  return nativeMenuJoints(document, target).find(
    (joint) => joint.bodyA === WORLD || joint.bodyB === WORLD
  );
}

/** Ground this mark, or let it go — the Grounded switch in both directions. */
export function nativeGroundCommand(
  document: BodyDocument,
  target: BodySelectionRef | undefined,
  body: BodyId | undefined,
  point: Point
): BodyEditCommand | undefined {
  const ground = nativeGroundJoint(document, target);
  if (ground) return nativeCommand({ kind: 'delete', targets: [{ kind: 'joint', id: ground.id }] });
  if (!body) return undefined;
  const joint =
    target?.kind === 'joint' ? document.joints.find((one) => one.id === target.id) : undefined;
  const attachment =
    target?.kind === 'junction'
      ? document.junctions
          .find((pin) => pin.id === target.id)
          ?.attachments.find((id) => document.attachments.find((a) => a.id === id)?.bodyId === body)
      : joint
        ? joint.bodyA === body
          ? joint.frameA.attachmentId
          : joint.frameB.attachmentId
        : target?.kind === 'attachment'
          ? target.id
          : undefined;
  return insertNativeGround(document, body, point, 'revolute', 0, attachment, joint?.id);
}

/**
 * The joint a connection pair stands for — the one the Slider and Welded
 * switches change the kind of.
 *
 * A multiway pin stores several joints for one mark, so the pair names the two
 * attachments rather than a joint, and the joint between them is looked up.
 */
export function nativePairJoint(
  document: BodyDocument,
  target: BodySelectionRef | undefined,
  pair: BodyConnectionPair | undefined
): BodyJoint | undefined {
  if (!pair) return undefined;
  if (target?.kind === 'junction')
    return document.joints.find((joint) =>
      [joint.frameA.attachmentId, joint.frameB.attachmentId].every((id) =>
        [pair.a, pair.b].includes(id)
      )
    );
  return document.joints.find((joint) => joint.id === pair.key);
}

// -------------------------------------------------------------------- drive

/** The coordinate a drive would be set on: a cylinder's stroke, or the pin's angle. */
export function nativeDriveJoint(
  document: BodyDocument,
  target: BodySelectionRef | undefined
): BodyJoint | undefined {
  return nativeMenuJoints(document, target).find((joint) => joint.kind !== 'weld');
}

export function nativeDriver(
  document: BodyDocument,
  target: BodySelectionRef | undefined
): BodyDriver | undefined {
  const joint = nativeDriveJoint(document, target);
  return document.drivers.find((driver) => driver.coordinate.jointId === joint?.id);
}

export function nativeDriveCommand(
  document: BodyDocument,
  target: BodySelectionRef | undefined
): BodyEditCommand | undefined {
  const joint = nativeDriveJoint(document, target);
  if (!joint) return undefined;
  const driver = nativeDriver(document, target);
  if (driver) return nativeCommand({ kind: 'remove-driver', driverId: driver.id });
  const angular = joint.kind === 'revolute';
  return nativeCommand({
    kind: 'add-driver',
    coordinate: { jointId: joint.id, coordinate: angular ? 'angle' : 'travel' },
    speed: angular ? document.settings.defaultDrive.angular : document.settings.defaultDrive.linear,
  });
}

/** Why this mark will not take an input, in the model's own words. */
export function nativeDriveRefusal(
  document: BodyDocument,
  target: BodySelectionRef | undefined
): NativeMenuRefusal | undefined {
  if (nativeDriveJoint(document, target)) return undefined;
  const joints = nativeMenuJoints(document, target);
  return joints.length > 0 ? NATIVE_WELD_HAS_NO_FREEDOM : NATIVE_NO_COORDINATE;
}

// -------------------------------------------------------------------- trace

/** The point whose path the Trace path switch draws. */
export function nativeTraceAttachment(
  document: BodyDocument,
  target: BodySelectionRef | undefined
): AttachmentId | undefined {
  if (target?.kind === 'attachment') return target.id;
  if (target?.kind === 'junction')
    return document.junctions.find((pin) => pin.id === target.id)?.hub;
  if (target?.kind === 'joint')
    return document.joints.find((joint) => joint.id === target.id)?.frameB.attachmentId;
  return undefined;
}

export function nativeIsTraced(
  document: BodyDocument,
  target: BodySelectionRef | undefined
): boolean {
  const id = nativeTraceAttachment(document, target);
  return !!document.attachments.find((point) => point.id === id)?.trace;
}

export function nativeTraceCommand(
  document: BodyDocument,
  target: BodySelectionRef | undefined
): BodyEditCommand | undefined {
  const id = nativeTraceAttachment(document, target);
  if (!id) return undefined;
  return nativeCommand({
    kind: 'attachment-properties',
    attachmentId: id,
    change: { trace: !nativeIsTraced(document, target) },
  });
}

// --------------------------------------------------------------------- lock

type LockTarget = Extract<BodyEditOperation, { kind: 'lock' }>['targets'][number];

/** What a Lock mark actually lands on for each thing that can be selected. */
export function nativeLockTargets(
  document: BodyDocument,
  selection: readonly BodySelectionRef[]
): readonly LockTarget[] {
  return selection.flatMap<LockTarget>((target) => {
    if (target.kind === 'force' || target.kind === 'attachment') return [target];
    if (target.kind === 'joint' || target.kind === 'junction') {
      const joints = selectionJoints(document, target);
      return [
        ...new Set(
          joints.flatMap((joint) => [joint.frameA.attachmentId, joint.frameB.attachmentId])
        ),
      ].map((id) => ({ kind: 'attachment' as const, id }));
    }
    return selectionBodies(document, [target]).map((id) => ({ kind: 'body' as const, id }));
  });
}

export function nativeIsLocked(document: BodyDocument, targets: readonly LockTarget[]): boolean {
  return (
    targets.length > 0 &&
    targets.every((target) =>
      target.kind === 'attachment'
        ? document.locks.includes(target.id)
        : target.kind === 'force'
          ? !!document.forces.find((force) => force.id === target.id)?.locked
          : document.bodies.some(
              (body) => body.id === target.id && body.kind === 'material' && body.locked
            )
    )
  );
}

export function nativeLockCommand(
  document: BodyDocument,
  selection: readonly BodySelectionRef[]
): BodyEditCommand {
  const targets = nativeLockTargets(document, selection);
  return nativeCommand({ kind: 'lock', targets, locked: !nativeIsLocked(document, targets) });
}

/**
 * How many marks carry a lock and how many do not.
 *
 * Joints and forces, as the public count has it — a link's mark is the marks on
 * its joints, so counting it again would count the same hold twice. A pin is
 * two attachments in the document and one mark on the drawing, and it is the
 * mark that is counted, or a four-bar would report eight parts where the
 * reader can see four.
 */
export function nativeLockCounts(document: BodyDocument): {
  locked: number;
  open: number;
  total: number;
} {
  const marks: boolean[] = [];
  const counted = new Set<AttachmentId>();
  const seen = new Set<string>();
  for (const joint of document.joints) {
    const junction = document.junctions.find((pin) => pin.joints.includes(joint.id));
    const key = junction?.id ?? joint.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const points = junction?.attachments ?? [joint.frameA.attachmentId, joint.frameB.attachmentId];
    for (const id of points) counted.add(id);
    marks.push(points.every((id) => document.locks.includes(id)));
  }
  for (const point of document.attachments)
    if (!counted.has(point.id)) marks.push(document.locks.includes(point.id));
  for (const force of document.forces) marks.push(!!force.locked);
  const locked = marks.filter(Boolean).length;
  return { locked, open: marks.length - locked, total: marks.length };
}

export function nativeAllLocksCommand(document: BodyDocument, locked: boolean): BodyEditCommand {
  return nativeCommand({
    kind: 'lock',
    locked,
    targets: [
      ...document.attachments.map((point) => ({ kind: 'attachment' as const, id: point.id })),
      ...document.forces.map((force) => ({ kind: 'force' as const, id: force.id })),
    ],
  });
}

// --------------------------------------------------------------- bar holds

/** Which of a bar's two numbers are held against edits, and whether it has two. */
export function nativeHoldState(
  document: BodyDocument,
  bodyId: BodyId | undefined
): { dimensions: readonly ('length' | 'angle')[]; holdable: boolean; locked: boolean } {
  const body = document.bodies.find((one) => one.id === bodyId);
  const hold = document.holds.find((one) => one.bodyId === bodyId);
  const locked = body?.kind === 'material' && !!body.locked;
  return {
    dimensions: [
      ...(hold?.length !== undefined ? (['length'] as const) : []),
      ...(hold?.angle !== undefined ? (['angle'] as const) : []),
    ],
    holdable:
      body?.kind === 'material' &&
      body.geometry.kind === 'bar' &&
      !!bodyBarHoldPair(document, body.id),
    locked,
  };
}

export function nativeHoldRefusal(
  document: BodyDocument,
  bodyId: BodyId | undefined
): NativeMenuRefusal | undefined {
  const state = nativeHoldState(document, bodyId);
  if (!state.holdable) return NATIVE_BARS_ONLY;
  return state.locked ? NATIVE_HELD_BY_LOCK : undefined;
}

export function nativeHoldCommand(
  document: BodyDocument,
  bodyId: BodyId | undefined,
  which: 'length' | 'angle'
): BodyEditCommand | undefined {
  const pair = bodyId && bodyBarHoldPair(document, bodyId);
  if (!bodyId || !pair) return undefined;
  return nativeCommand({
    kind: 'hold',
    bodyId,
    ...pair,
    dimension: which,
    enabled: !nativeHoldState(document, bodyId).dimensions.includes(which),
  });
}

/** A bar's length and its bearing, in the document's own units, for the row's hint. */
export function nativeBarDimensions(
  document: BodyDocument,
  bodyId: BodyId | undefined
): { length: number; angle: number } | undefined {
  const body = document.bodies.find((one) => one.id === bodyId);
  if (body?.kind !== 'material' || body.geometry.kind !== 'bar') return undefined;
  const [a, b] = body.geometry.vertices;
  return {
    length: Math.hypot(b.x - a.x, b.y - a.y),
    angle: body.pose.angle + Math.atan2(b.y - a.y, b.x - a.x),
  };
}

// -------------------------------------------------------------- link shape

export function nativeIsDisc(document: BodyDocument, bodyId: BodyId | undefined): boolean {
  const body = document.bodies.find((one) => one.id === bodyId);
  return body?.kind === 'material' && body.presentation.outline === 'circle';
}

export function nativeDiscCommand(
  document: BodyDocument,
  bodyId: BodyId | undefined
): BodyEditCommand | undefined {
  if (!bodyId) return undefined;
  return nativeCommand({
    kind: 'body-properties',
    bodyId,
    change: { presentation: { outline: nativeIsDisc(document, bodyId) ? 'geometry' : 'circle' } },
  });
}

export function nativeDuplicateCommand(
  document: BodyDocument,
  bodyIds: readonly BodyId[]
): BodyEditCommand | undefined {
  const copied = bodyIds.filter((id) => id !== WORLD);
  if (copied.length === 0) return undefined;
  const step = document.settings.objectScale;
  return nativeCommand({
    kind: 'copy-bodies',
    bodyIds: copied,
    offset: { x: step, y: -step },
    includeGround: false,
  });
}

// ------------------------------------------------------------------ forces

/** F1, F2 ... — the names the public route gives a new load. */
export function nativeNextForceName(document: BodyDocument): string {
  const taken = new Set(document.forces.map((force) => force.label));
  for (let n = 1; ; n++) if (!taken.has(`F${n}`)) return `F${n}`;
}

/**
 * A new load on a body, drawn from where the menu opened to where the pointer
 * is — the public route's click-then-place gesture, as one insert.
 *
 * Nothing exists until the gesture ends, so an abandoned draw leaves no force
 * behind and a finished one is a single entry in the history.
 */
export function nativeForceInsert(
  document: BodyDocument,
  bodyId: BodyId,
  at: Point,
  to: Point,
  id = newRecordId<'force'>()
): BodyEditCommand | undefined {
  const body = document.bodies.find((one) => one.id === bodyId);
  if (!body) return undefined;
  const span = { x: to.x - at.x, y: to.y - at.y };
  const length = Math.hypot(span.x, span.y);
  const unit = length > 0 ? { x: span.x / length, y: span.y / length } : { x: 1, y: 0 };
  return nativeCommand({
    kind: 'insert',
    records: {
      forces: [
        {
          id,
          bodyId,
          point: worldToLocal(body.pose, at),
          label: nativeNextForceName(document),
          frame: 'world',
          vector: { x: unit.x * DEFAULT_LOAD, y: unit.y * DEFAULT_LOAD },
          couple: 0,
          presentation: { length, zeroAngle: Math.atan2(unit.y, unit.x) },
        },
      ],
    },
  });
}

/** The magnitude a load starts at; the gesture sets its direction, not its size. */
const DEFAULT_LOAD = 10;

export function nativeForceReverseCommand(
  document: BodyDocument,
  forceId: ForceId
): BodyEditCommand | undefined {
  const force = document.forces.find((one) => one.id === forceId);
  if (!force) return undefined;
  return nativeCommand({
    kind: 'force-properties',
    forceId,
    change: { vector: { x: -force.vector.x, y: -force.vector.y }, couple: -force.couple },
  });
}

export function nativeForceFrameCommand(
  document: BodyDocument,
  forceId: ForceId
): BodyEditCommand | undefined {
  const force = document.forces.find((one) => one.id === forceId);
  if (!force) return undefined;
  return nativeCommand({
    kind: 'force-properties',
    forceId,
    change: { frame: force.frame === 'world' ? 'body' : 'world' },
  });
}
