import type { Provider } from '@angular/core';
import { LEGACY_CHROME_PROVIDERS } from './services/chrome/legacy-chrome-providers';

export interface EditorProviderSets {
  legacy: Provider[];
  native?: Provider[];
}

/**
 * Resolve before any service can load a drawing. The root and its shell stay the
 * same for either provider set. This PR installs only legacy; native remains a
 * development-only opt-in once a later PR supplies its implementation.
 */
export function selectEditorProviders(
  search: string,
  production: boolean,
  sets: EditorProviderSets = { legacy: LEGACY_CHROME_PROVIDERS }
): Provider[] {
  const nativeRequested = new URLSearchParams(search).get('editor') === 'native';
  if (production || !nativeRequested || !sets.native) return sets.legacy;

  // Root defaults support isolated component tests, but must never fill a hole
  // in another editor's set by silently constructing a legacy service.
  const supplied = new Set(
    sets.native
      .flat(Infinity)
      .filter((provider) => provider && 'provide' in provider)
      .map((provider) => provider.provide)
  );
  const missing = LEGACY_CHROME_PROVIDERS.filter(({ provide }) => !supplied.has(provide));
  if (missing.length) {
    throw new Error(
      `Native editor providers missing: ${missing.map(({ provide }) => String(provide)).join(', ')}`
    );
  }
  return sets.native;
}
