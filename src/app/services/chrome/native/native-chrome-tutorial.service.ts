import { Injectable } from '@angular/core';
import type { ChromeTutorial } from '../chrome-tutorial';

@Injectable({ providedIn: 'root' })
export class NativeChromeTutorialService implements ChromeTutorial {
  started = false;
  exited = false;
  onScreen = false;
  start() {
    this.started = true;
    this.exited = false;
  }
  exit() {
    this.exited = true;
  }
}
