// PROTOTYPE case builder, not a test. Skipped unless PMKS_WHAT_IS_THIS=1:
//   PMKS_WHAT_IS_THIS=1 PMKS_SHEET=v5 PMKS_PROMPT=v5 PMKS_CASES=fresh npx ng test --watch=false \
//     --include=src/app/prototype/what-is-this/what-is-this.prototype.spec.ts
// Writes one prompt per case, plus the moments its filmstrip shows (the
// filmstrip itself is captured from the app by run/schematic.mjs), to
// artifacts/what-is-this/<PMKS_SHEET>/, and each case's motion to
// artifacts/what-is-this/motion/.
//
// PMKS_CASES names a case set in run/case-sets/ (library templates, students'
// mechanisms by feedback message id, test cases from made-cases.ts); without it
// the first ten library templates are used. PMKS_PROMPT picks the instructions
// (v4 to v7, default v7). The model calls are made by the scripts in ./run,
// which read the manifest this writes.
import '../../model/joint';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { TEMPLATE_LINKAGES, TemplateID } from '../../component/MODALS/templates/template-linkages';
import { TEMPLATE_CARDS } from '../../component/MODALS/templates/template-catalog';
import { StringTranscoder } from '../../services/transcoding/string-transcoder';
import { MechanismBuilder } from '../../services/transcoding/mechanism-builder';
import { SettingsService } from '../../services/settings.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { LengthUnit } from '../../model/unit-enums';
import { fixturePayload } from '../../../test-utils/verification/fixture-payload';
import { describeDrawing } from './mechanism-facts';
import { MADE_CASES } from './made-cases';
import { mergeMotions } from './motion-export';
import { buildPrompt, PromptVersion } from './prompt';

const FIRST_TEN: TemplateID[] = [
  '4-Bar',
  'Slider_Crank',
  'Whitworth_Quick_Return',
  'Scotch_Yoke',
  'Chebyshev_Straight_Line',
  'Jansen_Leg',
  'Windshield_Wiper',
  'Cylinder_Boom',
  'Hood_Hinge',
  'Pumpjack',
];

/** Where "Open in PMKS+" goes: staging decodes every template the library ships. */
const APP_URL = 'https://staging--pmksnew.netlify.app/';
const VARIANT = 'relations+picture';

interface Case {
  id: string;
  name: string;
  source: 'library' | 'student' | 'test';
  blurb: string;
  payload: string;
  /** What it really is, when known; never sent to the model. */
  intent?: string;
  /** A library card whose background image the picture carries. */
  backdrop?: string;
}

interface CaseSet {
  library: TemplateID[];
  user: { id: string; intent?: string }[];
  made: string[];
}

function payloadOf(url: string): string {
  const query = url.slice(url.indexOf('?') + 1).split('#')[0];
  try {
    return decodeURIComponent(query);
  } catch {
    return query;
  }
}

function libraryCase(id: TemplateID): Case {
  const card = TEMPLATE_CARDS.find((c) => c.id === id)!;
  return {
    id,
    name: card.name,
    source: 'library',
    blurb: card.description,
    payload: TEMPLATE_LINKAGES[id],
    backdrop: card.backdrop ? id : undefined,
  };
}

