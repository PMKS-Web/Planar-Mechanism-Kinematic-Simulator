export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/** Local origin and +x direction are fixed by each body's two frame joint ids. */
export type ApplicationPoint =
  | { readonly frame: 'global'; readonly positionM: Vector2 }
  | { readonly frame: 'link'; readonly positionM: Vector2 };

export type AppliedLoad =
  | {
      readonly kind: 'point-force';
      readonly linkId: string;
      readonly at: ApplicationPoint;
      readonly forceN: Vector2;
      readonly directionFrame: 'global' | 'link';
    }
  | { readonly kind: 'moment'; readonly linkId: string; readonly momentNm: number };

export interface LoadCase {
  readonly name: string;
  readonly loads: readonly AppliedLoad[];
  /** Absent disables gravity. Acceleration in global axes, m/s². */
  readonly gravityMPerS2?: Vector2;
}

export function finiteVector(value: Vector2): boolean {
  return !!value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

export function validateLoadCase(loadCase: LoadCase): void {
  if (
    !loadCase ||
    typeof loadCase.name !== 'string' ||
    !loadCase.name.trim() ||
    !Array.isArray(loadCase.loads)
  )
    throw new Error('A load case needs a name and a load list.');
  if (loadCase.gravityMPerS2 !== undefined && !finiteVector(loadCase.gravityMPerS2)) {
    throw new Error('Gravity must be a finite acceleration vector.');
  }
  for (const load of loadCase.loads) {
    if (!load || typeof load.linkId !== 'string' || !load.linkId) {
      throw new Error('Each load must identify its target link.');
    }
    if (load.kind === 'moment') {
      if (!Number.isFinite(load.momentNm)) throw new Error('An applied moment must be finite.');
    } else if (load.kind === 'point-force') {
      if (
        !load.at ||
        !['global', 'link'].includes(load.at.frame) ||
        !finiteVector(load.at.positionM) ||
        !finiteVector(load.forceN) ||
        !['global', 'link'].includes(load.directionFrame)
      ) {
        throw new Error('A point force needs finite components and explicit coordinate frames.');
      }
    } else {
      throw new Error('Unsupported load type.');
    }
  }
}
