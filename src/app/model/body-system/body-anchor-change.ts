import { DriverId } from './body-id';

export interface BodyAnchorChange {
  readonly driverId: DriverId;
  readonly status:
    | 'retained'
    | 'unreachable'
    | 'anchor-unsolved'
    | 'motion-unavailable'
    | 'coordinate-changed'
    | 'drive-removed';
  readonly previous?: number;
  readonly anchor: number;
}

/** A numerical failure must not tell the reader the old start is mechanically impossible. */
export function bodyAnchorNotice(change: BodyAnchorChange): string | undefined {
  switch (change.status) {
    case 'drive-removed':
      return 'The input was removed. This pose is now the start.';
    case 'retained':
      return undefined;
    case 'unreachable':
      return 'The original starting pose is outside the new travel. This pose is now the start.';
    case 'anchor-unsolved':
      return 'The original starting pose could not be recovered. This pose is now the start.';
    case 'motion-unavailable':
      return 'Motion is unavailable after this edit. This pose is now the start.';
    case 'coordinate-changed':
      return 'The input coordinate changed. This pose is now the start.';
  }
}
