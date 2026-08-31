import { Mechanism } from './mechanism';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { buildMechanismFixture } from '../../../tests/fixtures/mechanism-fixtures';
import { RealLink } from '../link';
import { sealedCylinderStructures } from '../cylinder';

// Imports mirror force-solver.fixture.spec.ts exactly: the model modules form
// a cycle that only initializes cleanly when entered in the order the app
// enters it, and this file's entry point is the fixture builder.
void Mechanism;

describe('cylinder parts arriving from a URL', () => {
  it("migrate to auto: their inertia was never anybody's choice", () => {
    // Nothing that shipped ever offered a field for a sealed part's inertia
    // or center — the values in circulating URLs are fixture defaults. The
    // decoder hands the parts back to their shapes; masses stay as stored,
    // because mass carries no flag and is always somebody's choice.
    const { service } = buildMechanismFixture(TEMPLATE_LINKAGES['Cylinder_Boom']);
    const sealed = sealedCylinderStructures(service.joints);
    expect(sealed.length).toBe(1);
    for (const part of [sealed[0].barrel, sealed[0].rod]) {
      expect(part instanceof RealLink).toBe(true);
      expect((part as RealLink).moiIsCustom).toBe(false);
      expect((part as RealLink).comIsCustom).toBe(false);
    }
    // The ordinary link in the same URL keeps its legacy frozen values.
    const boom = service.links.find(
      (link: unknown) =>
        link instanceof RealLink && !sealed.some((cyl) => cyl.barrel === link || cyl.rod === link)
    ) as RealLink;
    expect(boom.moiIsCustom).toBe(true);
    expect(boom.comIsCustom).toBe(true);
  });
});
