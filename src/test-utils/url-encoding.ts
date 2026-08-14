import { Injector, runInInjectionContext } from '@angular/core';
import { MechanismService } from '../app/services/mechanism.service';
import { SettingsService } from '../app/services/settings.service';
import { UrlGenerationService } from '../app/services/url-generation.service';

/**
 * A UrlGenerationService wired to the given mechanism and settings.
 *
 * The service resolves both with inject(), so a spec cannot pass them
 * positionally any more; this is the one place that builds the injection
 * context for it.
 */
export function urlGeneratorFor(
  mechanism: MechanismService,
  settings: SettingsService
): UrlGenerationService {
  const injector = Injector.create({
    providers: [
      { provide: MechanismService, useValue: mechanism },
      { provide: SettingsService, useValue: settings },
      { provide: UrlGenerationService, deps: [] },
    ],
  });
  return injector.get(UrlGenerationService);
}

/** Shorthand for the common one-shot encode. */
export function encodeUrlOf(mechanism: MechanismService, settings: SettingsService): string {
  return urlGeneratorFor(mechanism, settings).generateUrlQuery();
}

export { runInInjectionContext };
