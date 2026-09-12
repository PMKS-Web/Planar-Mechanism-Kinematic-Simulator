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
          // Every comparison with zero, in either order: `speed >= 0` asks
          // the same direction question as `speed < 0` and once slipped past
          // a rule that only knew the one spelling.
          selector:
            "BinaryExpression[operator=/^[<>]=?$/][right.type='Literal'][right.value=0]" +
            `:matches([left.type='Identifier'][left.name=${SPEED_NAME}],` +
            ` [left.type='MemberExpression'][left.property.name=${SPEED_NAME}])`,
          message:
            'Ask turnsClockwise(speed) from model/drive-direction.ts instead of comparing a speed with 0.',
        },
        {
          selector:
            "BinaryExpression[operator=/^[<>]=?$/][left.type='Literal'][left.value=0]" +
            `:matches([right.type='Identifier'][right.name=${SPEED_NAME}],` +
            ` [right.type='MemberExpression'][right.property.name=${SPEED_NAME}])`,
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
    // A spec, and the snapshot of what the built-in templates decode to: a
    // table, not a file that could pick up a second job.
    files: ['src/**/*.spec.ts', 'src/tests/verification/template-baseline.ts'],
    rules: { 'max-lines': 'off' },
  },
  {
    // The two hubs take no new behavior (docs/code-style.md), and this is the
    // line that says so: each is capped at the size it had when the cap was
    // set, counted the way max-lines counts. Lower a number when a move lands;
    // raise one only in a pull request that says why the code could not live
    // in a model or a narrower service.
    files: ['src/app/services/mechanism.service.ts'],
    rules: { 'max-lines': ['error', { max: 4335, skipBlankLines: true, skipComments: true }] },
  },
  {
    files: ['src/app/component/new-grid/new-grid.component.ts'],
    rules: { 'max-lines': ['error', { max: 3829, skipBlankLines: true, skipComments: true }] },
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
