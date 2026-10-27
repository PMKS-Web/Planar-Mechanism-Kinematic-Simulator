import { Injectable } from '@angular/core';

/**
 * Which sections of a part's panels the reader has folded, for the session.
 *
 * The same trouble MechanismPanelStateService fixed for the machine panel: the
 * Edit panel and the analysis panel are new components every time their mode
 * is entered, so a fold kept on them came back open at every mode switch. A
 * reader who closed a joint's Basic Settings, or its Position graph, found it
 * open again on the way back. Kept here, a fold holds until they open it. View
 * state only: it never touches the document, and a reload starts afresh.
 */
@Injectable({ providedIn: 'root' })
export class PanelFoldStateService {
  /** The Edit panel's sections, by key, starting from these defaults. */
  readonly editSections: { [key: string]: boolean } = {
    JBasic: true,
    JInput: true, // Expanded on arrival, so a new input's settings are visible
    // Open on arrival, like the link's own mass section: it is only there at
    // all for a slider, so a reader who has one has come to a joint that
    // weighs something.
    JMass: true,
    JVisual: false,
    JDistToJ: true,
    LBasic: true,
    LVisual: false,
    LMass: true,
    FBasic: true,
    FVisual: false,
    BGPlace: true,
  };

  /** The analysis panel's graphs. Only explicit choices are remembered; the
   *  first graph starts open. */
  readonly analysisGraphs: { [key: string]: boolean } = {};
}
