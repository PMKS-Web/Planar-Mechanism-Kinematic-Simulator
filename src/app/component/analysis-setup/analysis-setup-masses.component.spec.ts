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
import { AnalysisSetupComponent, POINT_MASS_NOTE } from './analysis-setup.component';

/** The force drawer's Masses table over a real drawing. */
async function createMasses(payload: string) {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.updateMechanism();
  const pointed: unknown[] = [];
  const opened: unknown[] = [];
  const tabs = {
    getCurrentTab: () => TabID.FORCE,
    setTab: () => undefined,
  } as unknown as SelectedTabService;
  await TestBed.configureTestingModule({
    imports: [NoopAnimationsModule, AnalysisSetupComponent],
    providers: [
      { provide: ActiveObjService, useValue: harness.active },
      { provide: MechanismService, useValue: harness.service },
      { provide: SettingsService, useValue: harness.settings },
      { provide: SelectedTabService, useValue: tabs },
      {
        provide: PART_LINK_TARGET,
        useValue: {
          point: (part: unknown) => pointed.push(part),
          open: (part: unknown) => opened.push(part),
        },
      },
    ],
  }).compileComponents();
  const fixture: ComponentFixture<AnalysisSetupComponent> =
    TestBed.createComponent(AnalysisSetupComponent);
  fixture.componentRef.setInput('mode', 'force');
  fixture.detectChanges();
  return { fixture, harness, pointed, opened };
}

const all = (fixture: ComponentFixture<unknown>, selector: string): HTMLElement[] => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(selector),
];

describe('AnalysisSetupComponent masses', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('names each body as a part link that lights it on the grid', async () => {
    const { fixture, harness, pointed } = await createMasses(TEMPLATE_LINKAGES['Slider_Crank']);
    const links = all(fixture, '.massRow:not(.head) part-link button');
    expect(links.length).toBe(all(fixture, '.massRow:not(.head)').length);
    links[0].dispatchEvent(new Event('pointerenter'));
    expect(pointed[0]).toBe(harness.service.links[0]);
    fixture.destroy();
  });

  it('makes the name the row’s one way to its body, with no arrow beside it', async () => {
    const { fixture, harness, opened } = await createMasses(TEMPLATE_LINKAGES['Slider_Crank']);
    expect(all(fixture, '.massRow button:not(.partLink)')).toHaveLength(0);
    all(fixture, '.massRow:not(.head) part-link button')[0].click();
    expect(opened).toEqual([harness.service.links[0]]);
    fixture.destroy();
  });

  it('leaves a slider’s inertia empty and says why, with no grayed zero', async () => {
    const { fixture } = await createMasses(TEMPLATE_LINKAGES['Slider_Crank']);
    const slider = all(fixture, '.massRow').find((row) =>
      row.querySelector('.massName')?.textContent?.includes('Slider')
    )!;
    const cells = [...slider.children] as HTMLElement[];
    // Name, mass, inertia: the inertia cell holds no field at all.
    expect(cells[2].matches('.pointMass')).toBe(true);
    expect(cells[2].querySelector('input')).toBeNull();
    expect(cells[2].getAttribute('title')).toBe(POINT_MASS_NOTE);
    expect(slider.textContent).not.toContain('0.00');
    fixture.destroy();
  });

  it('lists one machine’s bodies under no heading', async () => {
    const { fixture } = await createMasses(TEMPLATE_LINKAGES['Slider_Crank']);
    expect(all(fixture, '.massGroup')).toHaveLength(0);
    fixture.destroy();
  });

  it('groups the bodies by machine when the drawing holds several', async () => {
    const { fixture, harness } = await createMasses(TEMPLATE_LINKAGES['Three_Machines']);
    const service = harness.service;
    const headings = all(fixture, '.massGroup').map((node) => node.textContent?.trim());
    expect(headings.length).toBe(service.partitions.length);
    // Every row sits under the heading of the machine that owns its body.
    const rows = fixture.componentInstance.massGroups();
    rows.forEach((group, index) => {
      for (const row of group.rows) {
        expect(service.indexOfMechanismContaining(row.body)).toBe(index);
      }
    });
    fixture.destroy();
  });
});
