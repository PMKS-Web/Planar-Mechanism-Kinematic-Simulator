import { Injectable, signal } from '@angular/core';
import { Force } from '../model/force';

/** Field hover/focus owns the temporary force-angle explanation. */
@Injectable({ providedIn: 'root' })
export class ForceGuideService {
  readonly force = signal<Force | undefined>(undefined);
}
