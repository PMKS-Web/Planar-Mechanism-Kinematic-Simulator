import type { MechanismFixture } from '../verification/fixture';
import { GROUND, OracleProblem, PROBLEM_SCHEMA, Vec } from './export-problem';
import { STANDARD_GRAVITY } from './si-units';

/**
 * A MATLAB verification fixture as an oracle problem, read straight from its
 * declarative description and nothing else.
 *
 * The published cases go through PMKS+'s model classes and URL codec on their
 * way to the oracle; these must not, because they are what checks that path.
 * The five fixtures in `verification/fixtures.ts` transcribe the MATLAB models
 * in PMKS-Web/PMKS_Verification, in meters, kilograms and kg·m², and this
 * reads only their joint coordinates, link joint lists, mass properties,
 * slider and load. So the comparison of this problem's reference with the
 * MATLAB tables shares no code with PMKS+ at all.
 *
 * Only what those five use is supported: grounded pins, pins between bars, one
 * grounded slider, global loads. Anything else throws.
 */
export function fixtureProblem(
  id: string,
  title: string,
  fixture: MechanismFixture
): OracleProblem {
  if (fixture.sliders || fixture.welds || fixture.detach || fixture.loads) {
    throw new Error(`${id}: fixtureProblem reads pins, one grounded slider and one load only`);
  }
  const at = new Map<string, Vec>(fixture.joints.map((j) => [j.id, [j.x, j.y]]));
  const bodies = fixture.links.map((link) => {
    if (link.subset) throw new Error(`${id}: welded links are not read here`);
    const points = [...link.joints].map((letter) => at.get(letter)!);
    const mean: Vec = [
      points.reduce((sum, p) => sum + p[0], 0) / points.length,
      points.reduce((sum, p) => sum + p[1], 0) / points.length,
    ];
    return {
      id: link.joints,
      mass: link.mass ?? 1,
      inertia: link.moi ?? 1,
      com: link.com ?? mean,
    };
  });
  const bodiesAt = (letter: string): string[] =>
    fixture.links.filter((link) => link.joints.includes(letter)).map((link) => link.joints);
  const slider = fixture.slider;
  if (slider?.on || slider?.sealed || slider?.input)
    throw new Error(`${id}: only a grounded slider is read here`);

  const joints: OracleProblem['joints'] = [];
  const points: OracleProblem['points'] = [];
  for (const joint of fixture.joints) {
    const onto = bodiesAt(joint.id);
    const where = at.get(joint.id)!;
    if (slider && slider.at === joint.id) {
      const angle = slider.angleRad ?? 0;
      joints.push({
        id: joint.id,
        kind: 'slider',
        at: where,
        guide: GROUND,
        linePoint: where,
        axis: [Math.cos(angle), Math.sin(angle)],
        riders: onto,
        rotates: true,
        blockMass: slider.pistonMass ?? 0,
      });
    } else if (onto.length > 1 || (joint.ground && onto.length > 0)) {
      joints.push({
        id: joint.id,
        kind: 'pin',
        at: where,
        bodies: onto,
        grounded: !!joint.ground,
        welded: false,
      });
    }
    points.push({ id: joint.id, body: joint.ground ? GROUND : onto[0], at: where });
  }

  const input = fixture.joints.find((joint) => joint.input);
  if (!input?.ground) throw new Error(`${id}: the input must be a grounded pin`);
  const load = fixture.load;
  return {
    schema: PROBLEM_SCHEMA,
    id,
    title,
    source: { kind: 'matlab-fixture', case: id, machine: 'M1' },
    gravity: fixture.gravity ? STANDARD_GRAVITY : 0,
    bodies,
    joints,
    driver: {
      joint: input.id,
      kind: 'rotation',
      speed: fixture.inputAngVel,
      bodies: [GROUND, bodiesAt(input.id)[0]],
    },
    loads: load
      ? [
          {
            id: 'F1',
            body: load.onLink,
            at: load.at,
            vector: load.vector,
            frame: load.local ? 'local' : 'global',
          },
        ]
      : [],
    points,
    sweep: { step: Math.PI / 180, maxSamples: 2000 },
    unsupported: [],
  };
}
