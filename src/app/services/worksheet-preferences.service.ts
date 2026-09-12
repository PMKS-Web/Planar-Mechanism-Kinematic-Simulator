import { Injectable, signal } from '@angular/core';
import { Mechanism } from '../model/mechanism/mechanism';
import { WorksheetSign } from '../model/mechanism/worksheet-conventions';
import {
  defaultWorksheetLoops,
  replaceWorksheetLoop,
  reverseWorksheetLoop,
  WorksheetLoop,
} from '../model/mechanism/worksheet-loops';

interface Preferences {
  forces: Record<string, WorksheetSign>;
  angular: WorksheetSign;
  angularByBody: Record<string, WorksheetSign>;
  momentPoints: Record<string, string>;
  loops: WorksheetLoop[];
}

/** Worksheet-only choices shared by the side panel and dialog, isolated per mechanism. */
@Injectable({ providedIn: 'root' })
export class WorksheetPreferencesService {
  readonly revision = signal(0);
  private readonly records = new WeakMap<Mechanism, Preferences>();
  get(mechanism: Mechanism): Preferences {
    this.revision();
    let state = this.records.get(mechanism);
    if (!state) {
      state = {
        forces: {},
        angular: 1,
        angularByBody: {},
        momentPoints: {},
        loops: defaultWorksheetLoops(mechanism.requiredLoops),
      };
      this.records.set(mechanism, state);
    }
    return state;
  }
  setForce(mechanism: Mechanism, key: string, sign: WorksheetSign) {
    this.get(mechanism).forces[key] = sign;
    this.revision.update((n) => n + 1);
  }
  setAngular(mechanism: Mechanism, sign: WorksheetSign) {
    this.get(mechanism).angular = sign;
    this.get(mechanism).angularByBody = {};
    this.revision.update((n) => n + 1);
  }
  setMomentPoint(mechanism: Mechanism, body: string, point: string) {
    this.get(mechanism).momentPoints[body] = point;
    this.revision.update((n) => n + 1);
  }
  setBodyAngular(mechanism: Mechanism, body: string, sign: WorksheetSign) {
    this.get(mechanism).angularByBody[body] = sign;
    this.revision.update((n) => n + 1);
  }
  setLoop(mechanism: Mechanism, index: number, path: string) {
    const state = this.get(mechanism);
    const result = replaceWorksheetLoop(mechanism, state.loops, index, path);
    if (!result.loop) return result.reason;
    state.loops[index] = result.loop;
    this.revision.update((n) => n + 1);
    return undefined;
  }
  reverseLoop(mechanism: Mechanism, index: number) {
    const state = this.get(mechanism);
    state.loops[index] = reverseWorksheetLoop(state.loops[index]);
    this.revision.update((n) => n + 1);
  }
  reset(mechanism: Mechanism) {
    this.records.delete(mechanism);
    this.revision.update((n) => n + 1);
  }
}
