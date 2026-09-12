import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { anchorsIn } from '../../test-utils/markdown-anchors';

/**
 * Every relative link in the hand-written docs reaches a file that exists
 * and, when it names a heading, a heading that exists.
 *
 * The Guides pages of the component gallery render three of these documents
 * and rewrite their relative links to GitHub (`src/stories/support/repo-links.ts`),
 * so a link that is wrong here is wrong on docs.pmksplus.com too, and there
 * it is the only thing the reader can click.
 */
const ROOT = resolve(__dirname, '../../..');

const DOCUMENTS = [
  'README.md',
  'CLAUDE.md',
  'AGENTS.md',
  'e2e/README.md',
  ...readdirSync(resolve(ROOT, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `docs/${name}`),
];

/** The `](target)` of every inline link in a document, with the target split at its `#`. */
function linksIn(markdown: string): { path: string; anchor: string }[] {
  return Array.from(markdown.matchAll(/\]\(([^)\s]+)\)/g))
    .map(([, target]) => target)
    .filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target))
    .map((target) => {
      const [path, anchor = ''] = target.split('#');
      return { path, anchor };
    });
}

describe('documentation links', () => {
  for (const document of DOCUMENTS) {
    it(`${document} links only to files and headings that exist`, () => {
      const markdown = readFileSync(resolve(ROOT, document), 'utf8');
      const broken: string[] = [];
      for (const { path, anchor } of linksIn(markdown)) {
        const target = path ? resolve(ROOT, dirname(document), path) : resolve(ROOT, document);
        if (!existsSync(target)) {
          broken.push(`${path || '#' + anchor}: no such file`);
          continue;
        }
        if (
          anchor &&
          target.endsWith('.md') &&
          !anchorsIn(readFileSync(target, 'utf8')).has(anchor)
        ) {
          broken.push(`${path}#${anchor}: no such heading`);
        }
      }
      expect(broken, `fix these links in ${document}`).toEqual([]);
    });
  }
});
