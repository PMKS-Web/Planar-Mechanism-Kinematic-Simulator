import type { Provider } from '@angular/core';
import { EDITOR_CONTENT } from './editor-content';
import { CHROME_PROJECT } from './services/chrome/chrome-project';
import { CHROME_STATUS } from './services/chrome/chrome-status';
import { CHROME_TUTORIAL } from './services/chrome/chrome-tutorial';
import { GRID_DOCUMENT } from './services/chrome/grid-document';
import { SETTINGS_COMMANDS } from './services/chrome/settings-commands';
import { LEGACY_CHROME_PROVIDERS } from './services/chrome/legacy-chrome-providers';

export const REQUIRED_EDITOR_PORTS = [
  ...LEGACY_CHROME_PROVIDERS.map(({ provide }) => provide),
  CHROME_PROJECT,
  CHROME_STATUS,
  CHROME_TUTORIAL,
  GRID_DOCUMENT,
  SETTINGS_COMMANDS,
  EDITOR_CONTENT,
];

export interface EditorProviderSets {
  legacy: Provider[];
  native?: Provider[];
}

/**
 * Resolve before any service can load a drawing. The root and its shell stay the
 * same for either provider set. Native remains an explicit development opt-in
 * until the consumer and default-cutover stage is accepted.
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
  const missing = REQUIRED_EDITOR_PORTS.filter((provide) => !supplied.has(provide));
  if (missing.length) {
    throw new Error(
      `Native editor providers missing: ${missing.map((provide) => String(provide)).join(', ')}`
    );
  }
  return sets.native;
}
