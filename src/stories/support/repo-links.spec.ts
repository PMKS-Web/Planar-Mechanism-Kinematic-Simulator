import { linkToRepo, REPO_BRANCH, REPO_URL } from './repo-links';

const blob = `${REPO_URL}/blob/${REPO_BRANCH}`;

describe('linkToRepo', () => {
  it('resolves a sibling document against the document directory', () => {
    expect(linkToRepo('see [words](ui-vocabulary.md#voice)', 'docs/ui-style-guide.md')).toBe(
      `see [words](${blob}/docs/ui-vocabulary.md#voice)`
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
