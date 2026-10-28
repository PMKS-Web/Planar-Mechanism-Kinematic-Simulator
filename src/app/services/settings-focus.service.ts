import { Injectable, signal } from '@angular/core';

/**
 * A request, from outside the Settings drawer, to show its unit choices.
 *
 * A pending flag rather than an event, because the drawer's panel may not exist
 * yet when the request is made: the bottom bar opens the drawer and asks in the
 * same click, and the panel is created a render later. Whichever panel is there
 * to see the flag answers it and clears it.
 */
@Injectable({ providedIn: 'root' })
export class SettingsFocusService {
  readonly unitsWanted = signal(false);

  showUnits(): void {
    this.unitsWanted.set(true);
  }
}
