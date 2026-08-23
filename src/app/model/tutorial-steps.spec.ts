import { RevJoint } from './joint';
import { Coord } from './coord';
import { RealLink } from './link';
import { copyFor, endJoints, linksAreChained, progressFor } from './tutorial-steps';

/** One bar between two joints, wired the way the grid wires one. */
function bar(a: RevJoint, b: RevJoint): RealLink {
  const link = new RealLink(a.id + b.id, [a, b], 1, 1, new Coord((a.x + b.x) / 2, (a.y + b.y) / 2));
  a.links.push(link);
  b.links.push(link);
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  return link;
}

/** A─B─C─D, the chain the tutorial is walking the student towards. */
function chain() {
  const a = new RevJoint('A', -2, 0);
  const b = new RevJoint('B', -2, 1);
  const c = new RevJoint('C', 0.99, 2.82);
  const d = new RevJoint('D', 2, 0);
  const links = [bar(a, b), bar(b, c), bar(c, d)];
  return { joints: [a, b, c, d], links, a, b, c, d };
}

/** Three bars that never touch — what `Add Link` three times actually leaves. */
function looseBars() {
  const joints: RevJoint[] = [];
  const links: RealLink[] = [];
  for (const [one, two] of [
    ['A', 'B'],
    ['C', 'D'],
    ['E', 'F'],
  ]) {
    const p = new RevJoint(one, 0, 0);
    const q = new RevJoint(two, 1, 1);
    joints.push(p, q);
    links.push(bar(p, q));
  }
  return { joints, links };
}

/** A bar off to one side, with nothing to do with the tutorial's chain. */
function stray(one: string, two: string) {
  const p = new RevJoint(one, 5, 5);
  const q = new RevJoint(two, 6, 6);
  return { joints: [p, q], link: bar(p, q), p, q };
}

describe('which step the drawing is on', () => {
  it('starts at step 1 with nothing drawn', () => {
    expect(progressFor([], []).step).toBe(1);
  });

  it('asks for the chain once one bar exists', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const progress = progressFor([a, b], [bar(a, b)]);
    expect(progress.step).toBe(2);
    expect(progress.achieved).toBe('First bar drawn');
  });

  /**
   * The reason step 1 and step 2 are two steps rather than one.
   *
   * The prototype counted links, so three bars dropped on bare grid read as a
   * finished chain and sent the student on to ground "the two end joints" of
   * something with six of them. Connectivity is the question being asked.
   */
  it('does not accept three bars that never touch as a chain', () => {
    const { joints, links } = looseBars();
    expect(links.length).toBe(3);
    expect(linksAreChained(links)).toBe(false);
    expect(progressFor(joints, links).step).toBe(2);
  });

  it('moves to grounding once three links are joined up', () => {
    const { joints, links } = chain();
    const progress = progressFor(joints, links);
    expect(progress.step).toBe(3);
    expect(progress.achieved).toBe('Three links chained');
  });

  it('names and rings an end joint, not one in the middle', () => {
    const { joints, links, a, d } = chain();
    expect(endJoints(joints).map((j) => j.id)).toEqual(['A', 'D']);
    const progress = progressFor(joints, links);
    expect([a, d]).toContain(progress.target);
    expect(copyFor(progress).body).toContain('joint A');
  });

  /**
   * A drawing can arrive with one end already grounded — a shared link, or a
   * student who did half of it. Naming the finished end sends them nowhere.
   */
  it('skips past the end that is already grounded', () => {
    const { joints, links, a, d } = chain();
    a.ground = true;
    const progress = progressFor(joints, links);
    expect(progress.step).toBe(3);
    expect(progress.target).toBe(d);
    expect(progress.alsoTarget).toBeUndefined();
    expect(copyFor(progress).body).not.toContain('at the other end');
  });

  it('asks for an input once both ends are grounded', () => {
    const { joints, links, a, d } = chain();
    a.ground = true;
    d.ground = true;
    const progress = progressFor(joints, links);
    expect(progress.step).toBe(4);
    expect(progress.achieved).toBe('Joints A and D grounded');
    expect(progress.target).toBe(a);
  });

  it('reaches the last step once a joint drives it', () => {
    const { joints, links, a, d } = chain();
    a.ground = true;
    d.ground = true;
    a.input = true;
    const progress = progressFor(joints, links);
    expect(progress.step).toBe(5);
    expect(progress.achieved).toBe('Joint A is the input');
  });

  /**
   * Step 3 asks for the chain's two *ends*. Pinning a joint in the middle is a
   * different move, and the step it was asked of has not been made.
   */
  it('does not count a grounded joint in the middle of the chain', () => {
    const { joints, links, a, b, d } = chain();
    a.ground = true;
    b.ground = true;
    const progress = progressFor(joints, links);
    expect(progress.step).toBe(3);
    expect(progress.target).toBe(d);
  });

  it('ignores grounds and inputs on a bar off to one side', () => {
    const built = chain();
    const off = stray('X', 'Y');
    const joints = [...built.joints, ...off.joints];
    const links = [...built.links, off.link];
    off.p.ground = true;
    off.q.ground = true;
    off.p.input = true;
    expect(progressFor(joints, links).step).toBe(3);

    built.a.ground = true;
    built.d.ground = true;
    expect(progressFor(joints, links).step).toBe(4);

    built.a.input = true;
    expect(progressFor(joints, links).step).toBe(5);
  });

  it('finds the chain even when a stray bar is drawn first', () => {
    const built = chain();
    const off = stray('X', 'Y');
    const links = [off.link, ...built.links];
    expect(linksAreChained(links)).toBe(true);
    expect(progressFor([...off.joints, ...built.joints], links).step).toBe(3);
  });
});

describe('what the card says', () => {
  /**
   * The two gestures are genuinely different controls, and the mock had step
   * one telling the student to use the wrong one three times.
   */
  it('sends the student to Add first and Attach after', () => {
    // The menu names the verb once, on the group, and the row below it is the
    // bare noun -- so what the student is told to look for is the group.
    expect(copyFor({ step: 1 }).body).toContain('under Add');
    expect(copyFor({ step: 1 }).body).not.toContain('under Attach');
    expect(copyFor({ step: 2 }).body).toContain('under Attach');
  });

  it('names the switches the menu actually shows', () => {
    // Not "Add Ground" and "Add Input": those were labels that flipped as they
    // were used, and the menu writes states as states now.
    expect(copyFor({ step: 3, target: { id: 'A' } as never }).body).toContain('Grounded');
    expect(copyFor({ step: 4, target: { id: 'A' } as never }).body).toContain('Driven Input');
  });

  it('never tells the student to add three links from the grid', () => {
    expect(copyFor({ step: 1 }).body).not.toMatch(/three times/i);
    expect(copyFor({ step: 2 }).body).not.toMatch(/Right-click anywhere/i);
  });
});
