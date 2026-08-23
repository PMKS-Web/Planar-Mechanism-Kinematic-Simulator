import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MechanismService } from '../../services/mechanism.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { SettingsService } from '../../services/settings.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { AnalysisSetupComponent } from './analysis-setup.component';

interface SetupState {
  /** What each mechanism still has in the way. Empty means ready. */
  checks?: { state: 'blocker' | 'warning'; title: string; body: string }[];
  /** Force requirements, in the shape `forceAnalysisRequirements` returns. */
  requirements?: { met: boolean; warning?: boolean; title: string; body: string }[];
}

/**
 * The drawer over a stubbed drawing. Only the questions the template asks are
 * answered: the readiness rules themselves are the model's specs, not this
 * one's, and what is being checked here is what the drawer does with them.
 */
async function createSetup(mode: 'kinematic' | 'force', tab: TabID, state: SetupState = {}) {
  const checks = state.checks ?? [];
  const requirements = state.requirements ?? [];
  const blockers = checks.filter((check) => check.state === 'blocker').length;
  const mechanism = {
    links: [],
    joints: [],
    onMechUpdateState: new BehaviorSubject(0),
    readinessOfEachMechanism: () => [{ id: 'M1', checks }],
    unassignedReports: () => [],
    forceAnalysisRequirements: () => requirements,
    forceAnalysisReady: () =>
      requirements.every((requirement) => requirement.met || requirement.warning === true),
    oneValidMechanismExists: () => blockers === 0,
    blockerCount: () => blockers,
    bodyLabel: () => '',
    cylinderAt: () => undefined,
  } as unknown as MechanismService;

  const setTab = vi.fn();
  const tabs = { getCurrentTab: () => tab, setTab } as unknown as SelectedTabService;

  await TestBed.configureTestingModule({
    imports: [AnalysisSetupComponent],
    providers: [
      { provide: MechanismService, useValue: mechanism },
      { provide: ActiveObjService, useValue: new ActiveObjService() },
      { provide: SettingsService, useValue: new SettingsService() },
      { provide: SelectedTabService, useValue: tabs },
    ],
    schemas: [NO_ERRORS_SCHEMA],
  }).compileComponents();

  const fixture: ComponentFixture<AnalysisSetupComponent> =
    TestBed.createComponent(AnalysisSetupComponent);
  fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  return { fixture, setTab };
}

function enterButton(fixture: ComponentFixture<AnalysisSetupComponent>): HTMLButtonElement | null {
  return fixture.nativeElement.querySelector('.enterButton');
}

describe('AnalysisSetupComponent way in', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('offers the mode it is about once nothing is in the way', async () => {
    const { fixture, setTab } = await createSetup('kinematic', TabID.EDIT);

    const button = enterButton(fixture);
    expect(button?.textContent?.trim()).toBe('Switch to Kinematic Analysis');
    button!.click();
    expect(setTab).toHaveBeenCalledWith(TabID.ANALYZE);
    fixture.destroy();
  });

  it('offers no way in while a blocker stands', async () => {
    const { fixture } = await createSetup('kinematic', TabID.EDIT, {
      checks: [{ state: 'blocker', title: 'No input', body: 'Pick a joint to drive.' }],
    });

    expect(enterButton(fixture)).toBeNull();
    fixture.destroy();
  });

  it('asks the force question in the force drawer, not the kinematic one', async () => {
    // Kinematically ready and force-unready at once: the drawing runs, but
    // nothing loads it, so the force drawer must not offer its mode.
    const { fixture } = await createSetup('force', TabID.EDIT, {
      requirements: [
        { met: true, title: 'A mechanism that runs', body: 'There is one.' },
        { met: false, title: 'Something to load it', body: 'Attach a force.' },
      ],
    });

    expect(enterButton(fixture)).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Something to load it');
    fixture.destroy();
  });

  it('replaces the empty force accordion with the way in', async () => {
    const { fixture, setTab } = await createSetup('force', TabID.ANALYZE, {
      requirements: [{ met: true, title: 'A mechanism that runs', body: 'There is one.' }],
    });

    // The section that would have held the list is gone with the list.
    expect(fixture.nativeElement.querySelector('.checkList')).toBeNull();
    const button = enterButton(fixture);
    expect(button?.textContent?.trim()).toBe('Switch to Force Analysis');
    button!.click();
    expect(setTab).toHaveBeenCalledWith(TabID.FORCE);
    fixture.destroy();
  });

  it('does not offer a way into the mode the reader is already in', async () => {
    const { fixture } = await createSetup('kinematic', TabID.ANALYZE);

    expect(enterButton(fixture)).toBeNull();
    fixture.destroy();
  });
});
