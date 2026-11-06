import { Directive, forwardRef, inject } from '@angular/core';
import { Joint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { editPanelHandle } from '../../services/edit-panel-handle';
import { PART_LINK_TARGET, PartLinkTarget } from '../BLOCKS/part-link/part-link-target';

/**
 * The Masses table's part links: a body's name goes where every part link
 * goes, and for a link it lands on that link's mass fields too, since a row of
 * masses is why the reader pressed it. Scoped to the table, so the issues
 * further down the drawer still open a part the ordinary way.
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

  point(part: Joint | Link | undefined): void {
    this.parent.point(part);
  }

  open(part: Joint | Link): void {
    this.parent.open(part);
    // Open its mass section even when the reader last left it folded shut.
    if (part instanceof RealLink) editPanelHandle()?.expandSection('LMass');
  }
}
