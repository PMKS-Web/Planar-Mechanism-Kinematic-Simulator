import { Joint, PrisJoint } from '../../model/joint';
import { Link } from '../../model/link';
import { distAt, fitLine, fmt, isGroundPin } from './fact-math';
import {
  FourBar,
  findFourBars,
  isDisc,
  jointsOf,
  RelationContext,
  sweepOf,
  traced,
  turnsFully,
} from './relations';
import { beamArms, cranksCoupledBy, listOf } from './roles';

/**
 * PROTOTYPE -- the family, decided by the app rather than guessed by the model.
 *
 * A short catalog of named mechanisms, each recognized from what the solver
 * already knows: link lengths and their ratios, which joints join which links,
 * and whether a link turns fully or rocks. A match is stated as fact, so the
 * model's "This mechanism is a ..." is the app's claim and not the model's; with
 * no match the model may only say what the mechanism resembles. The checks are
 * the textbook definitions, not the library's drawings: a student's Chebyshev
 * with the right proportions matches, and a template with the wrong ones would
 * not.
 */

export interface FamilyMatch {
  family: string;
  basis: string;
}

export interface FamilyCheck {
  lines: string[];
  /** Most specific first; the first is the family the note may state as fact. */
  matches: FamilyMatch[];
}

const TOLERANCE = 0.03;
const near = (x: number, y: number, tol = TOLERANCE) =>
  Math.abs(x - y) <= tol * Math.max(Math.abs(x), Math.abs(y), 1e-9);

type Member = Link | 'ground';

/** Links counting ground, and the joints between them; a cylinder that drives the mechanism is left out. */
function chainOf(ctx: RelationContext) {
  const membersOf = (joint: Joint): Member[] => {
    const members: Member[] = ctx.bodies.filter((b) => jointsOf(ctx, b).includes(joint));
    if (isGroundPin(joint) || (joint instanceof PrisJoint && joint.ground)) members.push('ground');
    if (joint instanceof PrisJoint && joint.carrier && !members.includes(joint.carrier))
      members.push(joint.carrier);
    return members;
  };
  let pins = 0;
  let sliding = 0;
  const degree = new Map<Member, number>();
  const neighbours = new Map<Member, Set<Member>>();
  for (const joint of ctx.visible) {
    const members = membersOf(joint);
    if (members.length < 2) continue;
    if (joint instanceof PrisJoint) sliding += members.length - 1;
    else pins += members.length - 1;
    for (const m of members) {
      degree.set(m, (degree.get(m) ?? 0) + 1);
      const set = neighbours.get(m) ?? new Set<Member>();
      members.filter((o) => o !== m).forEach((o) => set.add(o));
      neighbours.set(m, set);
    }
  }
  return { links: ctx.bodies.length + 1, pins, sliding, degree, neighbours };
}

function lengthsOf(ctx: RelationContext, loop: FourBar) {
  const d = (a: Joint, b: Joint) => distAt(ctx.samples, a, b);
  return {
    a: d(loop.g1, loop.j1),
    b: d(loop.j1, loop.j2),
    c: d(loop.g2, loop.j2),
    ground: d(loop.g1, loop.g2),
  };
}

