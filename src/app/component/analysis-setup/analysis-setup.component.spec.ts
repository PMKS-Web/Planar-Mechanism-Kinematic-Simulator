import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MechanismService } from '../../services/mechanism.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { SettingsService } from '../../services/settings.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { SetupIssue } from '../../model/mechanism/setup-issue';
import { RevJoint } from '../../model/joint';
import { jointRef, prose } from '../../model/prose';
import { PART_LINK_TARGET } from '../BLOCKS/part-link/part-link-target';
import { AnalysisSetupComponent } from './analysis-setup.component';

interface SetupState {
  /** What the mechanism still has in the way. Empty means ready. */
  issues?: SetupIssue[];
  /** What force analysis still wants, as `forceSetupIssues` returns it. */
  force?: SetupIssue[];
}

const blocker = (title: string, fixes = [prose`Delete a link`]): SetupIssue => ({
  severity: 'blocker',
  title,
  summary: prose`Something about the drawing.`,
  explain: 'The rule behind it.',
  fixes,
});

/**
 * The drawer over a stubbed drawing. Only the questions the template asks are
 * answered: the readiness rules themselves are the model's specs, not this
 * one's, and what is being checked here is what the drawer does with them.
 */
async function createSetup(mode: 'kinematic' | 'force', tab: TabID, state: SetupState = {}) {
  const issues = state.issues ?? [];
  const force = state.force ?? [];
  const blockers = issues.filter((issue) => issue.severity === 'blocker').length;
  const mechanism = {
    links: [],
    joints: [],
    onMechUpdateState: new BehaviorSubject(0),
    readinessOfEachMechanism: () => [{ id: 'M1', checks: issues }],
    unassignedReports: () => [],
    forceSetupIssues: () => force,
    forceAnalysisReady: () => force.every((issue) => issue.severity !== 'blocker'),
    oneValidMechanismExists: () => blockers === 0,
    blockerCount: () => blockers,
    bodyLabel: () => '',
    cylinderAt: () => undefined,
  } as unknown as MechanismService;

  const setTab = vi.fn();
  const tabs = { getCurrentTab: () => tab, setTab } as unknown as SelectedTabService;
  const target = { point: vi.fn(), open: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [AnalysisSetupComponent],
    providers: [
      { provide: MechanismService, useValue: mechanism },
      { provide: ActiveObjService, useValue: new ActiveObjService() },
      { provide: SettingsService, useValue: new SettingsService() },
      { provide: SelectedTabService, useValue: tabs },
      { provide: PART_LINK_TARGET, useValue: target },
    ],
    schemas: [NO_ERRORS_SCHEMA],
  }).compileComponents();

  const fixture: ComponentFixture<AnalysisSetupComponent> =
    TestBed.createComponent(AnalysisSetupComponent);
  fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  return { fixture, setTab, target };
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
      issues: [blocker('No input is set')],
    });

    expect(enterButton(fixture)).toBeNull();
    fixture.destroy();
  });

  it('asks the force question in the force drawer, not the kinematic one', async () => {
    // Kinematically ready and force-unready at once: the drawing runs, but
    // nothing loads it, so the force drawer must not offer its mode.
    const { fixture } = await createSetup('force', TabID.EDIT, {
      force: [blocker('Nothing loads the mechanism')],
    });

    expect(enterButton(fixture)).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Nothing loads the mechanism');
    fixture.destroy();
  });

  it('shows a ready force section as its name and chip, with the way in under it', async () => {
    const { fixture, setTab } = await createSetup('force', TabID.ANALYZE);

    expect(fixture.nativeElement.querySelector('issue-block')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Ready');
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

describe('AnalysisSetupComponent issues', () => {
  afterEach(() => TestBed.resetTestingModule());

  const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim();

  it('shows what is wrong, and keeps how to fix it behind Show fixes', async () => {
    // Two issues, so the list is one to scan: each starts with its fixes shut.
    const { fixture } = await createSetup('kinematic', TabID.EDIT, {
      issues: [blocker('No input is set'), blocker('Slider D has no slot')],
    });
    const issue: HTMLElement = fixture.nativeElement.querySelector('issue-block');

    expect(text(issue.querySelector('.issueTitle'))).toBe('No input is set');
    expect(text(issue.querySelector('.issueSummary'))).toBe('Something about the drawing.');
    expect(issue.querySelector('.issuePanel')).toBeNull();
    const toggle: HTMLButtonElement = issue.querySelector('.issueToggle')!;
    expect(text(toggle)).toContain('Show fixes');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();
    const panel = issue.querySelector('.issuePanel')!;
    expect(text(toggle)).toContain('Hide fixes');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(text(panel.querySelector('.issueExplain'))).toBe('The rule behind it.');
    expect(text(panel.querySelector('.issueLabel'))).toBe('Required to run. One way to fix it:');
    // One fix is a sentence, not a list of one.
    expect(panel.querySelector('ul')).toBeNull();
    expect(text(panel.querySelector('.issueFix'))).toBe('Delete a link');
    fixture.destroy();
  });

  it('opens the fixes of an issue alone in its section', async () => {
    const { fixture } = await createSetup('kinematic', TabID.EDIT, {
      issues: [blocker('No input is set')],
    });
    const issue: HTMLElement = fixture.nativeElement.querySelector('issue-block');
    const toggle: HTMLButtonElement = issue.querySelector('.issueToggle')!;

    expect(issue.querySelector('.issuePanel')).not.toBeNull();
    expect(text(toggle)).toContain('Hide fixes');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // And it still folds.
    toggle.click();
    fixture.detectChanges();
    expect(issue.querySelector('.issuePanel')).toBeNull();
    fixture.destroy();
  });

  it('lists two or more fixes as suggestions, each a bullet', async () => {
    const { fixture } = await createSetup('kinematic', TabID.EDIT, {
      issues: [
        blocker('2 degrees of freedom, needs 1', [prose`Ground a joint`, prose`Delete a link`]),
      ],
    });
    const issue: HTMLElement = fixture.nativeElement.querySelector('issue-block');

    expect(text(issue.querySelector('.issueLabel'))).toBe('Required to run. Some ways to fix it:');
    expect([...issue.querySelectorAll('li.issueFix')].map(text)).toEqual([
      'Ground a joint',
      'Delete a link',
    ]);
    fixture.destroy();
  });

  it('says Show less, and the note, where a warning has nothing to change', async () => {
    const toggle: SetupIssue = {
      severity: 'warning',
      title: 'Passes through a toggle',
      summary: prose`Near dead-center, a small input move gives a large output move.`,
      explain: 'Clamps use this on purpose.',
      fixes: [],
      note: 'Nothing to change.',
    };
    const { fixture } = await createSetup('kinematic', TabID.EDIT, { issues: [toggle] });
    const issue: HTMLElement = fixture.nativeElement.querySelector('issue-block');
    const button = issue.querySelector('.issueToggle') as HTMLButtonElement;
    // Alone in its section, so it opens with its note showing.
    expect(text(button)).toContain('Show less');
    expect(text(issue.querySelector('.issueLabel'))).toBe('Optional, it runs as is.');
    expect(text(issue.querySelector('.issueNote'))).toBe('Nothing to change.');
    fixture.destroy();
  });

  it('draws a part the text names as a link to it, and no Go To buttons', async () => {
    const c = new RevJoint('C', 0, 0);
    const { fixture, target } = await createSetup('kinematic', TabID.EDIT, {
      issues: [blocker("Joint C can't be the input", [prose`Set ${jointRef(c)} to Revolute`])],
    });
    // Alone in its section, so its fixes are already open.
    const issue: HTMLElement = fixture.nativeElement.querySelector('issue-block');

    expect(fixture.nativeElement.querySelector('button-block')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Go To');
    const link: HTMLButtonElement = issue.querySelector('part-link button')!;
    expect(text(link)).toBe('joint C');
    link.dispatchEvent(new Event('pointerenter'));
    expect(target.point).toHaveBeenCalledWith(c);
    link.click();
    expect(target.open).toHaveBeenCalledWith(c);
    fixture.destroy();
  });

  it('folds a section with issues, and gives a ready one no chevron', async () => {
    const withIssues = await createSetup('kinematic', TabID.EDIT, {
      issues: [blocker('No input is set')],
    });
    const header: HTMLButtonElement =
      withIssues.fixture.nativeElement.querySelector('.sectionHeader');
    expect(header.getAttribute('aria-expanded')).toBe('true');
    header.click();
    withIssues.fixture.detectChanges();
    expect(withIssues.fixture.nativeElement.querySelector('issue-block')).toBeNull();
    withIssues.fixture.destroy();
    TestBed.resetTestingModule();

    const ready = await createSetup('kinematic', TabID.ANALYZE);
    const readyHeader: HTMLButtonElement =
      ready.fixture.nativeElement.querySelector('.sectionHeader');
    expect(readyHeader.querySelector('mat-icon')).toBeNull();
    expect(readyHeader.getAttribute('aria-expanded')).toBeNull();
    ready.fixture.destroy();
  });
});
