// PROTOTYPE case builder, not a test. Skipped unless PMKS_WHAT_IS_THIS=1:
//   PMKS_WHAT_IS_THIS=1 PMKS_SHEET=v3 npx ng test --watch=false \
//     --include=src/app/prototype/what-is-this/what-is-this.prototype.spec.ts
// Writes one prompt per template and fact-sheet variant, plus each machine's
// drawing, to artifacts/what-is-this/<PMKS_SHEET>/, and each template's motion
// to artifacts/what-is-this/motion/. PMKS_VARIANTS is a comma list of variant
// ids; the default is the one the taste test runs. The model calls are made
// by the scripts in ./run, which read the manifest this writes.
import '../../model/joint';
import { mkdirSync, writeFileSync } from 'node:fs';
import { TEMPLATE_LINKAGES, TemplateID } from '../../component/MODALS/templates/template-linkages';
import { TEMPLATE_CARDS } from '../../component/MODALS/templates/template-catalog';
import { StringTranscoder } from '../../services/transcoding/string-transcoder';
import { MechanismBuilder } from '../../services/transcoding/mechanism-builder';
import { SettingsService } from '../../services/settings.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { LengthUnit } from '../../model/unit-enums';
import { describeDrawing } from './mechanism-facts';
import { buildPrompt } from './prompt';

const TEMPLATES: TemplateID[] = [
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

/** What each variant sends: the fact sheet with or without relations, with or without a picture. */
const ALL_VARIANTS = [
  { id: 'base', relations: false, picture: false },
  { id: 'relations', relations: true, picture: false },
  { id: 'relations+picture', relations: true, picture: true },
] as const;
const WANTED = (process.env['PMKS_VARIANTS'] ?? 'relations+picture').split(',');
const VARIANTS = ALL_VARIANTS.filter((variant) => WANTED.includes(variant.id));

/** Where "Open in PMKS+" goes: staging decodes every template the library ships. */
const APP_URL = 'https://staging--pmksnew.netlify.app/';

function describe_(id: TemplateID, relations: boolean) {
  const decoder = new StringTranscoder();
  decoder.decodeURL(TEMPLATE_LINKAGES[id]);
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
    relations,
  });
}

const run = process.env['PMKS_WHAT_IS_THIS'] === '1' ? it : it.skip;

describe('"What is this?" prototype', () => {
  run('writes the prompts for ten library templates', () => {
    const sheet = process.env['PMKS_SHEET'] ?? 'dev';
    const out = `${process.cwd()}/artifacts/what-is-this/${sheet}`;
    const motionDir = `${process.cwd()}/artifacts/what-is-this/motion`;
    mkdirSync(`${out}/cases`, { recursive: true });
    mkdirSync(motionDir, { recursive: true });
    const cases = [];
    for (const id of TEMPLATES) {
      const card = TEMPLATE_CARDS.find((c) => c.id === id)!;
      for (const variant of VARIANTS) {
        const described = describe_(id, variant.relations);
        const key = `${id}.${variant.id}`;
        if (described.motions.length) {
          writeFileSync(`${motionDir}/${id}.json`, JSON.stringify(described.motions[0]));
        }
        writeFileSync(`${out}/cases/${key}.prompt.txt`, buildPrompt(described.text));
        let svg: string | undefined;
        if (variant.picture && described.svgs.length) {
          svg = `cases/${id}.svg`;
          writeFileSync(`${out}/${svg}`, described.svgs[0]);
        }
        cases.push({
          key,
          template: id,
          name: card.name,
          libraryBlurb: card.description,
          appUrl: `${APP_URL}?${TEMPLATE_LINKAGES[id]}`,
          variant: variant.id,
          prompt: `cases/${key}.prompt.txt`,
          svg,
          image: svg?.replace(/\.svg$/, '.png'),
        });
      }
    }
    writeFileSync(`${out}/manifest.json`, JSON.stringify({ sheet, cases }, null, 2));
    expect(cases.length).toBe(TEMPLATES.length * VARIANTS.length);
  });
});
