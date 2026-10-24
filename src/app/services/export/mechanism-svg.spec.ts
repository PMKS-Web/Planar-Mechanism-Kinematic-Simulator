import { buildMechanismFixture } from '../../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { RealLink } from '../../model/link';
import { paintCylinderMember } from '../../model/cylinder-skin';
import { mechanismSvg } from './mechanism-svg';

/**
 * Page one of a report is a skeleton drawn from the record, and the record is
 * not always what the canvas shows.
 */
describe('the report drawing of a mechanism', () => {
  /** The stroke of every bar in the drawing, by the order the links are in. */
  function inks(payload: string): string[] {
    const built = buildMechanismFixture(payload);
    const svg = mechanismSvg(built.service.joints, built.service.links, 330, 230);
    return [...svg.matchAll(/stroke="(#[0-9a-fA-F]{6})"/g)]
      .map((match) => match[1])
      .filter((ink) => ink !== '#2c2c2c');
  }

  it('paints a rod in the ink the canvas shows, not the one it has on file', () => {
    // A rod carries a palette color from the moment it is created and the skin
    // has never drawn it: a rod that has chosen nothing is drawn in its
    // barrel's (decision S15). Reading `fill` straight off the link put a mint
    // rod beside a navy barrel on page one -- a pair that is nowhere in the
    // drawing the report is about.
    const built = buildMechanismFixture(TEMPLATE_LINKAGES['Cylinder_Boom']);
    const cylinder = built.service.sealedStructures()[0];
    const barrel = cylinder.barrel as RealLink;
    expect(cylinder.rod.ownColor).toBe(false);
    expect(cylinder.rod.fill).not.toBe(barrel.fill);

    const svg = mechanismSvg(built.service.joints, built.service.links, 330, 230);
    const drawn = [...svg.matchAll(/stroke="(#[0-9a-fA-F]{6})"/g)].map((match) => match[1]);
    expect(drawn).toContain(barrel.fill);
    expect(drawn).not.toContain(cylinder.rod.fill);
  });

  it('and paints it in its own the moment somebody gives it one', () => {
    const built = buildMechanismFixture(TEMPLATE_LINKAGES['Cylinder_Boom']);
    const cylinder = built.service.sealedStructures()[0];
    paintCylinderMember(cylinder.rod, '#ff00aa', cylinder);

    const svg = mechanismSvg(built.service.joints, built.service.links, 330, 230);
    expect(svg).toContain('stroke="#ff00aa"');
  });

  it('leaves a drawing with no cylinder in it painted exactly as before', () => {
    // The rule costs nothing where there is nothing to hide: an ordinary bar's
    // own fill is what `fillShownOn` answers with.
    const built = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const fills = built.service.links
      .filter((link): link is RealLink => link instanceof RealLink)
      .map((link) => link.fill);
    expect(inks(TEMPLATE_LINKAGES['4-Bar'])).toEqual(fills);
  });

  it('draws no pin and no letter at the joint a cylinder buries', () => {
    // N has no marker and no letter anywhere in the app (D14, S11), and the
    // skeleton wrote its interior name beside a pin of its own.
    const built = buildMechanismFixture(TEMPLATE_LINKAGES['Excavator_Bucket']);
    const buried = built.service.sealedStructures()[0].inner;
    const svg = mechanismSvg(built.service.joints, built.service.links, 330, 230);

    expect(buried.id.length).toBeGreaterThan(1);
    expect(svg).not.toContain(`>${buried.id}<`);
    // The barrel is still drawn between its two ends: what goes is the pin and
    // the label, not the bar.
    expect(svg).toContain('<polyline');
  });
});
