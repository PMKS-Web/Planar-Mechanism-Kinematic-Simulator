import type { CrossSection } from './cross-section';
import { sectionProperties } from './cross-section';

/** SI storage, independent of the drawing's display units. No assumed material defaults. */
export interface MaterialProperties {
  readonly name: string;
  readonly elasticModulusPa?: number;
  readonly poissonRatio?: number;
  readonly densityKgM3?: number;
  readonly yieldStrengthPa?: number;
  readonly ultimateStrengthPa?: number;
}

/** Existing Link.mass, massMoI and CoM remain the single source of mass data. */
export interface StructuralProperties {
  readonly material?: MaterialProperties;
  readonly crossSection?: CrossSection;
}

export function validateStructuralProperties(properties: StructuralProperties): void {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new Error('Structural properties must be an object.');
  }
  const material = properties.material;
  if (material !== undefined) {
    if (!material || typeof material.name !== 'string' || !material.name.trim()) {
      throw new Error('A material needs a name.');
    }
    for (const value of [
      material.elasticModulusPa,
      material.densityKgM3,
      material.yieldStrengthPa,
      material.ultimateStrengthPa,
    ]) {
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        throw new Error('Material properties must be finite and positive.');
      }
    }
    if (
      material.poissonRatio !== undefined &&
      (!Number.isFinite(material.poissonRatio) ||
        material.poissonRatio <= -1 ||
        material.poissonRatio >= 0.5)
    ) {
      throw new Error('Poisson ratio must be between -1 and 0.5 for an isotropic material.');
    }
    if (
      material.yieldStrengthPa !== undefined &&
      material.ultimateStrengthPa !== undefined &&
      material.yieldStrengthPa > material.ultimateStrengthPa
    ) {
      throw new Error('Yield strength cannot exceed ultimate strength.');
    }
  }
  if (properties.crossSection !== undefined) sectionProperties(properties.crossSection);
}
