/**
 * The Edit panel, as the analysis setup drawer needs it: a way to land the
 * reader on a section. The drawer used to reach `EditPanelComponent.instance`,
 * which made two panels import each other (see `canvas-handle.ts` for why a
 * cycle matters). The panel registers here instead.
 */
export interface EditPanelHandle {
  /** Open a collapsible section by its key, so a field the reader was sent to is in view. */
  expandSection(key: string): void;
}

let panel: EditPanelHandle | undefined;

export function registerEditPanel(handle: EditPanelHandle | undefined): void {
  panel = handle;
}

export function editPanelHandle(): EditPanelHandle | undefined {
  return panel;
}
