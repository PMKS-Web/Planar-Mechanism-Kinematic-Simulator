import {
  Component,
  ChangeDetectionStrategy,
  isDevMode,
  TemplateRef,
  inject,
  viewChild,
} from '@angular/core';
import {
  MatDialog,
  MatDialogRef,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
  MatDialogActions,
} from '@angular/material/dialog';
import { MechanismService } from 'src/app/services/mechanism.service';
import { UrlProcessorService } from 'src/app/services/url-processor.service';
import { SynthesisBuilderService } from 'src/app/services/synthesis/synthesis-builder.service';
import { DEV_TEMPLATES, DevTemplateID } from './dev-templates';
import { TemplateID, TEMPLATE_LINKAGES } from './template-linkages';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { PanelSectionComponent } from '../../BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../../BLOCKS/title/title.component';

@Component({
  selector: 'app-templates',
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    MatIconButton,
    MatDialogClose,
    MatIcon,
    CdkScrollable,
    MatDialogContent,
    PanelSectionComponent,
    TitleBlock,
    MatButton,
    MatDialogTitle,
    MatDialogActions,
  ],
})
export class TemplatesComponent {
  private dialogRef = inject<MatDialogRef<TemplatesComponent> | null>(
    MatDialogRef<TemplatesComponent>,
    { optional: true }
  );
  private dialog = inject(MatDialog);
  private mechanismSrv = inject(MechanismService);
  private urlProcessor = inject(UrlProcessorService);
  private design = inject(SynthesisBuilderService);

  /** Asks whether to replace the linkage already on the grid or open a new tab. */
  readonly openChoiceDialog = viewChild.required<TemplateRef<unknown>>('openChoiceDialog');

  /** Only a development build offers the drawings that exercise the app. */
  isDevMode(): boolean {
    return isDevMode();
  }

  openLinkage(linkage: TemplateID | DevTemplateID) {
    const content =
      linkage in DEV_TEMPLATES
        ? DEV_TEMPLATES[linkage as DevTemplateID]
        : TEMPLATE_LINKAGES[linkage as TemplateID];

    // An empty grid has nothing to lose, so load right here instead of
    // spawning a tab the user then has to switch to.
    if (this.gridIsEmpty()) {
      this.openHere(content);
      return;
    }

    this.dialog
      .open(this.openChoiceDialog())
      .afterClosed()
      .subscribe((choice) => {
        if (choice === 'replace') {
          this.openHere(content);
        } else if (choice === 'new-tab') {
          this.openInNewTab(content);
        }
      });
  }

  /**
   * Whether there is nothing here to lose.
   *
   * A synthesis design counts. Positions persist after the tab is left and are
   * cleared by the template's own load, so a reader who has drawn three of them
   * but inserted nothing yet was having them thrown away with no warning at all.
   */
  private gridIsEmpty(): boolean {
    return (
      this.mechanismSrv.joints.length === 0 &&
      this.mechanismSrv.links.length === 0 &&
      this.mechanismSrv.forces.length === 0 &&
      !this.design.hasDesign()
    );
  }

  private openHere(content: string) {
    // The same in-place rebuild undo/redo uses. Saved to history, so replacing
    // an existing linkage is a single undo away from being taken back.
    this.urlProcessor.updateFromURL(content, true, true, true);
    this.dialogRef?.close();
  }

  private openInNewTab(content: string) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    const url = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
    const dataURLString = `${url}?${content}`;

    const toolman = document.createElement('a');
    toolman.setAttribute('href', dataURLString);
    toolman.setAttribute('target', '_blank');
    toolman.style.display = 'none';
    document.body.appendChild(toolman);
    toolman.click();
    document.body.removeChild(toolman);
  }
}
