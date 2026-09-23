import { Cylinder, cylinderOfBarIn } from './cylinder';
import { Link, RealLink } from './link';
import { linkSkeletonPath } from './link-skeleton';

/**
 * How a schematic line says it is picked: a band of amber under the line, so
 * the line keeps its own color. `picked` is the thing selected; `context` is
 * the rest of the compound a picked part belongs to; `hovered` is a whole
 * machine pointed at from the transport.
 */
export type HaloKind = 'picked' | 'context' | 'hovered';

export interface Halo {
  key: string;
  d: string;
  kind: HaloKind;
}

/**
 * The line a halo runs under: the schematic's own drawing of the body. A
 * cylinder member is its line from mount A to the seal, or from the seal to
 * mount B, which is how Schematic draws it.
 */
export function haloPath(link: Link, cylinders: readonly Cylinder[]): string {
  const cylinder = cylinderOfBarIn(cylinders, link);
  if (cylinder) {
    const barrel = cylinder.barrel.id === link.id;
    const [a, b] = barrel ? [cylinder.mountA, cylinder.seal] : [cylinder.seal, cylinder.mountB];
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  if (link instanceof RealLink && link.subset.length) {
    return link.subset.map((part) => haloPath(part, cylinders)).join(' ');
  }
  return linkSkeletonPath(link);
}

/** Whether `part` is `body` or one of the parts it was welded from. */
export function holds(body: Link, part: Link): boolean {
  if (body.id === part.id) return true;
  return body instanceof RealLink && body.subset.some((child) => holds(child, part));
}

/**
 * Every halo to draw, deepest first.
 *
 * A whole body selected is one solid band along all of its lines. A part picked
 * inside a compound is a solid band on that part over a dashed one along the
 * rest of the compound, so the two selections cannot be mistaken for each
 * other and the part still says which body it belongs to.
 */
export function selectionHalos(
  roots: readonly Link[],
  stateOf: (link: Link) => string,
  part: Link | undefined,
  cylinders: readonly Cylinder[]
): Halo[] {
  const halos: Halo[] = [];
  for (const root of roots) {
    if (part && part.id !== root.id && holds(root, part)) {
      halos.push({ key: `${root.id}:context`, d: haloPath(root, cylinders), kind: 'context' });
      halos.push({ key: part.id, d: haloPath(part, cylinders), kind: 'picked' });
      continue;
    }
    const state = stateOf(root);
    const kind: HaloKind | undefined = /link-(selected|pointed)/.test(state)
      ? 'picked'
      : state.includes('link-hovered')
        ? 'hovered'
        : undefined;
    if (kind) halos.push({ key: root.id, d: haloPath(root, cylinders), kind });
  }
  // Context under every picked band, whichever body it came from.
  return halos.sort((a, b) => Number(b.kind === 'context') - Number(a.kind === 'context'));
}
