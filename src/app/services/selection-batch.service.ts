import { Injectable } from '@angular/core';
import { Cylinder, cylinderJoints } from '../model/cylinder';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { Link, RealLink, SliderBlock } from '../model/link';
import { SelectedPartRef } from '../model/selection';
import { MechanismService } from './mechanism.service';

export type { SelectedPartRef } from '../model/selection';

export interface BatchRefusal {
  code: string;
  short: string;
  message: string;
}

export type BatchMutationResult =
  { ok: true; selection: SelectedPartRef[] } | { ok: false; refusal: BatchRefusal };

type ResolvedPart =
  | { ref: SelectedPartRef; object: RealJoint }
  | { ref: SelectedPartRef; object: Link; root: Link }
  | { ref: SelectedPartRef; object: Force; force: Force };

interface DeletePlan {
  resolved: ResolvedPart[];
  removeRoots: Set<Link>;
  removeJointIds: Set<string>;
  selectedJointIds: Set<string>;
  orphanCandidates: Set<string>;
  /** Forces picked out on their own. The ones on a deleted body go with it anyway. */
  removeForces: Set<Force>;
}

interface DuplicateClosure {
  resolved: ResolvedPart[];
  joints: Joint[];
  roots: Link[];
}

const emptySelection = (): BatchRefusal => ({
  code: 'selection-empty',
  short: 'select parts first',
  message: 'Select at least one joint or link first.',
});

const staleSelection = (): BatchRefusal => ({
  code: 'selection-stale',
  short: 'selection changed',
  message: 'Part of the selection no longer exists. Select the parts again.',
});

/** Atomic structural operations shared by the multi-selection menu and shortcuts. */
@Injectable({ providedIn: 'root' })
export class SelectionBatchService {
  constructor(private readonly mechanism: MechanismService) {}

  deleteRefusal(refs: readonly SelectedPartRef[]): BatchRefusal | undefined {
    const resolved = resolve(this.mechanism, refs);
    if ('refusal' in resolved) return resolved.refusal;
    // A Lock says where a part is, not whether it may go: a locked selection
    // deletes like any other. What is left to refuse here is a selection that
    // is empty or no longer exists, which `resolve` has already answered.
    return undefined;
  }

  deleteSelected(refs: readonly SelectedPartRef[]): BatchMutationResult {
    const refusal = this.deleteRefusal(refs);
    if (refusal) return { ok: false, refusal };
    const resolved = resolve(this.mechanism, refs);
    if ('refusal' in resolved) return { ok: false, refusal: resolved.refusal };
    const plan = planDeletion(this.mechanism, resolved.parts);
    applyDeletion(this.mechanism, plan);
    this.mechanism.finishStructuralEdit(true);
    return { ok: true, selection: [] };
  }

  duplicateRefusal(refs: readonly SelectedPartRef[]): BatchRefusal | undefined {
    const resolved = resolve(this.mechanism, refs);
    if ('refusal' in resolved) return resolved.refusal;
    if (resolved.parts.every((part) => 'force' in part)) {
      return {
        code: 'duplicate-forces-only',
        short: 'nothing to copy it onto',
        message:
          'A force is copied with the link it acts on. Select that link as well, or copy it from the link.',
      };
    }
    const closure = duplicateClosure(this.mechanism, resolved.parts);
    return 'refusal' in closure ? closure.refusal : undefined;
  }

  duplicateSelected(
    refs: readonly SelectedPartRef[],
    delta: Readonly<{ x: number; y: number }>
  ): BatchMutationResult {
    if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
      return {
        ok: false,
        refusal: {
          code: 'duplicate-offset',
          short: 'invalid offset',
          message: 'The duplicate offset must be a finite distance.',
        },
      };
    }
    const resolved = resolve(this.mechanism, refs);
    if ('refusal' in resolved) return { ok: false, refusal: resolved.refusal };
    const closure = duplicateClosure(this.mechanism, resolved.parts);
    if ('refusal' in closure) return { ok: false, refusal: closure.refusal };
    const selection = copyClosure(this.mechanism, closure, delta);
    this.mechanism.finishStructuralEdit(true);
    return { ok: true, selection };
  }
}

