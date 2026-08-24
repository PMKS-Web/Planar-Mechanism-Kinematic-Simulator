// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, RealJoint } from '../../app/model/joint';
import { Link, RealLink } from '../../app/model/link';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { BELL_CRANK, bellCrankFixture } from '../../test-utils/verification/workshop-fixtures';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { SettingsService } from '../../app/services/settings.service';
import { urlGeneratorFor } from '../../test-utils/url-encoding';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { MechanismService } from '../../app/services/mechanism.service';
import { MODEL_SCALE } from '../../app/model/render-scale';

// This is the library's only welded compound link, so the assertion that has to
// hold is not just that the six-bar runs: it is that the weld survived into the
// built model as a link carrying its two constituent bars. Without that the
// template opens as an ordinary ternary body and the Compound Link Settings
// panel it exists to reach stays unreachable.

describe('a bell crank welded from two bars', () => {
  const { mechanism } = buildMechanism(bellCrankFixture());
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const frames = mechanism.joints.length;
  const angleAbout = (t: number, pivot: string, tip: string): number =>
    Math.atan2(at(t, tip).y - at(t, pivot).y, at(t, tip).x - at(t, pivot).x);

  it('has one degree of freedom and solves', () => {
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(frames).toBe(361);
    for (let t = 0; t < frames; t++) {
      for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
        expect(Number.isFinite(at(t, id).x) && Number.isFinite(at(t, id).y)).toBe(true);
      }
    }
  });

  it('is built as a compound link carrying its two sub-links', () => {
    const compound = mechanism.links[0].find((link) => link.id === 'CDE') as RealLink;
    expect(compound).toBeDefined();
    expect(compound.subset.map((member) => member.id).sort()).toEqual(['CD', 'DE']);
    expect(compound.isWelded).toBe(true);
    // The weld is a state of the joint the two bars share, and it is what the
    // URL carries; the subset alone would not reopen as a compound.
    expect((at(0, 'D') as RealJoint).isWelded).toBe(true);
    // Every frame, not just the drawn one — the compound has to survive the
    // deep copy the solver makes per timestep.
    for (let t = 0; t < frames; t++) {
      const link = mechanism.links[t].find((candidate) => candidate.id === 'CDE') as RealLink;
      expect(link.subset).toHaveLength(2);
    }
  });

  it('holds the two arms rigid at the angle they were fused at', () => {
    for (let t = 0; t < frames; t++) {
      const between = angleAbout(t, 'D', 'C') - angleAbout(t, 'D', 'E');
      expect(Math.atan2(Math.sin(between), Math.cos(between))).toBeCloseTo(
        BELL_CRANK.includedRad,
        3
      );
    }
  });

  it('turns the crank all the way round while the bell crank only rocks', () => {
    const crankAngles: number[] = [];
    let previous = 0;
    let turned = 0;
    for (let t = 0; t < frames; t++) {
      const raw = angleAbout(t, 'A', 'B');
      if (t > 0) {
        let step = raw - previous;
        while (step > Math.PI) step -= 2 * Math.PI;
        while (step < -Math.PI) step += 2 * Math.PI;
        turned += step;
      }
      previous = raw;
      crankAngles.push(turned);
    }
    expect(Math.abs(crankAngles[frames - 1])).toBeCloseTo(2 * Math.PI, 2);

    // The bell crank is the rocker of that four-bar: a bounded sweep, and a
    // wide enough one to be the point of the picture.
    const armAngles = mechanism.joints.map((_, t) => angleAbout(t, 'D', 'C'));
    const sweep = Math.max(...armAngles) - Math.min(...armAngles);
    expect(sweep).toBeGreaterThan((50 * Math.PI) / 180);
    expect(sweep).toBeLessThan(Math.PI);
  });

  it('passes the motion out through the far arm to the output rocker', () => {
    const rockerAngles = mechanism.joints.map((_, t) => angleAbout(t, 'G', 'F'));
    const sweep = Math.max(...rockerAngles) - Math.min(...rockerAngles);
    // A push in one direction has become a push in another: the output arm
    // works nowhere near the line the input coupler pulls along.
    expect(sweep).toBeGreaterThan((30 * Math.PI) / 180);
  });

  it('keeps every bar, welded or not, its own length', () => {
    const spans = [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'E'],
      ['C', 'E'],
      ['E', 'F'],
      ['F', 'G'],
    ] as const;
    for (let t = 0; t < frames; t++) {
      for (const [a, b] of spans) {
        const now = Math.hypot(at(t, a).x - at(t, b).x, at(t, a).y - at(t, b).y);
        const was = Math.hypot(at(0, a).x - at(0, b).x, at(0, a).y - at(0, b).y);
        expect(Math.abs(now - was), `|${a}${b}| at frame ${t}`).toBeLessThan(3e-3);
      }
    }
  });

  // A template is only ever opened through a URL, and the weld is the one thing
  // this one exists to deliver. Encoding it and reading it back is the cheapest
  // way to know the compound reaches the app as a compound rather than as a
  // ternary bar that has quietly forgotten which two bars it was made of.
  it('carries its weld and its sub-links through the URL', () => {
    const built = buildMechanism(bellCrankFixture());
    // The codec boundary works in internal units and divides on the way out, so
    // a copy destined for a URL is lifted into them first.
    built.joints.forEach((joint) => {
      joint.x *= MODEL_SCALE;
      joint.y *= MODEL_SCALE;
    });
    const scaleLink = (link: Link): void => {
      if (!(link instanceof RealLink)) return;
      link.CoM.x *= MODEL_SCALE;
      link.CoM.y *= MODEL_SCALE;
      link.subset.forEach(scaleLink);
    };
    built.links.forEach(scaleLink);

    const payload = urlGeneratorFor(
      {
        joints: built.joints,
        links: built.links,
        forces: built.forces,
        mechanismTimeStep: 0,
      } as unknown as MechanismService,
      new SettingsService()
    ).generateUrlQuery();

    const decoder = new StringTranscoder();
    decoder.decodeURL(payload.replace(/^\?/, ''));
    const rebuilt = createMechanismHarness();
    new MechanismBuilder(rebuilt.service, decoder, new SettingsService(), rebuilt.active).build(
      true
    );

    const compound = rebuilt.service.links.find((link) => link.id === 'CDE') as RealLink;
    expect(compound).toBeDefined();
    expect(compound.subset.map((member) => member.id).sort()).toEqual(['CD', 'DE']);
    // The sub-links are not also loose links of their own after the round trip.
    expect(rebuilt.service.links.map((link) => link.id).sort()).toEqual([
      'AB',
      'BC',
      'CDE',
      'EF',
      'FG',
    ]);
    expect((rebuilt.service.joints.find((joint) => joint.id === 'D') as RealJoint).isWelded).toBe(
      true
    );
  });

  it('comes round in six seconds, and carries no mass', () => {
    expect(mechanism.cyclePeriod).toBeGreaterThan(5);
    expect(mechanism.cyclePeriod).toBeLessThan(8);
    for (const link of mechanism.links[0]) {
      expect(link.mass).toBe(0);
    }
  });
});
