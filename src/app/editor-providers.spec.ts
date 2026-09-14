import { InjectionToken } from '@angular/core';
import { selectEditorProviders } from './editor-providers';
import { LEGACY_CHROME_PROVIDERS } from './services/chrome/legacy-chrome-providers';

describe('pre-load editor provider selection', () => {
  const marker = new InjectionToken<string>('test editor');
  const legacy = [{ provide: marker, useValue: 'legacy' }];
  const native = LEGACY_CHROME_PROVIDERS.map(({ provide }) => ({ provide, useValue: {} }));

  it('keeps every shipped route on the existing providers while native is absent', () => {
    for (const production of [true, false]) {
      for (const search of ['', '?editor=native', '?editor=legacy', '?library', '?saved-drawing']) {
        expect(selectEditorProviders(search, production)).toBe(LEGACY_CHROME_PROVIDERS);
      }
    }
  });

  for (const { provide } of LEGACY_CHROME_PROVIDERS) {
    it(`rejects a selected native set missing ${provide}`, () => {
      const incomplete = native.filter((entry) => entry.provide !== provide);
      expect(() =>
        selectEditorProviders('?editor=native', false, { legacy, native: incomplete })
      ).toThrowError(`Native editor providers missing: ${provide}`);
    });
  }

  it('accepts nested provider arrays without evaluating their factories', () => {
    const nested = [
      native.map(({ provide }) => ({
        provide,
        useFactory: () => {
          throw new Error('Selection must not construct a service');
        },
      })),
    ];
    expect(selectEditorProviders('?editor=native', false, { legacy, native: nested })).toBe(nested);
  });

  it('does not validate an unselected incomplete alternative', () => {
    for (const [search, production] of [
      ['?editor=native', true],
      ['', false],
      ['?editor=other', false],
    ] as const) {
      expect(selectEditorProviders(search, production, { legacy, native: [] })).toBe(legacy);
    }
  });

  it('selects an installed alternative only on an explicit development request', () => {
    expect(selectEditorProviders('?editor=native', false, { legacy, native })).toBe(native);
    expect(selectEditorProviders('?editor=native', true, { legacy, native })).toBe(legacy);
    expect(selectEditorProviders('', false, { legacy, native })).toBe(legacy);
    expect(selectEditorProviders('?editor=other', false, { legacy, native })).toBe(legacy);
  });
});