function resolve(
  mechanism: MechanismService,
  refs: readonly SelectedPartRef[]
): { parts: ResolvedPart[] } | { refusal: BatchRefusal } {
  const unique = refs.filter(
    (ref, index) =>
      refs.findIndex((other) => other.kind === ref.kind && other.id === ref.id) === index
  );
  if (unique.length === 0) return { refusal: emptySelection() };
  const parts: ResolvedPart[] = [];
  const canonical = new Set<string>();
  for (const ref of unique) {
    if (ref.kind === 'joint') {
      const joint = mechanism.joints.find(
        (candidate): candidate is RealJoint =>
          candidate instanceof RealJoint && candidate.id === ref.id
      );
      if (!joint) return { refusal: staleSelection() };
      const key = `joint:${joint.id}`;
      if (canonical.has(key)) continue;
      canonical.add(key);
      parts.push({ ref, object: joint });
    } else if (ref.kind === 'force') {
      const force = mechanism.forces.find((candidate) => candidate.id === ref.id);
      if (!force) return { refusal: staleSelection() };
      const key = `force:${force.id}`;
      if (canonical.has(key)) continue;
      canonical.add(key);
      parts.push({ ref, object: force, force });
    } else {
      const object = linkById(mechanism, ref.id);
      const owningRoot = rootById(mechanism, ref.id);
      if (!owningRoot || !object) return { refusal: staleSelection() };
      const cylinder = mechanism.cylinderAt(object);
      const root = cylinder ? rootOf(mechanism, cylinder.barrel) : owningRoot;
      if (!root) return { refusal: staleSelection() };
      const key = `link:${root.id}`;
      if (canonical.has(key)) continue;
      canonical.add(key);
      parts.push({ ref: { kind: 'link', id: root.id }, object: root, root });
    }
  }
  return { parts };
}

function planDeletion(mechanism: MechanismService, resolved: ResolvedPart[]): DeletePlan {
  const removeRoots = new Set<Link>();
  const removeJointIds = new Set<string>();
  const selectedJointIds = new Set<string>();
  const orphanCandidates = new Set<string>();

  const removeCylinder = (cylinder: Cylinder) => {
    for (const body of [cylinder.barrel, cylinder.rod, cylinder.block]) {
      const root = rootOf(mechanism, body);
      if (root) {
        removeRoots.add(root);
        root.joints.forEach((joint) => orphanCandidates.add(joint.id));
      }
    }
    for (const joint of [cylinder.barrelNear, cylinder.pin, cylinder.slider]) {
      removeJointIds.add(joint.id);
    }
  };

  const removeForces = new Set<Force>();
  for (const part of resolved) {
    if ('force' in part) {
      removeForces.add(part.force);
    } else if ('root' in part) {
      const linked = part;
      const cylinder = mechanism.cylinderAt(linked.object);
      if (cylinder) removeCylinder(cylinder);
      else {
        removeRoots.add(linked.root);
        linked.root.joints.forEach((joint) => orphanCandidates.add(joint.id));
      }
    } else {
      selectedJointIds.add(part.object.id);
      removeJointIds.add(part.object.id);
      const cylinder = mechanism.cylinderAt(part.object);
      if (cylinder) removeCylinder(cylinder);
    }
  }

  for (const root of mechanism.links) {
    if (removeRoots.has(root)) continue;
    const selectedOnRoot = root.joints.filter((joint) => selectedJointIds.has(joint.id));
    if (selectedOnRoot.length === 0) continue;
    if (root instanceof SliderBlock) {
      removeRoots.add(root);
      root.joints.forEach((joint) => removeJointIds.add(joint.id));
    } else if (!(root instanceof RealLink) || root.subset.length === 0) {
      if (root.joints.length - selectedOnRoot.length < 2) removeRoots.add(root);
    } else {
      const survivors = root.subset.filter(
        (leaf) => leaf.joints.filter((joint) => !selectedJointIds.has(joint.id)).length >= 2
      );
      if (survivors.length === 0) removeRoots.add(root);
    }
  }

  const survivingRoots = mechanism.links.filter((root) => !removeRoots.has(root));
  orphanCandidates.forEach((id) => {
    const held = survivingRoots.some((root) =>
      root.joints.some((joint) => joint.id === id && !selectedJointIds.has(id))
    );
    if (!held) removeJointIds.add(id);
  });
  return {
    resolved,
    removeRoots,
    removeJointIds,
    selectedJointIds,
    orphanCandidates,
    removeForces,
  };
}

