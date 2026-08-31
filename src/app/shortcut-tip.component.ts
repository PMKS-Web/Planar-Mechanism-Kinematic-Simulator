import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * What a shortcut tooltip looks like: the sentence, then the key.
 *
 * Everything here except the key is measured off a real `matTooltip` -- the
 * same ink, type, padding, corner, width cap and opening animation -- because
 * these sit beside a hundred plain tooltips and any difference in them reads as
 * two kinds of object rather than one kind with something extra. The key is the
 * only thing that should look new.
 *
 * The comments in the styles below are `/* *\/` rather than `//`. A component
 * `styles` block is plain CSS, where `//` is not a comment at all: written that
 * way the parser dropped every declaration after it, and the tip rendered as
 * white text on no background -- present in the DOM, invisible on screen.
 */
@Component({
  selector: 'app-shortcut-tip',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <span class="tipText">{{ text() }}</span>
    @if (keys()) {
      <kbd class="tipKeys">{{ keys() }}</kbd>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        gap: 8px;
        /* Hug the content, so a short label never wraps just because the key
           beside it took some of the room. "Reset View" broke over two lines
           with a gap before its key, which is not what the plain tooltips do
           and not what a two-word label should ever do. */
        width: max-content;
        padding: 4px 8px;
        border-radius: 4px;
        /* Measured from a live matTooltip rather than guessed. */
        background: rgb(66, 66, 66);
        color: #fff;
        font-size: 12px;
        line-height: 16px;
        animation: shortcutTipShow 0.15s cubic-bezier(0, 0, 0.2, 1) forwards;
      }

      /* Material caps a tooltip at 200px and centers it. The cap belongs to
         the sentence rather than to the whole tip: the key is never the reason
         a line breaks. */
      .tipText {
        max-width: 200px;
        text-align: center;
      }

      /* A key, drawn as one. Monospace and a cap edge are what separate it
         from the sentence beside it without needing brackets to say so. */
      .tipKeys {
        flex: none;
        padding: 1px 5px;
        border: 1px solid rgba(255, 255, 255, 0.45);
        border-bottom-width: 2px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.14);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 11px;
        line-height: 15px;
        letter-spacing: 0.02em;
        white-space: nowrap;
      }

      @keyframes shortcutTipShow {
        from {
          opacity: 0;
          transform: scale(0.8);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
    `,
  ],
})
export class ShortcutTipComponent {
  readonly text = input('');
  readonly keys = input('');
}
