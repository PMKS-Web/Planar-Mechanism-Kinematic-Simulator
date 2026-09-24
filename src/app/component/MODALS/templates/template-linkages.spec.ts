// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../../model/joint';
import { Joint, RealJoint } from '../../../model/joint';
import { Link, RealLink } from '../../../model/link';
import { cylindersIn, isCylinderInner } from '../../../model/cylinder';
import { visibleBodyName } from '../../../model/body-label';
import { ActiveObjService } from '../../../services/active-obj.service';
import { MechanismService } from '../../../services/mechanism.service';
import { SettingsService } from '../../../services/settings.service';
import { MechanismBuilder } from '../../../services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../../services/transcoding/string-transcoder';
import { DEV_TEMPLATES } from './dev-templates';
import { TEMPLATE_LINKAGES } from './template-linkages';

/**
 * A library drawing names nothing after a joint its reader cannot find.
 *
 * The reader renames joints as it builds: a seal stored under an interior name
 * (`A2`) is given the next free letter (decision S9), and a slider stored as
 * three objects folds into one joint. A link's id follows those renames and
 * its stored name does not, so a name that was only ever the old id reads, once
 * the two differ, as a name somebody typed -- and the Car Hood Hinge's rod was
 * headed `A2B`, after a joint no drawing of it has. Names somebody really
 * chose, `Hood` and `Wiper arm`, are what this has to leave alone.
 */

/**
 * The drawing a payload opens as, built the way the app builds it, and the
 * joint ids the payload itself wrote down.
 */
function opened(payload: string): { stored: string[]; joints: Joint[]; links: Link[] } {
  const transcoder = new StringTranscoder();
  transcoder.decodeURL(payload);
  const drawing = { joints: [], links: [], forces: [] } as unknown as MechanismService;
  const builder = new MechanismBuilder(
    drawing,
    transcoder,
    new SettingsService(),
    new ActiveObjService()
  );
  // Settings left alone: they are global, and naming does not read them.
  builder.build(false, false);
  const stored = transcoder.getJoints().map((joint) => joint.id);
  return { stored, joints: drawing.joints, links: drawing.links };
}

/** Every body a reader can select: the top-level links and the leaves under each weld. */
function bodiesOf(links: Link[]): Link[] {
  const found = new Map<string, Link>();
  const visit = (link: Link) => {
    found.set(link.id, link);
    if (link instanceof RealLink) link.subset.forEach(visit);
  };
  links.forEach(visit);
  return [...found.values()];
}

/**
 * The ids in a name that belong to joints the reader cannot see.
 *
 * `gone` is every id the payload wrote that the opened drawing does not show:
 * the buried barrel end, a seal that was given a letter, a slider folded into
 * its pin. Only those, because a library drawing may number its links on
 * purpose -- the inversions call theirs `L1` to `L4`, as the textbook does, and
 * no joint was ever called that. A name written wholly in joint ids (`A2B`) is
 * read id by id; any other name is somebody's words, and only an interior id
 * inside it (`Arm A2`) is read, so `Hood` spelled out is not four joints.
 */
function unfindableIdsIn(name: string, gone: ReadonlySet<string>): string[] {
  const spelledInIds = /^(?:[A-Z][0-9]*)+$/.test(name);
  const ids = name.match(spelledInIds ? /[A-Z][0-9]*/g : /[A-Za-z][0-9]+/g) ?? [];
  return ids.filter((id) => gone.has(id));
}

/** Every name the drawing shows that points at a joint the reader cannot find. */
function unfindableNames(payload: string): string[] {
  const { stored, joints, links } = opened(payload);
  const cylinders = cylindersIn(joints);
  const shown = joints.filter(
    (joint) =>
      joint instanceof RealJoint && !cylinders.some((cylinder) => isCylinderInner(cylinder, joint))
  );
  const visible = new Set(shown.map((joint) => joint.id));
  const gone = new Set(stored.filter((id) => !visible.has(id)));

  const named = [
    ...shown.map((joint) => ({ what: `joint ${joint.id}`, name: joint.name })),
    ...bodiesOf(links).map((body) => ({
      what: `link ${body.id}`,
      name: visibleBodyName(body, cylinders),
    })),
  ];
  return named
    .filter(({ name }) => unfindableIdsIn(name, gone).length > 0)
    .map(({ what, name }) => `${what} is called ${name}`);
}

describe('names in the template library', () => {
  const templates: Record<string, string> = { ...TEMPLATE_LINKAGES, ...DEV_TEMPLATES };

  for (const [id, payload] of Object.entries(templates)) {
    it(`${id} names nothing after a joint a reader cannot find`, () => {
      expect(unfindableNames(payload)).toEqual([]);
    });
  }

  it('reads a name spelled in joint ids id by id, and anything else as words', () => {
    const gone = new Set(['A1', 'A2', 'H']);
    expect(unfindableIdsIn('A2B', gone)).toEqual(['A2']);
    expect(unfindableIdsIn('AA1', gone)).toEqual(['A1']);
    expect(unfindableIdsIn('BP', gone)).toEqual([]);
    expect(unfindableIdsIn('L1', gone)).toEqual([]);
    expect(unfindableIdsIn('Hood', gone)).toEqual([]);
    expect(unfindableIdsIn('Arm A1', gone)).toEqual(['A1']);
  });
});