function applyDeletion(mechanism: MechanismService, plan: DeletePlan): void {
  const removedOwners = new Set<RealLink>();
  plan.removeRoots.forEach((root) => {
    if (root instanceof RealLink) removedOwners.add(root);
  });
  let roots = mechanism.links.filter((root) => !plan.removeRoots.has(root));

  roots = roots.flatMap((root) => {
    if (!root.joints.some((joint) => plan.selectedJointIds.has(joint.id))) return [root];
    if (!(root instanceof RealLink) || root.subset.length === 0) {
      removeJointsFromLink(root, plan.selectedJointIds);
      return root.joints.length >= 2 ? [root] : [];
    }
    root.subset = root.subset.filter((leaf) => {
      removeJointsFromLink(leaf, plan.selectedJointIds);
      return leaf.joints.length >= 2;
    });
    if (root.subset.length === 0) {
      removedOwners.add(root);
      return [];
    }
    if (root.subset.length === 1) {
      const survivor = root.subset[0];
      survivor.joints.forEach((joint) => {
        if (joint instanceof RealJoint) joint.isWelded = false;
      });
      if (survivor instanceof RealLink) {
        survivor.forces = root.forces;
        root.forces.forEach((force) => (force.link = survivor));
      }
      return [survivor];
    }
    root.joints = uniqueJoints(root.subset.flatMap((leaf) => leaf.joints));
    refreshLinkIdentity(root);
    return [root];
  });

  mechanism.links = roots;
  mechanism.forces = mechanism.forces.filter(
    (force) => !removedOwners.has(force.link) && !plan.removeForces.has(force)
  );
  mechanism.joints = mechanism.joints.filter((joint) => !plan.removeJointIds.has(joint.id));
  rewireForces(mechanism);
}

function duplicateClosure(
  mechanism: MechanismService,
  resolved: ResolvedPart[]
): DuplicateClosure | { refusal: BatchRefusal } {
  const joints = new Set<Joint>();
  const roots = new Set<Link>();
  const addRoot = (root: Link | undefined) => {
    if (!root) return;
    roots.add(root);
    root.joints.forEach((joint) => joints.add(joint));
  };
  const addCylinder = (cylinder: Cylinder) => {
    cylinderJoints(cylinder).forEach((joint) => joints.add(joint));
    addRoot(rootOf(mechanism, cylinder.barrel));
    addRoot(rootOf(mechanism, cylinder.rod));
    addRoot(rootOf(mechanism, cylinder.block));
  };

  for (const part of resolved) {
    // A force is copied with the body it acts on, which is the only place a
    // copy of it could go: a force on its own has no position of its own.
    if ('force' in part) continue;
    if ('root' in part) {
      const linked = part;
      const cylinder = mechanism.cylinderAt(linked.object);
      if (cylinder) addCylinder(cylinder);
      else addRoot(linked.root);
    } else {
      joints.add(part.object);
      const cylinder = mechanism.cylinderAt(part.object);
      if (cylinder) addCylinder(cylinder);
      if (part.object.isWelded) {
        mechanism.links.filter((root) => root.joints.includes(part.object)).forEach(addRoot);
      }
    }
  }

  let grew = true;
  while (grew) {
    const before = joints.size + roots.size;
    [...roots].forEach((root) => root.joints.forEach((joint) => joints.add(joint)));
    for (const joint of [...joints]) {
      if (!(joint instanceof RealJoint)) continue;
      for (const block of joint.links.filter(
        (link): link is SliderBlock => link instanceof SliderBlock
      )) {
        addRoot(rootOf(mechanism, block));
        block.joints.forEach((member) => joints.add(member));
        const slider = block.joints.find(
          (member): member is PrisJoint => member instanceof PrisJoint
        );
        if (slider?.isSealed) {
          const cylinder = mechanism.cylinderAt(slider);
          if (cylinder) addCylinder(cylinder);
        }
      }
      if (joint instanceof PrisJoint && joint.isFloating) {
        const carrier = rootOf(mechanism, joint.carrier!);
        if (!carrier || !joint.slotJointA || !joint.slotJointB) {
          return {
            refusal: {
              code: 'duplicate-slot',
              short: 'slot is incomplete',
              message:
                'The selection contains a slot whose carrier is incomplete. Repair the slot before duplicating it.',
            },
          };
        }
        addRoot(carrier);
        joints.add(joint.slotJointA);
        joints.add(joint.slotJointB);
      }
    }
    grew = before !== joints.size + roots.size;
  }
  return { resolved, joints: [...joints], roots: [...roots] };
}

