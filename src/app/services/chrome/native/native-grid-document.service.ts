import { Injectable, inject } from '@angular/core';
import { NativeEditorService } from '../../native-editor.service';
import { NativePlaybackService } from '../../native-playback.service';
import { MODEL_SCALE } from '../../../model/render-scale';
import { bodyMotionBounds } from '../../../model/body-system/body-motion-marks';
import type { GridDocument } from '../grid-document';

@Injectable({ providedIn: 'root' })
export class NativeGridDocumentService implements GridDocument {
  private readonly editor = inject(NativeEditorService);
  private readonly playback = inject(NativePlaybackService);
  // Native files always carry an authored marker size; fitting does not edit a document.
  readonly objectScaleChosen = true;
  get objectScale() {
    return this.editor.document().settings.objectScale * MODEL_SCALE;
  }
  hasParts() {
    return this.editor.document().bodies.some((body) => body.kind === 'material');
  }
  chooseObjectScale() {
    /* Authored on every native document. */
  }
  setObjectScale(scale: number) {
    this.editor.apply({
      kind: 'project',
      settings: { ...this.editor.document().settings, objectScale: scale / MODEL_SCALE },
    });
  }
  restate() {
    throw new Error('Native framing cannot rewrite document history.');
  }
  fullMotionBox() {
    const points = bodyMotionBounds(this.editor.document(), this.playback.snapshot());
    if (!points.length) return null;
    const [min, max] = points;
    const pad = Math.max(this.objectScale * 0.65, 1);
    return {
      x: min.x * MODEL_SCALE - pad,
      y: -max.y * MODEL_SCALE - pad,
      width: (max.x - min.x) * MODEL_SCALE + 2 * pad,
      height: (max.y - min.y) * MODEL_SCALE + 2 * pad,
    };
  }
}
