import { provideHttpClient } from '@angular/common/http';
import { provideZoneChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { applicationConfig, type Preview } from '@storybook/angular-vite';
import { provideAppIcons } from '../src/stories/support/icons';

/**
 * Every story is bootstrapped the way `src/main.ts` bootstraps the app: with
 * zone change detection (several blocks update from a `setTimeout`), the
 * animation providers the collapsible sections need, and an HTTP client for
 * Material to fetch the SVG icons with.
 *
 * `zone.js` itself is loaded by the builder (`"zoneless": false` on the
 * storybook targets in `angular.json`).
 *
 * The global stylesheets are not imported here. `.storybook/main.ts` reads the
 * app's build target in `angular.json` and prepends them, so a stylesheet added
 * to the app -- the design-token file, for one -- reaches the gallery unasked.
 */
const preview: Preview = {
  decorators: [
    applicationConfig({
      providers: [
        provideZoneChangeDetection(),
        provideAnimations(),
        provideHttpClient(),
        provideAppIcons(),
      ],
    }),
  ],
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    options: {
      storySort: {
        order: [
          'Introduction',
          'Guides',
          ['UI style guide', 'Vocabulary', 'Code style'],
          'Tokens',
          'Fields',
          'Choices',
          'Actions',
          'Structure',
          'Feedback',
          'Reuse backlog',
          'Canvas entities',
        ],
      },
    },
  },
};

export default preview;
