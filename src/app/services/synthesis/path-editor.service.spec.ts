import { TestBed } from '@angular/core/testing';
import { PathEditorService } from './path-editor.service';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { PathSynthesisDesign } from '../../model/path-synthesis';
import { Coord } from '../../model/coord';
import { MechanismService } from '../mechanism.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { Subject } from 'rxjs';

describe('target point edits', () => {
  const save = vi.fn();
  let editor: PathEditorService;
  beforeEach(() => {
    save.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: MechanismService, useValue: { save } },
        { provide: SelectedTabService, useValue: { getCurrentTab: () => TabID.SYNTHESIZE } },
        {
          provide: SynthesisBuilderService,
          useValue: { stage: 'path', path: new PathSynthesisDesign(), valueChanges: new Subject() },
        },
      ],
    });
    editor = TestBed.inject(PathEditorService);
  });

  it('copies getter-backed canvas coordinates and saves each edit once', () => {
    const at = new Coord(450, -270);
    editor.add(at);
    expect(editor.target.points).toEqual([{ x: 450, y: -270 }]);
    at.x = 900;
    expect(editor.target.points[0].x).toBe(450);
    expect(save).toHaveBeenCalledTimes(1);
    editor.add(new Coord(100, 200));
    editor.reorder(1, -1);
    expect(editor.target.points[0]).toEqual({ x: 100, y: 200 });
    editor.remove(0);
    expect(editor.target.points).toEqual([{ x: 450, y: -270 }]);
    expect(save).toHaveBeenCalledTimes(4);
  });

  it('does not record invalid points or impossible reorder operations', () => {
    editor.add(new Coord(NaN, 0));
    editor.remove(4);
    editor.reorder(0, -1);
    expect(save).not.toHaveBeenCalled();
  });
});
