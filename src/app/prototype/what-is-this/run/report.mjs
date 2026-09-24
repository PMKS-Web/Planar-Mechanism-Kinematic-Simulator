// PROTOTYPE: gather the run into one page.
//   node src/app/prototype/what-is-this/run/report.mjs
// Reads the manifest, every provider's answers and grades.json (a human's
// marks, written after reading the answers), and writes
// artifacts/what-is-this/<SHEET>/what-is-this.html from ./page.html.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL(
  `../../../../../artifacts/what-is-this/${process.env.SHEET ?? 'v2'}/`,
  import.meta.url
).pathname;
const here = new URL('.', import.meta.url).pathname;
const { cases } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const providers = readdirSync(join(root, 'answers'));
const grades = existsSync(join(root, 'grades.json'))
  ? JSON.parse(readFileSync(join(root, 'grades.json'), 'utf8'))
  : {};

const templates = [];
for (const entry of cases) {
  let template = templates.find((t) => t.id === entry.template);
  if (!template) {
    template = { id: entry.template, name: entry.name, blurb: entry.libraryBlurb, variants: {} };
    templates.push(template);
  }
  if (entry.image && !template.image) {
    template.image = `data:image/png;base64,${readFileSync(join(root, entry.image)).toString('base64')}`;
  }
  const answers = {};
  for (const provider of providers) {
    const file = join(root, 'answers', provider, `${entry.key}.json`);
    if (!existsSync(file)) continue;
    const a = JSON.parse(readFileSync(file, 'utf8'));
    answers[provider] = {
      model: a.model,
      effort: a.effort,
      parsed: a.parsed,
      raw: a.parsed ? undefined : a.text,
      error: a.error ?? a.parseError,
      latencyMs: a.latencyMs,
      usage: a.usage,
      grade: grades[`${provider}/${entry.key}`],
    };
  }
  const prompt = readFileSync(join(root, entry.prompt), 'utf8');
  template.variants[entry.variant] = {
    factSheet: prompt.slice(prompt.indexOf('FACT SHEET') + 'FACT SHEET'.length).trim(),
    answers,
  };
}

const systemPrompt = (() => {
  const prompt = readFileSync(join(root, cases[0].prompt), 'utf8');
  return prompt.slice(0, prompt.indexOf('FACT SHEET')).trim();
})();

const data = { providers, templates, systemPrompt, generated: new Date().toISOString() };
writeFileSync(join(root, 'data.json'), JSON.stringify(data, null, 2));
// Findings are the reviewer's own summary lines, trusted HTML written alongside grades.json.
const findings = existsSync(join(root, 'findings.json'))
  ? readFileSync(join(root, 'findings.json'), 'utf8')
  : '[]';
const page = readFileSync(join(here, 'page.html'), 'utf8')
  .replace(/\/\*DATA\*\/\s*null/, () => JSON.stringify(data).replace(/</g, '\\u003c'))
  .replace(/\/\*FINDINGS\*\/\s*\[\]/, () => findings);
writeFileSync(join(root, 'what-is-this.html'), page);
console.log(`wrote ${join(root, 'what-is-this.html')} (${Math.round(page.length / 1024)} KB)`);
