import { InjectionToken } from '@angular/core';
import { selectEditorProviders } from './editor-providers';
import { LEGACY_CHROME_PROVIDERS } from './services/chrome/legacy-chrome-providers';

describe('pre-load editor provider selection', () => {
  const marker = new InjectionToken<string>('test editor');
  const legacy = [{ provide: marker, useValue: 'legacy' }];
  const native = [{ provide: marker, useValue: 'native' }];

  it('keeps every shipped route on the existing providers while native is absent', () => {
    for (const production of [true, false]) {
      for (const search of ['', '?editor=native', '?editor=legacy', '?library', '?saved-drawing']) {
        expect(selectEditorProviders(search, production)).toBe(LEGACY_CHROME_PROVIDERS);
      }
    }
  });

  it('selects an installed alternative only on an explicit development request', () => {
    expect(selectEditorProviders('?editor=native', false, { legacy, native })).toBe(native);
    expect(selectEditorProviders('?editor=native', true, { legacy, native })).toBe(legacy);
    expect(selectEditorProviders('', false, { legacy, native })).toBe(legacy);
    expect(selectEditorProviders('?editor=other', false, { legacy, native })).toBe(legacy);
  });
});
