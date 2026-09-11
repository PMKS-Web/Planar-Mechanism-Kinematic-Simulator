import type { MechanismFixture } from './fixture';
import { BodyFactory } from '../../app/model/body-system/body-factory';
import { BodyDriver } from '../../app/model/body-system/body-document';
import { AttachmentId, BodyId, newRecordId, WORLD } from '../../app/model/body-system/body-id';
import { worldToLocal } from '../../app/model/body-system/body-frame';

/**
 * Geometry-only comparison bridge from declarative reference geometry, never a runtime graph.
 * Off-axis reference points are material attachments. Bar artwork and default masses are
 * placeholders here; neither supplies a distance, angle, position or rate to the solver.
 * Intrinsic CoM and force checks need their own material specifications.
 * S6 replaces this bridge with published, editor-constructed native fixtures.
 */
export function nativePositionReferenceFixture(fixture: MechanismFixture) {
  if (fixture.detach?.length || fixture.links.some((link) => link.subset))
    throw new Error('Reference bridge does not support detached or compound fixtures');
  const f = new BodyFactory();
  const points = new Map(fixture.joints.map((point) => [point.id, point]));
  const bodies = new Map<string, BodyId>();
  const anchors = new Map<string, AttachmentId>();
  const witnesses = new Map<string, AttachmentId>();
  const anchor = (bodyId: BodyId, pointId: string): AttachmentId => {
    const key = `${bodyId}:${pointId}`;
    if (!anchors.has(key)) {
      const body = f.document.bodies.find((candidate) => candidate.id === bodyId)!;
      anchors.set(
        key,
        f.attachment(bodyId, worldToLocal(body.pose, points.get(pointId)!), pointId)
      );
    }
    return anchors.get(key)!;
  };
  for (const link of fixture.links) {
    const [a, b] = [...link.joints].map((id) => points.get(id)!);
    const pose = { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    const id = f.body(link.joints, pose, [{ x: 0, y: 0 }, worldToLocal(pose, b)]);
    bodies.set(link.joints, id);
    for (const pointId of link.joints) witnesses.set(pointId, anchor(id, pointId));
  }
  let driver: BodyDriver | undefined;
  for (const point of fixture.joints) {
    const owners = fixture.links
      .filter((link) => link.joints.includes(point.id))
      .map((link) => bodies.get(link.joints)!);
    if (point.ground) owners.unshift(WORLD);
    if (point.input && (!point.ground || owners.length !== 2))
      throw new Error('Reference bridge requires an unambiguous grounded crank input');
    const hub = owners[0];
    for (const member of owners.slice(1)) {
      const joint = f.joint(
        fixture.welds?.includes(point.id) ? 'weld' : 'revolute',
        anchor(hub, point.id),
        anchor(member, point.id)
      );
      if (point.input)
        driver = {
          id: newRecordId<'driver'>(),
          coordinate: { jointId: joint.id, coordinate: 'angle' },
          profile: { kind: 'constant-speed', initial: 0, speed: fixture.inputAngVel },
        };
    }
  }
  for (const slot of [...(fixture.slider ? [fixture.slider] : []), ...(fixture.sliders ?? [])]) {
    if (slot.input || slot.sealed)
      throw new Error('Reference bridge only supports passive external guides');
    const riders = fixture.links.filter((link) => link.joints.includes(slot.at));
    if (riders.length !== 1) throw new Error('Reference bridge requires one explicit rider');
    const carrier = slot.on ? bodies.get(slot.on.carrier)! : WORLD;
    const rider = bodies.get(riders[0].joints)!;
    const a = slot.on ? points.get(slot.on.a)! : points.get(slot.at)!;
    const b = slot.on ? points.get(slot.on.b)! : undefined;
    const axis = b ? Math.atan2(b.y - a.y, b.x - a.x) : (slot.angleRad ?? 0);
    const carrierPose = f.document.bodies.find((body) => body.id === carrier)!.pose;
    const guide = f.attachment(carrier, worldToLocal(carrierPose, a));
    f.joint(
      fixture.welds?.includes(slot.at) ? 'prismatic' : 'pin-in-slot',
      guide,
      anchor(rider, slot.at),
      axis
    );
    // The old block's duplicated joint is the same visible rider point, not another body.
    witnesses.set(slot.prisId, anchor(rider, slot.at));
  }
  if (!driver) throw new Error('Reference bridge needs a drive');
  const input = fixture.joints.find((point) => point.input)!;
  const inputLink = fixture.links.find((link) => link.joints.includes(input.id))!;
  const crankTip = [...inputLink.joints].find((id) => id !== input.id)!;
  const tip = points.get(crankTip)!;
  return {
    document: { ...f.document, drivers: [driver] },
    witnesses,
    bodies,
    driver,
    input: input.id,
    crankTip,
    initialAngle: Math.atan2(tip.y - input.y, tip.x - input.x),
  };
}
