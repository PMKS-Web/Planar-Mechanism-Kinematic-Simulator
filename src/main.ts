/// <reference path = "typings.d.ts" />
import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';

import { LEGACY_CHROME_PROVIDERS } from './app/services/chrome/legacy-chrome-providers';
import { selectEditorProviders } from './app/editor-providers';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import 'hammerjs';

if (environment.production) {
  enableProdMode();
}

async function startEditor(): Promise<void> {
  const nativeRequested =
    !environment.production && new URLSearchParams(location.search).get('editor') === 'native';
  const native = nativeRequested
    ? (await import('./app/native-editor-providers')).NATIVE_EDITOR_PROVIDERS
    : undefined;
  await bootstrapApplication(AppComponent, {
    providers: [
      ...selectEditorProviders(location.search, environment.production, {
        legacy: LEGACY_CHROME_PROVIDERS,
        native,
      }),
      provideZoneChangeDetection(),
      provideAnimations(),
      provideHttpClient(withXhr(), withInterceptorsFromDi()),
    ],
  });
}
void startEditor().catch((err) => console.error(err));
