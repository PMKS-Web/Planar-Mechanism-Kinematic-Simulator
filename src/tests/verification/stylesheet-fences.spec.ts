import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PHONE_MAX_WIDTH } from '../../app/services/viewport.service';

/**
 * What the stylesheets promise and stylelint cannot check.
 *
 * `color-no-hex` and `color-named` keep a raw color out of a component
 * stylesheet, but a width in a media query and an `rgba()` are numbers, and a
 * number is not a color. Each rule below is a decision written in
 * `docs/ui-style-guide.md`; a spec holds it the way `docs-inventory.spec.ts`
 * holds the hand-kept lists, because a rule a person remembers drifts and a
 * rule a spec checks does not.
 */
const ROOT = resolve(__dirname, '../../..');
const VARS = 'src/app/component/left-tabs/left-tabs.vars.scss';
const TOKENS = 'src/styles/_tokens.scss';

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/** Every stylesheet under src, as a path relative to the repository root. */
function stylesheets(dir = resolve(ROOT, 'src')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return name.endsWith('.scss') ? [relative(ROOT, path)] : [];
  });
}

describe('stylesheet fences', () => {
  it('names the phone breakpoint once, and it is the width ViewportService asks', () => {
    const match = /\$phone-max-width:\s*(\d+)px/.exec(read(VARS));
    expect(match, `${VARS} needs a $phone-max-width`).not.toBeNull();
    expect(Number(match![1]), 'the Sass and TypeScript breakpoints differ').toBe(PHONE_MAX_WIDTH);
  });

  it('writes a width two files share as a name, not as a literal', () => {
    // The widths named in left-tabs.vars.scss. Writing one as a number again
    // is how the view controls and the transport came to tighten at two
    // different widths on the same line.
    const named = /\b(600|720|380|780|1340)px\b/;
    const offenders = stylesheets()
      .filter((path) => path !== VARS)
      .flatMap((path) =>
        read(path)
          .split('\n')
          .map((line, i) => ({ line, at: `${path}:${i + 1}` }))
          .filter(({ line }) => /@media[^{]*(max|min)-width:/.test(line) && named.test(line))
          .map(({ at }) => at)
      );
    expect(offenders, `use the named width from ${VARS} (nav.$phone-max-width, …)`).toEqual([]);
  });

  it('does not add a raw rgba() color outside the token file', () => {
    // What is left is black at a low alpha on a border, a wash, a shadow or a
    // divider, plus a few brand and white tints; the text inks were folded
    // onto the --text ladder. The count only goes down: lower the ceiling
    // when you remove some, and name a role in the token file rather than
    // raising it.
    const CEILING = 87;
    const count = stylesheets()
      .filter((path) => path !== TOKENS)
      .reduce((sum, path) => sum + (read(path).match(/\brgba?\(/g)?.length ?? 0), 0);
    expect(
      count,
      `${count} raw rgba() colors outside ${TOKENS}; name the role there instead`
    ).toBeLessThanOrEqual(CEILING);
  });
});
