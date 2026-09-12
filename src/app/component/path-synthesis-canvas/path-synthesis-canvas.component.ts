import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { PathEditorService } from '../../services/synthesis/path-editor.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { ModelFrameDirective, UprightDirective, ModelPoint } from '../../model-frame.directive';
import { KeyboardShortcutsService } from '../../services/keyboard-shortcuts.service';

/** A separate SVG layer keeps target editing out of the mechanism's drag state machine. */
@Component({
  selector: 'g[appPathSynthesisCanvas]',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ModelFrameDirective, UprightDirective],
  templateUrl: './path-synthesis-canvas.component.html',
  styleUrls: ['./path-synthesis-canvas.component.scss'],
})
export class PathSynthesisCanvasComponent implements OnDestroy {
  protected editor = inject(PathEditorService);
  protected grid = inject(SvgGridService);
  private keySub = inject(KeyboardShortcutsService).pressed.subscribe((id) => {
    if (id === 'edit.deselect' && this.editor.active) {
      this.cancel();
      this.editor.armed = false;
    }
  });
  private gesture?: {
    id: number;
    index: number;
    client: ModelPoint;
    start?: ModelPoint;
    element: Element;
    points: ModelPoint[];
  };

  protected down(event: PointerEvent, index = -1): void {
    if (!this.editor.active || event.button !== 0 || this.gesture) return;
    event.stopPropagation();
    event.preventDefault();
    const element = event.currentTarget as Element;
    element.setPointerCapture(event.pointerId);
    this.editor.selected = index;
    const point = this.editor.target.points[index];
    this.gesture = {
      id: event.pointerId,
      index,
      client: { x: event.clientX, y: event.clientY },
      start: point ? { ...point } : undefined,
      element,
      points: this.editor.target.points,
    };
  }

  protected move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== event.pointerId) return;
    event.stopPropagation();
    if (!this.editor.active || gesture.points !== this.editor.target.points) {
      this.cancel();
      return;
    }
    if (!gesture.start) return;
    const at = this.grid.screenToModelFromXY(event.clientX, event.clientY);
    const origin = this.grid.screenToModelFromXY(gesture.client.x, gesture.client.y);
    Object.assign(this.editor.target.points[gesture.index], {
      x: gesture.start.x + at.x - origin.x,
      y: gesture.start.y + at.y - origin.y,
    });
  }

  protected up(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== event.pointerId) return;
    event.stopPropagation();
    if (!this.editor.active || gesture.points !== this.editor.target.points) {
      this.cancel();
      return;
    }
    this.move(event);
    this.gesture = undefined;
    gesture.element.releasePointerCapture(event.pointerId);
    if (gesture.start) {
      const p = this.editor.target.points[gesture.index];
      if (p.x !== gesture.start.x || p.y !== gesture.start.y) this.editor.save();
    } else if (Math.hypot(event.clientX - gesture.client.x, event.clientY - gesture.client.y) < 5) {
      this.editor.add(this.grid.screenToModelFromXY(event.clientX, event.clientY));
    }
  }

  protected cancel(): void {
    const gesture = this.gesture;
    this.gesture = undefined;
    if (gesture?.start && gesture.points === this.editor.target.points) {
      Object.assign(gesture.points[gesture.index], gesture.start);
    }
    if (gesture?.element.hasPointerCapture(gesture.id))
      gesture.element.releasePointerCapture(gesture.id);
  }

  ngOnDestroy(): void {
    this.cancel();
    this.keySub.unsubscribe();
  }
}