function copyClosure(
  mechanism: MechanismService,
  closure: DuplicateClosure,
  delta: Readonly<{ x: number; y: number }>
): SelectedPartRef[] {
  const jointMap = new Map<Joint, Joint>();
  const reserved: string[] = [];
  const usedNames = new Set<string>([
    ...mechanism.joints.map((joint) => joint.name),
    ...mechanism.links.flatMap((link) => [
      link.name,
      ...descendants(link).map((leaf) => leaf.name),
    ]),
    ...mechanism.forces.map((force) => force.name),
  ]);
  for (const source of closure.joints) {
    const id = mechanism.determineNextLetter(reserved);
    reserved.push(id);
    jointMap.set(source, copyJoint(source, id, delta, usedNames));
  }

  const linkMap = new Map<Link, Link>();
  const copyLink = (source: Link): Link => {
    const known = linkMap.get(source);
    if (known) return known;
    const mapped = source.joints.map((joint) => jointMap.get(joint)!);
    const id = mapped
      .map((joint) => joint.id)
      .sort()
      .join('');
    let copy: Link;
    if (source instanceof SliderBlock) {
      copy = new SliderBlock(id, mapped, source.mass);
    } else if (source instanceof RealLink) {
      const subsets = source.subset.map(copyLink);
      const realCopy = new RealLink(
        id,
        mapped,
        source.mass,
        source.massMoI,
        new Coord(source.CoM.x + delta.x, source.CoM.y + delta.y),
        subsets
      );
      copyRealLinkState(source, realCopy, jointMap);
      copy = realCopy;
    } else {
      copy = new Link(id, mapped, source.mass);
    }
    copyPartName(source, copy, usedNames);
    copy.fixedLocation.fixedPoint =
      source.fixedLocation.fixedPoint === 'com'
        ? 'com'
        : (jointMap.get(
            source.joints.find((joint) => joint.id === source.fixedLocation.fixedPoint)!
          )?.id ?? 'com');
    linkMap.set(source, copy);
    return copy;
  };
  const rootCopies = closure.roots.map(copyLink);

  for (const source of closure.joints) {
    if (!(source instanceof PrisJoint)) continue;
    const copy = jointMap.get(source);
    if (!(copy instanceof PrisJoint) || !source.isFloating) continue;
    const carrier = source.carrier ? linkMap.get(source.carrier) : undefined;
    const a = source.slotJointA ? jointMap.get(source.slotJointA) : undefined;
    const b = source.slotJointB ? jointMap.get(source.slotJointB) : undefined;
    if (carrier && a && b) copy.slideOn(carrier, a, b);
  }

  const forceCopies: Force[] = [];
  const selectedOwners = new Set(
    closure.roots.filter((root): root is RealLink => root instanceof RealLink)
  );
  for (const source of mechanism.forces.filter((force) => selectedOwners.has(force.link))) {
    const owner = linkMap.get(source.link);
    if (!(owner instanceof RealLink)) continue;
    const id = nextForceId(
      mechanism,
      forceCopies.map((force) => force.id)
    );
    const copy = new Force(
      id,
      owner,
      new Coord(source.startCoord.x + delta.x, source.startCoord.y + delta.y),
      new Coord(source.endCoord.x + delta.x, source.endCoord.y + delta.y),
      source.local,
      source.arrowOutward,
      source.mag
    );
    copy.color = source.color;
    copyPartName(source, copy, usedNames);
    owner.forces.push(copy);
    forceCopies.push(copy);
  }

  mechanism.joints.push(...jointMap.values());
  mechanism.links.push(...rootCopies);
  mechanism.forces.push(...forceCopies);

  // What the copy leaves selected. A force ref is dropped: its copy came with
  // the body, and the reader's next gesture is about the new bodies.
  return closure.resolved.flatMap((part): SelectedPartRef[] => {
    if ('force' in part) return [];
    if (!('root' in part)) {
      return [{ kind: 'joint', id: jointMap.get(part.object)!.id }];
    }
    return [{ kind: 'link', id: linkMap.get(part.root)!.id }];
  });
}

function copyJoint(
  source: Joint,
  id: string,
  delta: Readonly<{ x: number; y: number }>,
  usedNames: Set<string>
): Joint {
  let copy: Joint;
  if (source instanceof PrisJoint) {
    const slider = new PrisJoint(
      id,
      source.x + delta.x,
      source.y + delta.y,
      source.input,
      source.ground
    );
    slider.angle_rad = source.angle_rad;
    slider.isSealed = source.isSealed;
    copy = slider;
  } else if (source instanceof RevJoint) {
    copy = new RevJoint(id, source.x + delta.x, source.y + delta.y, source.input, source.ground);
  } else if (source instanceof RealJoint) {
    copy = new RealJoint(id, source.x + delta.x, source.y + delta.y, source.input, source.ground);
  } else {
    copy = new Joint(id, source.x + delta.x, source.y + delta.y);
  }
  copy.colorFamily = source.colorFamily;
  copyPartName(source, copy, usedNames);
  if (copy instanceof RealJoint && source instanceof RealJoint) {
    copy.showCurve = source.showCurve;
    copy.isWelded = source.isWelded;
    copy.driveSpeed = source.driveSpeed;
    copy.r = source.r;
    copy.locked = false;
  }
  return copy;
}

