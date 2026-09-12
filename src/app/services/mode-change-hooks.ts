import type { TabID } from '../selected-tab.service';

/**
 * What else happens when the mode changes, registered by whoever cares.
 *
 * `SelectedTabService` used to close the right drawer's setup page itself by
 * calling a static on `RightPanelComponent`. That is a service importing a
 * component, and it put the tab service on an import cycle through the canvas
 * and the panels (see `joint-drag-state.ts` for what that broke). The drawer
 * now registers its own reaction here, and the service only announces.
 */
const hooks = new Set<(tab: TabID) => void>();

export function whenModeChanges(hook: (tab: TabID) => void): () => void {
  hooks.add(hook);
  return () => hooks.delete(hook);
}

export function modeChanged(tab: TabID): void {
  for (const hook of hooks) hook(tab);
}
