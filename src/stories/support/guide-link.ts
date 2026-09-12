import { createElement, type ReactNode } from 'react';

export interface GuideLinkProps {
  href?: string;
  children?: ReactNode;
  [attribute: string]: unknown;
}

/**
 * The anchor the Guides pages render their links with.
 *
 * Storybook's own docs anchor hands a `?path=` link to the manager, but
 * resolves it against the preview iframe first, so the top window lands on
 * `iframe.html` with the sidebar gone; and it leaves an `https://` link to
 * open inside the iframe, which GitHub refuses. The preview page also carries
 * a `<base target="_parent">`, so a link with no target of its own leaves the
 * iframe too. So every link says where it goes: an in-page anchor scrolls the
 * page it is on (`_self`); a link to another gallery page (`./?path=…`,
 * written by `linkToRepo`) loads the manager in the top window; anything else
 * opens in a new tab.
 */
export function GuideLink({ href = '', children, ...rest }: GuideLinkProps) {
  const target = href.startsWith('#') ? '_self' : href.startsWith('./?path=') ? '_top' : '_blank';
  const rel = target === '_blank' ? 'noreferrer' : undefined;
  return createElement('a', { ...rest, href, target, rel }, children);
}
