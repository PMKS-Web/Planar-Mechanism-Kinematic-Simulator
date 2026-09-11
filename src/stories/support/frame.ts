import { componentWrapperDecorator } from '@storybook/angular-vite';

/**
 * Stands a block in the card it is laid out for: the left mode card, 250px
 * wide, or 400px in the analysis modes. A block measured in a full-width
 * canvas is not the block a reader sees.
 *
 * `padding` stands in for the section a field usually sits in (a
 * `collapsible-subseciton` supplies it in the Edit panel). A block that sits
 * straight on the card, as `editable-title-block` does, wants 0.
 */
export function inPanel(width = 250, padding = 12) {
  return componentWrapperDecorator(
    (story) =>
      `<div class="sb-panel-frame" style="--sb-frame-width: ${width}px; --sb-frame-padding: ${padding}px">${story}</div>`
  );
}

/** The width alone, for a block that is itself the card (`panel-section`). */
export function atWidth(width = 250) {
  return componentWrapperDecorator((story) => `<div style="width: ${width}px">${story}</div>`);
}
