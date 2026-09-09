import '../model/joint';
import { Coord } from '../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { sealedCylinderAt, sealedCylinders } from '../model/cylinder';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { SettingsService } from './settings.service';
import { MODEL_SCALE } from '../model/render-scale';

// Object scale is process-wide static state and every cylinder size question
// reads it, so pin it for the file and put it back.
let previousObjectScale: number;
beforeEach(() => {
  previousObjectScale = SettingsService.objectScale;
  SettingsService._objectScale.next(1 * MODEL_SCALE);
});
afterEach(() => {
  SettingsService._objectScale.next(previousObjectScale);
});

/**
 * What survives an edit at a mount that is welded into something else.
 *
 * `cylinder-lifecycle.spec.ts` covers the part itself. This is about the
 * *neighborhood*: a mount is an ordinary attachment point now, so it can hold
 * a bracket of two bars, or two rams at once, and an edit that takes one thing
 * away has to leave everything else standing exactly as it was.
 */

/** A ram from the origin, with `bars` bars hung on its rod mount and welded. */
function ramWithBracket(bars: number, options: { weld?: boolean } = {}) {
  const harness = createMechanismHarness();
  harness.service.createCylinderFrom(new Coord(0, 0), new Coord(3 * MODEL_SCALE, 0));
  const slider = harness.service.joints.find(
    (joint): joint is PrisJoint => joint instanceof PrisJoint
  )!;
  const sealed = sealedCylinderAt(slider.connectedJoints[0] ?? slider)!;
  const mount = sealed.rodFar as RealJoint;
  const tips: RevJoint[] = [];
  for (let index = 0; index < bars; index++) {
    const tip = new RevJoint(
      String.fromCharCode('W'.charCodeAt(0) + index),
      mount.x + MODEL_SCALE,
      mount.y + (index + 1) * MODEL_SCALE
    );
    tips.push(tip);
    harness.service.joints.push(tip);
    harness.service.links.push(new RealLink(mount.id + tip.id, [mount, tip]));
  }
  wireGraph(harness.service);
  harness.active.updateSelectedObj(mount);
  if (options.weld ?? true) harness.service.weldJoint();
  return { ...harness, sealed, mount, tips };
}

/** The cylinders the drawing resolves to, from scratch. */
const cylindersIn = (harness: { service: { joints: unknown } }) =>
  sealedCylinders((harness.service as { joints: never }).joints);

describe('a mount welded to a bracket of more than one bar', () => {
  it('keeps the bracket welded to itself when the ram is deleted', () => {
    // The ram is one member of a compound of three. Taking it away leaves two
    // bars that are still welded to each other, and the weld at the mount is
    // still doing something -- so it has to survive. Unwelding the mount
    // wholesale to get the ram's leaf out takes the bracket apart as well: a
    // second, silent edit the reader did not ask for.
    const h = ramWithBracket(2);
    expect(h.mount.isWelded).toBe(true);

    h.service.deleteCylinder(cylindersIn(h)[0]);

    expect(cylindersIn(h)).toHaveLength(0);
    const survivor = h.service.joints.find((joint) => joint.id === h.mount.id) as RealJoint;
    expect(survivor, 'the mount itself').toBeDefined();
    expect(survivor.isWelded, 'the bracket is still one body').toBe(true);
    const compounds = h.service.links.filter(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    );
    expect(compounds).toHaveLength(1);
    expect(compounds[0].subset.map((leaf) => leaf.id).sort()).toEqual(
      h.tips.map((tip) => h.mount.id + tip.id).sort()
    );
  });

  it('drops the weld when the ram was the only thing it held', () => {
    // The other half of the same rule, and the reason it cannot simply be
    // "keep the flag": one bar left is nothing to be rigid *with*.
    const h = ramWithBracket(1);

    h.service.deleteCylinder(cylindersIn(h)[0]);

    const survivor = h.service.joints.find((joint) => joint.id === h.mount.id) as RealJoint;
    expect(survivor.isWelded).toBe(false);
    expect(h.service.links.map((link) => link.id)).toEqual([h.mount.id + h.tips[0].id]);
  });

  it('costs one undo entry', () => {
    const h = ramWithBracket(2);
    const before = h.saveCount();

    h.service.deleteCylinder(cylindersIn(h)[0]);

    expect(h.saveCount() - before).toBe(1);
  });
});

