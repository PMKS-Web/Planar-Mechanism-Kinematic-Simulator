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
  return !production && nativeRequested && sets.native ? sets.native : sets.legacy;
}
