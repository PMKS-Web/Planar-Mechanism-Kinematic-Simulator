/**
 * The template ids and their URLs, read out of the source the app uses.
 *
 * Every script that wants to open a template reads it from here rather than
 * matching the source itself. Each of them used to carry its own regular
 * expression, and `template-linkages.ts` is not a shape a regular expression
 * reads well: a payload may sit on the key's line or the next one, may be split
 * across several quoted pieces joined with `+`, and the file is commented
 * throughout -- including comments containing an apostrophe, which is where the
 * old patterns came apart. One of them silently found 18 of the 43 templates
 * and another reported "could not parse" with a list of prose fragments in it.
 *
 * So: drop the comment lines first, then read keys and quoted pieces from what
 * is left. Nothing here is clever; it just stops guessing.
 */
import { readFileSync } from 'node:fs';

const SOURCE = 'src/app/component/MODALS/templates/template-linkages.ts';
const SRC = readFileSync(SOURCE, 'utf8');

/** Lines of a block with the comment-only ones taken out. */
const withoutComments = (text) => text.split('\n').filter((line) => !line.trim().startsWith('//'));

/** The ids listed in one of the exported arrays. */
function idsOf(name) {
  const opened = SRC.indexOf(`export const ${name}`);
  if (opened === -1) return [];
  const from = SRC.indexOf('[', opened);
  const to = SRC.indexOf(']', from);
  return (
    withoutComments(SRC.slice(from + 1, to))
      .join('\n')
      .match(/'([^']+)'/g)
      ?.map((quoted) => quoted.slice(1, -1)) ?? []
  );
}

export const BUILT_IN_TEMPLATE_IDS = idsOf('BUILT_IN_TEMPLATE_IDS');
export const LIBRARY_TEMPLATE_IDS = idsOf('LIBRARY_TEMPLATE_IDS');
export const TEMPLATE_IDS = [...BUILT_IN_TEMPLATE_IDS, ...LIBRARY_TEMPLATE_IDS];

/** Every id in the map, to its URL. */
export const TEMPLATE_LINKAGES = (() => {
  const block = SRC.slice(SRC.indexOf('TEMPLATE_LINKAGES'));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('\n};'));
  const found = {};
  let key = null;
  let pieces = [];
  const quoted = (line) => [...line.matchAll(/'([^']*)'/g)].map((match) => match[1]);
  for (const line of withoutComments(body)) {
    const opening = line.match(/^ {2}'?([A-Za-z0-9_-]+)'?:\s*(.*)$/);
    if (opening) {
      if (key) found[key] = pieces.join('');
      key = opening[1];
      pieces = quoted(opening[2]);
    } else if (key) {
      pieces.push(...quoted(line));
    }
  }
  if (key) found[key] = pieces.join('');
  return found;
})();

/** Fail loudly rather than testing a handful of templates and calling it all. */
export function assertTemplatesParsed() {
  const missing = TEMPLATE_IDS.filter((id) => !TEMPLATE_LINKAGES[id]);
  if (!TEMPLATE_IDS.length || missing.length) {
    console.error(`Could not parse templates from ${SOURCE}. missing:`, missing);
    process.exit(2);
  }
}