describe('two rams sharing one welded mount', () => {
  /**
   * A second ram whose barrel mount *is* the first ram's rod mount, with a bar
   * on it as well, and the whole lot welded into one body.
   *
   * Hung on the mount before the weld rather than after. Both remaining public
   * guards -- the creation path's own refusal and the merge rule -- turn away
   * an edit that would put a ram on a joint that is already welded, and those
   * are step 5's to lift. The order below needs neither, and reaches the same
   * topology, which is the thing being tested.
   */
  function twoRams() {
    const h = ramWithBracket(1, { weld: false });
    const mount = h.mount;
    h.service.createCylinderFrom(
      new Coord(mount.x, mount.y),
      new Coord(mount.x, mount.y + 3 * MODEL_SCALE),
      undefined,
      mount
    );
    h.active.updateSelectedObj(mount);
    h.service.weldJoint();
    return { ...h, mount };
  }

  it('leaves the other ram sealed and the weld intact when one is deleted', () => {
    const h = twoRams();
    expect(cylindersIn(h)).toHaveLength(2);
    const doomed = cylindersIn(h).find((one) => one.rodFar.id === h.sealed.rodFar.id)!;
    const before = h.saveCount();

    h.service.deleteCylinder(doomed);

    const left = cylindersIn(h);
    expect(left, 'the other ram').toHaveLength(1);
    expect(left[0].slider.isSealed).toBe(true);
    expect(left[0].pin.isWelded).toBe(true);
    // The mount held three leaves -- two rams and a bar -- so what is left is
    // still a body of two, rebuilt rather than dissolved.
    const survivor = h.service.joints.find((joint) => joint.id === h.mount.id) as RealJoint;
    expect(survivor.isWelded).toBe(true);
    // One rebuild, one entry, however many parts the removal touched.
    expect(h.saveCount() - before).toBe(1);
  });
});

describe('three rams in a chain', () => {
  /** Ram A's rod mount on ram B's barrel mount, and B's rod on C's barrel. */
  function chain() {
    const harness = createMechanismHarness();
    const spans: { barrelFar: string; rodFar: string }[] = [];
    for (let index = 0; index < 3; index++) {
      harness.service.createCylinderFrom(
        new Coord(index * 3 * MODEL_SCALE, 0),
        new Coord((index + 1) * 3 * MODEL_SCALE, 0)
      );
    }
    // Drawn end to end; each pair is joined by merging the far mount of one
    // onto the near mount of the next.
    for (let index = 0; index < 2; index++) {
      const rams = sealedCylinders(harness.service.joints).sort(
        (left, right) => left.barrelFar.x - right.barrelFar.x
      );
      harness.service.mergeJoints(
        rams[index + 1].barrelFar as RealJoint,
        rams[index].rodFar as RealJoint
      );
      harness.service.finishStructuralEdit(true);
    }
    for (const ram of sealedCylinders(harness.service.joints)) {
      spans.push({ barrelFar: ram.barrelFar.id, rodFar: ram.rodFar.id });
    }
    return { ...harness, spans };
  }

  it('loses only the one deleted, in one entry', () => {
    const h = chain();
    expect(sealedCylinders(h.service.joints)).toHaveLength(3);
    const middle = sealedCylinders(h.service.joints).sort(
      (left, right) => left.barrelFar.x - right.barrelFar.x
    )[1];
    const outerIds = sealedCylinders(h.service.joints)
      .filter((ram) => ram.pin.id !== middle.pin.id)
      .map((ram) => ram.pin.id)
      .sort();
    const before = h.saveCount();

    h.service.deleteCylinder(middle);

    const left = sealedCylinders(h.service.joints);
    expect(left).toHaveLength(2);
    expect(left.map((ram) => ram.pin.id).sort()).toEqual(outerIds);
    expect(left.every((ram) => ram.slider.isSealed && ram.pin.isWelded)).toBe(true);
    expect(h.saveCount() - before).toBe(1);
  });
});

