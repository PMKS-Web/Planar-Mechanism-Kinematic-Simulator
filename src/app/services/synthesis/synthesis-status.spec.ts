import { TestBed } from '@angular/core/testing';
import { BottombarComponent } from '../../component/bottombar/bottombar.component';
import { Coord } from '../../model/coord';
import { MODEL_SCALE } from '../../model/render-scale';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { SynthesisSolutionService } from './synthesis-solution.service';
import { COR } from './synthesis-util';

describe('the three-position design found during interactive exploration', () => {
  let solution: SynthesisSolutionService;
  let bar: BottombarComponent;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [BottombarComponent] });
    bar = TestBed.createComponent(BottombarComponent).componentInstance;
    TestBed.inject(SelectedTabService).setTab(TabID.SYNTHESIZE);
    const scale = MODEL_SCALE;
    TestBed.inject(SynthesisBuilderService).applyDecoded({
      length: scale,
      reference: COR.CENTER,
      endsOnly: true,
      allowDefect: false,
      constrain: false,
      stage: 'working',
      poses: [
        { at: new Coord(2 * scale, 0), thetaDegrees: 0 },
        { at: new Coord(3 * scale, scale), thetaDegrees: 30 },
        { at: new Coord(4 * scale, scale), thetaDegrees: 60 },
      ],
      ownedJointIds: [],
    });
    solution = TestBed.inject(SynthesisSolutionService);
    solution.generate();
    vi.advanceTimersByTime(5000);
  });

  afterEach(() => vi.useRealTimers());

  it('distinguishes a small transmission angle from an unreachable position', () => {
    expect(solution.driven()?.onBranchCount).toBe(3);
    expect(solution.driven()?.binds).toBe(true);
    expect(bar.status).toContain('all 3 positions reached');
    expect(bar.status).toContain('small transmission angle');
    expect(bar.status).not.toContain('branch defect at 0');
  });

  it('keeps the solution letter when changing assembly and driven pin', () => {
    const offered = solution.candidates()[0];
    const alternate = solution
      .allAssemblies()
      .find((c) => c.pair === offered.pair && c.key !== offered.key)!;
    expect(alternate).toBeDefined();
    solution.candidateKey = alternate.key;
    solution.driveOnFarPin = true;
    expect(solution.driven()?.name).toBe(offered.name);
    expect(bar.status).not.toContain('Solution ?');
  });

  it('offsets duplicate positions by the link size rather than fixed document units', () => {
    const design = TestBed.inject(SynthesisBuilderService);
    design.removePose(3);
    design.removePose(2);
    design.duplicateLastPose();
    const copied = design.getPose(2);
    expect(copied.position.x).toBeCloseTo(2.6 * MODEL_SCALE, 8);
    expect(copied.position.y).toBeCloseTo(0.5 * MODEL_SCALE, 8);
    expect(copied.thetaDegrees).toBeCloseTo(-22, 8);
  });
});
