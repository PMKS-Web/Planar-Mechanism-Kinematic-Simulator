import { SaveHistoryService } from './save-history.service';
import { withTestInjector } from '../../test-utils/mechanism-harness';
import { UrlGenerationService } from './url-generation.service';
import { UrlProcessorService } from './url-processor.service';
import { MechanismService } from './mechanism.service';
import { SelectedTabService } from '../selected-tab.service';

describe('SaveHistoryService', () => {
  it('restores serialized settings together with the mechanism on undo and redo', () => {
    const states = ['metric-state', 'english-state'];
    const generator = {
      generateUrlQuery: () => states.shift()!,
    } as unknown as UrlGenerationService;
    const restores: unknown[][] = [];
    const processor = {
      updateFromURL: (...args: unknown[]) => restores.push(args),
    } as unknown as UrlProcessorService;
    const history = withTestInjector(
      [
        { provide: UrlGenerationService, useValue: generator },
        { provide: UrlProcessorService, useValue: processor },
        {
          provide: SelectedTabService,
          useValue: { isAnalysisMode: () => false },
        },
        {
          provide: MechanismService,
          useValue: { capturePausedPose: () => ({ mechanisms: [] }), restorePausedPose: () => {} },
        },
      ],
      () => new SaveHistoryService()
    );

    history.save();
    history.save();
    history.undo();
    history.redo();

    // The trailing flag says "this is a step within one mechanism's history,
    // not a different mechanism arriving". Per-joint memory -- the slot stash,
    // the cylinder-skin preference -- is keyed by joint letter, so a fresh load
    // has to forget it and an undo must not. Dropping the flag here would make
    // undo clear the thing it exists to restore.
    expect(restores).toEqual([
      ['metric-state', false, true, false, true],
      ['english-state', false, true, false, true],
    ]);
  });

  it('restores the paused pose after undo in an analysis mode', () => {
    const states = ['before', 'after'];
    const pose = { mechanisms: [{ id: 'M1', fraction: 0.42 }] };
    const calls: string[] = [];
    const history = withTestInjector(
      [
        {
          provide: UrlGenerationService,
          useValue: { generateUrlQuery: () => states.shift()! },
        },
        {
          provide: UrlProcessorService,
          useValue: { updateFromURL: () => calls.push('restore design') },
        },
        { provide: SelectedTabService, useValue: { isAnalysisMode: () => true } },
        {
          provide: MechanismService,
          useValue: {
            capturePausedPose: () => pose,
            restorePausedPose: (held: unknown) => {
              expect(held).toBe(pose);
              calls.push('restore pose');
            },
          },
        },
      ],
      () => new SaveHistoryService()
    );

    history.save();
    history.save();
    history.undo();

    expect(calls).toEqual(['restore design', 'restore pose']);
  });
});
