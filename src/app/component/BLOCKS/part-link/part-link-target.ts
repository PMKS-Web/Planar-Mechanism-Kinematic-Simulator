import { InjectionToken } from '@angular/core';
import type { Joint } from '../../../model/joint';
import type { Link } from '../../../model/link';

/**
 * What a `part-link` does with its part, supplied by whoever hosts it.
 *
 * The block names a part and hands the gestures on: it does not know where the
 * drawing is or how a selection is made, so it can sit in any panel, and the
 * component gallery can show it without building a mechanism. The app supplies
 * `PartNavigationService` at bootstrap.
 */
export interface PartLinkTarget {
  /** Light the part on the grid while it is pointed at, and nothing once it is not. */
  point(part: Joint | Link | undefined): void;
  /** Take the reader to the part: select it where it can be changed. */
  open(part: Joint | Link): void;
}

export const PART_LINK_TARGET = new InjectionToken<PartLinkTarget>('PartLinkTarget');
