import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { Analytics, getAnalytics, isSupported, logEvent } from 'firebase/analytics';
import { environment } from '../../environments/environment';

/*
 * Thin wrapper around Firebase Analytics using the framework-agnostic firebase
 * JS SDK. Replaces @angular/fire, whose Angular peer range lags the framework
 * and blocked the Angular 21+ upgrade.
 */
@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private analytics: Analytics | undefined;

  constructor() {
    // Analytics is unavailable in some contexts (tests, blocked cookies,
    // unsupported browsers) — the app must not break because of tracking.
    isSupported()
      .then((supported) => {
        if (supported) {
          this.analytics = getAnalytics(initializeApp(environment.firebase));
        }
      })
      .catch(() => undefined);
  }

  logEvent(eventName: string) {
    if (this.analytics) {
      logEvent(this.analytics, eventName);
    }
  }
}
