import { FormBuilder } from '@angular/forms';
import { AnalysisGraphComponent } from '../../app/component/analysis-graph/analysis-graph.component';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { RealJoint } from '../../app/model/joint';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { AnalysisCompareService } from '../../app/services/analysis-compare.service';
import { AnalysisSampleService } from '../../app/services/analysis-sample.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { NumberUnitParserService } from '../../app/services/number-unit-parser.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { createMechanismHarness, withTestInjector } from '../../test-utils/mechanism-harness';

/**
 * The pins at the ends of a bar that is anchored at every joint.
 *
 * The library's gripper rides two of them: each jaw runs along a rail pinned
 * to the frame top and bottom. A bar like that is the world rather than a
 * body, so the partitioner hands it to the machine that runs along it without
 * giving it to that machine -- it is in `partition.joints` and not in
 * `ownJoints`, which is what keeps a neighbor's driven joint from being read
 * as this machine's input.
 *
 * Every analysis question used to go through ownership, and ownership says
 * "no machine" for those four pins. The rail's *link* was found anyway, since
 * the index claims `partition.links` and the frame pieces are in it -- so the
 * rail graphed its angle and its center of mass while each of the pins holding
 * its own ends answered fourteen graphs with three empty series and no
 * explanation, and the panel behind them said the mechanism could not be
 * solved about a machine reading Ready.
 */

const RAIL_PINS = ['K', 'L', 'O', 'P'];

function gripper(): { service: MechanismService; graph: AnalysisGraphComponent } {
  const { service, settings, active } = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(TEMPLATE_LINKAGES['Cylinder_Gripper']);
  new MechanismBuilder(service, decoder, settings, active).build(true);
  service.updateMechanism();

  const graph = withTestInjector(
    [
      { provide: FormBuilder, deps: [] },
      { provide: MechanismService, useValue: service },
      { provide: SettingsService, useValue: settings },
      { provide: NumberUnitParserService, deps: [] },
      { provide: AnalysisSampleService, deps: [] },
      // Nothing is under the hand here, so the comparison overlay has nothing
      // to say.
      {
        provide: AnalysisCompareService,
        useValue: {
          live: false,
          record: undefined,
          compare: true,
          register: () => undefined,
          unregister: () => undefined,
          sync: () => undefined,
        } as Partial<AnalysisCompareService>,
      },
    ],
    () => new AnalysisGraphComponent()
  );
  return { service, graph };
}

/** Every plotted point of one graph, as the numbers behind it. */
function plotted(graph: AnalysisGraphComponent): Array<Array<number | null>> {
  return (graph.chartOptions.series ?? []).map((series) =>
    (series.data as unknown as Array<{ y: number | null }>).map((point) => point.y)
  );
}

describe('graphs for the pins holding an anchored rail', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('is frame: solved by the machine, owned by none of them', () => {
    const { service } = gripper();
    expect(service.partitions).toHaveLength(1);
    const partition = service.partitions[0];
    const idsOf = (joints: { id: string }[]) => joints.map((joint) => joint.id);

    for (const id of RAIL_PINS) {
      const pin = service.joints.find((joint) => joint.id === id)!;
      expect(idsOf(partition.joints), `${id} is handed to the machine`).toContain(id);
      expect(idsOf(partition.ownJoints), `${id} is not owned by it`).not.toContain(id);
      expect(service.indexOfMechanismContaining(pin)).toBe(-1);
      expect(service.indexOfMechanismSolving(pin)).toBe(0);
      expect(service.isFramePart(pin)).toBe(true);
      // And so the panels find it: what the whole complaint was about.
      expect(service.mechanismForId(id)).toBe(service.mechanisms[0]);
      expect(service.isPartSimulatable(pin)).toBe(true);
    }
  });

  it('draws every joint of the gripper, rather than an empty chart for four of them', () => {
    const { service, graph } = gripper();
    const samples = service.mechanisms[0].joints.length;
    expect(samples).toBeGreaterThan(100);

    for (const joint of service.joints) {
      for (const property of ['Linear Joint Pos', 'Linear Joint Vel', 'Linear Joint Acc']) {
        graph.determineChart('kinematic', 'loop', property, joint.id);
        const series = plotted(graph);
        expect(series.length, `${joint.id} ${property} has series`).toBeGreaterThan(0);
        for (const line of series) {
          expect(line, `${joint.id} ${property} is plotted at every sample`).toHaveLength(samples);
          expect(
            line.every((value) => Number.isFinite(value)),
            `${joint.id} ${property} is finite throughout`
          ).toBe(true);
        }
      }
    }
  });

  it('reads a rail pin as standing still, the way it reads any other ground pin', () => {
    const { service, graph } = gripper();
    const pin = service.joints.find((joint) => joint.id === 'K') as RealJoint;
    expect(pin.ground).toBe(true);

    graph.determineChart('kinematic', 'loop', 'Linear Joint Pos', 'K');
    const [x, y] = plotted(graph);
    // One place, held for the whole cycle -- and it is the pin's own place.
    expect(new Set(x).size).toBe(1);
    expect(new Set(y).size).toBe(1);
    const solvedK = service.mechanisms[0].joints[0].find((joint) => joint.id === 'K')!;
    expect(x[0]).toBeCloseTo(solvedK.x / MODEL_SCALE, 6);

    for (const property of ['Linear Joint Vel', 'Linear Joint Acc']) {
      graph.determineChart('kinematic', 'loop', property, 'K');
      expect(
        plotted(graph).every((line) => line.every((value) => value === 0)),
        `${property} is zero all cycle`
      ).toBe(true);
    }
  });

  it('declines the reaction graph with a sentence, instead of a chart of nothing', () => {
    const { service, graph } = gripper();
    // Statics writes no equation at a pin holding the world down, so there is
    // genuinely nothing to plot -- the panel has to say so rather than draw an
    // empty chart the reader cannot tell from a broken one.
    const index = service.mechanisms[0].getForceAnalysis('static').reactionIndex;

    for (const id of RAIL_PINS) {
      expect(index.linksByJoint.get(id)).toBeUndefined();
      for (const mode of ['static', 'dynamic']) {
        graph.determineChart('force', mode, 'Joint Forces', id);
        expect(graph.analysisDiagnostic, `${id} ${mode} explains itself`).toContain('frame');
        expect(plotted(graph).every((line) => line.every((value) => value === null))).toBe(true);
      }
    }
    // And the sentence is about the frame, not the count of parts at the pin:
    // two of them meet at K, so "only one part meets it" would send the reader
    // to check something that is not the reason.
    expect(graph.analysisDiagnostic).not.toContain('Only one part meets');
    const moving = service.joints.find((joint) => joint.id === 'S')!;
    expect(service.noReactionSentence(moving, 'this joint')).toContain('Only one part meets');
  });
});