describe('a slider and a weld at the same mount, in either order', () => {
  function withBoth(order: 'slider-first' | 'weld-first') {
    const harness = createMechanismHarness();
    harness.service.createCylinderFrom(new Coord(0, 0), new Coord(3 * MODEL_SCALE, 0));
    const slider = harness.service.joints.find(
      (joint): joint is PrisJoint => joint instanceof PrisJoint
    )!;
    const sealed = sealedCylinderAt(slider.connectedJoints[0] ?? slider)!;
    const mount = sealed.rodFar as RealJoint;
    const tip = new RevJoint('W', mount.x + MODEL_SCALE, mount.y + MODEL_SCALE);
    harness.service.joints.push(tip);
    harness.service.links.push(new RealLink(mount.id + tip.id, [mount, tip]));
    wireGraph(harness.service);
    harness.active.updateSelectedObj(mount);
    // Through the topology rather than through `toggleSlider`: the public
    // control still refuses a block on a mount, and that refusal is step 5's
    // to remove. What has to work now is the shape underneath it.
    const addBlock = () => {
      (harness.service as unknown as { sliderTopology: () => void }).sliderTopology();
      harness.service.finishStructuralEdit(true);
    };
    if (order === 'slider-first') {
      addBlock();
      harness.active.updateSelectedObj(mount);
      harness.service.weldJoint();
    } else {
      harness.service.weldJoint();
      harness.active.updateSelectedObj(mount);
      addBlock();
    }
    return { ...harness, sealed, mount, tip };
  }

  for (const order of ['slider-first', 'weld-first'] as const) {
    it(`recognizes the ram and the Slide, ${order}`, () => {
      const h = withBoth(order);

      // The ram survives both orders: a transient moment with two riders on
      // one block is a shape the repair pass has an answer for, and it has to
      // run before anything decides the sealed structure is gone.
      const cylinders = cylindersIn(h);
      expect(cylinders, 'the ram').toHaveLength(1);
      expect(cylinders[0].slider.isSealed).toBe(true);
      const survivor = h.service.joints.find((joint) => joint.id === h.mount.id) as RealJoint;
      expect(survivor.isWelded, 'the mount is welded').toBe(true);
      // And the external block is there, on its own guide.
      const blocks = h.service.joints.filter(
        (joint): joint is PrisJoint => joint instanceof PrisJoint && !joint.isSealed
      );
      expect(blocks, 'the external block').toHaveLength(1);
    });
  }
});

describe('deleting one bar of a bracket the ram is welded into', () => {
  it('leaves the ram welded to the bar that is left', () => {
    // The deletion used to reach the compound by unwelding the mount, which
    // takes the *whole* bracket apart to remove one leaf of it. What has to
    // happen is the same thing that happens when any other joint of a compound
    // goes: prune the leaf, keep every weld that still holds two things
    // together.
    const h = ramWithBracket(2);
    const doomed = h.service.joints.find((joint) => joint.id === h.tips[0].id)!;
    h.active.updateSelectedObj(doomed);

    h.service.deleteJoint();

    expect(h.service.joints.some((joint) => joint.id === h.tips[0].id)).toBe(false);
    const cylinders = cylindersIn(h);
    expect(cylinders, 'the ram').toHaveLength(1);
    expect(cylinders[0].slider.isSealed).toBe(true);
    const survivor = h.service.joints.find((joint) => joint.id === h.mount.id) as RealJoint;
    expect(survivor.isWelded, 'still welded to the surviving bar').toBe(true);
    const compounds = h.service.links.filter(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    );
    expect(compounds, 'one compound').toHaveLength(1);
    expect(compounds[0].subset.map((leaf) => leaf.id)).toContain(h.mount.id + h.tips[1].id);
  });

  it('drops the weld when the bar it was holding was the last one', () => {
    const h = ramWithBracket(1);
    const doomed = h.service.joints.find((joint) => joint.id === h.tips[0].id)!;
    h.active.updateSelectedObj(doomed);

    h.service.deleteJoint();

    const cylinders = cylindersIn(h);
    expect(cylinders).toHaveLength(1);
    const survivor = h.service.joints.find((joint) => joint.id === h.mount.id) as RealJoint;
    expect(survivor.isWelded).toBe(false);
  });
});

