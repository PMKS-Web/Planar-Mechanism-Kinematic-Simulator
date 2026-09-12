import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MODEL_SCALE } from '../../model/render-scale';
import { LengthUnit } from '../../model/unit-enums';
import { InertiaExplanationComponent } from './inertia-explanation.component';
import katex from 'katex';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { inertiaFormat, InertiaStep } from './inertia-format';
import { inertiaSteps } from './inertia-steps';
import { uniformMassProperties } from '../../model/mass-properties';
import { InertiaAxisComponent } from './inertia-axis.component';
import { InertiaPreviewService } from '../../services/inertia-preview.service';
import { InertiaMassModelComponent } from './inertia-mass-model.component';
import { MassGeometryPreviewService } from '../../services/mass-geometry-preview.service';

describe('inertia explanation in project units', () => {
  it('cleans up mass geometry on disclosure close and destruction without reclaiming another panel', () => {
    const preview = TestBed.inject(MassGeometryPreviewService);
    const fixtures = [
      TestBed.createComponent(InertiaMassModelComponent),
      TestBed.createComponent(InertiaMassModelComponent),
    ];
    const click = (index: number, label: string) => {
      const fixture = fixtures[index];
      const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((el) =>
        (el as HTMLElement).textContent?.includes(label)
      ) as HTMLButtonElement;
      button.click();
      fixture.detectChanges();
    };
    for (const [i, fixture] of fixtures.entries()) {
      fixture.componentRef.setInput('body', makeRod());
      fixture.detectChanges();
      click(i, 'Mass Model Being Used');
      click(i, 'Show Mass Geometry');
    }
    const show = vi.spyOn(preview, 'show');
    fixtures.forEach((fixture) => fixture.detectChanges());
    expect(show).not.toHaveBeenCalled();
    fixtures[0].destroy();
    expect(preview.selection()?.owner).toBe(fixtures[1].componentInstance);
    click(1, 'Mass Model Being Used');
    expect(preview.selection()).toBeUndefined();
    click(1, 'Mass Model Being Used');
    expect(preview.selection()).toBeUndefined();
    click(1, 'Show Mass Geometry');
    fixtures[1].destroy();
    expect(preview.selection()).toBeUndefined();
  });
  it('does not let two open panels continuously reclaim the same overlay', () => {
    const preview = TestBed.inject(InertiaPreviewService);
    const show = vi.spyOn(preview, 'show');
    const first = TestBed.createComponent(InertiaAxisComponent);
    const second = TestBed.createComponent(InertiaAxisComponent);
    for (const fixture of [first, second]) {
      fixture.componentRef.setInput('body', makeRod());
      fixture.componentRef.setInput('lengthUnit', LengthUnit.CM);
      fixture.detectChanges();
    }
    first.detectChanges();
    second.detectChanges();
    expect(show).toHaveBeenCalledTimes(2);
    first.destroy();
    expect(preview.selection()?.owner).toBe(second.componentInstance);
    second.destroy();
    expect(preview.selection()).toBeUndefined();
  });
  it('renders every edge equation and distinguishes local zero from a nonzero grid vertex', () => {
    const link = new RealLink(
      'ABC',
      [new RevJoint('A', 400, 600), new RevJoint('B', 1200, 600), new RevJoint('C', 600, 1200)],
      12
    );
    const f = inertiaFormat(LengthUnit.CM, new NumberUnitParserService());
    const working = inertiaSteps(link, uniformMassProperties(link, f.factor), f);
    const equations: string[] = [];
    const visit = (steps: InertiaStep[]) =>
      steps.forEach((step) => {
        equations.push(...step.equations);
        visit(step.children ?? []);
      });
    visit(working.steps);
    expect(equations).toContain(String.raw`x_{1}^{local} = 0\,\mathrm{cm}`);
    expect(equations).toContain(String.raw`x_{1}^{grid} = 2\,\mathrm{cm}`);
    for (const equation of equations) {
      expect(equation).not.toMatch(/[\x00-\x1f]/);
      expect(() => katex.renderToString(equation, { throwOnError: true })).not.toThrow();
    }
  });
  const makeRod = () =>
    new RealLink(
      'AB',
      [new RevJoint('A', 0, 0), new RevJoint('B', 3 * MODEL_SCALE, 4 * MODEL_SCALE)],
      12,
      0.025
    );

  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [InertiaExplanationComponent],
      providers: [provideNoopAnimations()],
    })
  );

  it('shows the 12 g, 5 cm worked example as 25 g·cm², not the stored kg·cm²', () => {
    const fixture = TestBed.createComponent(InertiaExplanationComponent);
    fixture.componentRef.setInput('body', makeRod());
    fixture.componentRef.setInput('expanded', true);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('25 g·cm²');
    const math = Array.from(fixture.nativeElement.querySelectorAll('annotation')).map(
      (node) => (node as Element).textContent
    );
    expect(math).toContain(String.raw`L = 5\,\mathrm{cm}`);
    expect(math).toContain(String.raw`I_G = \frac{12\times 25}{12}`);
    expect(math).toContain(String.raw`I_{\mathrm{end}}=100\,\mathrm{g}\cdot\mathrm{cm}^{2}`);
    for (const equation of math) {
      expect(equation).not.toMatch(/[\x00-\x1f\ufffd]/);
      expect(() => katex.renderToString(equation ?? '', { throwOnError: true })).not.toThrow();
    }
    expect(fixture.nativeElement.querySelectorAll('mfrac').length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('.katex-error')).toBeNull();
    expect(text).not.toContain('kg·cm²');
  });

  it('retains custom inertia while comparing the shape and updates after selection and unit changes', () => {
    const fixture = TestBed.createComponent(InertiaExplanationComponent);
    const link = makeRod();
    link.massMoI = 0.075;
    link.moiIsCustom = true;
    fixture.componentRef.setInput('body', link);
    fixture.componentRef.setInput('expanded', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('75 g·cm²');
    expect(fixture.nativeElement.textContent).toContain('25 g·cm²');
    expect(link.massMoI).toBe(0.075);
    const next = makeRod();
    next.massMoI = 25;
    fixture.componentRef.setInput('body', next);
    fixture.componentRef.setInput('lengthUnit', LengthUnit.INCH);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('25 lbm·in²');
    expect(fixture.nativeElement.textContent).not.toContain('g·cm²');
  });
});
