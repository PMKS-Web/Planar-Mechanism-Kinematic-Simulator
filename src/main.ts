/// <reference path = "typings.d.ts" />
import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';

import { AppComponent } from './app/app.component';
import { PART_LINK_TARGET } from './app/component/BLOCKS/part-link/part-link-target';
import { PartNavigationService } from './app/services/part-navigation.service';
import { environment } from './environments/environment';
import 'hammerjs';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    provideAnimations(),
    provideHttpClient(withXhr(), withInterceptorsFromDi()),
    // A part named in a panel's text is a link to it, and this is where it goes.
    { provide: PART_LINK_TARGET, useExisting: PartNavigationService },
  ],
}).catch((err) => console.error(err));
