// @ts-check
/**
 * ESLint enforces the few invariants a reviewer cannot hold in their head, and
 * nothing else. No recommended rule set is enabled on purpose: this is a guard
 * on decisions the codebase has already made (see docs/code-style.md), not a
 * style overhaul. Formatting belongs to Prettier.
 */
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const SPEED_NAME = '/^(speed|driveSpeed)$/';

export default defineConfig([
  {
    // src/test-data holds generated MATLAB tables and DXF goldens.
    ignores: ['dist/**', 'node_modules/**', 'src/test-data/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      // Negative is clockwise, and model/drive-direction.ts is the only place
      // that knows it. Eight hand-written copies once disagreed with each other.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "BinaryExpression[operator='<'][right.type='Literal'][right.value=0]" +
            `:matches([left.type='Identifier'][left.name=${SPEED_NAME}],` +
            ` [left.type='MemberExpression'][left.property.name=${SPEED_NAME}])`,
          message:
            'Ask turnsClockwise(speed) from model/drive-direction.ts instead of comparing a speed with 0.',
        },
      ],
      // A prompt to ask whether a file does two things, not a limit to split to.
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/app/model/drive-direction.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/**/*.spec.ts'],
    rules: { 'max-lines': 'off' },
  },
  {
    // The import graph runs one way: components import services, never the
    // reverse. Three services once reached the canvas and a drawer through
    // their statics, and put every block that injects MechanismService on an
    // import cycle (see docs/code-style.md). A service that needs the canvas
    // reads a handle the canvas registers -- services/canvas-handle.ts.
    files: ['src/app/services/**/*.ts', 'src/app/*.service.ts'],
    ignores: ['src/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/component/**/*.component'],
              message:
                'A service does not import a component. Have the component register a handle the service reads (services/canvas-handle.ts), or excuse a dialog open on this line.',
            },
          ],
        },
      ],
    },
  },
  {
    // Components read solved samples through the services; they do not run
    // the solvers. A warning while existing imports remain.
    files: ['src/app/component/**/*.ts'],
    ignores: ['src/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: [
                '**/mechanism/position-solver',
                '**/mechanism/kinematic-solver',
                '**/mechanism/force-solver',
                '**/mechanism/loop-solver',
              ],
              message:
                'Components get solved values from MechanismService, not from the solvers directly.',
            },
          ],
        },
      ],
    },
  },
]);
