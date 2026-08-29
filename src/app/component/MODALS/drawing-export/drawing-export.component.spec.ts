import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';
import { LengthUnit } from '../../../model/unit-enums';
import {
  DEFAULT_DXF_EXPORT_OPTIONS,
  DxfExportService,
} from '../../../services/export/dxf/dxf-export.service';
import { DrawingExportComponent } from './drawing-export.component';

describe('DrawingExportComponent', () => {
  /** A drawing with geometry, one traced joint and no forces, unless said otherwise. */
  const exportService = {
    create: vi.fn().mockReturnValue({
      name: 'four-bar.dxf',
      mime: 'application/dxf;charset=utf-8',
      content: 'DXF',
      blob: new Blob(['DXF']),
      parts: ['four-bar.dxf'],
    }),
    summarize: vi.fn().mockReturnValue({
      entities: 42,
      layers: 7,
      width: 24,
      height: 18,
      unit: 'cm',
      shapes: { strokes: 'M0 0L10 10', holes: [{ cx: 4, cy: 4, r: 2 }] },
    }),
    hasGeometry: vi.fn().mockReturnValue(true),
    hasTracedJoint: vi.fn().mockReturnValue(true),
    originJointChoices: vi.fn().mockReturnValue([{ id: 'A', name: 'A' }]),
    firstGroundJointName: vi.fn().mockReturnValue('A'),
    projectUnit: vi.fn().mockReturnValue(LengthUnit.CM),
    fileNames: vi.fn().mockReturnValue(['mechanism (cm).dxf', 'mechanism-joints.csv']),
    downloadName: vi.fn().mockReturnValue('mechanism.zip'),
    pinWarning: vi.fn().mockReturnValue(''),
    pinDiameter: vi.fn().mockReturnValue(0.13),
  };

  function render() {
    const fixture = TestBed.createComponent(DrawingExportComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, element: fixture.nativeElement };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    exportService.hasGeometry.mockReturnValue(true);
    exportService.hasTracedJoint.mockReturnValue(true);
    await TestBed.configureTestingModule({ imports: [DrawingExportComponent] })
      .overrideProvider(DxfExportService, { useValue: exportService })
      .compileComponents();
  });

  it('opens on the destination most readers are heading for, with the detail folded', () => {
    const { component, element } = render();
    expect(component.preset).toBe('build');
    expect(component.options).toEqual(DEFAULT_DXF_EXPORT_OPTIONS);
    // Two cards and no Custom banner: nobody picks Custom, they arrive in it.
    expect(element.querySelectorAll('.presetCard')).toHaveLength(2);
    expect(element.querySelector('[data-preset="custom"]')).toBeNull();
    expect(element.querySelector('[data-preset="build"]')?.className).toContain('on');
    // Four sections, each shut, each already saying what it holds.
    expect(element.querySelectorAll('.sectionHead')).toHaveLength(4);
    expect(element.querySelectorAll('.sectionBody')).toHaveLength(0);
    expect(element.textContent).toContain('start pose');
    // The default is parts now, not a picture of them.
    expect(element.textContent).toContain('part outlines');
    expect(element.querySelector('.titleRow > h1')?.textContent).toContain('CAD Export');
  });

  it('says what is about to come down, and names the file in the button', () => {
    const { component, element } = render();
    expect(element.querySelector('.liveSummary')?.textContent).toContain('42 entities');
    expect(element.querySelector('.liveSummary')?.textContent).toContain('7 layers');
    // The build preset asks for a CSV, so two files means a zip, and the
    // button says so rather than the reader finding out afterwards.
    expect(component.exportLabel).toBe('Export DXF + CSV');
    expect(element.querySelector('.deliveryLine')?.textContent).toContain('.zip');
  });

  it('leaves the preset the moment a detail is changed, and offers the way back', () => {
    const { component, fixture, element } = render();
    expect(element.querySelector('.linkButton')).toBeNull();
    component.touch({ includeLabels: true });
    fixture.detectChanges();
    expect(component.preset).toBe('custom');
    expect(element.querySelector('[data-preset="custom"]')).not.toBeNull();
    // The values are kept: Custom describes where they are, not a mode.
    expect(component.options.includeLabels).toBe(true);
    expect(component.options.perLinkLayers).toBe(true);
    const reset = element.querySelector('.linkButton') as HTMLButtonElement;
    expect(reset.textContent).toContain('Reset to Build parts');
    reset.click();
    fixture.detectChanges();
    expect(component.preset).toBe('build');
    expect(component.options.includeLabels).toBe(false);
  });

  it('switching to the reference sketch changes what the summaries say', () => {
    const { component, fixture, element } = render();
    (element.querySelector('[data-preset="reference"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.options.origin).toBe('model');
    expect(component.options.jointCircles).toBe('marks');
    expect(component.geometrySummary).toContain('model coordinates');
    expect(component.geometrySummary).toContain('joint marks');
    expect(component.dataSummary).toBe('DXF only');
    expect(component.exportLabel).toBe('Export DXF');
  });

  it('keeps file-level choices out of Custom, and the pin the size it is', () => {
    const { component, fixture, element } = render();
    // Neither preset has an opinion about the file's name or its units, so
    // changing one must not raise a "Reset to Build parts" offering to undo
    // something it would not undo.
    component.chooseUnit(LengthUnit.METER);
    component.set({ fileName: 'four-bar' });
    fixture.detectChanges();
    expect(component.preset).toBe('build');
    expect(element.querySelector('.linkButton')).toBeNull();
    expect(component.effectiveUnit).toBe(LengthUnit.METER);
    // A pin nobody chose is derived from the drawing and already follows the
    // unit, so changing units leaves it unset rather than pinning it down.
    expect(component.options.pinDiameter).toBeUndefined();

    // One that was typed is a physical hole, and keeps its size across units.
    component.chooseUnit(LengthUnit.CM);
    component.touch({ pinDiameter: 0.6 });
    component.chooseUnit(LengthUnit.METER);
    expect(component.options.pinDiameter).toBeCloseTo(0.006, 6);
    component.chooseUnit(LengthUnit.INCH);
    expect(component.options.pinDiameter).toBeCloseTo(0.6 / 2.54, 4);
    // Back where it started, to within the rounding that keeps the field
    // showing a number somebody could have typed.
    component.chooseUnit(LengthUnit.CM);
    expect(component.options.pinDiameter).toBeCloseTo(0.6, 3);
  });

  it('greys a control it cannot offer, and says why on the row', () => {
    exportService.hasTracedJoint.mockReturnValue(false);
    const { component, fixture, element } = render();
    (element.querySelector('[data-section="geometry"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const row = element.querySelector('[data-check="tracedPaths"]') as HTMLElement;
    expect(row.className).toContain('blocked');
    // The reason hangs on the row, through the same tooltip the rest of the app
    // uses: a disabled button takes no pointer events, so a tooltip on the
    // button would be the one explanation nobody could reach.
    const tooltip = fixture.debugElement
      .queryAll(By.directive(MatTooltip))
      .map((found) => found.injector.get(MatTooltip))
      .find((instance) => /No joint is tracing a path/.test(instance.message as string));
    expect(tooltip).toBeDefined();
    expect(tooltip!.disabled).toBe(false);
    // Pressing it does nothing rather than half-doing something.
    const before = component.options.includeTracedPaths;
    component.toggle('includeTracedPaths');
    expect(component.options.includeTracedPaths).toBe(before);
  });

  it('has nothing to say about an empty grid, and refuses to export one', () => {
    exportService.hasGeometry.mockReturnValue(false);
    const { component, element } = render();
    expect(component.liveSummary).toContain('Nothing to export yet');
    expect(element.querySelector('.deliveryLine')?.textContent).toContain('The grid is empty');
    const button = element.querySelector('button[mat-flat-button]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    component.download();
    expect(exportService.create).not.toHaveBeenCalled();
  });

  it('downloads exactly what the dialog is showing', () => {
    const { component } = render();
    component.options.fileName = 'four-bar';
    component.touch({ includeLabels: true });
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
