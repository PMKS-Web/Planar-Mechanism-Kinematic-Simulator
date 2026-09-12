import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { GALLERY_PAGES, linkToRepo, REPO_BRANCH, REPO_URL } from './repo-links';

const blob = `${REPO_URL}/blob/${REPO_BRANCH}`;

describe('linkToRepo', () => {
  it('sends a link to a document the gallery renders to that page', () => {
    expect(linkToRepo('see [words](ui-vocabulary.md#voice)', 'docs/ui-style-guide.md')).toBe(
      'see [words](./?path=/docs/guides-vocabulary--docs#voice)'
    );
  });

  it('sends a link to any other document to GitHub', () => {
    expect(linkToRepo('[traps](tips-and-tricks.md#environment)', 'docs/code-style.md')).toBe(
      `[traps](${blob}/docs/tips-and-tricks.md#environment)`
    );
  });

  it('resolves a path that climbs out of docs', () => {
    expect(linkToRepo('[the file](../src/styles/_tokens.scss)', 'docs/ui-style-guide.md')).toBe(
      `[the file](${blob}/src/styles/_tokens.scss)`
    );
  });

  it('leaves in-page anchors and absolute links alone', () => {
    const text =
      '[below](#layout) and [the site](https://app.pmksplus.com) and [mail](mailto:a@b.c)';
    expect(linkToRepo(text, 'docs/code-style.md')).toBe(text);
  });
});

/** Storybook's id for a docs page: its `<Meta title>` sanitized, then `--docs`. */
function pageIdOf(title: string): string {
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `/docs/${sanitized}--docs`;
}

describe('the gallery pages the rewrite knows about', () => {
  const pagesDir = resolve(__dirname, '../docs');
  const pages = readdirSync(pagesDir)
    .filter((name) => name.endsWith('.mdx'))
    .map((name) => readFileSync(resolve(pagesDir, name), 'utf8'));

  for (const [doc, page] of Object.entries(GALLERY_PAGES)) {
    it(`${doc} is rendered by a page whose id is ${page}`, () => {
      const rendering = pages.find((source) => source.includes(`'../../../${doc}?raw'`));
      expect(rendering, `no page in src/stories/docs imports ${doc}`).toBeDefined();
      const title = /<Meta title="([^"]+)"/.exec(rendering!)?.[1] ?? '';
      expect(pageIdOf(title)).toBe(page);
    });
  }
});
