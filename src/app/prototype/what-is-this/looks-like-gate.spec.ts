import { looksLikeGate, PHOTO_OPENS_GATE } from './looks-like-gate';

const family = (name: string) => ({ family: name, basis: '' });

describe('looksLikeGate', () => {
  it('opens for a name that says what the mechanism is for', () => {
    const gate = looksLikeGate(['Hood'], []);
    expect(gate.show).toBe(true);
    expect(gate.because).toContain('"Hood"');
  });

  it('stays shut for names that only say what a part does in the chain', () => {
    const gate = looksLikeGate(['Input lever', 'Coupler', 'Drag crank', 'Rocker 2'], []);
    expect(gate.show).toBe(false);
    expect(gate.because).toContain('only say what the parts do');
  });

  it('counts a role word beside a purpose word', () => {
    expect(looksLikeGate(['Luffing crank'], []).show).toBe(true);
  });

  it('opens for a family that points at a kind of machine', () => {
    expect(looksLikeGate([], [family('walking-beam mechanism')]).show).toBe(true);
    expect(looksLikeGate([], [family('crank-rocker driving a parallelogram')]).show).toBe(true);
  });

  it('stays shut for a family that names only a class of chain', () => {
    for (const name of [
      'crank-rocker four-bar',
      'triple-rocker four-bar',
      'Watt six-bar',
      'in-line slider-crank',
      'cylinder-driven lever',
    ])
      expect(looksLikeGate([], [family(name)]).show, name).toBe(false);
  });

  it('lets a background photograph open it only when the switch is on', () => {
    expect(looksLikeGate([], [], true).show).toBe(PHOTO_OPENS_GATE);
  });
});
