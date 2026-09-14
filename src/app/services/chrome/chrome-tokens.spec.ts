import { TestBed } from '@angular/core/testing';
import { LEGACY_CHROME_PROVIDERS } from './legacy-chrome-providers';

/** A token must not create a second writer, or ignore a replacement provider. */
describe('chrome service identity', () => {
  for (const alias of LEGACY_CHROME_PROVIDERS) {
    if (!('useExisting' in alias)) throw new Error('Chrome providers must alias existing services');

    it(`shares the existing ${alias.useExisting.name} singleton with explicit aliases and defaults`, () => {
      for (const explicit of [true, false]) {
        TestBed.resetTestingModule();
        let constructions = 0;
        const service = { revision: 0 };
        TestBed.configureTestingModule({
          providers: [
            ...(explicit ? LEGACY_CHROME_PROVIDERS : []),
            {
              provide: alias.useExisting,
              useFactory: () => {
                constructions++;
                return service;
              },
            },
          ],
        });
        const chrome = TestBed.inject(alias.provide) as typeof service;
        const legacy = TestBed.inject(alias.useExisting) as typeof service;
        legacy.revision++;
        expect(chrome).toBe(legacy);
        expect(chrome.revision).toBe(1);
        expect(constructions).toBe(1);
      }
    });

    it(`does not construct ${alias.useExisting.name} when its chrome token is replaced`, () => {
      const replacement = {};
      TestBed.configureTestingModule({
        providers: [
          ...LEGACY_CHROME_PROVIDERS,
          {
            provide: alias.useExisting,
            useFactory: () => {
              throw new Error('Legacy service constructed');
            },
          },
          { provide: alias.provide, useValue: replacement },
        ],
      });
      expect(TestBed.inject(alias.provide)).toBe(replacement);
    });
  }
});
