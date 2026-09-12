import { Coord } from './coord';
import { RealLink } from './link';
import { uniformBodyOf } from './uniform-body';

/** Uniform bodies combined by the parallel-axis theorem, retaining member overrides. */
export function uniformMassProperties(link: RealLink, factor: number): { com: Coord; moi: number } {
  if (link.subset.length === 0) {
    const body = uniformBodyOf(link.joints);
    return {
      com: new Coord(body.centroid.x, body.centroid.y),
      moi: link.mass * body.gyrationSq * factor,
    };
  }
  const parts = link.subset
    .filter((member): member is RealLink => member instanceof RealLink)
    .map((member) => {
      const own = uniformMassProperties(member, factor);
      return {
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
  const moi = parts.reduce(
    (sum, part) =>
      sum + part.moi + part.mass * ((part.com.x - com.x) ** 2 + (part.com.y - com.y) ** 2) * factor,
    0
  );
  return { com, moi };
}