/** Students' links stay in the gitignored feedback file; the case set names them by message id. */
function casesFrom(setName: string | undefined, root: string): Case[] {
  if (!setName) return FIRST_TEN.map(libraryCase);
  const set: CaseSet = JSON.parse(
    readFileSync(`${root}/src/app/prototype/what-is-this/run/case-sets/${setName}.json`, 'utf8')
  );
  const feedbackFile = `${root}/artifacts/what-is-this/feedback/feedback.jsonl`;
  const feedback: {
    id: string;
    date: string;
    message: string;
    project_url: string | null;
    intent?: string;
  }[] = existsSync(feedbackFile)
    ? readFileSync(feedbackFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  const students = set.user.map((pick): Case => {
    const row = feedback.find((r) => r.id.startsWith(pick.id));
    if (!row?.project_url) throw new Error(`no feedback link for ${pick.id}`);
    const month = new Date(row.date).toLocaleString('en-US', { month: 'short', year: 'numeric' });
    return {
      id: `student-${pick.id.slice(0, 12)}`,
      name: pick.intent ? `Student: ${pick.intent}` : `Student mechanism, ${month}`,
      source: 'student',
      blurb: row.message,
      payload: payloadOf(row.project_url),
      intent: pick.intent ?? row.intent,
    };
  });
  const made = set.made.map((id): Case => {
    const test = MADE_CASES.find((m) => m.id === id)!;
    return {
      id,
      name: test.name,
      source: 'test',
      blurb: test.blurb,
      payload: fixturePayload(test.fixture),
      intent: test.intent,
    };
  });
  return [...set.library.map(libraryCase), ...students, ...made];
}

function describe_(entry: Case, withBackdrop: boolean, picture: 'v5' | 'v6' | 'v7' | 'v8') {
  const decoder = new StringTranscoder();
  decoder.decodeURL(entry.payload);
  const settings = new SettingsService();
  const target = {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, settings, new ActiveObjService()).build(true, false);
  const unit = settings.lengthUnit.value;
  return describeDrawing({
    joints: target.joints,
    links: target.links,
    forces: target.forces,
    lengthUnit: unit === LengthUnit.INCH ? 'in' : unit === LengthUnit.METER ? 'm' : 'cm',
    gravity: settings.isGravity.value,
    defaultRpm: settings.inputSpeed.value,
    defaultLinearSpeed: settings.linearInputSpeed.value,
    defaultClockwise: settings.isInputCW.value,
    relations: true,
    backdrop: withBackdrop && !!entry.backdrop,
    picture,
    // From v7 the author's own names go too: the best chance for a real drawing.
    includeNames: picture === 'v7' || picture === 'v8',
  });
}

const run = process.env['PMKS_WHAT_IS_THIS'] === '1' ? it : it.skip;

describe('"What is this?" prototype', () => {
  run('writes one prompt per case', () => {
    const root = process.cwd();
    const sheet = process.env['PMKS_SHEET'] ?? 'dev';
    const asked = process.env['PMKS_PROMPT'];
    const version: PromptVersion =
      asked === 'v4' || asked === 'v5' || asked === 'v6' || asked === 'v7' ? asked : 'v8';
    const out = `${root}/artifacts/what-is-this/${sheet}`;
    const motionDir = `${root}/artifacts/what-is-this/motion`;
    mkdirSync(`${out}/cases`, { recursive: true });
    mkdirSync(motionDir, { recursive: true });
    const cases = [];
    const skipped: string[] = [];
    for (const entry of casesFrom(process.env['PMKS_CASES'], root)) {
      // v4's pictures carried no background image, so its sheets do not mention one.
      const described = describe_(
        entry,
        version !== 'v4',
        version === 'v8' || version === 'v7' || version === 'v6' ? version : 'v5'
      );
      // From v8 a drawing PMKS+ cannot solve is not asked about at all.
      if (version === 'v8' && !described.machines.length) {
        skipped.push(entry.id);
        continue;
      }
      const key = `${entry.id}.${VARIANT}`;
      // The filmstrip and the family are the first machine's; the page's
      // animation and Links table show them all.
      const machine = described.machines[0];
      const motion = mergeMotions(described.motions);
      if (motion) writeFileSync(`${motionDir}/${entry.id}.json`, JSON.stringify(motion));
      const jobs = described.machines
        .flatMap((m) => m.jobs)
        .filter((job, i, all) => all.findIndex((j) => j.name === job.name) === i);
      writeFileSync(`${out}/cases/${key}.prompt.txt`, buildPrompt(described.text, version));
      cases.push({
        key,
        template: entry.id,
        name: entry.name,
        source: entry.source,
        intent: entry.intent,
        libraryBlurb: entry.blurb,
        appUrl: `${APP_URL}?${entry.payload}`,
        backdrop: version !== 'v4' ? entry.backdrop : undefined,
        variant: VARIANT,
        prompt: `cases/${key}.prompt.txt`,
        image: `cases/${entry.id}.filmstrip.png`,
        film: machine?.frames ?? [],
        jobs,
        family: machine?.family ?? [],
      });
    }
    writeFileSync(
      `${out}/manifest.json`,
      JSON.stringify({ sheet, prompt: version, cases, unsolvedSkipped: skipped }, null, 2)
    );
    expect(cases.length).toBeGreaterThan(0);
  });
});