/** Grashof's class of one loop, in the words a course uses. */
function grashofKind(ctx: RelationContext, loop: FourBar): { kind: string; basis: string } {
  const { a, b, c, ground } = lengthsOf(ctx, loop);
  const bars = [
    { name: `${ctx.bodyLabel(loop.left)}`, value: a, side: true },
    { name: `${ctx.bodyLabel(loop.coupler)}`, value: b, side: false },
    { name: `${ctx.bodyLabel(loop.right)}`, value: c, side: true },
    { name: 'the ground', value: ground, side: false },
  ];
  const sorted = [...bars].sort((x, y) => x.value - y.value);
  const [s, , , l] = sorted;
  const sl = s.value + l.value;
  const pq = sorted[1].value + sorted[2].value;
  const lengths = `lengths ${fmt(a)}, ${fmt(b)}, ${fmt(c)}, ground ${fmt(ground)}`;
  if (near(a, c, 0.002) && near(b, ground, 0.002)) {
    return sweepOf(ctx, loop.coupler) < 0.5
      ? {
          kind: 'parallelogram four-bar',
          basis: `opposite links equal (${lengths}) and ${ctx.bodyLabel(loop.coupler)} keeps its angle`,
        }
      : {
          kind: 'antiparallelogram (crossed) four-bar',
          basis: `opposite links equal (${lengths}), crossed`,
        };
  }
  const margin = `shortest + longest ${fmt(sl)} vs the other two ${fmt(pq)}`;
  if (near(sl, pq, 0.002)) return { kind: 'change-point four-bar', basis: margin };
  if (sl > pq) return { kind: 'triple-rocker four-bar', basis: `non-Grashof: ${margin}` };
  if (s.name === 'the ground')
    return {
      kind: 'double-crank (drag-link) four-bar',
      basis: `Grashof, the ground is shortest: ${margin}`,
    };
  if (s.side)
    return { kind: 'crank-rocker four-bar', basis: `Grashof, ${s.name} is shortest: ${margin}` };
  return { kind: 'double-rocker four-bar', basis: `Grashof, the coupler is shortest: ${margin}` };
}

/** Coupler-point straight-line linkages, by their textbook proportions. */
function straightLine(ctx: RelationContext, loop: FourBar): FamilyMatch | undefined {
  const points = traced(ctx).filter(
    (p) => jointsOf(ctx, loop.coupler).includes(p) && p !== loop.j1 && p !== loop.j2
  );
  const { a, b, c, ground } = lengthsOf(ctx, loop);
  for (const p of points) {
    const pj1 = distAt(ctx.samples, p, loop.j1);
    const pj2 = distAt(ctx.samples, p, loop.j2);
    const midpoint = near(pj1, b / 2) && near(pj2, b / 2);
    const lengths = `side links ${fmt(a)} and ${fmt(c)}, coupler ${fmt(b)}, ground ${fmt(ground)}`;
    if (near(a, c) && near(b, 0.4 * a) && near(ground, 0.8 * a) && midpoint) {
      return {
        family: 'Chebyshev straight-line linkage',
        basis: `${lengths}: coupler 0.4 and ground 0.8 of the equal side links, traced point ${p.id} at the coupler's midpoint`,
      };
    }
    if (near(a, c) && near(b, ground / 2) && near(pj1, a) && near(pj2, a)) {
      return {
        family: 'Roberts straight-line linkage',
        basis: `${lengths}: coupler half the ground, traced point ${p.id} one side-link length from both coupler joints`,
      };
    }
    const [crank, rocker, pin, far] = a <= c ? [a, c, loop.j1, loop.j2] : [c, a, loop.j2, loop.j1];
    const pPin = distAt(ctx.samples, p, pin);
    const pFar = distAt(ctx.samples, p, far);
    if (
      near(ground, 2 * crank) &&
      near(b, 2.5 * crank) &&
      near(rocker, 2.5 * crank) &&
      near(pPin, 5 * crank) &&
      near(pFar, 2.5 * crank)
    ) {
      return {
        family: 'Hoeken straight-line linkage',
        basis: `crank ${fmt(crank)}, ground 2x, coupler and rocker 2.5x, traced point ${p.id} on the coupler extended to 5x from the crank pin`,
      };
    }
    if (near(a, c) && midpoint) {
      const g1 = ctx.samples.paths.get(loop.g1.id)![0];
      const j1 = ctx.samples.paths.get(loop.j1.id)![0];
      const g2 = ctx.samples.paths.get(loop.g2.id)![0];
      const j2 = ctx.samples.paths.get(loop.j2.id)![0];
      const opposite = (j1[0] - g1[0]) * (j2[0] - g2[0]) + (j1[1] - g1[1]) * (j2[1] - g2[1]) < 0;
      if (opposite && sweepOf(ctx, loop.coupler) > 0.5) {
        return {
          family: 'Watt straight-line linkage',
          basis: `${lengths}: equal side links reaching in opposite directions, traced point ${p.id} at the coupler's midpoint`,
        };
      }
    }
  }
  return undefined;
}

