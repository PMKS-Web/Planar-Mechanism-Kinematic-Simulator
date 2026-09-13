/// <reference path = "typings.d.ts" />
import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';

import { environment } from './environments/environment';
import 'hammerjs';

if (environment.production) {
  enableProdMode();
}

const native =
  !environment.production && new URLSearchParams(location.search).get('editor') === 'native';
const root = native
  ? import('./app/component/native-editor/native-editor.component').then(
      (module) => module.NativeEditorComponent
    )
  : import('./app/app.component').then((module) => module.AppComponent);

root
  .then((component) =>
    bootstrapApplication(component, {
      providers: [
        provideZoneChangeDetection(),
        provideAnimations(),
        provideHttpClient(withXhr(), withInterceptorsFromDi()),
      ],
    })
  )
  .catch((err) => console.error(err));
