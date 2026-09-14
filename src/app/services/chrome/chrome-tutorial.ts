import { InjectionToken, inject } from '@angular/core';
import { TutorialService } from '../tutorial.service';

export interface ChromeTutorial {
  readonly started: boolean;
  readonly exited: boolean;
  onScreen: boolean;
  start(): void;
  exit(): void;
}
export const CHROME_TUTORIAL = new InjectionToken<ChromeTutorial>('CHROME_TUTORIAL', {
  providedIn: 'root',
  factory: () => inject(TutorialService),
});
