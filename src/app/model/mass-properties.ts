import { Coord } from './coord';
import { RealLink } from './link';
import { UniformBody, uniformBodyOf } from './uniform-body';
import { parallelAxis, ParallelAxisTrace } from './parallel-axis';

/** Shared by the editable mechanism and its explanation: member overrides and
 * parallel-axis terms must have exactly one definition. Factor converts stored
 * mass times squared model lengths to stored inertia. */
export interface MassProperties {
  com: Coord;
  moi: number;
  shape?: UniformBody;
  trace?: { kind: 'rod'; endpoint: ParallelAxisTrace } | PlateMassTrace;
  parts: {
    body: RealLink;
    mass: number;
    com: Coord;
    moi: number;
    distanceSq: number;
    shift: number;
    contribution: number;
  }[];
}

export interface PlateMassTrace {
  kind: 'plate';
  originMoi: number;
  edgeMoi: number[];
}

export function uniformMassProperties(link: RealLink, factor: number): MassProperties {
  if (link.subset.length === 0) {
    const body = uniformBodyOf(link.joints);
    const moi = link.mass * body.gyrationSq * factor;
    const c = body.calculation;
    const trace =
      c.kind === 'rod'
        ? {
            kind: 'rod' as const,
            endpoint: parallelAxis(link.mass, body.centroid, moi, c.endpoints[0], factor),
          }
        : c.kind === 'plate'
          ? {
              kind: 'plate' as const,
              originMoi: link.mass * c.polarOverMass * factor,
              edgeMoi: c.edges.map(
                (edge) => ((link.mass * edge.polarAreaMoment) / c.area) * factor
              ),
            }
          : undefined;
    return {
      com: new Coord(body.centroid.x, body.centroid.y),
      moi,
      trace,
      shape: body,
      parts: [],
    };
  }
  const parts = link.subset
    .filter((member): member is RealLink => member instanceof RealLink)
    .map((member) => {
      const own = uniformMassProperties(member, factor);
      return {
        body: member,
        mass: member.mass,
        com: member.comIsCustom ? new Coord(member.CoM.x, member.CoM.y) : own.com,
        moi: member.moiIsCustom ? member.massMoI : own.moi,
      };
    });
  const totalMass = parts.reduce((sum, part) => sum + part.mass, 0);
  const com =
    totalMass > 0
      ? new Coord(
          parts.reduce((sum, part) => sum + part.mass * part.com.x, 0) / totalMass,
          parts.reduce((sum, part) => sum + part.mass * part.com.y, 0) / totalMass
        )
      : new Coord(
          parts.reduce((sum, part) => sum + part.com.x, 0) / Math.max(1, parts.length),
          parts.reduce((sum, part) => sum + part.com.y, 0) / Math.max(1, parts.length)
        );
  const contributions = parts.map((part) => {
    const shifted = parallelAxis(part.mass, part.com, part.moi, com, factor);
    return {
      ...part,
      distanceSq: shifted.distanceSq,
      shift: shifted.shift,
      contribution: shifted.inertia,
    };
  });
  // Preserve the existing accumulation order while exposing each same shift.
  const moi = contributions.reduce((sum, part) => sum + part.moi + part.shift, 0);
  return { com, moi, parts: contributions };
}