/** Theo Jansen's published link lengths, for a crank of 15. */
const JANSEN = [38, 7.8, 41.5, 39.3, 40.1, 55.8, 39.4, 36.7, 65.7, 49, 50, 61.9];

function jansen(ctx: RelationContext): FamilyMatch | undefined {
  const cranks = ctx.bodies.filter(
    (b) => turnsFully(ctx, b) && jointsOf(ctx, b).some(isGroundPin) && jointsOf(ctx, b).length === 2
  );
  if (cranks.length !== 1 || ctx.bodies.length < 7) return undefined;
  const [g, pin] = jointsOf(ctx, cranks[0]).sort(
    (x, y) => Number(isGroundPin(y)) - Number(isGroundPin(x))
  );
  const scale = 15 / distAt(ctx.samples, g, pin);
  const lengths: number[] = [];
  for (const body of ctx.bodies) {
    const joints = jointsOf(ctx, body);
    for (let i = 0; i < joints.length; i++)
      for (let k = i + 1; k < joints.length; k++)
        lengths.push(distAt(ctx.samples, joints[i], joints[k]) * scale);
  }
  const grounds = ctx.visible.filter(isGroundPin);
  for (let i = 0; i < grounds.length; i++)
    for (let k = i + 1; k < grounds.length; k++) {
      const p = ctx.samples.paths.get(grounds[i].id)![0];
      const q = ctx.samples.paths.get(grounds[k].id)![0];
      lengths.push(Math.abs(p[0] - q[0]) * scale, Math.abs(p[1] - q[1]) * scale);
    }
  const found = JANSEN.filter((n) => lengths.some((l) => near(l, n, 0.015)));
  return found.length >= 10
    ? {
        family: 'Jansen linkage (Strandbeest leg)',
        basis: `${found.length} of Jansen's 12 published lengths appear, scaled to a crank of 15 (${JANSEN.join(', ')})`,
      }
    : undefined;
}

