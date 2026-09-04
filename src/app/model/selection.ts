import { Force } from './force';
import { Joint, RealJoint } from './joint';
import { Link, RealLink } from './link';

/**
 * What a reader can pick out of the drawing and act on as a group.
 *
 * A force is one of them, and it is the odd one: joints and links are
 * *geometry*, and a force is a reading anchored to a body. It joins the
 * selection so that eight of them can be given one magnitude, one frame or one
 * color in a single press -- and it brings no geometry of its own to a group
 * drag, because where a force is is decided by the link it is on. A selection
 * that is nothing but forces therefore has nothing to drag, and says so.
 */
export type SelectedPart = RealJoint | RealLink | Force;
export type SelectedPartKind = 'joint' | 'link' | 'force';

/** A transient selection identity. Kind is part of the key: joint and link ids may collide. */
export interface SelectedPartRef {
  kind: SelectedPartKind;
  id: string;
}

export interface PartSelectionSnapshot {
  refs: SelectedPartRef[];
  primary?: SelectedPartRef;
}

export type CommonValue<T> = { kind: 'empty' } | { kind: 'mixed' } | { kind: 'common'; value: T };

export function partRef(part: SelectedPart): SelectedPartRef {
  return {
    kind: part instanceof RealJoint ? 'joint' : part instanceof Force ? 'force' : 'link',
    id: part.id,
  };
}

export function partRefKey(ref: SelectedPartRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function samePartRef(left: SelectedPartRef, right: SelectedPartRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

/** Keep macOS Control-click available for its native context-menu gesture. */
export function isAdditiveSelectionGesture(
  event: { ctrlKey: boolean; metaKey: boolean },
  platform: string = typeof navigator === 'undefined' ? '' : navigator.platform
): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? event.metaKey : event.ctrlKey;
}

/** Roots plus every leaf of every compound, without making the top-level array lie. */
export function selectableLinks(links: Link[]): RealLink[] {
  const found: RealLink[] = [];
  const seen = new Set<RealLink>();
  const visit = (link: Link) => {
    if (!(link instanceof RealLink) || seen.has(link)) return;
    seen.add(link);
    found.push(link);
    link.subset.forEach(visit);
  };
  links.forEach(visit);
  return found;
}

export function resolveSelectedParts(
  refs: readonly SelectedPartRef[],
  joints: readonly Joint[],
  links: readonly Link[],
  forces: readonly Force[] = []
): SelectedPart[] {
  const jointById = new Map(
    joints
      .filter((joint): joint is RealJoint => joint instanceof RealJoint)
      .map((joint) => [joint.id, joint])
  );
  const linkById = new Map(selectableLinks([...links]).map((link) => [link.id, link]));
  const forceById = new Map(forces.map((force) => [force.id, force]));
  const resolved: SelectedPart[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = partRefKey(ref);
    if (seen.has(key)) continue;
    const part =
      ref.kind === 'joint'
        ? jointById.get(ref.id)
        : ref.kind === 'force'
          ? forceById.get(ref.id)
          : linkById.get(ref.id);
    if (!part) continue;
    seen.add(key);
    resolved.push(part);
  }
  return resolved;
}

/** Ordered transient state, kept independent of Angular and URL serialization. */
export class PartSelectionState {
  private chosen: SelectedPart[] = [];
  private primarySelection?: SelectedPartRef;

  get parts(): readonly SelectedPart[] {
    return this.chosen;
  }

  get refs(): SelectedPartRef[] {
    return this.chosen.map(partRef);
  }

  get primaryRef(): SelectedPartRef | undefined {
    return this.primarySelection ? { ...this.primarySelection } : undefined;
  }

  get primary(): SelectedPart | undefined {
    if (!this.primarySelection) return undefined;
    const wanted = partRefKey(this.primarySelection);
    return this.chosen.find((part) => partRefKey(partRef(part)) === wanted);
  }

  replace(part: SelectedPart): void {
    this.chosen = [part];
    this.primarySelection = partRef(part);
  }

  toggle(part: SelectedPart): void {
    const key = partRefKey(partRef(part));
    const index = this.chosen.findIndex((candidate) => partRefKey(partRef(candidate)) === key);
    this.chosen =
      index >= 0
        ? this.chosen.filter((_, candidateIndex) => candidateIndex !== index)
        : [...this.chosen, part];
    this.primarySelection =
      this.chosen.length > 0 ? partRef(this.chosen[this.chosen.length - 1]) : undefined;
  }

  contains(partOrRef: SelectedPart | SelectedPartRef): boolean {
    const wanted = 'kind' in partOrRef ? partOrRef : partRef(partOrRef);
    const key = partRefKey(wanted);
    return this.chosen.some((part) => partRefKey(partRef(part)) === key);
  }

  clear(): void {
    this.chosen = [];
    this.primarySelection = undefined;
  }

  snapshot(): PartSelectionSnapshot {
    return {
      refs: this.refs.map((ref) => ({ ...ref })),
      primary: this.primaryRef,
    };
  }

  restore(
    snapshot: PartSelectionSnapshot,
    joints: readonly Joint[],
    links: readonly Link[],
    forces: readonly Force[] = []
  ): void {
    this.chosen = resolveSelectedParts(snapshot.refs, joints, links, forces);
    const surviving = new Set(this.chosen.map((part) => partRefKey(partRef(part))));
    this.primarySelection =
      snapshot.primary && surviving.has(partRefKey(snapshot.primary))
        ? { ...snapshot.primary }
        : this.chosen.length > 0
          ? partRef(this.chosen[this.chosen.length - 1])
          : undefined;
  }
}

/**
 * Aggregate a field for the multi-selection panel without choosing a display policy for it.
 * Callers supply tolerance-aware equality when formatted numeric values should agree.
 */
export function aggregateCommonValue<T>(
  values: readonly T[],
  equals: (left: T, right: T) => boolean = Object.is
): CommonValue<T> {
  if (values.length === 0) return { kind: 'empty' };
  const first = values[0];
  return values.every((value) => equals(value, first))
    ? { kind: 'common', value: first }
    : { kind: 'mixed' };
}
