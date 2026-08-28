import { TestBed } from '@angular/core/testing';
import { DxfExportService } from '../../../services/export/dxf/dxf-export.service';
import { DrawingExportComponent } from './drawing-export.component';

describe('DrawingExportComponent', () => {
  const exportService = {
    create: vi.fn().mockReturnValue({
      name: 'four-bar.dxf',
      mime: 'application/dxf;charset=utf-8',
      content: 'DXF',
      blob: new Blob(['DXF']),
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({ imports: [DrawingExportComponent] })
      .overrideProvider(DxfExportService, { useValue: exportService })
      .compileComponents();
  });

  it('starts with labels off and separable semantic annotations on', () => {
    const fixture = TestBed.createComponent(DrawingExportComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.options).toEqual({
      fileName: 'mechanism',
      includeLabels: false,
      includeKinematicAnnotations: true,
      includeForces: true,
      includeConstruction: true,
    });
    expect(fixture.nativeElement.textContent).toContain('start pose');
    expect(fixture.nativeElement.textContent).toContain('centerline');
    expect(fixture.nativeElement.querySelector('mat-form-field')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('mat-checkbox')).toHaveLength(4);
    expect(fixture.nativeElement.querySelector('button[mat-icon-button]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.titleRow > h1')?.textContent).toContain(
      'CAD Export'
    );
    expect(fixture.nativeElement.querySelector('h1[mat-dialog-title]')).toBeNull();
  });

  it('downloads exactly the selected semantic DXF options', () => {
    const fixture = TestBed.createComponent(DrawingExportComponent);
    const component = fixture.componentInstance;
    component.options.fileName = 'four-bar';
    component.options.includeLabels = true;
    component.options.includeForces = false;
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dxf');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    component.download();

    expect(exportService.create).toHaveBeenCalledWith(component.options);
    expect(createUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:dxf');
  });
});
