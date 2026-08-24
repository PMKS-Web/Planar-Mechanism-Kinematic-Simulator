import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { ActiveObjService } from '../services/active-obj.service';
import { EditPanelComponent } from './edit-panel/edit-panel.component';
import { SettingsPanelComponent } from './settings-panel/settings-panel.component';
import { TopBarComponent } from './top-bar/top-bar.component';

describe('always-on force and weld UI', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsPanelComponent, TopBarComponent, EditPanelComponent],
      providers: [provideAnimations()],
    }).compileComponents();
  });

  it('does not expose experimental enablement or loop equations actions', () => {
    const settings = TestBed.createComponent(SettingsPanelComponent);
    settings.detectChanges();
    const settingsText = settings.nativeElement.textContent;
    expect(settingsText).not.toContain('Experimental Features');
    expect(settingsText).not.toContain('Enable Forces');
    expect(settingsText).not.toContain('Enable Welded');
    expect(settingsText).not.toContain('Equations');

    const topBar = TestBed.createComponent(TopBarComponent);
    topBar.detectChanges();
    expect(topBar.nativeElement.textContent).not.toContain('Equations');
  });

  it('renders weld and force editing controls without enablement flags', () => {
    const active = TestBed.inject(ActiveObjService);
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 2, 0);
    const ab = new RealLink('AB', [a, b]);
    const bc = new RealLink('BC', [b, c]);
    a.links = [ab];
    b.links = [ab, bc];
    c.links = [bc];
    a.connectedJoints = [b];
    b.connectedJoints = [a, c];
    c.connectedJoints = [b];

    active.objType = 'Joint';
    active.selectedJoint = b;
    const fixture: ComponentFixture<EditPanelComponent> =
      TestBed.createComponent(EditPanelComponent);
    fixture.detectChanges();
    // One Weld toggle, not a Weld/Unweld button pair: welding is one axis of
    // the 2x2 (§2.1), and two buttons cannot show which side of it the joint is
    // currently on. Unwelding is the same control turned off.
    expect(fixture.nativeElement.textContent).toContain('Weld');
    expect(fixture.nativeElement.textContent).not.toContain('Unweld');
    expect(fixture.nativeElement.querySelectorAll('mat-slide-toggle').length).toBeGreaterThan(2);

    active.objType = 'Link';
    active.selectedLink = bc;
    active.fakeUpdateSelectedObj();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Add Force');

    active.objType = 'Force';
    active.selectedForce = new Force(
      'F1',
      bc,
      new Coord(1.5, 0),
      new Coord(1.5, 1),
      false,
      true,
      10
    );
    active.fakeUpdateSelectedObj();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Edit Force');
    expect(fixture.nativeElement.textContent).toContain('Force Components');
    expect(fixture.nativeElement.textContent).toContain('Force Base Frame');
  });

  // The template library used to be checked here by counting cards and naming a
  // few of them. It has its own spec now — templates.component.spec.ts — which
  // checks coverage in both directions instead of against a list of titles that
  // went stale the moment a card was renamed.
});
