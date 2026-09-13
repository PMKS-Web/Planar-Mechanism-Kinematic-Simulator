import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { anchorOf } from '../../test-utils/markdown-anchors';

/**
 * The three hand-kept lists an agent is told to read first. Each one drifted before this spec
 * existed: the e2e README named a third of the suites, a Contents stopped
 * half way down the file, and nothing listed which documents were current. A list a person
 * maintains goes stale; a list a spec checks does not.
 */
const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('documentation inventories', () => {
  it('names every e2e script in e2e/README.md', () => {
    const readme = read('e2e/README.md');
    const scripts = readdirSync(resolve(ROOT, 'e2e')).filter((name) => name.endsWith('.mjs'));
    const missing = scripts.filter((name) => !readme.includes(name));
    expect(missing, 'add a line for each of these to e2e/README.md').toEqual([]);
  });

  it('lists every document in docs/README.md', () => {
    const index = read('docs/README.md');
    const documents = readdirSync(resolve(ROOT, 'docs')).filter(
      (name) => name.endsWith('.md') && name !== 'README.md'
    );
    const missing = documents.filter((name) => !index.includes(name));
    expect(missing, 'add each of these to docs/README.md, with its status').toEqual([]);
  });

  // Any document may carry a Contents; one that does has to be complete. This
  // used to name `tips-and-tricks.md` alone, which is how three of the four
  // documents it was split into could have shipped with a half-written index.
  it('links every section of a document that carries a Contents', () => {
    const documents = readdirSync(resolve(ROOT, 'docs')).filter((name) => name.endsWith('.md'));
    const incomplete: string[] = [];
    for (const name of documents) {
      const lines = read(`docs/${name}`).split('\n');
      const start = lines.findIndex((line) => line.trim() === '## Contents');
      // A document without one is fine: `short-notes.md` is eighty-odd headings
      // searched by symbol, and a hand-kept list of them would be stale in a
      // month.
      if (start < 0) continue;
      // A Contents that is the last `##` in its file has no following heading;
      // `slice(start, -1)` would silently drop the final line of the index.
      const after = lines.findIndex((line, i) => i > start && line.startsWith('## '));
      const contents = lines.slice(start, after < 0 ? lines.length : after).join('\n');
      const sections = lines
        .filter((line) => line.startsWith('## ') && line.trim() !== '## Contents')
        .map((line) => line.slice(3));
      incomplete.push(
        ...sections
          .filter((heading) => !contents.includes(`(#${anchorOf(heading)})`))
          .map((heading) => `${name}: ${heading}`)
      );
    }
    expect(incomplete, 'link each of these from its own document’s Contents').toEqual([]);
  });
});
