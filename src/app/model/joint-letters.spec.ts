import { interiorNames, isLetteredId, JOINT_ALPHABET, nextFreeLetter } from './joint-letters';

/**
 * The one rule two callers share: the editor naming a joint the reader has
 * just drawn, and the reader naming a seal an old payload stored under an
 * interior name. The claims below are the ones both of them depend on.
 */
describe('the next free letter', () => {
  const taken = (...ids: string[]) => new Set(ids);

  it('is the one after the highest letter in use', () => {
    expect(nextFreeLetter(taken())).toBe('A');
    expect(nextFreeLetter(taken('A', 'B', 'C'))).toBe('D');
    // A gap below the highest is left alone: a drawing being built up counts
    // forward, and reusing B here would read as the deleted joint coming back.
    expect(nextFreeLetter(taken('A', 'C'))).toBe('D');
  });

  it('walks past an interior name rather than counting it', () => {
    // `A1` has no place in the alphabet, which is what keeps the joints
    // nothing ever shows from pushing the next letter along.
    expect(nextFreeLetter(taken('A', 'A1', 'B'))).toBe('C');
  });

  it('carries on into lower case, and then fills the gaps', () => {
    expect(nextFreeLetter(taken('Z'))).toBe('a');
    const all = new Set(JOINT_ALPHABET);
    all.delete('Q');
    expect(nextFreeLetter(all), 'the only gap left').toBe('Q');
  });

  it('gives a two-letter name once the alphabet is spent', () => {
    expect(nextFreeLetter(new Set(JOINT_ALPHABET))).toBe('AA');
  });

  it('knows a shown name from a hidden one', () => {
    expect(isLetteredId('A')).toBe(true);
    expect(isLetteredId('AB')).toBe(true);
    expect(isLetteredId('A1')).toBe(false);
    expect(isLetteredId('')).toBe(false);
  });
});

describe('interior names', () => {
  it('hang off the part’s own mount and number from one', () => {
    expect(interiorNames('A', 2, new Set(['A']))).toEqual(['A1', 'A2']);
  });

  it('skip a name a neighboring part already took', () => {
    // Two cylinders can share a mount and would otherwise ask for the same one.
    expect(interiorNames('A', 1, new Set(['A', 'A1']))).toEqual(['A2']);
  });
});
