import '../../app/model/joint';
import { PrisJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import {
  cylinderAtSeal,
  cylinderSizeOf,
  cylinderStrokeAlong,
  derivedInterior,
} from '../../app/model/cylinder';
import { MODEL_SCALE } from '../../app/model/render-scale';

// Geometry is built in internal model units (user units x MODEL_SCALE) so the
// shape-to-mark proportions match what the app actually renders.
const S = MODEL_SCALE;

// Stage 2 of `docs/joint-type-and-cylinder-plan.md`. A cylinder used to be a
// *shape* -- a Slide whose rod and barrel happened to line up -- so the test
// was geometric and every caller had to be told how much bend to forgive. It
// is a sealed slide now, and the record is read off the seal: the slot's own
// order says which barrel joint is the mount, and the two joints the seal owns
// are derived rather than checked.

/**
 * Barrel M--N along the x axis, a sealed Slide at P, and a rod reaching out to
 * T on the far side of P from N.
 *
 * P is one joint: the seal and the pin the rod hangs on were a prismatic
 * joint, a coincident `RevJoint` and a zero-length block joining the two until
 * a slider became one joint, and the weld on that pin is `rotates` on this one.
 *
 * The slot is declared mount-first, as creation declares it. `reversed` writes
 * it the other way round, which is the only thing that decides the roles.
 */
function piston(options: { rodAt?: [number, number]; reversed?: boolean; sealed?: boolean } = {}) {
  const [rodX, rodY] = options.rodAt ?? [7 * S, 0];

  const m = new RevJoint('M', -8 * S, 0);
  const n = new RevJoint('N', -1 * S, 0);
  const t = new RevJoint('T', rodX, rodY);
  const seal = new PrisJoint('P', 0, 0);

  const barrel = new RealLink('MN', [m, n], 1, 1);
  const rod = new RealLink('PT', [seal, t], 1, 1);

  [m, n].forEach((joint) => joint.links.push(barrel));
  [seal, t].forEach((joint) => joint.links.push(rod));
  // The rod cannot turn against the barrel's slot, which is what makes the
  // assembly one rigid part and what the weld at the pin used to say.
  seal.rotates = false;
  seal.isSealed = options.sealed ?? true;
  if (options.reversed) seal.slideOn(barrel, n, m);
  else seal.slideOn(barrel, m, n);

  return { p: seal, t, m, n, seal, barrel, rod };
}

describe('reading a cylinder off its seal', () => {
  it('answers for a sealed slide, and names its members', () => {
    const found = cylinderAtSeal(piston().p);

    expect(found).toBeDefined();
    expect(found!.barrel.id).toBe('MN');
    expect(found!.rod.id).toBe('PT');
    expect(found!.seal.id).toBe('P');
    // The rod's other end is mount B; nothing is measured to find it.
    expect(found!.mountB.id).toBe('T');
  });

  it('takes the roles from the slot’s order, and measures nothing', () => {
    // Declared mount-first, the mount is A and the buried end is B -- which is
    // also what the distance rule would have said, so the interesting case is
    // the next one.
    const straight = cylinderAtSeal(piston().p)!;
    expect(straight.mountA.id).toBe('M');
    expect(straight.inner.id).toBe('N');

    // Declared the other way round, the record says the other way round. The
    // old rule looked at which barrel joint sat further from the rod's mount
    // and would have answered M either way; the reader is the one place that
    // question is still asked, once, on decode.
    const reversed = cylinderAtSeal(piston({ reversed: true }).p)!;
    expect(reversed.mountA.id).toBe('N');
    expect(reversed.inner.id).toBe('M');
  });

  it('answers for a bent assembly, because sealed is the whole test', () => {
    // A rod off the slot line used to stop being a cylinder, which meant every
    // guard, drag route and delete cascade lost sight of the part at exactly
    // the moment something had written a member joint wrongly. It is a
    // cylinder; the derivation below is what straightens it.
    expect(cylinderAtSeal(piston({ rodAt: [6 * S, 2 * S] }).p)).toBeDefined();
    // Including a rod and a barrel of different lengths, which used to be a
    // tripwire and is now just a cylinder the reader has not been given a way
    // to draw.
    expect(cylinderAtSeal(piston({ rodAt: [4 * S, 0] }).p)).toBeDefined();
  });

  it('declines a slide that is not sealed', () => {
    expect(cylinderAtSeal(piston({ sealed: false }).p)).toBeUndefined();
  });

  it('declines a Slot — the rod has to be rigid with the slot', () => {
    const scene = piston();
    scene.seal.rotates = true;

    expect(cylinderAtSeal(scene.p)).toBeUndefined();
  });

  it('declines a grounded slider, which has no barrel to be', () => {
    const scene = piston();
    scene.seal.groundAt(0);

    expect(cylinderAtSeal(scene.p)).toBeUndefined();
  });

  it('declines a rod carrying more than one other joint', () => {
    // Three joints on the rod is a body with its own shape, and hiding it
    // inside a cylinder would lose a joint the user placed.
    const scene = piston();
    const extra = new RevJoint('U', 3 * S, 4 * S);
    scene.rod.joints.push(extra);
    extra.links.push(scene.rod);

    expect(cylinderAtSeal(scene.p)).toBeUndefined();
  });

  it('declines a barrel carrying more than two joints', () => {
    const scene = piston();
    const extra = new RevJoint('V', -4 * S, 3 * S);
    scene.barrel.joints.push(extra);
    extra.links.push(scene.barrel);

    expect(cylinderAtSeal(scene.p)).toBeUndefined();
  });

  it('declines a seal with two rods on it', () => {
    // Which of them is the rod is not a question with an answer, and guessing
    // would make the drawing depend on the order the reader drew things in.
    const scene = piston();
    const other = new RevJoint('W', 4 * S, 4 * S);
    const second = new RealLink('PW', [scene.seal, other], 1, 1);
    [scene.seal, other].forEach((joint) => joint.links.push(second));

    expect(cylinderAtSeal(scene.p)).toBeUndefined();
  });

  it('reports where in its travel the seal stands, on every read', () => {
    const found = cylinderAtSeal(piston().p)!;
    expect(found.start).toBeCloseTo(cylinderSizeOf(found).start, 12);

    // Read rather than stored: the record is cached per topology revision and
    // a drag moves joints without touching the topology, so a field taken at
    // lookup time would answer for a pose that has gone.
    const before = found.start;
    found.seal.x -= 2 * S;
    expect(found.start).not.toBeCloseTo(before, 6);
    expect(found.start).toBeCloseTo(cylinderSizeOf(found).start, 12);
  });

  it('reads the seal’s place along the barrel, not the distance between the joints', () => {
    // Decision S3: the two members have their own lengths. Carrying the far
    // joint out without touching the seal makes the *rod* longer -- which is
    // what the derivation already believes -- and the cylinder has not moved
    // in its travel at all. Read off the span, it would have said the part had
    // opened, and the drawing and the number would be describing different
    // things.
    const found = cylinderAtSeal(piston().p)!;
    const before = found.start;
    found.mountB.x += 4 * S;

    expect(found.start).toBeCloseTo(before, 12);
    expect(cylinderSizeOf(found).rodLength).toBeCloseTo(11 * S, 9);
  });
});

describe('deriving the two joints a seal owns', () => {
  it('writes nothing for a cylinder that is already straight', () => {
    const found = cylinderAtSeal(piston().p)!;

    const derived = derivedInterior(found)!;
    expect(derived.inner.x).toBeCloseTo(found.inner.x, 9);
    expect(derived.inner.y).toBeCloseTo(found.inner.y, 9);
    expect(derived.seal.x).toBeCloseTo(found.seal.x, 9);
    expect(derived.seal.y).toBeCloseTo(found.seal.y, 9);
  });

  it('puts a bent inner end back on the axis, at the barrel’s own length', () => {
    const scene = piston();
    const found = cylinderAtSeal(scene.p)!;
    const barrel = Math.hypot(scene.n.x - scene.m.x, scene.n.y - scene.m.y);
    scene.n.y += 3 * S;

    const derived = derivedInterior(found)!;
    // Back on the line M--T, one barrel along it. The bend is gone and the
    // length it was drawn with is kept.
    expect(derived.inner.y).toBeCloseTo(0, 9);
    expect(derived.inner.x).toBeCloseTo(scene.m.x + Math.hypot(scene.n.x - scene.m.x, 3 * S), 9);
    expect(barrel).toBeCloseTo(7 * S, 9);
  });

  it('brings a flung seal back to one rod’s length short of its mount', () => {
    const scene = piston();
    const found = cylinderAtSeal(scene.p)!;
    const rod = Math.hypot(scene.t.x - scene.p.x, scene.t.y - scene.p.y);
    scene.p.x += 4 * S;
    scene.p.y -= 5 * S;

    const derived = derivedInterior(found)!;
    const flung = Math.hypot(scene.t.x - scene.p.x, scene.t.y - scene.p.y);
    expect(Math.hypot(scene.t.x - derived.seal.x, scene.t.y - derived.seal.y)).toBeCloseTo(
      flung,
      9
    );
    expect(derived.seal.y).toBeCloseTo(0, 9);
    // The rod's length as drawn, not the barrel's: the two are equal in
    // everything the app can draw, and it is the rod's that this reads.
    expect(rod).toBeCloseTo(7 * S, 9);
  });

  it('never moves a mount', () => {
    const scene = piston({ rodAt: [6 * S, 2 * S] });
    const found = cylinderAtSeal(scene.p)!;
    const mounts = [
      { x: scene.m.x, y: scene.m.y },
      { x: scene.t.x, y: scene.t.y },
    ];

    expect(Object.keys(derivedInterior(found)!).sort()).toEqual(['inner', 'seal']);
    expect([
      { x: scene.m.x, y: scene.m.y },
      { x: scene.t.x, y: scene.t.y },
    ]).toEqual(mounts);
  });

  it('does not clamp the seal into the travel', () => {
    // Raising Object Size grows the head under a part nobody touched and can
    // leave the seal outside its own stops. Snapping it in would move a joint
    // with no undo entry and destroy the geometry that scaling back down would
    // restore; the solver refuses to run the part instead, which is what the
    // panel already says.
    const scene = piston();
    const found = cylinderAtSeal(scene.p)!;
    // A barrel far too short to hold a seal standing 8 units out from its
    // mount -- the shape an Object Size change leaves behind.
    scene.n.x = -7 * S;

    const derived = derivedInterior(found)!;
    const along = derived.seal.x - scene.m.x;
    expect(along).toBeCloseTo(8 * S, 9);
    expect(along).toBeGreaterThan(cylinderStrokeAlong(1 * S).max);
    // And the part is left exactly as drawn rather than folded up.
    expect(derived.seal.y).toBeCloseTo(0, 9);
  });

  it('declines a cylinder whose mounts are in the same place', () => {
    // Coincident mounts give no axis to lay anything along, and a direction
    // picked at random is worse than the drawing as it stands.
    const scene = piston();
    const found = cylinderAtSeal(scene.p)!;
    scene.t.x = scene.m.x;
    scene.t.y = scene.m.y;

    expect(derivedInterior(found)).toBeUndefined();
  });
});
