import './joint';
import { Coord } from './coord';
import { PrisJoint, RevJoint } from './joint';
import { RealLink, SliderBlock } from './link';
import { cylinderHeadHalf, cylinderSpanLayoutFrom, HEAD_CLEARANCE_R } from './cylinder';
import { frozenJointIds, locksHolding } from './lock-set';
import { MODEL_SCALE } from './render-scale';

const S = MODEL_SCALE;

/**
 * What a Lock mark holds still is a set of joints, and this file pins the
 * translation: marks spread along consequence, not membership. The directed
 * cases — a mount that stays free while an interior joint seals the part, a
 * floating pin that pins its channel without the reverse — are exactly the
 * ones a symmetric "travelling group" closure gets wrong.
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

/** The sealed-cylinder shape url-sealed-cylinder.spec builds, minus the codec. */
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
  const c = new RevJoint('C', at(pinAlong).x, at(pinAlong).y);
  const d = new RevJoint('D', at(4).x, at(4).y);
  const slider = new PrisJoint('P', c.x, c.y);
  slider.isSealed = true;

  const barrel = new RealLink('AB', [a, b], 1, 1);
  const rod = new RealLink('CD', [c, d], 1, 1);
  const block = new SliderBlock('CP', [c, slider], 1);
  [a, b].forEach((joint) => joint.links.push(barrel));
  [c, d].forEach((joint) => joint.links.push(rod));
  c.links.push(block);
  slider.links.push(block);
  c.isWelded = true;
  slider.slideOn(barrel, a, b);

  return {
    joints: [a, b, c, d, slider],
    links: [barrel, rod, block],
    mountA: a,
    buried: b,
    pin: c,
    mountD: d,
    slider,
  };
}

describe('what a Lock mark holds still', () => {
  it('a locked joint holds itself and nothing else', () => {
    const { joints, links, b } = fourBar();
    b.locked = true;

    expect(frozenJointIds(joints, links)).toEqual(new Set(['B']));
  });

  it('a locked link holds every joint of the link', () => {
    const { joints, links, bc } = fourBar();
    bc.locked = true;

    expect(frozenJointIds(joints, links)).toEqual(new Set(['B', 'C']));
  });

  it('a slider pin and its block joint hold each other — they are coincident', () => {
    const pin = new RevJoint('A', 0, 0);
    const slider = new PrisJoint('P', 0, 0);
    const block = new SliderBlock('AP', [pin, slider], 1);
    pin.links.push(block);
    slider.links.push(block);
    pin.locked = true;

    expect(frozenJointIds([pin, slider], [block])).toEqual(new Set(['A', 'P']));
  });

  it('a locked interior joint seals the whole cylinder', () => {
    const part = sealedCylinder();
    part.slider.locked = true;

    expect(frozenJointIds(part.joints, part.links)).toEqual(new Set(['A', 'B', 'C', 'D', 'P']));
  });

  it('a locked mount holds only the mount — the ram still re-poses and swings about it', () => {
    const part = sealedCylinder();
    part.mountA.locked = true;

    expect(frozenJointIds(part.joints, part.links)).toEqual(new Set(['A']));
  });

  it('a locked floating pin holds the two joints that define its channel, and not the reverse', () => {
    const { joints, links, a, b, ab } = fourBar();
    const slider = new PrisJoint('P', 1 * S, 1 * S);
    const rider = new RevJoint('E', 1 * S, 1 * S);
    const block = new SliderBlock('EP', [rider, slider], 1);
    rider.links.push(block);
    slider.links.push(block);
    slider.slideOn(ab, a, b);
    const withSlot = { joints: [...joints, slider, rider], links: [...links, block] };

    slider.locked = true;
    expect(frozenJointIds(withSlot.joints, withSlot.links)).toEqual(new Set(['P', 'E', 'A', 'B']));

    slider.locked = false;
    a.locked = true;
    expect(frozenJointIds(withSlot.joints, withSlot.links)).toEqual(new Set(['A']));
  });

  it('keeps holding through a weld: the mark rides the leaf inside the compound', () => {
    // Welding restructures the links array — the marked link becomes a subset
    // leaf of a new compound root. A lock that stopped holding the moment its
    // owner was hidden would be a lock that lies.
    const { joints, b, c, d, bc, cd } = fourBar();
    bc.locked = true;
    const compound = new RealLink('BCD', [b, c, d], 1, 1, undefined, [bc, cd]);
    const links = [compound];

    expect(frozenJointIds(joints, links)).toEqual(new Set(['B', 'C']));
    expect(locksHolding('B', joints, links)).toEqual([bc]);
  });

  it('names the mark that holds a joint, so Unlock can clear exactly it', () => {
    const { joints, links, bc, b } = fourBar();
    bc.locked = true;

    expect(locksHolding('C', joints, links)).toEqual([bc]);
    expect(locksHolding('A', joints, links)).toEqual([]);
    expect(locksHolding(b.id, joints, links)).toEqual([bc]);
  });
});
