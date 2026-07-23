import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSelectHarness } from '@angular/material/select/testing';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import {
  buildMechanismFixture,
  LOOPLESS_WELDED_MECHANISM,
} from '../../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../MODALS/templates/template-linkages';
import { AnalysisPanelComponent } from './analysis-panel.component';

async function createPanel(payload: string, selectedId: string) {
  const fixtureData = buildMechanismFixture(payload);
  const selected =
    fixtureData.service.joints.find((joint) => joint.id === selectedId) ??
    fixtureData.service.links.find((link) => link.id === selectedId)!;
  fixtureData.active.updateSelectedObj(selected);

  await TestBed.configureTestingModule({
    declarations: [AnalysisPanelComponent],
    imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule, NoopAnimationsModule],
    providers: [
      { provide: ActiveObjService, useValue: fixtureData.active },
      { provide: MechanismService, useValue: fixtureData.service },
      { provide: SettingsService, useValue: fixtureData.settings },
    ],
    schemas: [NO_ERRORS_SCHEMA],
  }).compileComponents();

  const fixture: ComponentFixture<AnalysisPanelComponent> =
    TestBed.createComponent(AnalysisPanelComponent);
  return { fixture, fixtureData };
}

describe('AnalysisPanelComponent welded mechanism regression', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('renders analysis controls for a valid loopless welded link instead of blanking', async () => {
    const { fixture } = await createPanel(LOOPLESS_WELDED_MECHANISM, 'A');
    fixture.componentInstance.graphExpanded['JPos'] = true;
    fixture.componentInstance.graphExpanded['JForce'] = true;
    fixture.componentInstance.graphExpanded['JInputForce'] = true;

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.textContent).toContain('Analysis for Joint A');
    expect(fixture.nativeElement.textContent).toContain('Force Analysis');
    expect(fixture.nativeElement.querySelectorAll('app-analysis-graph').length).toBe(3);

    fixture.destroy();
  });

  it('maps the 0/1 radio values directly to static and dynamic modes', async () => {
    const { fixture } = await createPanel(LOOPLESS_WELDED_MECHANISM, 'A');
    expect(fixture.componentInstance.forceAnalysisMode()).toBe('static');
    fixture.componentInstance.inputSpeedFormGroup.patchValue({ speed: '1' });
    expect(fixture.componentInstance.forceAnalysisMode()).toBe('dynamic');
    fixture.componentInstance.inputSpeedFormGroup.patchValue({ speed: '0' });
    expect(fixture.componentInstance.forceAnalysisMode()).toBe('static');
    fixture.destroy();
  });

  it('explains that an internal welded joint has no independent pin reaction', async () => {
    const { fixture } = await createPanel(LOOPLESS_WELDED_MECHANISM, 'B');
    fixture.componentInstance.graphExpanded['JForce'] = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('internal to one welded body');
    expect(fixture.nativeElement.textContent).toContain('no independent pin reaction');
    expect(fixture.nativeElement.querySelectorAll('app-analysis-graph').length).toBe(0);
    fixture.destroy();
  });

  it('selects and persists the root-link side at an external multi-link pin', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'B');
    fixture.detectChanges();

    const links = fixture.componentInstance.selectedJointReactionLinks();
    expect(links).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.reaction-link-selector')).not.toBeNull();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const selector = await loader.getHarness(MatSelectHarness);
    expect(await selector.getValueText()).toBe(`Link ${links[0].name}`);
    await selector.open();
    const options = await selector.getOptions();
    expect(await Promise.all(options.map((option) => option.getText()))).toEqual(
      links.map((link) => `Link ${link.name}`)
    );
    await options[1].click();
    expect(fixture.componentInstance.reactionLinkId()).toBe(links[1].id);
    expect(await selector.getValueText()).toBe(`Link ${links[1].name}`);
    fixture.destroy();
  });

  it('renders every joint kinematics graph without losing expansion state', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'B');
    Object.assign(fixture.componentInstance.graphExpanded, {
      JPos: true,
      JVel: true,
      JAcc: true,
    });
    fixture.detectChanges();

    const graphs = [...fixture.nativeElement.querySelectorAll('app-analysis-graph')];
    const properties = graphs.map((graph: Element) => graph.getAttribute('mechprop'));
    expect(properties).toEqual(
      expect.arrayContaining(['Linear Joint Pos', 'Linear Joint Vel', 'Linear Joint Acc'])
    );
    fixture.componentInstance.graphExpanded['JPos'] = false;
    fixture.detectChanges();
    expect(fixture.componentInstance.graphExpanded['JPos']).toBe(false);
    fixture.destroy();
  });

  it('renders all six link kinematics graphs with valid expansion headers', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'AB');
    Object.assign(fixture.componentInstance.graphExpanded, {
      LAng: true,
      LAngVel: true,
      LAngAcc: true,
      LPos: true,
      LVel: true,
      LAcc: true,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('app-analysis-graph')).toHaveLength(6);
    expect(fixture.nativeElement.querySelector('mat-panel-title mat-panel-title')).toBeNull();
    fixture.destroy();
  });

  it('does not render unfinished axial-force or stress graph placeholders', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], 'AB');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Axial Force');
    expect(fixture.nativeElement.textContent).not.toContain('Axial Stress');
    fixture.destroy();
  });
});
