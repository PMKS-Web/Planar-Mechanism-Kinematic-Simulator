/**
 * GitHub's heading anchor: lowercase, punctuation dropped, each space a hyphen.
 *
 * Shared by the specs that check hand-written links, because a link written
 * to a heading is only as good as the two of them agreeing on this rule.
 */
export function anchorOf(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Every anchor a Markdown document offers, from its headings. */
export function anchorsIn(markdown: string): Set<string> {
  const anchors = new Set<string>();
  for (const line of markdown.split('\n')) {
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (heading) anchors.add(anchorOf(heading[1]));
  }
  return anchors;
}
