// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../joint';
import { partitionKey, partitionMechanisms } from './mechanism-partition';
import { Mechanism } from './mechanism';
import { buildMechanism, MechanismFixture } from '../../../test-utils/verification/fixture';

/**
 * Which machine is which, across a rebuild.
 *
 * `id` is the ordinal a reader sees, and a rebuild renumbers it — so anything
 * that hands a machine back its clock, its drive compensation or its playback
 * direction has to ask a question the ordinal cannot answer.
 */
describe('naming a machine so it survives a rebuild', () => {
  const split = (fixture: MechanismFixture) => {
    const built = buildMechanism(fixture);
    return { built, ...partitionMechanisms(built.joints, built.links, built.forces) };
  };

  const twoFourBars: MechanismFixture = {
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
  };

  it('keeps a machine its own name when the machine before it is deleted', () => {
    const both = split(twoFourBars);
    expect(both.mechanisms.map((partition) => partition.id)).toEqual(['M1', 'M2']);
    const second = partitionKey(both.mechanisms[1]);

    const onlySecond = split({
      ...twoFourBars,
      joints: twoFourBars.joints.filter((joint) => 'ABCD'.indexOf(joint.id) === -1),
      links: [{ joints: 'EF' }, { joints: 'FG' }, { joints: 'GH' }],
    });

    // The ordinal moved, which is exactly why held state cannot be keyed on it.
    expect(onlySecond.mechanisms[0].id).toBe('M1');
    expect(partitionKey(onlySecond.mechanisms[0])).toBe(second);
  });

  it('tells two cranks sharing one ground pivot apart', () => {
    // A grounded joint belongs to every machine bolted to it, so it cannot be
    // anybody's name. Only the moving joints can.
    const { mechanisms } = split({
      joints: [
        { id: 'A', x: 0, y: 0, ground: true, input: true },
        { id: 'B', x: 0, y: 1 },
        { id: 'C', x: 3, y: 2 },
        { id: 'D', x: 4, y: 0, ground: true },
        { id: 'E', x: 1, y: -1 },
        { id: 'F', x: 3, y: -3 },
        { id: 'G', x: 5, y: 0, ground: true },
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
    const keys = mechanisms.map(partitionKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys.some((key) => key === 'A')).toBe(false);
  });
});

/**
 * A machine has to be solved against frame it shares with its neighbours, and
 * the far ends of those pieces are somebody else's joints — including,
 * sometimes, somebody else's driven pin.
 */
describe('a driven joint borrowed along with a shared frame bar', () => {
  const sharedFrame: MechanismFixture = {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true },
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
      // The fixed bar bolting the two frames together. Part of the world, so
      // both machines are handed it — and E along with it.
      { joints: 'DE' },
      { joints: 'EF' },
      { joints: 'FG' },
      { joints: 'GH' },
    ],
    inputAngVel: 1,
  };

  it('is not taken for the input of the machine that merely stands on it', () => {
    const built = buildMechanism(sharedFrame);
    const { mechanisms } = partitionMechanisms(built.joints, built.links, built.forces);
    const undriven = mechanisms[0];
    expect(undriven.joints.map((joint) => joint.id)).toContain('E');
    expect(undriven.ownJoints.map((joint) => joint.id)).not.toContain('E');

    const solved = new Mechanism(
      undriven.joints,
      undriven.links,
      undriven.forces,
      [],
      false,
      'm',
      1,
      'degree',
      new Set(undriven.ownJoints.map((joint) => joint.id))
    );

    // "Nothing drives this mechanism", not "nothing moves when the input turns".
    expect(solved.isMechanismValid()).toBe(false);
    expect(solved.failure).toBe('not-driven');
  });
});
