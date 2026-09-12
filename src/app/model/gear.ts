/** A gear adds pitch geometry to an existing rigid body; it is not another body. */
export interface Gear {
  readonly id: string;
  readonly hostLinkId: string;
  readonly centerJointId: string;
  readonly referenceJointId: string;
  readonly teeth: number;
  /** Pitch diameter per tooth, in model length units. */
  readonly module: number;
  readonly name?: string;
}

export interface GearMesh {
  readonly id: string;
  readonly gearAId: string;
  readonly gearBId: string;
  readonly kind: 'external';
}

export interface GearAssembly {
  readonly gears: readonly Gear[];
  readonly meshes: readonly GearMesh[];
}

export function gearPitchRadius(gear: Gear): number {
  return (gear.module * gear.teeth) / 2;
}
