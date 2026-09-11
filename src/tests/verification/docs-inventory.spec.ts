import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The three hand-kept lists an agent is told to read first. Each one drifted before this spec
 * existed: the e2e README named a third of the suites, the Contents of tips-and-tricks stopped
 * half way down the file, and nothing listed which documents were current. A list a person
 * maintains goes stale; a list a spec checks does not.
 */
const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/** GitHub's heading anchor: lowercase, punctuation dropped, each space a hyphen. */
function anchorOf(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

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

  it('links every section of tips-and-tricks from its Contents', () => {
    const lines = read('docs/tips-and-tricks.md').split('\n');
    const start = lines.findIndex((line) => line.trim() === '## Contents');
    const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
    expect(start, 'tips-and-tricks.md needs a "## Contents" section').toBeGreaterThanOrEqual(0);
    const contents = lines.slice(start, end).join('\n');
    const sections = lines
      .filter((line) => line.startsWith('## ') && line.trim() !== '## Contents')
      .map((line) => line.slice(3));
    const missing = sections.filter((heading) => !contents.includes(`(#${anchorOf(heading)})`));
    expect(missing, 'link each of these from the Contents of tips-and-tricks.md').toEqual([]);
  });
});
