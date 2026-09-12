/** The repository the gallery documents, and the branch the docs are written on. */
export const REPO_URL = 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator';
export const REPO_BRANCH = 'staging';

/**
 * Rewrites a Markdown document's relative links to GitHub URLs.
 *
 * `docs/*.md` link to each other and to the source by relative path, which is
 * right on GitHub and in an editor, and means nothing on docs.pmksplus.com,
 * where the rendered page is the only thing that exists. The files stay as
 * they are; the gallery rewrites at render time, resolving each relative
 * target against the document's own path in the repository. An in-page
 * anchor (`#…`) and an absolute URL are left alone.
 */
export function linkToRepo(markdown: string, docPath: string): string {
  const base = new URL(docPath, 'https://repository.invalid/');
  return markdown.replace(/\]\(([^)\s]+)\)/g, (whole, target: string) => {
    if (/^(#|[a-z][a-z0-9+.-]*:)/i.test(target)) return whole;
    const resolved = new URL(target, base);
    return `](${REPO_URL}/blob/${REPO_BRANCH}${resolved.pathname}${resolved.hash})`;
  });
}
