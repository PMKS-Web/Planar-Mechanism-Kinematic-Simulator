import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  GEAR_PAIR,
  GEAR_FIVE_TURNS,
  GEAR_FOUR_BAR,
  gearNetworkFixture,
} from '../../test-utils/verification/gear-fixtures';

describe('bounded production gear workloads', () => {
  it('records the cost of representative fixed-axis mechanisms without raising limits', () => {
    const cases = [
      ['20T/40T', GEAR_PAIR],
      ['20T/100T', GEAR_FIVE_TURNS],
      ['closed four-bar', GEAR_FOUR_BAR],
      [
        'idler',
        gearNetworkFixture(
          [
            { center: [-3, 0], teeth: 20 },
            { center: [0, 0], teeth: 40 },
            { center: [3, 0], teeth: 20 },
          ],
          [
            [0, 1],
            [1, 2],
          ]
        ),
      ],
      [
        'eight-gear train',
        gearNetworkFixture(
          Array.from({ length: 8 }, (_, i) => ({
            center: [i * 2, 0] as [number, number],
            teeth: 20,
          })),
          Array.from({ length: 7 }, (_, i) => [i, i + 1] as [number, number])
        ),
      ],
    ] as const;
    const results = cases.map(([name, fixture]) => {
      const start = performance.now();
      const { mechanism } = buildMechanism(fixture, 'adaptive');
      const elapsedMs = performance.now() - start;
      expect(mechanism.isMechanismValid(), name).toBe(true);
      expect(mechanism.joints.length).toBeLessThanOrEqual(6000);
      return {
        name,
        elapsedMs,
        samples: mechanism.joints.length,
        periodTurns: mechanism.gearDrive?.periodTurns,
      };
    });
    const folder = resolve('artifacts/gears');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      resolve(folder, 'production-performance.json'),
      JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2)
    );
  });
});
