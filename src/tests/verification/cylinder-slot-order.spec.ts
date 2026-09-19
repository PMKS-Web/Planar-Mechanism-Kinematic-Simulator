// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { Cylinder, cylindersIn } from '../../app/model/cylinder';
import { LEGACY_TEMPLATE_PAYLOADS } from '../../test-data/legacy-payloads';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { FIXTURE_GALLERY, fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';

/**
 * Every cylinder anyone can already open, read by the slot's order rather than
 * by measuring — and answering what the measuring answered.
 *
 * Stage 2 of `docs/joint-type-and-cylinder-plan.md` made `slotJointA` the mount
 * and `slotJointB` the inner end (decision S1), and left the old distance rule
 * alive in exactly one place: the reader, which puts an old payload's slot in
 * that order once, on decode. This is what says the two rules agree about every
 * payload in circulation — the seventeen bytes a shipped release emitted, the
 * templates the app writes today, and every gallery fixture with a cylinder in
 * it.
 *
 * The old rule is written out here rather than imported, because the point is
 * to compare against something that is gone.
 */
function mountByTheOldRule(cylinder: Cylinder): Joint {
  const from = cylinder.mountB;
  const reach = (end: Joint) => Math.hypot(end.x - from.x, end.y - from.y);
  return reach(cylinder.mountA) >= reach(cylinder.inner) ? cylinder.mountA : cylinder.inner;
}

function agreesAbout(payload: string): { cylinders: number; disagreements: string[] } {
  const { service } = buildMechanismFixture(payload);
  const found = cylindersIn(service.joints);
  return {
    cylinders: found.length,
    disagreements: found
      .filter((cylinder) => mountByTheOldRule(cylinder).id !== cylinder.mountA.id)
      .map((cylinder) => `${cylinder.barrel.id}: A is ${cylinder.mountA.id}`),
  };
}

describe('the slot order every payload in circulation decodes to', () => {
  for (const [name, payload] of Object.entries(LEGACY_TEMPLATE_PAYLOADS)) {
    it(`${name}, as a release before Stage 1 emitted it`, () => {
      expect(agreesAbout(payload).disagreements).toEqual([]);
    });
  }

  for (const [name, payload] of Object.entries(TEMPLATE_LINKAGES)) {
    it(`${name}, as the app writes it today`, () => {
      expect(agreesAbout(payload).disagreements).toEqual([]);
    });
  }

  for (const entry of FIXTURE_GALLERY) {
    it(`the ${entry.name} fixture`, () => {
      expect(agreesAbout(fixturePayload(entry.fixture)).disagreements).toEqual([]);
    });
  }

  it('is asked about cylinders at all', () => {
    // A guard on the guard: every assertion above passes trivially if nothing
    // decodes to a cylinder, and the whole suite would then go on passing
    // through a change that stopped cylinders resolving.
    const withCylinders = FIXTURE_GALLERY.filter(
      (entry) => agreesAbout(fixturePayload(entry.fixture)).cylinders > 0
    );
    expect(withCylinders.length).toBeGreaterThan(3);
  });
});
