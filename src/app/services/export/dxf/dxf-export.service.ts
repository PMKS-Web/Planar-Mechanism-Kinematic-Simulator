import { inject, Injectable } from '@angular/core';
import { MechanismService } from '../../mechanism.service';
import { SettingsService } from '../../settings.service';
import { buildSemanticDxf } from './semantic-dxf';
import { writeDxf } from './dxf-writer';

export interface DxfExportOptions {
  fileName?: string;
  includeLabels?: boolean;
  includeKinematicAnnotations?: boolean;
  includeForces?: boolean;
  includeConstruction?: boolean;
}

export interface DxfExportFile {
  name: string;
  mime: 'application/dxf;charset=utf-8';
  content: string;
  blob: Blob;
}

export const DEFAULT_DXF_EXPORT_OPTIONS = {
  fileName: 'mechanism',
  includeLabels: false,
  includeKinematicAnnotations: true,
  includeForces: true,
  includeConstruction: true,
} as const;

/** Produces a semantic start-pose drawing; the UI owns how the Blob is delivered. */
@Injectable({ providedIn: 'root' })
export class DxfExportService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);

  create(options: DxfExportOptions = {}): DxfExportFile {
    const choices = { ...DEFAULT_DXF_EXPORT_OPTIONS, ...options };
    const content = this.mechanism.encodeFromStartPose(() =>
      writeDxf(
        buildSemanticDxf({
          joints: this.mechanism.joints,
          links: this.mechanism.links,
          forces: this.mechanism.forces,
          lengthUnit: this.settings.lengthUnit.value,
          defaultInputClockwise: this.settings.isInputCW.value,
          includeLabels: choices.includeLabels,
          includeKinematicAnnotations: choices.includeKinematicAnnotations,
          includeForces: choices.includeForces,
          includeConstruction: choices.includeConstruction,
        })
      )
    );
    const mime = 'application/dxf;charset=utf-8' as const;
    return {
      name: `${fileStem(choices.fileName || DEFAULT_DXF_EXPORT_OPTIONS.fileName)}.dxf`,
      mime,
      content,
      blob: new Blob([content], { type: mime }),
    };
  }
}

function fileStem(requested: string): string {
  const withoutExtension = requested.trim().replace(/\.dxf$/i, '');
  const safe = withoutExtension.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^[._-]+|[._-]+$/g, '');
  return safe || DEFAULT_DXF_EXPORT_OPTIONS.fileName;
}
