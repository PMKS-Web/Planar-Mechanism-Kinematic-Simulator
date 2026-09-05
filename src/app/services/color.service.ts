import { Injectable } from '@angular/core';
import {
  DEFAULT_FORCE_COLOR,
  JointFamily,
  JOINT_FAMILIES,
  PART_COLORS,
} from '../model/joint-colors';

export {
  JOINT_FAMILIES,
  SELECTION_RING,
  PART_COLORS,
  DEFAULT_FORCE_COLOR,
} from '../model/joint-colors';
export type { JointFamily } from '../model/joint-colors';

@Injectable({
  providedIn: 'root',
})
export class ColorService {
  //Create a static instance of the color service
  public static instance: ColorService;

  constructor() {
    //Create a static instance of the color service
    ColorService.instance = this;
  }

  private linkColorOptions: string[] = [...PART_COLORS];

  /**
   * The families a joint can be drawn in, each a set of three.
   *
   * A joint is drawn resting, pointed at and picked, and those only read as one
   * object in three moods if they come from one family -- so choosing a color
   * for a joint chooses all three at once, not a fill.
   *
   * Amber through brown: warm, complementary to the indigo and teal the links
   * are drawn in, and none of it competing with the link palette. Amber is
   * first and is what every joint is drawn in until somebody says otherwise,
   * so the same row that puts a color on a joint takes it off again.
   */
  private jointFamilies: readonly JointFamily[] = JOINT_FAMILIES;

  public getJointFamilies(): readonly JointFamily[] {
    return this.jointFamilies;
  }

  /** The family a joint belongs to; the first for anything unrecognised. */
  public jointFamily(id: string): JointFamily {
    return this.jointFamilies.find((family) => family.id === id) ?? this.jointFamilies[0];
  }

  public getJointColorOptions(): string[] {
    return this.jointFamilies.map((family) => family.normal);
  }

  public getIndexFromJointFamily(id: string): number {
    const at = this.jointFamilies.findIndex((family) => family.id === id);
    return at === -1 ? 0 : at;
  }

  public getJointFamilyFromIndex(index: number): string {
    return (this.jointFamilies[index] ?? this.jointFamilies[0]).id;
  }

  /** The same six the links use. A force is read against the link it acts on. */
  private forceColorOptions: string[] = [...PART_COLORS];

  private linkLastColorIndex = 0;

  public getNextLinkColor(): string {
    let color = this.linkColorOptions[this.linkLastColorIndex];
    this.linkLastColorIndex = (this.linkLastColorIndex + 1) % this.linkColorOptions.length;
    return color;
  }

  /**
   * The color the next link will be, without taking it.
   *
   * For the previews the creation gestures draw. A ghost is a promise about
   * what the click will make, and a ghost in some other color than the part
   * turns out to be is a promise broken at the moment it is kept — but asking
   * for the color the ordinary way would spend it, so a canceled gesture
   * would silently shuffle every color after it.
   */
  public peekNextLinkColor(): string {
    return this.linkColorOptions[this.linkLastColorIndex];
  }

  public getLinkColorOptions(): string[] {
    return this.linkColorOptions;
  }

  public getForceColorOptions(): string[] {
    return this.forceColorOptions;
  }

  /**
   * The force color that stands out most against a link's fill.
   *
   * The forces' palette is the links' palette, and the shared default is one
   * of its navies -- so a force dropped on a navy link vanished into it. Each
   * option is scored by its distance in Lab from the fill, which is the
   * nearest cheap thing to how far apart two colors look, and the farthest
   * wins. Returns '' when that is the shared default, so a drawing that never
   * needed a color of its own keeps saying nothing about one.
   */
  contrastingForceColor(fill: string): string {
    const target = lab(fill);
    if (!target) return '';
    let best = DEFAULT_FORCE_COLOR;
    let bestDistance = -1;
    for (const option of this.forceColorOptions) {
      const candidate = lab(option);
      if (!candidate) continue;
      const distance = Math.hypot(
        candidate[0] - target[0],
        candidate[1] - target[1],
        candidate[2] - target[2]
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        best = option;
      }
    }
    return best.toLowerCase() === DEFAULT_FORCE_COLOR.toLowerCase() ? '' : best;
  }

  getIndexFromLinkColor(fill: string) {
    return this.linkColorOptions.indexOf(fill);
  }

  getIndexFromForceColor(fill: string) {
    // An empty color is the default, which is one of the six -- so the picker
    // always has exactly one swatch ticked, whether or not anybody has chosen.
    const wanted = (fill || DEFAULT_FORCE_COLOR).toLowerCase();
    const at = this.forceColorOptions.findIndex((option) => option.toLowerCase() === wanted);
    return at === -1 ? this.forceColorOptions.indexOf(DEFAULT_FORCE_COLOR) : at;
  }

  getLinkColorFromIndex(index: number) {
    return this.linkColorOptions[index];
  }

  getForceColorFromIndex(index: number) {
    return this.forceColorOptions[index] ?? DEFAULT_FORCE_COLOR;
  }
}

/** sRGB hex to CIE Lab, D65. Enough to say which of six colors is farthest. */
function lab(hex: string): [number, number, number] | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  const channel = (at: number) => {
    const c = parseInt(match[1].slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [channel(0), channel(2), channel(4)];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
