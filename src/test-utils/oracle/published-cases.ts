// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import {
  TEMPLATE_IDS,
  TEMPLATE_LINKAGES,
} from '../../app/component/MODALS/templates/template-linkages';
import { FIXTURE_GALLERY, fixturePayload } from '../verification/fixture-gallery';

/**
 * Every mechanism a reader can open, as the URL payload they open: each
 * gallery fixture as `npm run fixture-urls` links it, and each template as the
 * library dialog stores it. These are the oracle's *published* cases; the raw
 * benchmark cases live in oracle/benchmarks/cases and never pass through
 * PMKS+.
 */
export interface PublishedCase {
  /** File-safe and stable: `gallery.<slug>` or `template.<id>`. */
  id: string;
  title: string;
  payload: string;
}

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function publishedCases(): PublishedCase[] {
  const gallery = FIXTURE_GALLERY.map((entry) => ({
    id: `gallery.${slug(entry.name)}`,
    title: entry.name,
    payload: fixturePayload(entry.fixture, entry.objectScale, entry.speed),
  }));
  const templates = TEMPLATE_IDS.map((id) => ({
    id: `template.${slug(id)}`,
    title: `Template ${id}`,
    payload: TEMPLATE_LINKAGES[id],
  }));
  return [...gallery, ...templates];
}
