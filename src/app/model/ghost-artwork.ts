import { Cylinder, cylinderOfBarIn } from './cylinder';
import { memberSilhouette } from './cylinder-fusion';
import { transformRigidPath } from './compound-link-path';
import { Joint } from './joint';
import { Link, RealLink } from './link';
import { linkArtwork } from './link-artwork';
import { linkSkeletonPath } from './link-skeleton';
import { GhostBody } from './mechanism/anchor';

interface Snapshot {
  link: RealLink;
  cylinders: Cylinder[];
  channels: string;
  key?: string;
  path?: string;
}
const snapshots = new WeakMap<GhostBody, Snapshot>();

/** A held ghost keeps its last reachable shape even when its presentation changes. */
function capture(link: RealLink, cylinders: readonly Cylinder[], channels: string): Snapshot {
  const points = new Map<Joint, Joint>();
  const point = <T extends Joint>(joint: T): T => {
    if (!points.has(joint)) {
      points.set(joint, Object.assign(Object.create(Object.getPrototypeOf(joint)), joint));
    }
    return points.get(joint) as T;
  };
  const body = (source: RealLink): RealLink => {
    const result = new RealLink(
      source.id,
      source.joints.map(point),
      0,
      0,
      undefined,
      source.subset.map((child) => (child instanceof RealLink ? body(child) : child)),
      source
    );
    result.drawnByACylinderSkin = source.drawnByACylinderSkin;
    result.skinSilhouette = source.skinSilhouette;
    return result;
  };
  return {
    link: body(link),
    channels,
    cylinders: cylinders.map((c) => ({
      ...c,
      seal: point(c.seal),
      inner: point(c.inner),
      mountA: point(c.mountA),
      mountB: point(c.mountB),
    })),
  };
}

export function ghostArtwork(
  ghost: GhostBody,
  link: Link | undefined,
  cylinders: readonly Cylinder[],
  scale: number,
  schematic: boolean,
  channels: string
): string {
  if (!(link instanceof RealLink)) return ghost.d;
  let snapshot = snapshots.get(ghost);
  if (!snapshot) {
    snapshot = capture(link, cylinders, channels);
    snapshots.set(ghost, snapshot);
  }
  const key = `${scale}:${schematic}`;
  if (snapshot.key === key) return snapshot.path!;
  const drawing = snapshot;
  const schematicPath = (part: Link): string => {
    const c = cylinderOfBarIn(drawing.cylinders, part);
    if (c) return memberSilhouette(c, c.barrel.id === part.id ? 'barrel' : 'rod', 0.15 * scale);
    return part instanceof RealLink && part.subset.length
      ? part.subset.map(schematicPath).join(' ')
      : linkSkeletonPath(part);
  };
  const path = schematic
    ? schematicPath(snapshot.link)
    : `${linkArtwork(snapshot.link, scale, snapshot.cylinders)} ${snapshot.channels}`;
  const { from, to, there, thereEnd } = ghost.move;
  snapshot.key = key;
  snapshot.path = transformRigidPath(path, from, to, there, thereEnd);
  return snapshot.path;
}
