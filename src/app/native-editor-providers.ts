import { APP_INITIALIZER, Provider, inject } from '@angular/core';
import { EDITOR_CONTENT } from './editor-content';
import { NativeGridComponent } from './component/native-editor/native-grid.component';
import { NativeInspectorComponent } from './component/native-editor/native-inspector.component';
import { NativePreviewPanelComponent } from './component/native-editor/native-preview-panel.component';
import {
  CHROME_GRID,
  CHROME_HISTORY,
  CHROME_MECHANISM,
  CHROME_PERMISSION,
  CHROME_SELECTION,
  CHROME_SETTINGS,
  CHROME_TABS,
} from './services/chrome/chrome-tokens';
import { CHROME_STATUS } from './services/chrome/chrome-status';
import { CHROME_PROJECT } from './services/chrome/chrome-project';
import { CHROME_TUTORIAL } from './services/chrome/chrome-tutorial';
import { GRID_DOCUMENT } from './services/chrome/grid-document';
import { SETTINGS_COMMANDS } from './services/chrome/settings-commands';
import { NativeChromeMechanismService } from './services/chrome/native/native-chrome-mechanism.service';
import { NativeChromeHistoryService } from './services/chrome/native/native-chrome-history.service';
import { NativeChromeTabsService } from './services/chrome/native/native-chrome-tabs.service';
import { NativeChromePermissionService } from './services/chrome/native/native-chrome-permission.service';
import { NativeChromeSelectionService } from './services/chrome/native/native-chrome-selection.service';
import { NativeSettingsService } from './services/chrome/native/native-settings.service';
import { NativeChromeProjectService } from './services/chrome/native/native-chrome-project.service';
import { NativeChromeTutorialService } from './services/chrome/native/native-chrome-tutorial.service';
import { NativeChromeStatusService } from './services/chrome/native/native-chrome-status.service';
import { NativeGridDocumentService } from './services/chrome/native/native-grid-document.service';
import { NativeSettingsCommandsService } from './services/chrome/native/native-settings-commands.service';
import { SvgGridService } from './services/svg-grid.service';
import { NativeEditorSessionService } from './services/native-editor-session.service';

export const NATIVE_EDITOR_PROVIDERS: Provider[] = [
  { provide: CHROME_MECHANISM, useExisting: NativeChromeMechanismService },
  { provide: CHROME_HISTORY, useExisting: NativeChromeHistoryService },
  { provide: CHROME_TABS, useExisting: NativeChromeTabsService },
  { provide: CHROME_PERMISSION, useExisting: NativeChromePermissionService },
  { provide: CHROME_SELECTION, useExisting: NativeChromeSelectionService },
  { provide: CHROME_SETTINGS, useExisting: NativeSettingsService },
  { provide: CHROME_GRID, useExisting: SvgGridService },
  { provide: CHROME_PROJECT, useExisting: NativeChromeProjectService },
  { provide: CHROME_TUTORIAL, useExisting: NativeChromeTutorialService },
  { provide: CHROME_STATUS, useExisting: NativeChromeStatusService },
  { provide: GRID_DOCUMENT, useExisting: NativeGridDocumentService },
  { provide: SETTINGS_COMMANDS, useExisting: NativeSettingsCommandsService },
  {
    provide: EDITOR_CONTENT,
    useValue: {
      canvas: NativeGridComponent,
      edit: NativeInspectorComponent,
      analysis: NativePreviewPanelComponent,
      synthesis: NativePreviewPanelComponent,
      analysisSetup: NativePreviewPanelComponent,
      export: NativePreviewPanelComponent,
      tutorial: NativePreviewPanelComponent,
      tutorialInputs: { feature: 'tutorial', title: 'Tutorial' },
      analysisInputs: { feature: 'analysis', title: 'Kinematic Analysis' },
      synthesisInputs: { feature: 'synthesis', title: 'Synthesis' },
      exportInputs: { feature: 'export', title: 'Export Data' },
    },
  },
  {
    provide: APP_INITIALIZER,
    multi: true,
    useFactory: () => {
      const session = inject(NativeEditorSessionService);
      return () => session.start();
    },
  },
];
