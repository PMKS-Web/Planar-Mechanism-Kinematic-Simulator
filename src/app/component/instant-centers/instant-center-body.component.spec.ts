import { TestBed } from '@angular/core/testing';
import { InstantCenterBodyComponent } from './instant-center-body.component';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { InstantCenterService } from '../../services/instant-center.service';

describe('IC velocity preview curves', () => {
  it('keeps an unavailable IC sample as a gap while retaining the current solver value', () => {
    const sampleAt = vi.fn((_mechanism, index, _analysis, method) => [
      method === 'ic' && index === 1 ? NaN : index + 1,
    ]);
    TestBed.configureTestingModule({
      imports: [InstantCenterBodyComponent],
      providers: [
        { provide: AnalysisSampleService, useValue: { sampleAt } },
        { provide: SettingsService, useValue: { lengthUnit: { value: 1 } } },
        { provide: NumberUnitParserService, useValue: { unitLabel: () => 'cm' } },
        { provide: InstantCenterService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(InstantCenterBodyComponent);
    fixture.componentRef.setInput('mechanism', {
      joints: [[], [], []],
      timeNum: [0, 0.5, 1],
      inputAngularVelocities: [1, 1, 1],
    });
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('linkId', 'BC');
    const preview = fixture.componentInstance as unknown as {
      plot(): { name: string; data: { x: number; y: number | null }[] }[];
      unavailable: number;
    };
    const curves = preview.plot();
    expect(curves[0].data[1]).toEqual({ x: 0.5, y: 2 });
    expect(curves[1].data[1]).toEqual({ x: 0.5, y: null });
    expect(curves[1].data[2]).toEqual({ x: 1, y: 3 });
    expect(preview.unavailable).toBe(1);
  });
});
