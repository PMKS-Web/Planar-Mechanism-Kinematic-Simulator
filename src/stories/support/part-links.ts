import type { Provider } from '@angular/core';
import { action } from 'storybook/actions';
import { PART_LINK_TARGET } from '../../app/component/BLOCKS/part-link/part-link-target';
import { RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';

/**
 * Where a `part-link` in a story goes: nowhere, said in the Actions panel. The
 * app's own target lights the grid and selects the part; a gallery has neither.
 */
export function partLinkStub(): Provider {
  return {
    provide: PART_LINK_TARGET,
    useValue: {
      point: (part: { id: string } | undefined) => action('point')(part?.id ?? 'nothing'),
      open: (part: { id: string }) => action('open')(part.id),
    },
  };
}

/** A few parts to name: a chain's joints and links, and nothing else. */
export function fourBarParts() {
  const [a, b, c, d, e] = ['A', 'B', 'C', 'D', 'E'].map((id, i) => new RevJoint(id, i, 0));
  const link = (x: RevJoint, y: RevJoint) => new RealLink(x.id + y.id, [x, y]);
  return { a, b, c, d, e, ab: link(a, b), bc: link(b, c), cd: link(c, d), de: link(d, e) };
}
