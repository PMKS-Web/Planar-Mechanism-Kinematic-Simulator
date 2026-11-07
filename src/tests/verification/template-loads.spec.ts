// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { RealJoint } from '../../app/model/joint';
import {
  LIBRARY_TEMPLATE_IDS,
  TEMPLATE_LINKAGES,
} from '../../app/component/MODALS/templates/template-linkages';
import { barHalfWidth } from '../../app/model/joint-marks';
import { SettingsService } from '../../app/services/settings.service';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';

/**
 * No library template puts a load on a joint two bodies share.
 *
 * A force belongs to one link, and the app has no gesture that sets one down
 * on a pin another link also meets at: the reader would see a load that seems
 * to act on both bodies, and could not draw one like it. Read off the
 * published payload, and counted as on the joint while the application point
 * is inside the pin's end cap, because that is where it looks as if it is.
 */
describe('where a library template applies its loads', () => {
  for (const id of LIBRARY_TEMPLATE_IDS) {
    it(`keeps every load in ${id} off the joints its bodies share`, () => {
      const { service } = buildMechanismFixture(TEMPLATE_LINKAGES[id]);
      const reach = barHalfWidth(SettingsService.objectScale);
      const onShared = service.forces.flatMap((force) =>
        service.joints
          .filter((joint) => joint instanceof RealJoint && joint.links.length > 1)
          .filter(
            (joint) =>
              Math.hypot(force.startCoord.x - joint.x, force.startCoord.y - joint.y) < reach
          )
          .map((joint) => `${force.name || force.id} on ${joint.id}`)
      );
      expect(onShared).toEqual([]);
    });
  }
});
