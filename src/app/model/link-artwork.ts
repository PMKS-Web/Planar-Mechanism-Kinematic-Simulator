import { Cylinder, cylinderOfBarIn } from './cylinder';
import { memberSilhouette } from './cylinder-fusion';
import { transformRigidPath } from './compound-link-path';
import { Link, RealLink } from './link';
import { linkSkeletonPath } from './link-skeleton';
import { SettingsService } from '../services/settings.service';

interface Artwork {
  shape: string;
  path: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  pose: string;
  placed: string;
}

const cache = new WeakMap<RealLink, Artwork>();

/** A display copy never replaces the outlines used by geometry or CAD export. */
function copy(link: RealLink, scale: number, cylinders: readonly Cylinder[]): RealLink {
  const children = link.subset.map((child) =>
    child instanceof RealLink ? copy(child, scale, cylinders) : child
  );
  const result = new RealLink(
    link.id,
    link.joints,
    link.mass,
    link.massMoI,
    link.CoM,
    children,
    link,
    scale
  );
  result.drawnByACylinderSkin = link.drawnByACylinderSkin;
  const cylinder = cylinderOfBarIn(cylinders, link);
  if (cylinder) {
    result.skinSilhouette = memberSilhouette(
      cylinder,
      cylinder.barrel.id === link.id ? 'barrel' : 'rod',
      0.15 * scale
    );
  }
  return result;
}

/**
 * Build once per shape/size, then rigidly place the cached picture during
 * playback. No solve, history entry, or union per animation frame.
 */
export function linkArtwork(link: Link, scale: number, cylinders: readonly Cylinder[]): string {
  if (!(link instanceof RealLink) || link.joints.length < 2) return '';
  const member = cylinderOfBarIn(cylinders, link);
  if (member)
    return memberSilhouette(member, member.barrel.id === link.id ? 'barrel' : 'rod', 0.15 * scale);
  if (scale === SettingsService.objectScale) return link.d;
  const [a, b] = link.joints;
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = span > 0 ? (b.x - a.x) / span : 1;
  const uy = span > 0 ? (b.y - a.y) / span : 0;
  const shapeOf = (part: Link): string => {
    const real = part instanceof RealLink ? part : undefined;
    return `${part.id}:${real?.isCircle}:${part.joints
      .map(
        (p) =>
          `${((p.x - a.x) * ux + (p.y - a.y) * uy).toFixed(6)},${(-(p.x - a.x) * uy + (p.y - a.y) * ux).toFixed(6)},${'ground' in p && p.ground}`
      )
      .join(';')}[${real?.subset.map(shapeOf).join('|') ?? ''}]`;
  };
  const shape = `${scale}:${SettingsService.cylinderObjectScale}:${cylinders.map((c) => c.barrel.id + '/' + c.rod.id).join(';')}:${shapeOf(link)}`;
  const pose = `${a.x},${a.y},${ux},${uy}`;
  let held = cache.get(link);
  if (!held || held.shape !== shape) {
    const path = copy(link, scale, cylinders).d;
    held = {
      shape,
      path,
      from: { x: a.x, y: a.y },
      to: { x: a.x + ux, y: a.y + uy },
      pose,
      placed: path,
    };
    cache.set(link, held);
  } else if (held.pose !== pose) {
    held.placed = transformRigidPath(held.path, held.from, held.to, a, {
      x: a.x + ux,
      y: a.y + uy,
    });
    held.pose = pose;
  }
  return held.placed;
}

/** Cylinder members keep their own symbols; hidden internal joints aren't schematic pins. */
export function schematicLink(link: Link, cylinders: readonly Cylinder[]): string {
  if (link instanceof RealLink && link.subset.length) {
    return link.subset.map((child) => schematicLink(child, cylinders)).join(' ');
  }
  return cylinderOfBarIn(cylinders, link) ? '' : linkSkeletonPath(link);
}
