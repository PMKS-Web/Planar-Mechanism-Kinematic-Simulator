import '../../app/model/joint';
import { Joint, RealJoint } from '../../app/model/joint';
import { Link } from '../../app/model/link';
import { assignBodies } from '../../app/model/mechanism/bodies';
import { freedomsOf } from '../../app/model/mechanism/freedoms';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import {
  TEMPLATE_IDS,
  TEMPLATE_LINKAGES,
} from '../../app/component/MODALS/templates/template-linkages';
import {
  DEV_TEMPLATE_IDS,
  DEV_TEMPLATES,
} from '../../app/component/MODALS/templates/dev-templates';

/**
 * The geometry's count is believed wherever it finds more than Gruebler's
 * (decision S30), so a template whose count sits on a knife edge -- one freedom
 * or two depending on the last digit of a coordinate -- would open refused for
 * one reader and running for the next. A near neighbor of the old gripper did
 * exactly that on a 1e-9 nudge. Every template's count has to stand up to a
 * nudge far larger than the URL's own rounding.
 */
describe('every template counts the same, nudged', () => {
  const settings = new SettingsService();
  function decode(url: string) {
    const decoder = new StringTranscoder();
    decoder.decodeURL(url);
    const target = {
      joints: [],
      links: [],
      forces: [],
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    new MechanismBuilder(target, decoder, settings, new ActiveObjService()).build(true, false);
    return { joints: target.joints as Joint[], links: target.links as Link[] };
  }
  function dofs(joints: Joint[], links: Link[]) {
    return partitionMechanisms(joints, links, []).mechanisms.map(
      (p) => freedomsOf(p.joints, p.links, assignBodies(p.joints, p.links)).dof
    );
  }
  it('keeps its count when every joint moves by a hair', () => {
    const out: string[] = [];
    let rng = 1;
    const rand = () => {
      rng = (rng * 16807) % 2147483647;
      return rng / 2147483647 - 0.5;
    };
    const all: [string, string][] = [
      ...TEMPLATE_IDS.map((id) => [id, TEMPLATE_LINKAGES[id]] as [string, string]),
      ...DEV_TEMPLATE_IDS.map((id) => [id, DEV_TEMPLATES[id]] as [string, string]),
    ];
    for (const [id, url] of all) {
      const base = dofs(...(Object.values(decode(url)) as [Joint[], Link[]]));
      for (const eps of [1e-9, 1e-6, 1e-4]) {
        for (let trial = 0; trial < 3; trial++) {
          const d = decode(url);
          d.joints.forEach((j) => {
            if (j instanceof RealJoint) {
              j.x += eps * 200 * rand();
              j.y += eps * 200 * rand();
            }
          });
          const got = dofs(d.joints, d.links);
          if (JSON.stringify(got) !== JSON.stringify(base))
            out.push(`${id} eps ${eps}: ${JSON.stringify(base)} -> ${JSON.stringify(got)}`);
        }
      }
    }
    expect(out).toEqual([]);
  });
});