describe('attaching a new bar to a joint that is already welded', () => {
  it('takes the newcomer into the compound rather than pinning it beside it', () => {
    // A weld says every body meeting here is rigid. A bar attached afterwards
    // meets here too, so it is part of that body -- and if it is not, the
    // joint draws its weld marker while one of its links is still free to
    // turn. The canvas used to finish a link creation at `updateMechanism`,
    // which runs the sealed-cylinder normalizer without running the repair
    // that answers this; the sequence below is what those gestures do now.
    const h = ramWithBracket(2);
    const newcomer = new RevJoint('Q', h.mount.x - MODEL_SCALE, h.mount.y);
    h.service.joints.push(newcomer);
    h.service.links.push(new RealLink(h.mount.id + newcomer.id, [h.mount, newcomer]));
    h.service.finishStructuralEdit(true);

    const compounds = h.service.links.filter(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    );
    expect(compounds, 'one body at the weld').toHaveLength(1);
    expect(compounds[0].subset.map((leaf) => leaf.id)).toContain(h.mount.id + newcomer.id);
    // And the ram is still a ram inside it.
    expect(cylindersIn(h)).toHaveLength(1);
  });
});

describe('a merge that could not put the weld back', () => {
  it('is refused, and the weld is still there afterwards', () => {
    // A driven joint cannot be welded, and the survivor of a merge inherits
    // `input` from either half -- so this merge ends with a joint that cannot
    // carry the weld it started with. The merge used to take the weld apart
    // first and discover that afterwards, leaving the weld gone and the merge
    // reported as having worked.
    //
    // Reachable because the driven-joint rule counts *bodies*: a loose driven
    // joint brings none, so the count stays at two and the drop is allowed.
    const h = ramWithBracket(2);
    const loose = new RevJoint('Q', h.mount.x + 3 * MODEL_SCALE, h.mount.y);
    loose.input = true;
    h.service.joints.push(loose);
    wireGraph(h.service);
    const before = h.service.links.length;

    const refusal = h.service.mergeJoints(loose, h.mount);

    expect(refusal).toBe('weld-cannot-survive');
    expect(h.mount.isWelded, 'the weld is untouched').toBe(true);
    expect(h.service.links).toHaveLength(before);
    expect(
      h.service.joints.some((joint) => joint.id === 'Q'),
      'nothing merged'
    ).toBe(true);
    expect(cylindersIn(h)).toHaveLength(1);
  });

  it('and an ordinary merge onto a welded joint still takes the newcomer in', () => {
    // The other side of it: when the survivor *can* be welded, the merge goes
    // through and the newcomer's bar joins the body, because a weld means
    // every link meeting there is rigid.
    const h = ramWithBracket(2);
    const far = new RevJoint('Q', h.mount.x + 3 * MODEL_SCALE, h.mount.y);
    const near = new RevJoint('R', h.mount.x + 2 * MODEL_SCALE, h.mount.y + MODEL_SCALE);
    h.service.joints.push(far, near);
    h.service.links.push(new RealLink('QR', [far, near]));
    wireGraph(h.service);

    const refusal = h.service.mergeJoints(far, h.mount);

    expect(refusal).toBeUndefined();
    const survivor = h.service.joints.find((joint) => joint.id === h.mount.id) as RealJoint;
    expect(survivor.isWelded).toBe(true);
    const compounds = h.service.links.filter(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    );
    expect(compounds).toHaveLength(1);
    // The newcomer's bar is renamed by the merge -- Q became the mount -- and
    // it is inside the body, not pinned beside it.
    expect(compounds[0].subset.map((leaf) => leaf.id)).toContain(h.mount.id + 'R');
    expect(cylindersIn(h)).toHaveLength(1);
  });
});
