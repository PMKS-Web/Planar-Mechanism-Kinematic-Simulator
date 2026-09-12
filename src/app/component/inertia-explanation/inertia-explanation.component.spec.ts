import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MODEL_SCALE } from '../../model/render-scale';
import { LengthUnit } from '../../model/unit-enums';
import { InertiaExplanationComponent } from './inertia-explanation.component';

describe('inertia explanation in project units', () => {
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
