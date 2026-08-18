import { Component, NO_ERRORS_SCHEMA, input } from '@angular/core';
import { AnalysisApexChartComponent } from './analysis-apex-chart.component';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MatIconModule } from '@angular/material/icon';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ApexAxisChartSeries } from 'apexcharts';
import { RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { ForceAnalysisSeries, ForceSolver } from '../../model/mechanism/force-solver';
import { KinematicsSolver } from '../../model/mechanism/kinematic-solver';
import { ForceUnit, LengthUnit } from '../../model/unit-enums';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { BUILT_IN_TEMPLATE_IDS, TEMPLATE_LINKAGES } from '../MODALS/templates/template-linkages';
import {
  buildMechanismFixture,
  COMPLEX_WELDED_MECHANISM,
  LEGACY_FORCE_MECHANISM,
  LOOPLESS_WELDED_MECHANISM,
  MechanismFixture,
} from '../../../tests/fixtures/mechanism-fixtures';
import {
  ANALYSIS_SERIES_COLORS,
  AnalysisGraphComponent,
  formatTimeLabel,
} from './analysis-graph.component';
import { withTestInjector } from '../../../test-utils/mechanism-harness';

@Component({
  selector: 'app-analysis-apex-chart',
  template: '',
})
class ApexChartStubComponent {
  readonly series = input<ApexAxisChartSeries>([]);
  readonly annotations = input<unknown>();
  readonly chart = input<unknown>();
  readonly colors = input<unknown>();
  readonly yaxis = input<unknown>();
  readonly dataLabels = input<unknown>();
  readonly markers = input<unknown>();
  readonly stroke = input<unknown>();
  readonly grid = input<unknown>();
  readonly xaxis = input<unknown>();
  readonly tooltip = input<unknown>();
  readonly legend = input<unknown>();

  addPointAnnotation = vi.fn();
  addXaxisAnnotation = vi.fn();
  clearAnnotations = vi.fn();
  updateOptions = vi.fn();
}

const KINEMATIC_GRAPHS: Array<[string, number]> = [
  ['Linear Joint Pos', 2],
  ['Linear Joint Vel', 3],
  ['Linear Joint Acc', 3],
  ["Linear Link's CoM Pos", 2],
  ["Linear Link's CoM Vel", 3],
  ["Linear Link's CoM Acc", 3],
  ['Angular Link Pos', 1],
  ['Angular Link Vel', 1],
  ['Angular Link Acc', 1],
];

const PRODUCTION_FIXTURES = [
  ...BUILT_IN_TEMPLATE_IDS.map((id) => [id, TEMPLATE_LINKAGES[id]] as const),
  ['complex welded URL', COMPLEX_WELDED_MECHANISM] as const,
  ['loopless welded Safari URL', LOOPLESS_WELDED_MECHANISM] as const,
  ['legacy force URL', LEGACY_FORCE_MECHANISM] as const,
];

function createComponent(fixture: MechanismFixture): AnalysisGraphComponent {
  return withTestInjector(
    [
      { provide: FormBuilder, deps: [] },
      { provide: MechanismService, useValue: fixture.service },
      { provide: SettingsService, useValue: fixture.settings },
      { provide: NumberUnitParserService, deps: [] },
      { provide: AnalysisSampleService, deps: [] },
    ],
    () => new AnalysisGraphComponent()
  );
}

function expectNumericSeries(
  component: AnalysisGraphComponent,
  expectedSeries: number,
  expectedTimes: number[],
  requireFiniteData = false,
  context = ''
): void {
  const series = component.chartOptions.series ?? [];
  expect(series).toHaveLength(expectedSeries);
  expect(series.every((item) => item.data.length === expectedTimes.length)).toBe(true);
  for (const item of series) {
    const points = item.data as unknown as Array<{ x: number; y: number | null }>;
    points.forEach((point, index) => {
      expect(point).toEqual(expect.objectContaining({ x: expect.any(Number) }));
      expect(Number.isFinite(point.x)).toBe(true);
      expect(point.x).toBeCloseTo(expectedTimes[index], 12);
      expect(point.y === null || Number.isFinite(point.y)).toBe(true);
    });
    if (requireFiniteData) {
      expect(
        points.filter((point) => Number.isFinite(point.y)).length,
        `${context}/${item.name}: ${JSON.stringify(points.slice(0, 3))}`
      ).toBeGreaterThanOrEqual(2);
    }
  }
}

/**
 * A partially failed force series is rare but real: the square-rod tangency
 * slider-crank (fixture gallery) goes singular at the one sampled frame where
 * the rod stands square to its guide, and a mechanism drawn exactly at a dead
 * pose fails at frame 0 (square-rod-tangency.spec.ts pins the real case).
 * This spec fabricates the failure instead, the way `analyzeFrame`'s
 * `empty('singular')` fails a frame, so the rendering assertions stay
 * deterministic and independent of solver behavior.
 */
function failForceFrames(
  fixture: MechanismFixture,
  mode: 'static' | 'dynamic',
  indices: number[]
): ForceAnalysisSeries {
  const series = fixture.mechanism.getForceAnalysis(mode);
  for (const index of indices) {
    const frame = series.frames[index];
    frame.status = 'singular';
    frame.jointReactionsByLink = new Map();
    frame.jointReactions = new Map();
    frame.guideCouples = new Map();
    frame.inputEffort = undefined;
    frame.rank = 0;
    frame.residual = Number.POSITIVE_INFINITY;
    frame.message = ForceSolver.statusMessage('singular');
  }
  series.successfulFrames = series.frames.filter((frame) => frame.status === 'ok').length;
  return series;
}

describe('AnalysisGraphComponent production fixtures', () => {
  beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  for (const [fixtureName, payload] of PRODUCTION_FIXTURES) {
    it(`builds every visible graph series for ${fixtureName}`, () => {
      const fixture = buildMechanismFixture(payload);
      const mechanism = fixture.mechanism;
      const component = createComponent(fixture);
      const joint = mechanism.joints[0].find(
        (candidate): candidate is RealJoint => candidate instanceof RealJoint && candidate.ground
      )!;
      const compound = mechanism.links[0].find(
        (candidate): candidate is RealLink =>
          candidate instanceof RealLink && candidate.subset.length > 0
      );
      const link =
        compound ??
        mechanism.links[0].find(
          (candidate): candidate is RealLink => candidate instanceof RealLink
        )!;

      for (const [property, expectedSeries] of KINEMATIC_GRAPHS) {
        const part = property.startsWith('Linear Joint') ? joint.id : link.id;
        component.determineChart('kinematic', 'loop', property, part);
        expectNumericSeries(
          component,
          expectedSeries,
          mechanism.timeNum,
          true,
          `${fixtureName}/${property}`
        );
      }

      for (const analysisType of ['static', 'dynamic'] as const) {
        const forceResult = mechanism.getForceAnalysis(analysisType);
        const sampleFrame = forceResult.frames.find((frame) => frame.status === 'ok');
        expect(
          sampleFrame?.jointReactions.has(joint.id),
          `${fixtureName}/${analysisType}: ${sampleFrame?.status} joints=${[
            ...(sampleFrame?.jointReactions.keys() ?? []),
          ].join(',')}`
        ).toBe(true);
        expect(
          sampleFrame?.jointReactions.get(joint.id)?.every(Number.isFinite),
          `${fixtureName}/${analysisType}: ${sampleFrame?.jointReactions.get(joint.id)}`
        ).toBe(true);
        component.determineChart('force', analysisType, 'Input Effort', joint.id);
        expectNumericSeries(component, 1, mechanism.timeNum, true);
        expect(component.analysisDiagnostic).toBeNull();

        const [reactionData] = component.determineAnalysis(
          'force',
          analysisType,
          'Joint Forces',
          joint.id
        );
        expect(
          reactionData[0].filter(Number.isFinite).length,
          `${fixtureName}/${analysisType}: ${reactionData[0].slice(0, 3)}`
        ).toBeGreaterThanOrEqual(2);
        component.determineChart('force', analysisType, 'Joint Forces', joint.id);
        expectNumericSeries(
          component,
          3,
          mechanism.timeNum,
          true,
          `${fixtureName}/${analysisType}`
        );
        expect(component.analysisDiagnostic).toBeNull();
      }
    });
  }

  it('caches a force solution once per mechanism and mode', () => {
    const analyze = vi.spyOn(ForceSolver, 'analyzeMechanism');
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const input = fixture.mechanism.joints[0].find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    )!;

    component.determineChart('force', 'dynamic', 'Input Effort', input.id);
    component.determineChart('force', 'dynamic', 'Joint Forces', input.id);

    expect(analyze).toHaveBeenCalledTimes(1);
    analyze.mockRestore();
  });

  it('produces mode-dependent dynamic input effort', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const input = fixture.mechanism.joints[0].find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    )!;
    component.determineChart('force', 'static', 'Input Effort', input.id);
    const staticValues = (
      component.chartOptions.series![0].data as unknown as Array<{ y: number }>
    ).map((point) => point.y);
    component.determineChart('force', 'dynamic', 'Input Effort', input.id);
    const dynamicValues = (
      component.chartOptions.series![0].data as unknown as Array<{ y: number }>
    ).map((point) => point.y);

    expect(dynamicValues.some((value, index) => value !== staticValues[index])).toBe(true);
  });

  it('shows a diagnostic instead of an unexplained empty internal-weld reaction graph', () => {
    const fixture = buildMechanismFixture(LOOPLESS_WELDED_MECHANISM);
    const component = createComponent(fixture);
    component.determineChart('force', 'static', 'Joint Forces', 'B');

    expect(component.analysisDiagnostic).toContain('Only one part meets this joint');
    expect(
      component.chartOptions.series!.every((series) =>
        (series.data as unknown as Array<{ y: number | null }>).every((point) => point.y === null)
      )
    ).toBe(true);
  });

  it('counts the positions with no solution and can stand the mechanism at the first', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const ground = fixture.mechanism.joints[0].find(
      (candidate): candidate is RealJoint => candidate instanceof RealJoint && candidate.ground
    )!;
    const series = failForceFrames(fixture, 'static', [1, 4]);

    component.determineChart('force', 'static', 'Joint Forces', ground.id);

    expect(component.analysisGap).toEqual({
      failed: 2,
      total: series.frames.length,
      firstSeconds: series.frames[1].timeSeconds,
      mechIndex: 0,
    });
    // A hole in a good series, not a failure of the whole series.
    expect(component.analysisDiagnostic).toBeNull();
    const points = component.chartOptions.series![0].data as unknown as Array<{
      y: number | null;
    }>;
    expect(points[1].y).toBeNull();
    expect(points[4].y).toBeNull();
    expect(Number.isFinite(points[0].y ?? Number.NaN)).toBe(true);

    // Several holes: the button names the one it goes to, which is the first.
    expect(component.gapShowLabel).toBe(
      `Show first (${formatTimeLabel(series.frames[1].timeSeconds)} s)`
    );

    const seek = vi.fn();
    const animate = vi.fn();
    const togglePlaying = vi.fn();
    Object.assign(fixture.service, {
      seekMechanism: seek,
      animate,
      isPlaying: true,
      isMechanismPlaying: () => true,
      toggleMechanismPlaying: togglePlaying,
    });
    component.showGapPosition();
    // Pressed mid-animation, the button pauses playback first -- a seek that
    // kept playing would sail straight past the pose it names.
    expect(animate).toHaveBeenCalledWith(fixture.service.mechanismTimeStep, false);
    expect(togglePlaying).toHaveBeenCalledWith(0);
    expect(seek).toHaveBeenCalledWith(0, series.frames[1].timeSeconds);

    // A fully solved series takes the banner down...
    component.determineChart('force', 'dynamic', 'Joint Forces', ground.id);
    expect(component.analysisGap).toBeNull();

    // ...and so does leaving force analysis for a kinematic graph.
    component.determineChart('force', 'static', 'Joint Forces', ground.id);
    expect(component.analysisGap).not.toBeNull();
    component.determineChart('kinematic', 'loop', 'Linear Joint Pos', ground.id);
    expect(component.analysisGap).toBeNull();
  });

  it('says the analysis failed rather than showing an empty series selection', () => {
    // A solver that throws leaves chartOptions.series unassigned, and the
    // template read that as nothing ticked -- "Please select at least one data
    // series", above no checkboxes to tick. The user reads that as their own
    // mistake. Two live defects presented this way before they were found.
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const joint = fixture.mechanism.joints[0].find(
      (candidate): candidate is RealJoint => candidate instanceof RealJoint
    )!;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const solver = vi.spyOn(KinematicsSolver, 'determineKinematics').mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading '0')");
    });

    component.determineChart('kinematic', 'loop', 'Linear Joint Vel', joint.id);
    component.applySeriesVisibility();

    expect(component.analysisDiagnostic).toContain('could not be analyzed');
    expect(component.numberOfSeries).toBe(0);
    expect(component.displayedSeries).toHaveLength(0);
    // And the failure is still recoverable in a console, not merely absorbed.
    expect(logged).toHaveBeenCalled();

    solver.mockRestore();
    logged.mockRestore();
  });

  it('uses matching Newton/lbf labels and values for graph and CSV output', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const input = fixture.mechanism.joints[0].find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    )!;
    component.determineChart('force', 'static', 'Joint Forces', input.id);
    const newtonPoints = component.chartOptions.series![2].data as unknown as Array<{
      y: number | null;
    }>;
    const finiteIndex = newtonPoints.findIndex((point) => Number.isFinite(point.y));
    const newtonValue = newtonPoints[finiteIndex].y!;
    expect(component.chartOptions.yaxis!.title!.text).toBe('Force (N)');

    fixture.settings.forceUnit.next(ForceUnit.LBF);
    component.determineChart('force', 'static', 'Joint Forces', input.id);
    const lbfValue = (
      component.chartOptions.series![2].data[finiteIndex] as unknown as { y: number }
    ).y;
    expect(component.chartOptions.yaxis!.title!.text).toBe('Force (lbf)');
    expect(lbfValue).toBeCloseTo(newtonValue * 0.22480894387096, 3);
  });
});

