import '../../model/joint';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import { structuralCrankFixture } from '../../../test-utils/verification/structural-fixtures';
import { crankCycle } from '../../../test-utils/verification/cycle-verification';
import { createMechanismHarness } from '../../../test-utils/mechanism-harness';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { LengthUnit } from '../../model/unit-enums';
import { MODEL_SCALE } from '../../model/render-scale';
import { RealLink } from '../../model/link';
import { analyzePmksCycle } from '../../model/structural/pmks-cycle-analysis';
import { StringTranscoder } from './string-transcoder';
import { MechanismBuilder } from './mechanism-builder';

it('surfaces legacy custom-inertia URL rounding as S3 cycle failures and leaves URL bytes unchanged', () => {
  const fixture = structuralCrankFixture();
  fixture.load = undefined;
  fixture.joints[1].x = 2 * MODEL_SCALE;
  fixture.links[0] = { joints: 'AB', mass: 2, moi: 2 / 3, com: [MODEL_SCALE, 0] };
  const built = buildMechanism(fixture);
  (built.links[0] as RealLink).moiIsCustom = true;
  const source = createMechanismHarness();
  source.settings.lengthUnit.next(LengthUnit.METER);
  source.service.joints = built.joints;
  source.service.links = built.links;
  source.service.forces = [];
  source.service.updateMechanism();
  const base = { ...crankCycle(), coordinateSpace: 'model' as const, sampleIndices: [0, 30, 90] };
  expect(analyzePmksCycle({ ...base, mechanism: source.service.mechanisms[0] }).status).toBe(
    'complete'
  );
  const url = urlGeneratorFor(source.service, source.settings).generateUrlQuery();
  const decoder = new StringTranscoder();
  decoder.decodeURL(url);
  const target = createMechanismHarness();
  new MechanismBuilder(target.service, decoder, target.settings, target.active).build(true);
  target.service.updateMechanism();
  const restored = target.service.mechanisms[0];
  expect((restored.links[0][0] as RealLink).massMoI).toBe(0.667);
  const result = analyzePmksCycle({ ...base, mechanism: restored });
  expect(result.status).toBe('failed');
  expect(result.coverage.successful).toBe(0);
  for (const sample of result.samples)
    expect(sample).toMatchObject({
      status: 'failed',
      stage: 'member-loads',
      code: 'mass-distribution-mismatch',
    });
  expect(urlGeneratorFor(target.service, target.settings).generateUrlQuery()).toBe(url);
});