/** A crank driving a pin in another link's slot, or a block on a fixed guide through a rod. */
function sliders(ctx: RelationContext): FamilyMatch[] {
  const out: FamilyMatch[] = [];
  for (const rider of ctx.visible) {
    if (!(rider instanceof PrisJoint) || !ctx.samples.paths.has(rider.id)) continue;
    if (rider.carrier) {
      const crank = ctx.bodies.find(
        (b) =>
          b !== rider.carrier &&
          jointsOf(ctx, b).includes(rider) &&
          jointsOf(ctx, b).some(isGroundPin)
      );
      if (!crank || !turnsFully(ctx, crank)) continue;
      const slotted = rider.carrier;
      const pivot = jointsOf(ctx, slotted).find(isGroundPin);
      if (sweepOf(ctx, slotted) < 0.5) {
        out.push({
          family: 'Scotch yoke',
          basis: `${ctx.bodyLabel(crank)} turns fully and its pin ${rider.id} rides a slot in ${ctx.bodyLabel(slotted)}, which slides without turning`,
        });
      } else if (pivot && turnsFully(ctx, slotted)) {
        out.push({
          family: 'Whitworth quick-return mechanism',
          basis: `${ctx.bodyLabel(crank)} turns fully and drives the slotted ${ctx.bodyLabel(slotted)}, which also turns fully about ${pivot.id} but unevenly (a rotating slotted link)`,
        });
      } else if (pivot) {
        out.push({
          family: 'crank and slotted-lever quick-return mechanism',
          basis: `${ctx.bodyLabel(crank)} turns fully and rocks the slotted ${ctx.bodyLabel(slotted)} about ${pivot.id} (an oscillating slotted link, as in a shaper)`,
        });
      }
    } else if (rider.ground) {
      for (const rod of ctx.bodies.filter((b) => jointsOf(ctx, b).includes(rider))) {
        const pin = jointsOf(ctx, rod).find((j) => j !== rider && !isGroundPin(j));
        const crank =
          pin &&
          ctx.bodies.find(
            (b) => b !== rod && jointsOf(ctx, b).includes(pin) && jointsOf(ctx, b).some(isGroundPin)
          );
        if (!crank || !pin) continue;
        const beam = beamArms(ctx, crank);
        if (turnsFully(ctx, crank)) {
          const g = ctx.samples.paths.get(jointsOf(ctx, crank).find(isGroundPin)!.id)![0];
          const s = ctx.samples.paths.get(rider.id)![0];
          const ux = Math.cos(rider.angle_rad);
          const uy = Math.sin(rider.angle_rad);
          const offset = Math.abs(-(g[0] - s[0]) * uy + (g[1] - s[1]) * ux);
          const r = distAt(ctx.samples, jointsOf(ctx, crank).find(isGroundPin)!, pin);
          out.push({
            family: offset < 0.02 * r ? 'in-line slider-crank' : 'offset slider-crank',
            basis: `${ctx.bodyLabel(crank)} turns fully and drives slider ${rider.id} along a fixed guide through connecting rod ${ctx.bodyLabel(rod)}${offset < 0.02 * r ? '' : `; the guide is offset ${fmt(offset)} from the crank's pivot`}`,
          });
        } else if (beam && beam.includes(pin)) {
          const other = beam.find((j) => j !== pin)!;
          const drivenAtOther = ctx.bodies.some(
            (b) => b !== crank && jointsOf(ctx, b).includes(other)
          );
          if (drivenAtOther) {
            out.push({
              family: 'walking-beam mechanism',
              basis: `${ctx.bodyLabel(crank)} is a beam rocking about a pivot between its ends; one end (${other.id}) is moved by the rest of the mechanism, the other (${pin.id}) works slider ${rider.id} up and down a fixed guide through rod ${ctx.bodyLabel(rod)}`,
            });
          }
        }
      }
    }
  }
  return out;
}

/** A crank-rocker whose rocker is one side of a parallelogram: two rockers that swing in step. */
function crankRockerIntoParallelogram(
  ctx: RelationContext,
  loops: FourBar[]
): FamilyMatch | undefined {
  const kinds = loops.map((loop) => ({ loop, kind: grashofKind(ctx, loop).kind }));
  for (const drive of kinds.filter((k) => k.kind === 'crank-rocker four-bar')) {
    for (const par of kinds.filter((k) => k.kind === 'parallelogram four-bar')) {
      const shared = [drive.loop.left, drive.loop.right].find(
        (b) => b === par.loop.left || b === par.loop.right
      );
      if (!shared) continue;
      const partner = shared === par.loop.left ? par.loop.right : par.loop.left;
      return {
        family: 'crank-rocker driving a parallelogram',
        basis: `the rocker ${ctx.bodyLabel(shared)} of one loop is a side of the parallelogram, so ${ctx.bodyLabel(shared)} and ${ctx.bodyLabel(partner)} swing in step through the same angle`,
      };
    }
  }
  return undefined;
}

/**
 * Cranks tied to turn together by a rod that keeps its angle. With the cranks
 * drawn as wheels and one of them joined by a rod to a block on a fixed guide,
 * it is a steam locomotive's running gear: side rods coupling the driving
 * wheels, and the main rod from the piston's crosshead.
 */
