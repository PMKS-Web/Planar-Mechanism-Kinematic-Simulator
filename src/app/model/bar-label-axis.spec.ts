import { barLabelAxis } from './bar-label-axis';
import { RevJoint } from './joint';
import { RealLink } from './link';

describe('bar label attachment', () => {
  it('keeps the label at the same end across horizontal during playback', () => {
    const start = [new RevJoint('A', 0, 0), new RevJoint('B', 2, 1)];
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 2, -0.01);
    const link = new RealLink('AB', [a, b]);
    const below = barLabelAxis(link, start)!;
    b.y = 0.01;
    const above = barLabelAxis(link, start)!;
    expect(below.x).toBeGreaterThan(0);
    expect(above.x).toBeGreaterThan(0);
    expect(Math.hypot(above.x - below.x, above.y - below.y)).toBeLessThan(0.02);
  });
});
