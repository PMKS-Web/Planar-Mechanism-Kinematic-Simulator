import { InjectionToken, Type } from '@angular/core';

/**
 * Only document content varies. The enclosing cards own layout, navigation and motion.
 *
 * This file imports no component on purpose. The cards that render these slots
 * (`app.component`, `left-tabs`, `right-panel`) each fall back to the legacy
 * component they always imported when nothing provides the token, so the
 * public route needs no provider and the import graph stays the one staging
 * has. A default factory here that named the legacy panels would put every
 * panel that reaches `RightPanelComponent`'s statics on a cycle through this
 * file, and `always-on-features.spec` then sees `undefined` in a component's
 * `imports` in full-suite order (`.storybook/tools/cycles.mjs` lists them).
 */
export interface EditorContent {
  readonly tutorial: Type<unknown>;
  readonly tutorialInputs?: Record<string, unknown>;
  readonly analysisInputs?: Record<string, unknown>;
  readonly synthesisInputs?: Record<string, unknown>;
  readonly exportInputs?: Record<string, unknown>;
  readonly canvas: Type<unknown>;
  readonly edit: Type<unknown>;
  readonly analysis: Type<unknown>;
  readonly synthesis: Type<unknown>;
  readonly analysisSetup: Type<unknown>;
  readonly export: Type<unknown>;
}

/** Provided by a non-default editor's provider set; absent on the public route. */
export const EDITOR_CONTENT = new InjectionToken<EditorContent>('EDITOR_CONTENT');
