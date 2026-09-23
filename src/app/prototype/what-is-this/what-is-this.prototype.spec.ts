// PROTOTYPE runner, not a test. Skipped unless PMKS_WHAT_IS_THIS=1, so the
// ordinary suite never calls the network:
//   PMKS_WHAT_IS_THIS=1 npm test -- --watch=false \
//     --include=src/app/prototype/what-is-this/what-is-this.prototype.spec.ts
// Writes artifacts/what-is-this/{results.json,report.md}.
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
import { buildSystemPrompt } from './prompt';
import { askFirstAvailable, flashModelsNewestFirst, GeminiReply } from './gemini';

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

const KEY_NAMES = [
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_AI_API_KEY',
];

function factSheetFor(id: TemplateID): string {
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
  });
}

const run = process.env['PMKS_WHAT_IS_THIS'] === '1' ? it : it.skip;

describe('"What is this?" prototype', () => {
  run(
    'describes ten library templates with Gemini',
    async () => {
      const out = `${process.cwd()}/artifacts/what-is-this`;
      mkdirSync(out, { recursive: true });
      const keyName = KEY_NAMES.find((name) => process.env[name]);
      const key = keyName ? process.env[keyName]! : undefined;
      const models = !key
        ? []
        : process.env['PMKS_GEMINI_MODEL']
          ? [process.env['PMKS_GEMINI_MODEL']]
          : (await flashModelsNewestFirst(key)).slice(0, 3);
      const model = models.join(' then ') || undefined;

      const rows: {
        id: string;
        name: string;
        libraryBlurb: string;
        factSheet: string;
        reply?: GeminiReply & { attempts: number; waitedMs: number; skipped: string[] };
        error?: string;
      }[] = [];
      const save = () => {
        writeFileSync(
          `${out}/results.json`,
          JSON.stringify({ keyName: keyName ?? null, model, rows }, null, 2)
        );
        const report = [
          `# "What is this?" prototype run`,
          ``,
          `Model: ${model ?? '(no key found; fact sheets only)'} · key variable: ${keyName ?? 'none of ' + KEY_NAMES.join(', ')}`,
          ``,
          ...rows.flatMap((r) => [
            `## ${r.name} (\`${r.id}\`)`,
            ``,
            `Library card: ${r.libraryBlurb}`,
            ``,
            r.error ? `**Error:** ${r.error}` : '',
            r.reply
              ? `**${r.reply.model}**${r.reply.skipped.length ? ` (after skipping ${r.reply.skipped.join(', ')})` : ''} (${r.reply.latencyMs} ms on attempt ${r.reply.attempts}, waited ${Math.round(r.reply.waitedMs / 1000)} s, ${r.reply.promptTokens ?? '?'} in / ${r.reply.outputTokens ?? '?'} out, finish ${r.reply.finishReason}):\n\n${r.reply.text}`
              : '',
            ``,
            `<details><summary>Fact sheet sent</summary>\n\n\`\`\`\n${r.factSheet}\n\`\`\`\n</details>`,
            ``,
          ]),
        ].join('\n');
        writeFileSync(`${out}/report.md`, report);
      };
      for (const id of TEMPLATES) {
        const card = TEMPLATE_CARDS.find((c) => c.id === id)!;
        const row: (typeof rows)[number] = {
          id,
          name: card.name,
          libraryBlurb: card.description,
          factSheet: '',
        };
        try {
          row.factSheet = factSheetFor(id);
          if (key && model) {
            row.reply = await askFirstAvailable(
              key,
              models,
              buildSystemPrompt(row.factSheet),
              'What is this?'
            );
            // Five requests a minute on the free tier.
            await new Promise((resolve) => setTimeout(resolve, 13000));
          }
        } catch (error) {
          row.error = String(error).slice(0, 500);
        }
        rows.push(row);
        save();
        process.stderr.write(
          `[what-is-this] ${id}: ${row.error ? 'error' : row.reply ? `${row.reply.model} answered on attempt ${row.reply.attempts}` : 'fact sheet only'}\n`
        );
      }

      save();
      expect(rows.length).toBe(TEMPLATES.length);
    },
    1800000
  );
});
