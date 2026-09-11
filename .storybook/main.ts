import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/angular-vite';
import { mergeConfig, type Plugin } from 'vite';

/** The repository root, which the app's Sass and TypeScript both resolve `src/...` against. */
const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * The app's own build options, read from `angular.json` rather than copied.
 *
 * The Storybook builder only loads the global stylesheets listed on its *own*
 * target, and a second list would drift from the first the day somebody adds
 * a stylesheet to the app -- the design-token file, for one. So the gallery
 * asks the app's build target, and follows it.
 */
const appBuild = JSON.parse(readFileSync(resolve(workspaceRoot, 'angular.json'), 'utf8')).projects
  .PMKSWeb.architect.build.options as {
  styles: (string | { input: string })[];
  stylePreprocessorOptions?: { includePaths?: string[] };
};

const appStyles = appBuild.styles.map((style) => (typeof style === 'string' ? style : style.input));
const appIncludePaths = (appBuild.stylePreprocessorOptions?.includePaths ?? []).map((path) =>
  resolve(workspaceRoot, path)
);

/** Prepends the app's global stylesheets to the preview, the way the CLI puts them in `index.html`. */
function appGlobalStyles(): Plugin {
  return {
    name: 'pmks-app-global-styles',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]\.storybook[\\/]preview\.ts$/.test(id)) return undefined;
      const imports = appStyles
        .map((style) => `import '${resolve(workspaceRoot, style).replace(/\\/g, '/')}';`)
        .join('\n');
      return { code: `${imports}\n${code}`, map: null };
    },
  };
}

/**
 * The component gallery: the BLOCKS primitives, one story per state, and the
 * docs pages that explain what the gallery cannot show by itself.
 *
 * Stories live under `src/stories/` rather than beside each component, so the
 * gallery can grow without touching the app's own directories. Canvas entities
 * are not here yet -- see `src/stories/canvas/README.md`.
 */
const config: StorybookConfig = {
  stories: ['../src/stories/**/*.mdx', '../src/stories/**/*.stories.ts'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: '@storybook/angular-vite',
  // The app's SVG icons are fetched from `assets/icons/...` at runtime, the
  // same relative URL `AppComponent` registers them under.
  staticDirs: [{ from: '../src/assets', to: '/assets' }],
  core: { disableTelemetry: true },
  viteFinal: async (viteConfig) =>
    mergeConfig(viteConfig, {
      plugins: [appGlobalStyles()],
      // Component stylesheets `@use 'src/app/...'`, which the CLI resolves
      // through the build's `includePaths`; and a few components import
      // `src/app/...` in TypeScript, which the CLI resolves through `baseUrl`.
      css: { preprocessorOptions: { scss: { loadPaths: appIncludePaths } } },
      resolve: { alias: [{ find: /^src\//, replacement: `${workspaceRoot}src/` }] },
    }),
};

export default config;
