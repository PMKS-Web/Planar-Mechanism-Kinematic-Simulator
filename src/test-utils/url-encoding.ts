import { Injector, runInInjectionContext } from '@angular/core';
import { MechanismService } from '../app/services/mechanism.service';
import { SettingsService } from '../app/services/settings.service';
import { UrlGenerationService } from '../app/services/url-generation.service';
import { SynthesisBuilderService } from '../app/services/synthesis/synthesis-builder.service';
import { NumberUnitParserService } from '../app/services/number-unit-parser.service';

/**
 * A UrlGenerationService wired to the given mechanism and settings.
 *
 * The service resolves them with inject(), so a spec cannot pass them
 * positionally any more; this is the one place that builds the injection
 * context for it.
 *
 * A synthesis design can be handed in the same way. Left out, a real but empty
 * one stands in -- which encodes to nothing, so every spec that predates the
 * design being in the URL still compares the bytes it always did.
 */
export function urlGeneratorFor(
  mechanism: MechanismService,
  settings: SettingsService,
  design?: SynthesisBuilderService
): UrlGenerationService {
  const injector = Injector.create({
    providers: [
      { provide: MechanismService, useValue: mechanism },
      { provide: SettingsService, useValue: settings },
      { provide: NumberUnitParserService, deps: [] },
      design
        ? { provide: SynthesisBuilderService, useValue: design }
        : { provide: SynthesisBuilderService, deps: [] },
      { provide: UrlGenerationService, deps: [] },
    ],
  });
  return injector.get(UrlGenerationService);
}

/** Shorthand for the common one-shot encode. */
export function encodeUrlOf(mechanism: MechanismService, settings: SettingsService): string {
  return urlGeneratorFor(mechanism, settings).generateUrlQuery();
}

/** A synthesis design built outside Angular, for the specs that need one. */
export function designFor(settings: SettingsService): SynthesisBuilderService {
  const injector = Injector.create({
    providers: [
      { provide: SettingsService, useValue: settings },
      { provide: NumberUnitParserService, deps: [] },
      { provide: SynthesisBuilderService, deps: [] },
    ],
  });
  return injector.get(SynthesisBuilderService);
}

export { runInInjectionContext };
