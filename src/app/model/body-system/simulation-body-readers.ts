import { AttachmentId, BodyId } from './body-id';
import { add, compose, finitePoint, localToWorld, Point, Pose, scale } from './body-frame';
import { BodyMotion } from './body-rates';
import { bodyPointRates, PointRates } from './body-point-rates';
import { resolveMass } from './body-properties';
import { unitFactors } from './body-units';
import { SimulationView } from './simulation-view';
import { simulationBodyContext } from './simulation-body-context';
import { SimulationValue, simulationAvailable, simulationUnavailable } from './simulation-values';

/** World SI poses are presentation values; continue solving with the retained numerical frame. */
export function simulationBodyPose(view: SimulationView, body: BodyId): SimulationValue<Pose> {
  const context = simulationBodyContext(view, body);
  if (!context.ok) return context;
  const { pose, member, origin } = context.value,
    material = compose(pose, member);
  return simulationAvailable({ ...add(material, origin), angle: material.angle });
}

/** The requested point is body-local in document units; returned position and rates use world-oriented SI. */
export function simulationBodyPoint(
  view: SimulationView,
  body: BodyId,
  local: Point
): SimulationValue<Point> {
  if (!finitePoint(local)) return simulationUnavailable('invalid');
  const context = simulationBodyContext(view, body);
  if (!context.ok) return context;
  const { pose, member, origin } = context.value;
  const point = localToWorld(
    member,
    scale(local, unitFactors(view.snapshot.document.units).length)
  );
  return simulationAvailable(add(localToWorld(pose, point), origin));
}

export function simulationBodyPointRates(
  view: SimulationView,
  body: BodyId,
  local: Point
): SimulationValue<PointRates> {
  if (!finitePoint(local)) return simulationUnavailable('invalid');
  const context = simulationBodyContext(view, body);
  if (!context.ok) return context;
  const { pose, member, motion } = context.value;
  if (!motion.ok) return motion;
  const point = localToWorld(
    member,
    scale(local, unitFactors(view.snapshot.document.units).length)
  );
  const result = bodyPointRates(pose, point, motion.value);
  return result ? simulationAvailable(result) : simulationUnavailable('invalid');
}

export function simulationBodyMotion(
  view: SimulationView,
  body: BodyId
): SimulationValue<BodyMotion> {
  const context = simulationBodyContext(view, body);
  if (!context.ok) return context;
  const { pose, member, motion } = context.value;
  if (!motion.ok) return motion;
  const point = bodyPointRates(pose, member, motion.value);
  return point
    ? simulationAvailable({
        velocity: {
          vx: point.velocity.x,
          vy: point.velocity.y,
          omega: motion.value.velocity.omega,
        },
        acceleration: {
          ax: point.acceleration.x,
          ay: point.acceleration.y,
          alpha: motion.value.acceleration.alpha,
        },
      })
    : simulationUnavailable('invalid');
}

export function simulationAttachmentPosition(
  view: SimulationView,
  id: AttachmentId
): SimulationValue<Point> {
  const anchor = view.snapshot.document.attachments.find((item) => item.id === id);
  return anchor
    ? simulationBodyPoint(view, anchor.bodyId, anchor.point)
    : simulationUnavailable('unknown-attachment');
}
export function simulationAttachmentRates(
  view: SimulationView,
  id: AttachmentId
): SimulationValue<PointRates> {
  const anchor = view.snapshot.document.attachments.find((item) => item.id === id);
  return anchor
    ? simulationBodyPointRates(view, anchor.bodyId, anchor.point)
    : simulationUnavailable('unknown-attachment');
}

/** A material center uses its own mass specification; a group override never becomes a member CoM. */
export function simulationMaterialCenter(view: SimulationView, id: BodyId): SimulationValue<Point> {
  const body = view.snapshot.document.bodies.find((item) => item.id === id);
  if (!body || body.kind !== 'material') return simulationUnavailable('unknown-body');
  const mass = resolveMass(body, view.snapshot.document.units);
  if (!mass.center) return simulationUnavailable('zero-mass');
  return simulationBodyPoint(
    view,
    id,
    scale(mass.center, 1 / unitFactors(view.snapshot.document.units).length)
  );
}
export function simulationMaterialCenterRates(
  view: SimulationView,
  id: BodyId
): SimulationValue<PointRates> {
  const body = view.snapshot.document.bodies.find((item) => item.id === id);
  if (!body || body.kind !== 'material') return simulationUnavailable('unknown-body');
  const mass = resolveMass(body, view.snapshot.document.units);
  if (!mass.center) return simulationUnavailable('zero-mass');
  return simulationBodyPointRates(
    view,
    id,
    scale(mass.center, 1 / unitFactors(view.snapshot.document.units).length)
  );
}