function sideRods(ctx: RelationContext): FamilyMatch | undefined {
  for (const rod of ctx.bodies) {
    const cranks = cranksCoupledBy(ctx, rod);
    if (cranks.length < 2) continue;
    const names = listOf(cranks.map(ctx.bodyLabel));
    const wheels = cranks.every(isDisc);
    const coupling = `${names} ${wheels ? 'are wheels (drawn as discs)' : 'are cranks'} tied by side rod ${ctx.bodyLabel(rod)}, which keeps its angle, so they turn together`;
    for (const slider of ctx.visible) {
      if (!(slider instanceof PrisJoint) || !slider.ground) continue;
      const main = ctx.bodies.find(
        (b) =>
          b !== rod &&
          jointsOf(ctx, b).includes(slider) &&
          cranks.some((c) =>
            jointsOf(ctx, b).some((j) => j !== slider && jointsOf(ctx, c).includes(j))
          )
      );
      if (!main || !wheels) continue;
      return {
        family: 'steam-locomotive running gear (driving wheels, side rod and main rod)',
        basis: `${coupling}; ${ctx.bodyLabel(main)} joins them to slider ${slider.id} on a fixed guide, as a main rod joins a piston's crosshead to a driving wheel`,
      };
    }
    return {
      family: wheels ? 'coupled wheels (side-rod drive)' : 'coupled cranks (side-rod drive)',
      basis: coupling,
    };
  }
  return undefined;
}

/**
 * A point that moves along an exactly straight line without riding a guide.
 * Four equal links in a loop through it, two of them meeting at it, make it
 * a Peaucellier-Lipkin cell: the first linkage to draw a true straight line.
 */
function exactStraightLine(ctx: RelationContext): FamilyMatch | undefined {
  // A body that slides (on a guide, carrying a slot, or on a cylinder's hidden
  // seal, hence its own joints rather than the visible ones) moves straight
  // because it is guided; the linkage has to make the line itself.
  const slides = (b: Link) =>
    b.joints.some((j) => j instanceof PrisJoint) ||
    ctx.visible.some((j) => j instanceof PrisJoint && j.carrier === b);
  for (const point of ctx.visible) {
    if (point instanceof PrisJoint || isGroundPin(point)) continue;
    if (ctx.bodies.some((b) => jointsOf(ctx, b).includes(point) && slides(b))) continue;
    const path = ctx.samples.paths.get(point.id);
    if (!path) continue;
    const line = fitLine(path);
    // Within 0.1% of its length: a drawn Peaucellier cell rounded to two decimals
    // strays about 0.05%, Chebyshev's approximate line about 4%.
    if (line.length < 1e-6 || line.maxOff / line.length > 1e-3) continue;
    const binary = (j: Joint) =>
      ctx.bodies.filter((b) => jointsOf(ctx, b).length === 2 && jointsOf(ctx, b).includes(j));
    const other = (b: Link, j: Joint) => jointsOf(ctx, b).find((x) => x !== j)!;
    const len = (b: Link) => distAt(ctx.samples, jointsOf(ctx, b)[0], jointsOf(ctx, b)[1]);
    const arms = binary(point);
    let cell = false;
    for (let i = 0; i < arms.length && !cell; i++)
      for (let k = i + 1; k < arms.length && !cell; k++) {
        const side = len(arms[i]);
        if (!near(side, len(arms[k]), 0.005)) continue;
        const a = other(arms[i], point);
        const b = other(arms[k], point);
        cell = binary(a).some((ab) => {
          const q = other(ab, a);
          return (
            q !== point &&
            near(len(ab), side, 0.005) &&
            binary(b).some((bb) => other(bb, b) === q && near(len(bb), side, 0.005))
          );
        });
      }
    return {
      family: cell ? 'Peaucellier-Lipkin straight-line linkage' : 'exact straight-line linkage',
      basis: `point ${point.id} moves along a straight line ${fmt(line.length)} long without riding a guide${cell ? ', and four equal links form a rhombus through it: an inversor cell' : ''}`,
    };
  }
  return undefined;
}

