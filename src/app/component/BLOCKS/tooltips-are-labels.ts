import { Provider } from '@angular/core';
import { MAT_TOOLTIP_DEFAULT_OPTIONS, MatTooltipDefaultOptions } from '@angular/material/tooltip';

/**
 * A tooltip is a label, never a target: the pointer goes through it to whatever
 * it is lying over.
 *
 * Material's tooltip panel takes pointer events, so that a reader may move onto
 * the tooltip itself and keep it open. Among options that sit next to each
 * other that is a trap, and it is what was reported on the Joint Type choice:
 * pointing at a grayed option opened its reason over the options beside it, and
 * the panel -- not the option under it -- is what the next press landed on.
 * `document.elementFromPoint` at a covered option's centre answered with the
 * tooltip's own surface, and in the right-click card a covered value could not
 * be reached by a pointer at all: moving onto the tooltip kept it open, so the
 * value under it never got the hover back.
 *
 * Moving the tooltip off the options is the other half of the fix and the one a
 * reader sees; this is the half that means a tooltip which does end up over
 * something -- because Material flips a tooltip that has no room on the side it
 * asked for -- still cannot eat the press.
 *
 * Material has a switch for exactly this, and this is the value that throws it:
 * the panel then carries `mat-mdc-tooltip-panel-non-interactive`, whose own
 * `pointer-events: none` ships with the tooltip's stylesheet. So no global
 * sheet has to reach into an overlay to say it, the way `.shortcutTipPanel`
 * does for the one tooltip that was patched before this existed. The three
 * delays are Material's own defaults, repeated because the token holds one
 * object rather than a field at a time.
 *
 * Given by the components whose tooltips can come to rest over something
 * pressable rather than app-wide, because it is those components that have the
 * problem, and a tooltip drawn over the canvas costs a reader nothing.
 */
export const TOOLTIPS_ARE_LABELS: Provider = {
  provide: MAT_TOOLTIP_DEFAULT_OPTIONS,
  useValue: {
    showDelay: 0,
    hideDelay: 0,
    touchendHideDelay: 1500,
    disableTooltipInteractivity: true,
  } satisfies MatTooltipDefaultOptions,
};
