import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';
import { NATIVE_EDITOR_PROVIDERS } from './native-editor-providers';
import { SvgGridService } from './services/svg-grid.service';
import { MechanismService } from './services/mechanism.service';
import { SaveHistoryService } from './services/save-history.service';
import { ActiveObjService } from './services/active-obj.service';
import { UrlProcessorService } from './services/url-processor.service';
import { UrlGenerationService } from './services/url-generation.service';
import { AnalysisCompareService } from './services/analysis-compare.service';
import { GridUtilsService } from './services/grid-utils.service';
import { TutorialService } from './services/tutorial.service';
import { SelectedTabService, TabID } from './selected-tab.service';
import { CHROME_PROJECT } from './services/chrome/chrome-project';
import { CHROME_TABS } from './services/chrome/chrome-tokens';
import { RightPanelComponent } from './component/right-panel/right-panel.component';
import { NativeEditorService } from './services/native-editor.service';
import { nativeMultiwayPin } from '../test-utils/verification/native-editor-fixtures';
import { attachmentWorld, weldedSelection } from './model/body-system/body-joint-interaction';

it('constructs the actual shell and every drawer without any legacy document consumer', async () => {
  const forbidden = [
    MechanismService,
    SaveHistoryService,
    ActiveObjService,
    UrlProcessorService,
    UrlGenerationService,
    AnalysisCompareService,
    GridUtilsService,
    TutorialService,
    SelectedTabService,
  ];
  await TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      NATIVE_EDITOR_PROVIDERS,
      provideNoopAnimations(),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...forbidden.map((provide) => ({
        provide,
        useFactory: () => {
          throw new Error(`Legacy consumer: ${provide.name}`);
        },
      })),
    ],
  }).compileComponents();
  vi.spyOn(TestBed.inject(SvgGridService), 'setNewElement').mockImplementation(() => undefined);
  const fixture = TestBed.createComponent(AppComponent);
  fixture.detectChanges();
  const tabs = TestBed.inject(CHROME_TABS);
  const editor = TestBed.inject(NativeEditorService),
    drawing = nativeMultiwayPin();
  editor.loadDocument(drawing.document);
  editor.select({ kind: 'junction', id: drawing.junction.id });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('input[data-field="x"]') as HTMLInputElement;
  const before = editor.store.undoDepth,
    beforeDocument = editor.document();
  input.value = '0.25';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  fixture.detectChanges();
  await fixture.whenStable();
  expect(editor.store.undoDepth).toBe(before + 1);
  expect(attachmentWorld(editor.document(), drawing.junction.hub)!.x).toBeCloseTo(0.25, 10);
  editor.history('undo');
  expect(editor.document()).toEqual(beforeDocument);
  editor.select({ kind: 'body', id: drawing.members[0] });
  fixture.detectChanges();
  await fixture.whenStable();
  editor.apply({ kind: 'joint-kind', jointId: drawing.junction.joints[0], jointKind: 'weld' });
  editor.select(weldedSelection(editor.document(), drawing.members[0]));
  fixture.detectChanges();
  await fixture.whenStable();
  for (const tab of [TabID.SYNTHESIZE, TabID.EDIT, TabID.ANALYZE, TabID.FORCE]) {
    tabs.setTab(tab);
    for (const drawer of [1, 3, 5, 6, 7]) {
      RightPanelComponent.isOpen = true;
      RightPanelComponent.openTab = drawer;
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }
  expect(fixture.nativeElement.querySelectorAll('app-native-grid')).toHaveLength(1);
  expect(fixture.nativeElement.querySelectorAll('app-top-bar')).toHaveLength(1);
  expect(fixture.nativeElement.querySelectorAll('app-playback-bar')).toHaveLength(1);
  expect(TestBed.inject(CHROME_PROJECT).shareUrl()).toContain('editor=native');
  expect(TestBed.inject(CHROME_PROJECT).open('invalid drawing')).toBe(false);
  fixture.destroy();
});
