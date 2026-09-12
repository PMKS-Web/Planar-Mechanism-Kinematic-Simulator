import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { PathSynthesisService } from './path-synthesis.service';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { PathSynthesisDesign, pathPreset } from '../../model/path-synthesis';
import { MechanismService } from '../mechanism.service';
import { EditPermissionService } from '../edit-permission.service';
import { SelectedTabService } from '../../selected-tab.service';
import { LoadingService } from '../loading.service';

describe('path search orchestration', () => {
  let service: PathSynthesisService;
  let design: { path: PathSynthesisDesign; stage: string; valueChanges: Subject<boolean> };
  const save = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    save.mockClear();
    design = {
      path: pathPreset('Bean', { x: 0, y: 0 }, 400),
      stage: 'path',
      valueChanges: new Subject(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SynthesisBuilderService, useValue: design },
        { provide: MechanismService, useValue: { save, updateMechanism: save } },
        { provide: SelectedTabService, useValue: {} },
        { provide: EditPermissionService, useValue: { poseRefusal: () => null } },
        { provide: LoadingService, useValue: {} },
      ],
    });
    service = TestBed.inject(PathSynthesisService);
  });
  afterEach(() => {
    service.cancel();
    vi.useRealTimers();
  });
  it('cancels on a target change without saving or exposing a stale candidate', async () => {
    service.synthesize();
    expect(service.busy()).toBe(true);
    design.path.points[0].x += 20;
    await vi.runAllTimersAsync();
    expect(service.busy()).toBe(false);
    expect(service.candidate).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    expect(service.message()).toContain('cancelled');
  });
  it('does not start a second search while the first is running', async () => {
    service.synthesize();
    const first = service.evaluations();
    service.synthesize();
    expect(service.evaluations()).toBe(first);
    service.cancel();
    await vi.runAllTimersAsync();
    expect(service.busy()).toBe(false);
    expect(service.candidate).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
  });
  it('refuses creation without a verified candidate', () => {
    expect(service.createRefusal).toContain('verified');
    service.create();
    expect(save).not.toHaveBeenCalled();
  });
});
