// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { cylindersIn } from '../../app/model/cylinder';
import { barrelFillOf, rodFillOf } from '../../app/model/cylinder-skin';
import { LEGACY_TEMPLATE_PAYLOADS } from '../../test-data/legacy-payloads';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { FIXTURE_GALLERY, fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';

/**
 * Every cylinder anyone can already open still paints its rod in its barrel's
 * color (decision S15).
 *
 * The rod's color became readable in Stage 2, and that is exactly the danger:
 * a rod has carried a fill since the format was written, because creation hands
 * every new link the next color off the palette — and the skin has never drawn
 * it. Every one of the payloads below therefore stores a rod color that differs
 * from its barrel's, and a build that simply believed it would recolor every
 * shared link and every card in the library at once.
 *
 * `ownColor` is what stands between the two, and this is what says it holds for
 * the drawings in circulation rather than only for the one in a unit fixture:
 * the bytes a shipped release emitted, the templates the app writes today, and
 * every gallery fixture with a cylinder in it.
 */

interface Reading {
  cylinders: number;
  /** Members drawn in a color nobody chose for them. */
  repainted: string[];
  /** Rods carrying a color that the skin has never drawn — the whole hazard. */
  strayColors: number;
}

function reading(payload: string): Reading {
  const { service } = buildMechanismFixture(payload);
  const found = cylindersIn(service.joints);
  return {
    cylinders: found.length,
    repainted: found
      .filter((cylinder) => cylinder.rod.ownColor || rodFillOf(cylinder) !== barrelFillOf(cylinder))
      .map(
        (cylinder) => `${cylinder.rod.id}: ${rodFillOf(cylinder)} beside ${barrelFillOf(cylinder)}`
      ),
    strayColors: found.filter((cylinder) => cylinder.rod.fill !== barrelFillOf(cylinder)).length,
  };
}

describe("every cylinder in circulation keeps its barrel's color on its rod", () => {
  for (const [name, payload] of Object.entries(LEGACY_TEMPLATE_PAYLOADS)) {
    it(`${name}, as a release before Stage 1 emitted it`, () => {
      expect(reading(payload).repainted).toEqual([]);
    });
  }

  for (const [name, payload] of Object.entries(TEMPLATE_LINKAGES)) {
    it(`${name}, as the app writes it today`, () => {
      expect(reading(payload).repainted).toEqual([]);
    });
  }

  for (const entry of FIXTURE_GALLERY) {
    it(`the ${entry.name} fixture`, () => {
      expect(reading(fixturePayload(entry.fixture)).repainted).toEqual([]);
    });
  }

  it('is asked about cylinders that really do store a second color', () => {
    // A guard on the guard, twice over. Every assertion above passes trivially
    // if nothing decodes to a cylinder — and it passes just as trivially if the
    // rods happen to store the color they are drawn in, which is the one case
    // where believing the record would be harmless. Neither is true, and this
    // is what would say so if it stopped being true.
    const payloads = [
      ...Object.values(LEGACY_TEMPLATE_PAYLOADS),
      ...Object.values(TEMPLATE_LINKAGES),
    ].map(reading);
    const withCylinders = payloads.filter((one) => one.cylinders > 0);
    expect(withCylinders.length).toBeGreaterThan(3);
    expect(
      withCylinders.reduce((sum, one) => sum + one.strayColors, 0),
      'rods storing a color the skin has never drawn'
    ).toBeGreaterThan(3);
  });
});
