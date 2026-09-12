import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MechanismService } from '../../services/mechanism.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { Gear, GearMesh, gearPitchRadius } from '../../model/gear';
import { GearDrawingComponent } from './gear-drawing.component';
import { UprightDirective } from '../../model-frame.directive';
import { validateGearAssembly } from '../../model/mechanism/gear-validation';

@Component({
  selector: 'g[appGearLayer]',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [GearDrawingComponent, UprightDirective],
  template: `
    @for (gear of mechanism.gears; track gear.id) {
      @if (center(gear); as c) {
        @if (!mechanism.isAtStartPose() && !mechanism.isPlaying) {
          <svg:g [attr.transform]="startTransform(gear)" pointer-events="none" opacity="0.35">
            <svg:line
              x1="0"
              y1="0"
              y2="0"
              [attr.x2]="radius(gear) * 0.85"
              stroke="var(--brand)"
              stroke-dasharray="4 3"
              vector-effect="non-scaling-stroke"
            />
          </svg:g>
        }
        <svg:g
          [attr.transform]="transform(gear)"
          appGearDrawing
          [gear]="gear"
          [detail]="radius(gear) > grid.scaleWithZoom(35)"
          [class.selected]="active.objType === 'Gear' && active.selectedGearId === gear.id"
          [class.invalid]="invalid(gear.id)"
          [attr.data-gear-id]="gear.id"
          [attr.data-gear-center]="gear.centerJointId"
          role="button"
          tabindex="0"
          [attr.aria-label]="'Gear ' + (gear.name || gear.id)"
          (pointerdown)="$event.stopPropagation()"
          (click)="select($event, gear.id)"
          (keydown.enter)="select($event, gear.id)"
          (contextmenu)="select($event, gear.id); $event.preventDefault()"
        />
        <svg:g [upright]="{ x: c.x, y: c.y }" pointer-events="none">
          <svg:text
            [attr.x]="radius(gear) * 0.55"
            [attr.y]="-radius(gear) * 0.55"
            [attr.font-size]="grid.scaleWithZoom(12)"
            fill="var(--text-primary)"
          >
            {{ gear.teeth }}T
          </svg:text>
        </svg:g>
      }
    }
    @for (mesh of mechanism.gearMeshes; track mesh.id) {
      @if (marker(mesh); as p) {
        <svg:circle
          [attr.cx]="p.x"
          [attr.cy]="p.y"
          [attr.r]="grid.scaleWithZoom(6)"
          [attr.fill]="invalid(mesh.id) ? 'var(--danger)' : 'var(--surface)'"
          [attr.stroke]="
            active.objType === 'GearMesh' && active.selectedMeshId === mesh.id
              ? 'var(--brand)'
              : 'var(--text-secondary)'
          "
          [attr.stroke-width]="grid.scaleWithZoom(2)"
          role="button"
          tabindex="0"
          [attr.aria-label]="'Gear mesh ' + mesh.id"
          [attr.data-mesh-id]="mesh.id"
          (pointerdown)="$event.stopPropagation()"
          (click)="selectMesh($event, mesh.id)"
          (keydown.enter)="selectMesh($event, mesh.id)"
          (contextmenu)="selectMesh($event, mesh.id); $event.preventDefault()"
        />
      }
    }
  `,
})
export class GearLayerComponent {
  protected mechanism = inject(MechanismService);
  protected active = inject(ActiveObjService);
  protected grid = inject(SvgGridService);
  protected radius = gearPitchRadius;
  private revision = -1;
  private invalidIds = new Set<string>();
  protected center(gear: Gear) {
    return this.mechanism.joints.find((j) => j.id === gear.centerJointId);
  }
  protected transform(gear: Gear): string {
    const c = this.center(gear)!;
    const r = this.mechanism.joints.find((j) => j.id === gear.referenceJointId)!;
    return `translate(${c.x} ${c.y}) rotate(${(Math.atan2(r.y - c.y, r.x - c.x) * 180) / Math.PI})`;
  }
  protected startTransform(gear: Gear): string {
    const solved = this.mechanism.mechanismForId(gear.id);
    const points = solved?.joints[0] ?? this.mechanism.joints;
    const c = points.find((j) => j.id === gear.centerJointId)!;
    const r = points.find((j) => j.id === gear.referenceJointId)!;
    return `translate(${c.x} ${c.y}) rotate(${(Math.atan2(r.y - c.y, r.x - c.x) * 180) / Math.PI})`;
  }
  protected invalid(id: string): boolean {
    if (this.revision !== this.mechanism.solveRevision) {
      this.revision = this.mechanism.solveRevision;
      this.invalidIds = new Set(
        validateGearAssembly(
          this.mechanism.transmission,
          this.mechanism.joints,
          this.mechanism.links
        ).flatMap((d) => d.ids)
      );
      for (const solved of this.mechanism.mechanisms)
        for (const diagnostic of solved.gearDiagnostics)
          for (const affected of diagnostic.ids) this.invalidIds.add(affected);
    }
    return this.invalidIds.has(id);
  }
  protected marker(mesh: GearMesh) {
    const a = this.mechanism.gears.find((g) => g.id === mesh.gearAId);
    const b = this.mechanism.gears.find((g) => g.id === mesh.gearBId);
    const ca = a && this.center(a),
      cb = b && this.center(b);
    if (!a || !b || !ca || !cb) return undefined;
    const fraction = gearPitchRadius(a) / (gearPitchRadius(a) + gearPitchRadius(b));
    return { x: ca.x + (cb.x - ca.x) * fraction, y: ca.y + (cb.y - ca.y) * fraction };
  }
  protected select(event: Event, id: string) {
    event.stopPropagation();
    this.active.selectGear(id);
  }
  protected selectMesh(event: Event, id: string) {
    event.stopPropagation();
    this.active.selectGearMesh(id);
  }
}
