import { Injectable, inject } from '@angular/core';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { MechanismService } from '../mechanism.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ModelPoint } from '../../model-frame.directive';

/** Transient selection/placement belongs here; the target itself rides in the document. */
@Injectable({ providedIn: 'root' })
export class PathEditorService {
  private design = inject(SynthesisBuilderService);
  private mechanism = inject(MechanismService);
  private tabs = inject(SelectedTabService);
  armed = false;
  selected = -1;

  get active(): boolean {
    return this.tabs.getCurrentTab() === TabID.SYNTHESIZE && this.design.stage === 'path';
  }

  get target() {
    return this.design.path;
  }

  save(): void {
    this.design.valueChanges.next(true);
    this.mechanism.save();
  }

  add(at: ModelPoint): void {
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
    this.target.points = [...this.target.points, { x: at.x, y: at.y }];
    this.selected = this.target.points.length - 1;
    this.save();
  }

  remove(index: number): void {
    if (!this.target.points[index]) return;
    this.target.points = this.target.points.filter((_, i) => i !== index);
    this.selected = -1;
    this.save();
  }

  reorder(index: number, offset: number): void {
    const points = [...this.target.points];
    const next = index + offset;
    if (!points[index] || !points[next]) return;
    [points[index], points[next]] = [points[next], points[index]];
    this.target.points = points;
    this.selected = next;
    this.save();
  }
}