describe('AnalysisGraphComponent lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('updates charts without recursive form or mechanism-state emissions', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    const chart = {
      addPointAnnotation: vi.fn(),
      addXaxisAnnotation: vi.fn(),
      clearAnnotations: vi.fn(),
      updateOptions: vi.fn(),
    };
    component.chart = chart as never;
    component.analysis = 'kinematic';
    component.analysisType = 'loop';
    component.mechProp = 'Linear Joint Pos';
    component.mechPart = 'A';
    const determineChart = vi.spyOn(component, 'determineChart');
    const stateEvents: number[] = [];
    const stateSub = fixture.service.onMechUpdateState.subscribe((state) =>
      stateEvents.push(state)
    );

    component.ngOnInit();
    component.ngAfterViewInit();
    vi.advanceTimersByTime(2);

    expect(component.seriesCheckboxForm.getRawValue()).toEqual({ x: true, y: true, z: false });
    expect(component.noDataSelected).toBe(false);
    expect(component.displayedSeries.map((series) => series.name)).toEqual(['X', 'Y']);
    expect(chart.updateOptions).toHaveBeenCalledTimes(1);

    component.seriesCheckboxForm.patchValue({ x: false, y: true, z: false });
    expect(component.displayedSeries.map((series) => series.name)).toEqual(['Y']);
    component.seriesCheckboxForm.patchValue({ x: false, y: false, z: false });
    expect(component.displayedSeries).toHaveLength(0);
    expect(component.noDataSelected).toBe(true);
    component.seriesCheckboxForm.patchValue({ x: true, y: false, z: false });

    // The broadcast says something moved; the graph asks its own machine where
    // it is, because with several machines the shared index means nothing to
    // any one of them.
    const annotationIndex = Math.min(2, fixture.mechanism.timeNum.length - 1);
    fixture.service.mechanismTimeStep = annotationIndex;
    fixture.service.onMechPositionChange.next(annotationIndex);
    expect(chart.addXaxisAnnotation).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: fixture.mechanism.timeNum[annotationIndex] }),
      false
    );

    const eventsBeforeRefresh = stateEvents.length;
    fixture.service.onMechUpdateState.next(2);
    vi.advanceTimersByTime(2);
    expect(stateEvents.slice(eventsBeforeRefresh)).toEqual([2]);
    expect(component.loading).toBe(false);

    const callsBeforeUnitChange = determineChart.mock.calls.length;
    fixture.settings.lengthUnit.next(LengthUnit.METER);
    vi.advanceTimersByTime(2);
    expect(determineChart.mock.calls.length).toBe(callsBeforeUnitChange + 1);

    const callsBeforeForceUnitChange = determineChart.mock.calls.length;
    fixture.settings.forceUnit.next(ForceUnit.LBF);
    vi.advanceTimersByTime(2);
    expect(determineChart.mock.calls.length).toBe(callsBeforeForceUnitChange + 1);

    component.ngOnDestroy();
    const callsBeforeDestroyEvents = determineChart.mock.calls.length;
    fixture.settings.lengthUnit.next(LengthUnit.INCH);
    fixture.service.onMechUpdateState.next(2);
    vi.advanceTimersByTime(2);
    expect(determineChart.mock.calls.length).toBe(callsBeforeDestroyEvents);
    stateSub.unsubscribe();
  });

  it('opens force graphs on the X/Y components and kinematic ones on the magnitude', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const chart = {
      addPointAnnotation: vi.fn(),
      addXaxisAnnotation: vi.fn(),
      clearAnnotations: vi.fn(),
      updateOptions: vi.fn(),
    };

    const defaultsFor = (analysis: string, analysisType: string, mechProp: string) => {
      const component = createComponent(fixture);
      component.chart = chart as never;
      component.analysis = analysis;
      component.analysisType = analysisType;
      component.mechProp = mechProp;
      component.mechPart = 'B';
      component.ngOnInit();
      component.ngAfterViewInit();
      vi.advanceTimersByTime(2);
      return { series: component.numberOfSeries, form: component.seriesCheckboxForm.getRawValue() };
    };

    // A reaction's direction is the point of the graph, so it leads with X/Y...
    const force = defaultsFor('force', 'static', 'Joint Forces');
    expect(force.series).toBe(3);
    expect(force.form).toEqual({ x: true, y: true, z: false });

    // ...while an equally three-series kinematic graph still leads with magnitude.
    const kinematic = defaultsFor('kinematic', 'loop', 'Linear Joint Vel');
    expect(kinematic.series).toBe(3);
    expect(kinematic.form).toEqual({ x: false, y: false, z: true });
  });

  it('compacts only graphs that have no component-selector checkboxes', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);

    component.numberOfSeries = 1;
    expect(component.compactSingleSeries).toBe(true);

    component.numberOfSeries = 2;
    expect(component.compactSingleSeries).toBe(false);

    component.numberOfSeries = 3;
    expect(component.compactSingleSeries).toBe(false);
  });

  it('keeps canonical colors when a middle series is hidden', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const component = createComponent(fixture);
    component.determineChart('kinematic', 'loop', 'Linear Joint Vel', 'B');
    component.seriesCheckboxForm.setValue({ x: true, y: false, z: true });
    component.applySeriesVisibility();

    expect(component.displayedSeries.map((series) => series.name)).toEqual(['X', 'Z']);
    expect(component.displayedColors).toEqual([ANALYSIS_SERIES_COLORS.X, ANALYSIS_SERIES_COLORS.Z]);
  });
});