function copyRealLinkState(source: RealLink, copy: RealLink, joints: Map<Joint, Joint>): void {
  copy.moiIsCustom = source.moiIsCustom;
  copy.comIsCustom = source.comIsCustom;
  copy.fill = source.fill;
  copy.isCircle = source.isCircle;
  const anchor = source.comAnchor;
  copy.comAnchor =
    typeof anchor === 'object'
      ? {
          joint:
            joints.get(source.joints.find((joint) => joint.id === anchor.joint)!)?.id ??
            copy.joints[0].id,
        }
      : anchor;
  copy.comAnchorOffset = source.comAnchorOffset ? { ...source.comAnchorOffset } : undefined;
  if (copy.comAnchor === 'grid' && copy.comAnchorOffset) {
    copy.comAnchorOffset.dx += copy.CoM.x - source.CoM.x;
    copy.comAnchorOffset.dy += copy.CoM.y - source.CoM.y;
  }
  copy.comOffset = source.comOffset
    ? {
        along: source.comOffset.along,
        across: source.comOffset.across,
        frame: source.comOffset.frame.map(
          (id) =>
            joints.get(source.joints.find((joint) => joint.id === id)!)?.id ?? copy.joints[0].id
        ) as [string, string],
      }
    : undefined;
  if (copy.isCircle) copy.reComputeDPath();
}

function copyPartName(
  source: { id: string; name: string },
  copy: { id: string; name: string },
  used: Set<string>
): void {
  if (source.name === source.id) {
    used.add(copy.id);
    return;
  }
  let candidate = `${source.name} Copy`;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${source.name} Copy ${suffix++}`;
  copy.name = candidate;
  used.add(candidate);
}

function nextForceId(mechanism: MechanismService, additional: string[]): string {
  const taken = new Set([...mechanism.forces.map((force) => force.id), ...additional]);
  for (let number = 1; ; number++) {
    const candidate = `F${number}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function rootById(mechanism: MechanismService, id: string): Link | undefined {
  return mechanism.links.find(
    (root) => root.id === id || descendants(root).some((leaf) => leaf.id === id)
  );
}

function linkById(mechanism: MechanismService, id: string): Link | undefined {
  for (const root of mechanism.links) {
    if (root.id === id) return root;
    const found = descendants(root).find((leaf) => leaf.id === id);
    if (found) return found;
  }
  return undefined;
}

function rootOf(mechanism: MechanismService, link: Link): Link | undefined {
  return mechanism.links.find((root) => root === link || descendants(root).includes(link));
}

function descendants(link: Link): Link[] {
  if (!(link instanceof RealLink)) return [];
  return link.subset.flatMap((child) => [child, ...descendants(child)]);
}

function uniqueJoints(joints: Joint[]): Joint[] {
  return joints.filter(
    (joint, index) => joints.findIndex((candidate) => candidate.id === joint.id) === index
  );
}

function removeJointsFromLink(link: Link, ids: ReadonlySet<string>): void {
  link.joints = link.joints.filter((joint) => !ids.has(joint.id));
  refreshLinkIdentity(link);
}

function refreshLinkIdentity(link: Link): void {
  link.id = link.joints
    .map((joint) => joint.id)
    .sort()
    .join('');
  link.fixedLocations = [
    { id: 'com', label: 'com' },
    ...link.joints.map((joint) => ({ id: joint.id, label: joint.id })),
  ];
  if (!link.fixedLocations.some((location) => location.id === link.fixedLocation.fixedPoint)) {
    link.fixedLocation.fixedPoint = 'com';
  }
}

function rewireForces(mechanism: MechanismService): void {
  const bodies = mechanism.links.flatMap((root) => [root, ...descendants(root)]);
  bodies.forEach((body) => (body.forces = []));
  mechanism.forces.forEach((force) => {
    if (!force.link.forces.includes(force)) force.link.forces.push(force);
  });
}