function cylinderLever(ctx: RelationContext): FamilyMatch | undefined {
  for (const cylinder of ctx.cylinders) {
    for (const mount of [cylinder.mountA, cylinder.mountB]) {
      if (isGroundPin(mount)) continue;
      const lever = ctx.bodies.find(
        (b) => jointsOf(ctx, b).includes(mount) && jointsOf(ctx, b).some(isGroundPin)
      );
      if (!lever) continue;
      const other = mount === cylinder.mountA ? cylinder.mountB : cylinder.mountA;
      return {
        family: 'cylinder-driven lever',
        basis: `cylinder ${cylinder.mountA.id}-${cylinder.mountB.id}, anchored at ${other.id}, pushes ${ctx.bodyLabel(lever)} at ${mount.id} and swings it about its fixed pivot`,
      };
    }
  }
  return undefined;
}

export function familyCheck(ctx: RelationContext): FamilyCheck {
  const chain = chainOf(ctx);
  const loops = findFourBars(ctx);
  const cylinderNote = ctx.cylinders.length ? ' (the cylinder that drives it not counted)' : '';
  const joints = `${chain.pins} pin joint${chain.pins === 1 ? '' : 's'}${chain.sliding ? ` and ${chain.sliding} sliding joint${chain.sliding === 1 ? '' : 's'}` : ''}`;
  let structure = `${chain.links} links counting the ground, joined by ${joints}${cylinderNote}`;
  let chainType: FamilyMatch | undefined;
  if (chain.links === 4 && chain.pins === 4 && !chain.sliding && loops.length === 1) {
    structure += ': a single four-bar loop';
  } else if (chain.links === 6 && chain.pins === 7 && !chain.sliding) {
    const ternary = [...chain.degree].filter(([, n]) => n === 3).map(([m]) => m);
    if (ternary.length === 2) {
      const adjacent = chain.neighbours.get(ternary[0])?.has(ternary[1]);
      const name = (m: Member) => (m === 'ground' ? 'the ground' : ctx.bodyLabel(m));
      const type = adjacent ? 'Watt' : 'Stephenson';
      structure += `: a six-bar chain of the ${type} type, because its two three-joint links (${name(ternary[0])} and ${name(ternary[1])}) are ${adjacent ? 'joined directly' : 'joined only through two-joint links'}`;
      chainType = {
        family: `${type} six-bar`,
        basis: `its two three-joint links are ${adjacent ? 'joined directly' : 'not joined directly'}`,
      };
    }
  } else if (chain.links === 8 && chain.pins === 10 && !chain.sliding) {
    structure += ': an eight-bar chain';
  }

  const matches: FamilyMatch[] = [];
  const add = (m: FamilyMatch | undefined) => {
    if (m && !matches.some((x) => x.family === m.family)) matches.push(m);
  };
  add(jansen(ctx));
  if (ctx.catalogV8) {
    add(sideRods(ctx));
    add(exactStraightLine(ctx));
  }
  loops.forEach((loop) => add(straightLine(ctx, loop)));
  sliders(ctx).forEach(add);
  add(crankRockerIntoParallelogram(ctx, loops));
  // A cylinder pushing a pivoted link names the mechanism only when that is all
  // there is; in a hood hinge it is how a larger linkage is driven.
  if (ctx.bodies.length === 1) add(cylinderLever(ctx));
  if (chain.links === 4 && loops.length === 1) {
    const { kind, basis } = grashofKind(ctx, loops[0]);
    add({ family: kind, basis });
  }
  add(chainType);
  add(cylinderLever(ctx));

  const lines = [
    '### Family check (PMKS+ compares lengths, joints and motion with a short catalog)',
  ];
  lines.push(`- Structure: ${structure}.`);
  if (matches.length) {
    const [first, ...rest] = matches;
    lines.push(`- Matches: ${first.family}. ${capitalize(first.basis)}.`);
    for (const m of rest) lines.push(`- Also matches: ${m.family}. ${capitalize(m.basis)}.`);
  } else {
    lines.push(
      '- No family in the catalog matched; name it only by what it resembles, if anything.'
    );
  }
  return { lines, matches };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
