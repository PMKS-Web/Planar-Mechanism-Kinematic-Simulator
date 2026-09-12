import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';
import { StandardFieldDirective } from '../BLOCKS/standard-field/standard-field.directive';
import { PathEditorService } from '../../services/synthesis/path-editor.service';
import { SynthesisBuilderService } from '../../services/synthesis/synthesis-builder.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import {
  PATH_PRESETS,
  PathPreset,
  PathSynthesisDesign,
  pathPreset,
} from '../../model/path-synthesis';
import { MODEL_SCALE } from '../../model/render-scale';
import { Coord } from '../../model/coord';
import { freeCanvasRect } from '../../services/view-framing';
import { PathSynthesisService } from '../../services/synthesis/path-synthesis.service';
import { PathSynthesisResultComponent } from '../path-synthesis-result/path-synthesis-result.component';

@Component({
  selector: 'app-path-synthesis-panel',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    MatIcon,
    ButtonComponent,
    SegmentedComponent,
    StandardFieldDirective,
    PathSynthesisResultComponent,
  ],
  templateUrl: './path-synthesis-panel.component.html',
  styleUrls: ['./path-synthesis-panel.component.scss'],
})
export class PathSynthesisPanelComponent implements OnDestroy {
  protected synthesis = inject(PathSynthesisService);
  protected get fitMetrics() {
    const errors = this.synthesis.candidate?.errors;
    return errors
      ? {
          rms: this.format(errors.rms),
          maximum: this.format(errors.maximum),
          normalized: `${(errors.normalizedRms * 100).toFixed(2)}%`,
        }
      : undefined;
  }
  protected editor = inject(PathEditorService);
  private design = inject(SynthesisBuilderService);
  private grid = inject(SvgGridService);
  private settings = inject(SettingsService);
  private parser = inject(NumberUnitParserService);
  protected readonly presets = PATH_PRESETS;
  protected readonly preset = signal<PathPreset>('Bean');
  protected readonly error = signal('');

  ngOnDestroy(): void {
    this.editor.armed = false;
    if (this.synthesis.busy()) this.synthesis.cancel();
  }

  protected back(): void {
    this.editor.armed = false;
    this.design.stage = 'chooser';
  }

  protected choosePreset(event: Event): void {
    this.preset.set((event.target as HTMLSelectElement).value as PathPreset);
  }

  protected loadPreset = (): void => {
    const center = this.center();
    const span = this.grid.viewBoxMaxX - this.grid.viewBoxMinX;
    this.design.path = pathPreset(this.preset(), center, span > 0 ? span / 6 : 4 * MODEL_SCALE);
    this.editor.selected = -1;
    this.editor.armed = false;
    this.editor.save();
  };

  private center(): Coord {
    // Center of the unobscured drawing, rather than behind the left panel.
    const canvas = document.getElementById('canvas');
    if (!canvas) return new Coord(0, 0);
    const box = freeCanvasRect(canvas);
    return this.grid.screenToModelFromXY(box.x + box.width / 2, box.y + box.height / 2);
  }

  protected addPoint = (): void => this.editor.add(this.center());
  protected placePoints = (): void => {
    this.editor.armed = !this.editor.armed;
  };
  protected clear = (): void => {
    this.design.path = new PathSynthesisDesign();
    this.editor.selected = -1;
    this.editor.armed = false;
    this.editor.save();
  };

  protected setClosed(index: number): void {
    this.editor.target.closed = index === 1;
    this.editor.save();
  }

  protected setSmooth(index: number): void {
    this.editor.target.smooth = index === 1;
    this.editor.save();
  }

  protected get unit(): string {
    return this.parser.unitLabel(this.settings.lengthUnit.getValue());
  }

  protected format(value: number): string {
    return this.parser.formatModelLength(value, this.settings.lengthUnit.getValue());
  }

  protected coordinate(index: number, axis: 'x' | 'y', event: Event): void {
    const field = event.target as HTMLInputElement;
    const point = this.editor.target.points[index];
    const [success, value] = this.parser.parseModelLengthString(
      field.value.trim(),
      this.settings.lengthUnit.getValue()
    );
    if (!success || !Number.isFinite(value)) {
      this.error.set('Enter a finite coordinate, optionally followed by its unit.');
      field.value = this.format(point[axis]);
      return;
    }
    this.error.set('');
    if (point[axis] === value) return;
    point[axis] = value;
    this.editor.selected = index;
    this.editor.save();
    this.grid.revealOnCanvas(new Coord(point.x, point.y));
  }
}
