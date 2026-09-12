import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

/**
 * The gallery's own name in the sidebar, and the repository behind it. The
 * title links to the repository rather than to the gallery's home, so a
 * reader who arrived at the hosted copy can find the source in one click.
 */
addons.setConfig({
  theme: create({
    base: 'light',
    brandTitle: 'PMKS+ UI',
    brandUrl: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator',
    brandTarget: '_blank',
  }),
});
