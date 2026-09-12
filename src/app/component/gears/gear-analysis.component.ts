import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { GEAR_QUANTITIES } from '../../model/gear-analysis';
import { AnalysisGraphSectionComponent } from '../analysis-graph-section/analysis-graph-section.component';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../BLOCKS/title/title.component';

@Component({
  selector: 'app-gear-analysis',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [AnalysisGraphSectionComponent, PanelSectionComponent, TitleBlock],
  template: `<panel-section>
    <title-block>{{ gear?.name || 'Gear' }}</title-block>
    @if (force()) {
      <p>
        Force transmission through gears is not supported in V1. Select an eligible independent
        gear-free mechanism for force analysis.
      </p>
    } @else {
      @for (quantity of quantities; track quantity.property; let i = $index) {
        <app-analysis-graph-section
          [label]="quantity.label"
          analysis="kinematic"
          analysisType="loop"
          [mechProp]="quantity.property"
          [mechPart]="active.selectedGearId || ''"
          [(expanded)]="expanded[i]"
        />
      }
      <p>
        Angular position includes the authored reference heading. Travel measures rotation from that
        heading across the complete cycle.
      </p>
    }
  </panel-section>`,
  styles: [
    `
      p {
        white-space: normal;
        overflow-wrap: anywhere;
        font-size: 12px;
        margin: 12px 15px;
        color: var(--text-secondary);
      }
    `,
  ],
})
export class GearAnalysisComponent {
  readonly force = input(false);
  protected active = inject(ActiveObjService);
  private mechanism = inject(MechanismService);
  protected quantities = GEAR_QUANTITIES;
  protected expanded = [false, false, false, false];
  protected get gear() {
    return this.mechanism.gears.find((g) => g.id === this.active.selectedGearId);
  }
}
