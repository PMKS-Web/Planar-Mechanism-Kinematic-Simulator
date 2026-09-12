/** Dimensions are meters; bending is about the centroidal out-of-plane z axis. */
export type CrossSection =
  | { readonly kind: 'rectangle'; readonly widthM: number; readonly heightM: number }
  | { readonly kind: 'circle'; readonly diameterM: number };

export interface SectionProperties {
  readonly areaM2: number;
  readonly secondMomentM4: number;
  readonly extremeFiberM: number;
  readonly sectionModulusM3: number;
}

/** The height is the in-plane bending depth; width is perpendicular to the mechanism plane. */
export function sectionProperties(section: CrossSection): SectionProperties {
  let areaM2: number;
  let secondMomentM4: number;
  let extremeFiberM: number;
  if (section.kind === 'rectangle') {
    positive(section.widthM);
    positive(section.heightM);
    areaM2 = section.widthM * section.heightM;
    secondMomentM4 = (section.widthM * section.heightM ** 3) / 12;
    extremeFiberM = section.heightM / 2;
  } else if (section.kind === 'circle') {
    positive(section.diameterM);
    areaM2 = (Math.PI * section.diameterM ** 2) / 4;
    secondMomentM4 = (Math.PI * section.diameterM ** 4) / 64;
    extremeFiberM = section.diameterM / 2;
  } else {
    throw new Error('Unsupported cross section.');
  }
  const sectionModulusM3 = secondMomentM4 / extremeFiberM;
  [areaM2, secondMomentM4, extremeFiberM, sectionModulusM3].forEach(positive);
  return { areaM2, secondMomentM4, extremeFiberM, sectionModulusM3 };
}

function positive(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Section dimensions and properties must be finite and positive.');
  }
}
