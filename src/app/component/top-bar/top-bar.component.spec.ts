import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { RevJoint } from '../../model/joint';
import { MechanismService } from '../../services/mechanism.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { TopBarComponent } from './top-bar.component';
import { MatDialog } from '@angular/material/dialog';
import { DrawingExportComponent } from '../MODALS/drawing-export/drawing-export.component';

/**
 * One button per mode, and one press meaning three different things.
 *
 * The strip is the only place these rules live -- the keyboard goes through the
 * same `select` -- so this is where they are pinned down.
 */
describe('top bar modes', () => {
  let fixture: ComponentFixture<TopBarComponent>;
  let bar: TopBarComponent;
  let mechanism: MechanismService;
  let tabs: SelectedTabService;

  const KINEMATIC = RightPanelComponent.KINEMATIC_SETUP_TAB;
  const FORCE = RightPanelComponent.FORCE_SETUP_TAB;

  /** What the strip asks about readiness, answered without a real mechanism. */
  function ready(kinematic: boolean, force = kinematic): void {
    vi.spyOn(mechanism, 'oneValidMechanismExists').mockReturnValue(kinematic);
    vi.spyOn(mechanism, 'forceAnalysisReady').mockReturnValue(force);
    vi.spyOn(mechanism, 'blockerCount').mockReturnValue(kinematic ? 0 : 2);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopBarComponent],
      providers: [provideAnimations()],
    }).compileComponents();

    RightPanelComponent.isOpen = false;
    RightPanelComponent.openTab = 0;
    mechanism = TestBed.inject(MechanismService);
    tabs = TestBed.inject(SelectedTabService);
    tabs.setTab(TabID.EDIT);
    fixture = TestBed.createComponent(TopBarComponent);
    bar = fixture.componentInstance;
  });

  it('opens the setup and stays put when the mode is not ready', () => {
    ready(false);
    bar.select(TabID.ANALYZE);
    expect(tabs.getCurrentTab()).toBe(TabID.EDIT);
    expect(RightPanelComponent.isOpen).toBe(true);
    expect(RightPanelComponent.openTab).toBe(KINEMATIC);

    // A second refusal insists rather than toggling: the reader who pressed
    // again is asking the same question, and an empty drawer is no answer.
    const attention = RightPanelComponent.attentionCount;
    bar.select(TabID.ANALYZE);
    expect(RightPanelComponent.isOpen).toBe(true);
    expect(RightPanelComponent.attentionCount).toBe(attention + 1);
  });

  it('just switches when the mode is ready and not the current one', () => {
    ready(true);
    bar.select(TabID.ANALYZE);
    expect(tabs.getCurrentTab()).toBe(TabID.ANALYZE);
    expect(RightPanelComponent.isOpen).toBe(false);
  });

  it('toggles the setup when the mode is ready and already current', () => {
    ready(true);
    bar.select(TabID.FORCE);
    expect(tabs.getCurrentTab()).toBe(TabID.FORCE);

    bar.select(TabID.FORCE);
    expect(RightPanelComponent.isOpen).toBe(true);
    expect(RightPanelComponent.openTab).toBe(FORCE);

    bar.select(TabID.FORCE);
    expect(RightPanelComponent.isOpen).toBe(false);
    expect(tabs.getCurrentTab()).toBe(TabID.FORCE);
  });

  it('sends the mode keys through the same three-way gate', () => {
    ready(false);
    // Through the service's own subject, so what runs is the component's
    // subscription rather than a copy of the rule written here.
    const keys = bar.shortcuts as unknown as { presses: { next(id: string): void } };
    keys.presses.next('mode.kinematic');
    expect(tabs.getCurrentTab()).toBe(TabID.EDIT);
    expect(RightPanelComponent.openTab).toBe(KINEMATIC);
  });

  it('shows readiness as a label rather than a second control', () => {
    ready(false);
    mechanism.joints = [new RevJoint('A', 0, 0)];
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.chip');
    expect(chips.length).toBe(2);
    for (const chip of chips) {
      expect(chip.tagName).toBe('SPAN');
      expect(chip.getAttribute('role')).toBeNull();
      expect(chip.hasAttribute('tabindex')).toBe(false);
      // Inside the mode button, so the whole tab is one target.
      expect(chip.closest('.tabButton')).not.toBeNull();
    }

    // The chip's text is spoken, since a button with a label of its own does
    // not read its contents.
    const kinematic = fixture.nativeElement.querySelectorAll('.tabButton')[2];
    expect(kinematic.getAttribute('aria-label')).toContain('2 fixes');

    // Every mode is still one tab stop, and none of them is taken out of it.
    const buttons = [...fixture.nativeElement.querySelectorAll('.tabButton')];
    expect(buttons.length).toBe(4);
    expect(buttons.every((one: HTMLElement) => one.getAttribute('tabindex') === null)).toBe(true);
  });

  it('opens a separate semantic drawing export flow from the project menu', () => {
    const dialog = TestBed.inject(MatDialog);
    const open = vi.spyOn(dialog, 'open').mockReturnValue({} as never);
    bar.menuOpen = true;

    bar.exportDrawing();

    expect(bar.menuOpen).toBe(false);
    expect(open).toHaveBeenCalledWith(
      DrawingExportComponent,
      expect.objectContaining({ autoFocus: 'dialog' })
    );
  });
});
