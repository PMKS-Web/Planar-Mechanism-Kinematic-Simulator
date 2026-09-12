/** The repository the gallery documents, and the branch the docs are written on. */
export const REPO_URL = 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator';
export const REPO_BRANCH = 'staging';

/**
 * The documents the gallery renders as pages of its own, and the page each is.
 *
 * A link from one of these to another stays inside the gallery. The page ids
 * are what Storybook makes of each page's `<Meta title>` in
 * `src/stories/docs/`; `repo-links.spec.ts` checks that they still agree.
 */
export const GALLERY_PAGES: Record<string, string> = {
  'docs/ui-style-guide.md': '/docs/guides-ui-style-guide--docs',
  'docs/ui-vocabulary.md': '/docs/guides-vocabulary--docs',
  'docs/code-style.md': '/docs/guides-code-style--docs',
};

/**
 * Rewrites a Markdown document's relative links for the gallery.
 *
 * `docs/*.md` link to each other and to the source by relative path, which is
 * right on GitHub and in an editor, and means nothing on docs.pmksplus.com,
 * where the rendered page is the only thing that exists. The files stay as
 * they are; the gallery rewrites at render time, resolving each relative
 * target against the document's own path in the repository. A target the
 * gallery renders itself becomes a link to that page (`./?path=…`, which
 * `GuideLink` opens in the top window); anything else opens on GitHub. An
 * in-page anchor (`#…`) and an absolute URL are left alone.
 */
export function linkToRepo(markdown: string, docPath: string): string {
  const base = new URL(docPath, 'https://repository.invalid/');
  return markdown.replace(/\]\(([^)\s]+)\)/g, (whole, target: string) => {
    if (/^(#|[a-z][a-z0-9+.-]*:)/i.test(target)) return whole;
    const resolved = new URL(target, base);
    const page = GALLERY_PAGES[resolved.pathname.slice(1)];
    // `./` so the browser resolves it against the directory the gallery lives
    // in, not against `iframe.html`; `GuideLink` opens it in the top window.
    if (page) return `](./?path=${page}${resolved.hash})`;
    return `](${REPO_URL}/blob/${REPO_BRANCH}${resolved.pathname}${resolved.hash})`;
  });
}
