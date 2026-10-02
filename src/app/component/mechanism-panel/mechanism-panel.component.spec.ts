import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { createMechanismHarness } from '../../../test-utils/mechanism-harness';
import { MechanismBuilder } from '../../services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../services/transcoding/string-transcoder';
import { PART_LINK_TARGET } from '../BLOCKS/part-link/part-link-target';
import { TEMPLATE_LINKAGES } from '../MODALS/templates/template-linkages';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { MechanismPanelComponent } from './mechanism-panel.component';

/**
 * The machines on the grid, with nothing selected: every one in a list, or
 * one in detail, the same way in Edit and in the analysis modes.
 */
async function createPanel(payload: string, editable = false) {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.updateMechanism();
  const data = harness;
  const tabs = {
    getCurrentTab: () => (editable ? TabID.EDIT : TabID.ANALYZE),
  } as unknown as SelectedTabService;
  await TestBed.configureTestingModule({
    imports: [NoopAnimationsModule, MechanismPanelComponent],
    providers: [
      { provide: ActiveObjService, useValue: data.active },
      { provide: MechanismService, useValue: data.service },
      { provide: SettingsService, useValue: data.settings },
      { provide: SelectedTabService, useValue: tabs },
      { provide: PART_LINK_TARGET, useValue: { point: () => undefined, open: () => undefined } },
    ],
  }).compileComponents();
  const fixture: ComponentFixture<MechanismPanelComponent> =
    TestBed.createComponent(MechanismPanelComponent);
  fixture.componentRef.setInput('editable', editable);
  fixture.detectChanges();
  return { fixture, data };
}

const text = (fixture: ComponentFixture<unknown>, selector: string): string[] =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll(selector)].map(
    (node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  );

describe('MechanismPanelComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lists every machine, with what PMKS+ recognized, when none is picked', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['Straight_Line_Pair']);
    expect(text(fixture, '.mechTitle')).toEqual(['All mechanisms']);
    const rows = text(fixture, '.machineRow');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Mechanism 1');
    expect(rows[0]).toContain('Chebyshev straight-line linkage');
    expect(rows[1]).toContain('Peaucellier-Lipkin straight-line linkage');
    fixture.destroy();
  });

  it('shows the one picked, and goes back to all of them', async () => {
    const { fixture, data } = await createPanel(TEMPLATE_LINKAGES['Straight_Line_Pair']);
    (fixture.nativeElement.querySelectorAll('.machineRow')[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(data.active.objType).toBe('Mechanism');
    expect(data.active.selectedMechanismIndex).toBe(1);
    expect(text(fixture, '.mechTitle')).toEqual(['Mechanism 2']);
    expect(text(fixture, '.familyFact')[0]).toContain('Peaucellier-Lipkin straight-line linkage');

    (fixture.nativeElement.querySelector('.backLink') as HTMLElement).click();
    fixture.detectChanges();
    expect(text(fixture, '.mechTitle')).toEqual(['All mechanisms']);
    fixture.destroy();
  });

  it('shows a lone machine in detail at once, with nothing to go back to', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar']);
    expect(text(fixture, '.mechTitle')).toEqual(['Mechanism 1']);
    expect(fixture.nativeElement.querySelector('.backLink')).toBeNull();
    expect(text(fixture, '.linkRole')).toEqual(expect.arrayContaining(['Input crank', 'Rocker']));
    fixture.destroy();
  });

  it('in Edit, says how free a machine is, and leaves family and motion to analysis', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar'], true);
    expect(fixture.nativeElement.querySelector('.familyFact')).toBeNull();
    expect(text(fixture, '.factLabel')).toEqual([
      'Degrees of freedom',
      'Links',
      'Joints',
      'Input joint',
    ]);
    fixture.destroy();
  });

  it('never hides the Family: a match, else the body count, else not recognized', async () => {
    const counted = await createPanel(TEMPLATE_LINKAGES['Pantograph']);
    expect(text(counted.fixture, '.familyFact')[0]).toContain('Eight-bar linkage');
    // Motion is said where no family says it for the reader.
    expect(text(counted.fixture, '.factLabel')).toContain('Motion');
    counted.fixture.destroy();
    TestBed.resetTestingModule();

    const none = await createPanel(TEMPLATE_LINKAGES['Elliptical_Trammel']);
    expect(text(none.fixture, '.familyFact')[0]).toContain('Not recognized');
    expect(none.fixture.nativeElement.querySelector('.familyFact .unrecognized')).not.toBeNull();
    none.fixture.destroy();
  });

  it('leaves Motion out where a named family already says it', async () => {
    const { fixture } = await createPanel(TEMPLATE_LINKAGES['4-Bar']);
    expect(text(fixture, '.familyFact')[0]).toContain('Crank-rocker four-bar');
    expect(text(fixture, '.factLabel')).not.toContain('Motion');
    fixture.destroy();
  });

  it('names a machine by the name its author gave it, with its code beside it', async () => {
    const { fixture, data } = await createPanel(TEMPLATE_LINKAGES['Straight_Line_Pair'], true);
    data.service.renameMechanism(1, 'Straight arm');
    fixture.detectChanges();
    const rows = text(fixture, '.machineRow');
    expect(rows[1]).toContain('Straight arm');
    // In Edit the line under a name is how free it is, not what it is, and
    // no code: a machine is its name.
    expect(rows[1]).toContain('1 degree of freedom');
    expect(rows[1]).not.toContain('M2');
    expect(rows[1]).not.toContain('Peaucellier');
    fixture.destroy();
  });
});
