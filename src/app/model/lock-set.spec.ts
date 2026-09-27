import './joint';
import { Coord } from './coord';
import { PrisJoint, RevJoint } from './joint';
import { RealLink } from './link';
import { cylinderHeadHalf, cylinderSpanLayoutFrom, HEAD_CLEARANCE_R } from './cylinder';
import { frozenJointIds, locksHolding } from './lock-set';
import { MODEL_SCALE } from './render-scale';

const S = MODEL_SCALE;

/**
 * What a Lock mark holds still is a set of joints, and this file pins the
 * translation: marks spread along consequence, not membership. The directed
 * cases — a mount that stays free while an interior joint seals the part, a
 * floating slider that holds its own place without holding its channel — are
 * exactly the ones a symmetric "traveling group" closure gets wrong.
 */

function fourBar() {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 0, 2 * S);
  const c = new RevJoint('C', 3 * S, 2 * S);
  const d = new RevJoint('D', 3 * S, 0, false, true);
  const ab = new RealLink('AB', [a, b], 1, 1);
  const bc = new RealLink('BC', [b, c], 1, 1);
  const cd = new RealLink('CD', [c, d], 1, 1);
  [a, b].forEach((joint) => joint.links.push(ab));
  [b, c].forEach((joint) => joint.links.push(bc));
  [c, d].forEach((joint) => joint.links.push(cd));
  return { joints: [a, b, c, d], links: [ab, bc, cd], a, b, c, d, ab, bc, cd };
}

/**
 * The sealed-cylinder shape url-sealed-cylinder.spec builds, minus the codec.
 *
 * Four joints, not five: C is the slider the rod hangs on. It was a coincident
 * pin and a prismatic joint joined by a zero-length block until Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md`.
 */
function sealedCylinder() {
  const angle = 0.31;
  const at = (along: number) => new Coord(along * Math.cos(angle) * S, along * Math.sin(angle) * S);
  const CLEARANCE = HEAD_CLEARANCE_R * 0.15;
  const { stroke } = cylinderSpanLayoutFrom(8, 0.5, 0.15);
  const HEAD_HALF = cylinderHeadHalf(stroke + CLEARANCE, 0.15);
  const buried = -4 + stroke + CLEARANCE;
  const pinAlong = -4 + CLEARANCE + HEAD_HALF + stroke * 0.5;

  const a = new RevJoint('A', at(-4).x, at(-4).y, false, true);
  const b = new RevJoint('B', at(buried).x, at(buried).y);
  const c = new PrisJoint('C', at(pinAlong).x, at(pinAlong).y);
  const d = new RevJoint('D', at(4).x, at(4).y);
  c.isSealed = true;
  c.rotates = false;

  const barrel = new RealLink('AB', [a, b], 1, 1);
  const rod = new RealLink('CD', [c, d], 1, 1);
  [a, b].forEach((joint) => joint.links.push(barrel));
  [c, d].forEach((joint) => joint.links.push(rod));
  c.slideOn(barrel, a, b);

  return {
    joints: [a, b, c, d],
    links: [barrel, rod],
    mountA: a,
    buried: b,
    slider: c,
    mountD: d,
  };
}

describe('what a Lock mark holds still', () => {
  it('a locked joint holds itself and nothing else', () => {
    const { joints, links, b } = fourBar();
    b.locked = true;

    expect(frozenJointIds(joints, links)).toEqual(new Set(['B']));
  });

  it('one lock layer: freeing one joint of a marked pair frees exactly it', () => {
    // Locking a link is a shortcut that marks each of its joints — so this is
    // what "lock link BC, then unlock joint B" leaves behind.
    const { joints, links, b, c } = fourBar();
    b.locked = true;
    c.locked = true;
    expect(frozenJointIds(joints, links)).toEqual(new Set(['B', 'C']));

    b.locked = false;
    expect(frozenJointIds(joints, links)).toEqual(new Set(['C']));
  });

  it('a locked slider holds itself and nothing else', () => {
    // There used to be a symmetric rule here: a slider was a prismatic joint
    // and a coincident pin joined by a block, and holding either had to hold
    // both. One joint carries the mark now, so the pair it spoke about is gone
    // and so is the rule.
    const slider = new PrisJoint('P', 0, 0);
    const far = new RevJoint('E', 2 * S, 0);
    const rider = new RealLink('EP', [slider, far], 1, 1);
    [slider, far].forEach((joint) => joint.links.push(rider));
    slider.locked = true;

    expect(frozenJointIds([slider, far], [rider])).toEqual(new Set(['P']));
  });

  it('a locked interior joint seals the whole cylinder', () => {
    const part = sealedCylinder();
    part.slider.locked = true;

    expect(frozenJointIds(part.joints, part.links)).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('a locked mount holds only the mount — the ram still re-poses and swings about it', () => {
    const part = sealedCylinder();
    part.mountA.locked = true;

    expect(frozenJointIds(part.joints, part.links)).toEqual(new Set(['A']));
  });

  it('a locked floating slider holds its place in the slot and leaves the channel free', () => {
    // The mark is parametric: it spends the one freedom the slider has, which
    // is where it sits along the slot. The two joints that cut the slot keep
    // moving, and the reseat takes the slider with them.
    const { joints, links, a, b, ab } = fourBar();
    const slider = new PrisJoint('P', 1 * S, 1 * S);
    const far = new RevJoint('E', 1 * S, 3 * S);
    const rider = new RealLink('EP', [slider, far], 1, 1);
    [slider, far].forEach((joint) => joint.links.push(rider));
    slider.slideOn(ab, a, b);
    const withSlot = { joints: [...joints, slider, far], links: [...links, rider] };

    slider.locked = true;
    expect(frozenJointIds(withSlot.joints, withSlot.links)).toEqual(new Set(['P']));

    slider.locked = false;
    a.locked = true;
    expect(frozenJointIds(withSlot.joints, withSlot.links)).toEqual(new Set(['A']));
  });

  it('keeps holding through a weld: marks live on joints, which no weld restructures', () => {
    const { joints, b, c, d, bc, cd } = fourBar();
    b.locked = true;
    c.locked = true;
    const compound = new RealLink('BCD', [b, c, d], 1, 1, undefined, [bc, cd]);
    const links = [compound];

    expect(frozenJointIds(joints, links)).toEqual(new Set(['B', 'C']));
  });

  it('names the mark that holds a joint, so Unlock can clear exactly it', () => {
    const { joints, links, b, c } = fourBar();
    b.locked = true;

    expect(locksHolding('B', joints, links)).toEqual([b]);
    expect(locksHolding('A', joints, links)).toEqual([]);
    expect(locksHolding(c.id, joints, links)).toEqual([]);
  });
});