describe('AnalysisGraphComponent rendered controls', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function mountGraph(
    fixtureData: MechanismFixture,
    inputs: { analysis: string; analysisType: string; mechProp: string; mechPart: string }
  ): Promise<ComponentFixture<AnalysisGraphComponent>> {
    await TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        MatButtonModule,
        MatCheckboxModule,
        MatIconModule,
        NoopAnimationsModule,
        AnalysisGraphComponent,
        ApexChartStubComponent,
      ],
      providers: [
        { provide: MechanismService, useValue: fixtureData.service },
        { provide: SettingsService, useValue: fixtureData.settings },
        { provide: NumberUnitParserService, useValue: new NumberUnitParserService() },
        { provide: ActiveObjService, useValue: fixtureData.active },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      // The standalone graph brings the real apex chart; these tests assert on
      // the stub's recorded inputs, so it takes the chart's place.
      .overrideComponent(AnalysisGraphComponent, {
        remove: { imports: [AnalysisApexChartComponent] },
        add: { imports: [ApexChartStubComponent] },
      })
      .compileComponents();

    const fixture: ComponentFixture<AnalysisGraphComponent> =
      TestBed.createComponent(AnalysisGraphComponent);
    fixture.componentRef.setInput('analysis', inputs.analysis);
    fixture.componentRef.setInput('analysisType', inputs.analysisType);
    fixture.componentRef.setInput('mechProp', inputs.mechProp);
    fixture.componentRef.setInput('mechPart', inputs.mechPart);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('updates the rendered chart series when a series is switched off and on', async () => {
    const fixtureData = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const fixture = await mountGraph(fixtureData, {
      analysis: 'kinematic',
      analysisType: 'loop',
      mechProp: 'Linear Joint Pos',
      mechPart: 'B',
    });

    // The switches live on the panel header that owns this graph now -- one row
    // that reads the values out and turns the lines on and off -- so this drives
    // the API that row calls rather than a checkbox that no longer exists.
    const graph = fixture.componentInstance;
    expect(graph.isSeriesShown('x')).toBe(true);
    expect(graph.isSeriesShown('y')).toBe(true);

    graph.toggleSeries('x');
    fixture.detectChanges();
    expect(graph.isSeriesShown('x')).toBe(false);
    expect(graph.displayedSeries.map((series) => series.name)).toEqual(['Y']);

    graph.toggleSeries('y');
    fixture.detectChanges();
    expect(graph.displayedSeries).toHaveLength(0);
    expect(graph.noDataSelected).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('No series shown. Pick one above.');

    graph.toggleSeries('x');
    fixture.detectChanges();
    expect(graph.displayedSeries.map((series) => series.name)).toEqual(['X']);
    expect(graph.noDataSelected).toBe(false);

    const chartStub = fixture.debugElement.query(By.directive(ApexChartStubComponent))
      .componentInstance as ApexChartStubComponent;
    const annotationIndex = Math.min(3, fixtureData.mechanism.timeNum.length - 1);
    fixtureData.service.mechanismTimeStep = annotationIndex;
    fixtureData.service.onMechPositionChange.next(annotationIndex);
    expect(chartStub.addXaxisAnnotation).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: fixtureData.mechanism.timeNum[annotationIndex] }),
      false
    );
    fixture.destroy();
  });

  it('renders the no-solution banner, and Show them drives the mechanism there', async () => {
    const fixtureData = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const series = failForceFrames(fixtureData, 'static', [2]);
    const seek = vi.fn();
    Object.assign(fixtureData.service, {
      seekMechanism: seek,
      isPlaying: false,
      isMechanismPlaying: () => false,
    });
    const ground = fixtureData.mechanism.joints[0].find(
      (candidate): candidate is RealJoint => candidate instanceof RealJoint && candidate.ground
    )!;

    const fixture = await mountGraph(fixtureData, {
      analysis: 'force',
      analysisType: 'static',
      mechProp: 'Joint Forces',
      mechPart: ground.id,
    });

    const banner = fixture.nativeElement.querySelector('.analysis-gap') as HTMLElement | null;
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain(`No solution at 1 of ${series.frames.length} positions`);

    const showButton = banner!.querySelector('.gapShow') as HTMLButtonElement;
    // One hole: singular wording, no time needed.
    expect(showButton.textContent!.trim()).toBe('Show position');
    showButton.click();
    expect(seek).toHaveBeenCalledWith(0, series.frames[2].timeSeconds);
    fixture.destroy();
  });
});

describe('formatTimeLabel', () => {
  it('drops decimals that carry no information', () => {
    expect(formatTimeLabel(0)).toBe('0');
    expect(formatTimeLabel(3)).toBe('3');
    expect(formatTimeLabel(3.0)).toBe('3');
    expect(formatTimeLabel(0.3)).toBe('0.3');
  });

  it('keeps up to three decimals when they matter', () => {
    expect(formatTimeLabel(3.14159)).toBe('3.142');
    expect(formatTimeLabel(8.571428)).toBe('8.571');
    expect(formatTimeLabel(0.0238)).toBe('0.024');
  });

  it('renders nothing for a non-finite time', () => {
    expect(formatTimeLabel(Number.NaN)).toBe('');
    expect(formatTimeLabel(Number.POSITIVE_INFINITY)).toBe('');
  });
});
