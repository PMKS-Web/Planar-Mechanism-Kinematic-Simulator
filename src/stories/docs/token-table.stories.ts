import type { Meta, StoryObj } from '@storybook/angular-vite';
import { TokenTableComponent } from './token-table.component';

/**
 * The table the Tokens docs page embeds. Kept out of the sidebar (`!dev`):
 * it is read on that page, beside the words that explain it.
 */
const meta: Meta<TokenTableComponent> = {
  title: 'Internal/Token table',
  component: TokenTableComponent,
  tags: ['!dev', '!autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;

export const LoadedTokens: StoryObj<TokenTableComponent> = {};
