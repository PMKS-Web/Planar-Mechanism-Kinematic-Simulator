import { Directive, forwardRef, inject } from '@angular/core';
import { Joint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { PanelFoldStateService } from '../../services/panel-fold-state.service';
import { PART_LINK_TARGET, PartLinkTarget } from '../BLOCKS/part-link/part-link-target';

/**
 * The Masses table's part links explicitly open Edit, and for a link land on
 * its mass fields too: the reader came to change its mass or center of mass,
 * rather than inspect its graphs. Scoped to the table, so other part links
 * keep the current analysis mode.
 *
 * The rows used to end in an arrow that did this beside a name that did
 * nothing; the name is the one control now.
 */
@Directive({
  selector: '[massPartLinks]',
  providers: [{ provide: PART_LINK_TARGET, useExisting: forwardRef(() => MassPartLinksDirective) }],
})
export class MassPartLinksDirective implements PartLinkTarget {
  private readonly parent = inject(PART_LINK_TARGET, { skipSelf: true });
  private readonly folds = inject(PanelFoldStateService);

  point(part: Joint | Link | undefined): void {
    this.parent.point(part);
  }

  open(part: Joint | Link): void {
    // The Edit panel is not mounted yet when arriving from analysis. Open its
    // shared fold state before navigation, even if it was last left shut.
    if (part instanceof RealLink) this.folds.editSections['LMass'] = true;
    this.parent.open(part, 'edit');
  }
}
