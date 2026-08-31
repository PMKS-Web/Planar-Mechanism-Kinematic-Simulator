// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { FIXTURE_GALLERY } from '../../test-utils/verification/fixture-gallery';

/**
 * What counts as one machine.
 *
 * The rule that does the work is that ground anchors without connecting. Let a
 * grounded joint join the bodies that meet at it and every grounded chain in
 * the drawing merges into one component — which is not a modeling nicety but
 * the difference between "two mechanisms, each 1-DoF and ready" and "one
 * 2-DoF mechanism that refuses to simulate".
 */
describe('splitting a drawing into the machines it contains', () => {
  const ids = (partition: { joints: { id: string }[] }) => partition.joints.map((j) => j.id).sort();

  const split = (fixture: MechanismFixture) => {
    const built = buildMechanism(fixture);
    return { built, ...partitionMechanisms(built.joints, built.links, built.forces) };
  };

  /** The ordinary case: one four-bar, one mechanism, nothing left over. */
  const fourBar: MechanismFixture = {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 0, y: 1 },
      { id: 'C', x: 3, y: 2 },
      { id: 'D', x: 4, y: 0, ground: true },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
    inputAngVel: 1,
  };

  it('finds one mechanism in a lone four-bar, and leaves nothing over', () => {
    const { mechanisms, unassigned } = split(fourBar);

    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0].id).toBe('M1');
    expect(ids(mechanisms[0])).toEqual(['A', 'B', 'C', 'D']);
    expect(unassigned.floatingChains).toEqual([]);
    expect(unassigned.looseJoints).toEqual([]);
  });

  it('finds two mechanisms in two four-bars drawn side by side', () => {
    const { mechanisms } = split({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
        { id: 'E', x: 10, y: 0, ground: true, input: true },
        { id: 'F', x: 10, y: 1 },
        { id: 'G', x: 13, y: 2 },
        { id: 'H', x: 14, y: 0, ground: true },
      ],
      links: [
        { joints: 'AB' },
        { joints: 'BC' },
        { joints: 'CD' },
        { joints: 'EF' },
        { joints: 'FG' },
        { joints: 'GH' },
      ],
      inputAngVel: 1,
    });

    expect(mechanisms.map((m) => m.id)).toEqual(['M1', 'M2']);
    expect(ids(mechanisms[0])).toEqual(['A', 'B', 'C', 'D']);
    expect(ids(mechanisms[1])).toEqual(['E', 'F', 'G', 'H']);
  });

  it('keeps two cranks pinned to the same fixed point apart', () => {
    // The rule under test. Both chains hold joint A, and A is the only thing
    // they share — but it is grounded, so neither crank can feel the other and
    // they are two machines that happen to be bolted to the same spot.
    const { mechanisms, unassigned } = split({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
        { id: 'E', x: -1, y: 1 },
        { id: 'F', x: -4, y: 2 },
        { id: 'G', x: -5, y: 0, ground: true },
      ],
      links: [
        { joints: 'AB' },
        { joints: 'BC' },
        { joints: 'CD' },
        { joints: 'AE' },
        { joints: 'EF' },
        { joints: 'FG' },
      ],
      inputAngVel: 1,
    });

    expect(mechanisms).toHaveLength(2);
    // The shared pin belongs to both, because it really is part of both frames.
    expect(ids(mechanisms[0])).toEqual(['A', 'B', 'C', 'D']);
    expect(ids(mechanisms[1])).toEqual(['A', 'E', 'F', 'G']);
    expect(unassigned.floatingChains).toEqual([]);
  });

  it('refuses to call a chain that never reaches ground a mechanism', () => {
    const { mechanisms, unassigned } = split({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
        { id: 'E', x: 0, y: 6 },
        { id: 'F', x: 2, y: 7 },
        { id: 'G', x: 4, y: 6 },
      ],
      links: [
        { joints: 'AB' },
        { joints: 'BC' },
        { joints: 'CD' },
        { joints: 'EF' },
        { joints: 'FG' },
      ],
      inputAngVel: 1,
    });

    expect(mechanisms).toHaveLength(1);
    expect(ids(mechanisms[0])).toEqual(['A', 'B', 'C', 'D']);
    expect(unassigned.floatingChains).toHaveLength(1);
    expect(unassigned.floatingChains[0].joints.map((j) => j.id).sort()).toEqual(['E', 'F', 'G']);
    expect(unassigned.looseJoints).toEqual([]);
  });

  it('reports a joint with no link at all on its own', () => {
    const { mechanisms, unassigned } = split({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
        { id: 'E', x: 8, y: 8 },
      ],
      links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
      inputAngVel: 1,
    });

    expect(mechanisms).toHaveLength(1);
    expect(unassigned.floatingChains).toEqual([]);
    expect(unassigned.looseJoints.map((j) => j.id)).toEqual(['E']);
  });

  it("does not let a shared frame bar hand one machine another machine's joints", () => {
    // Two four-bars whose frames are bolted together by a fixed bar D–E. The
    // bar is part of the world, so both machines have to be solved against it,
    // but its far end belongs to whichever machine can actually move it.
    // Without the distinction M1 picks up E — and E is what drives M2.
    const { mechanisms, unassigned } = split({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
        { id: 'E', x: 10, y: 0, ground: true, input: true },
        { id: 'F', x: 10, y: 1 },
        { id: 'G', x: 13, y: 2 },
        { id: 'H', x: 14, y: 0, ground: true },
      ],
      links: [
        { joints: 'AB' },
        { joints: 'BC' },
        { joints: 'CD' },
        { joints: 'DE' },
        { joints: 'EF' },
        { joints: 'FG' },
        { joints: 'GH' },
      ],
      inputAngVel: 1,
    });

    expect(mechanisms).toHaveLength(2);
    // Solved against the shared bar, so E is among the joints handed over...
    expect(mechanisms[0].joints.map((j) => j.id)).toContain('E');
    // ...but it is not one of M1's own, and so cannot be taken for its input.
    expect(mechanisms[0].ownJoints.map((j) => j.id).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(mechanisms[1].ownJoints.map((j) => j.id).sort()).toEqual(['E', 'F', 'G', 'H']);
    expect(unassigned.looseJoints).toEqual([]);
  });

  it('calls a bar fixed at both ends what it is, not a joint with no link', () => {
    // It belongs to no machine, which is true — but it plainly has a link, and
    // telling the reader to attach one is advice about a different drawing.
    const { mechanisms, unassigned } = split({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
        { id: 'E', x: 9, y: 9, ground: true },
        { id: 'F', x: 11, y: 9, ground: true },
      ],
      links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }, { joints: 'EF' }],
      inputAngVel: 1,
    });

    expect(mechanisms).toHaveLength(1);
    expect(unassigned.looseJoints).toEqual([]);
    expect(unassigned.fixedLinks.map((link) => link.id)).toEqual(['EF']);
  });

  it('keeps the rails a slot is cut into, even when they are part of the frame', () => {
    // The gripper's sliders run in slots cut into anchored bars — links whose
    // joints are all grounded, so they *are* the world and have no body of
    // their own to be joined by. A slot's carrier lives outside `links` and
    // `connectedJoints`, so nothing in the component walk reaches it, and a
    // mechanism handed its sliders without the rails they run on does not fail
    // loudly: it solves something else, and the arms never close their cycle.
    const entry = FIXTURE_GALLERY.find((f) => f.name === 'Cylinder-driven gripper')!;
    const built = buildMechanism(entry.fixture);
    const { mechanisms, unassigned } = partitionMechanisms(built.joints, built.links, built.forces);

    expect(mechanisms).toHaveLength(1);
    // Every joint and link in the drawing belongs to it. Nothing is left over.
    expect(mechanisms[0].joints).toHaveLength(built.joints.length);
    expect(mechanisms[0].links).toHaveLength(built.links.length);
    expect(unassigned.looseJoints).toEqual([]);
    expect(unassigned.floatingChains).toEqual([]);
  });

  it('does not split a mechanism at a slider that rides on one of its own links', () => {
    // A floating slot joins the block to its carrier, so the two are one
    // machine even though no pin connects them.
    const { mechanisms, unassigned } = split({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
        { id: 'E', x: 1.5, y: 1.5 },
      ],
      links: [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }],
      sliders: [{ at: 'E', prisId: 'P', on: { carrier: 'BC', a: 'B', b: 'C' } }],
      inputAngVel: 1,
    });

    expect(mechanisms).toHaveLength(1);
    expect(ids(mechanisms[0])).toContain('E');
    expect(unassigned.floatingChains).toEqual([]);
  });
});
