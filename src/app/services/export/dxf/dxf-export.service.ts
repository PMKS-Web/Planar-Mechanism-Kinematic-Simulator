import { inject, Injectable } from '@angular/core';
import { PrisJoint, RealJoint } from '../../../model/joint';
import { RealLink } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { LengthUnit } from '../../../model/unit-enums';
import { MechanismService } from '../../mechanism.service';
import { SettingsService } from '../../settings.service';
import { utf8, zipStore } from '../zip';
import { DEFAULT_DXF_EXPORT_OPTIONS, DxfExportOptions } from './dxf-options';
import { DxfEntity } from './dxf-model';
import { buildSemanticDxf, TracedPath } from './semantic-dxf';
import { writeDxf } from './dxf-writer';

export * from './dxf-options';

/** What the footer strip draws and says. */
export interface DxfSummary {
  entities: number;
  layers: number;
  width: number;
  height: number;
  unit: string;
  shapes: DxfPreviewShapes;
}

export interface DxfPreviewShapes {
  /** SVG path data for everything drawn with straight runs. */
  strokes: string;
  /** Circles, already projected into the 120 x 90 preview box. */
  holes: { cx: number; cy: number; r: number }[];
}

export interface DxfExportFile {
  name: string;
  mime: string;
  /** The DXF itself, whatever the file finally delivered is. */
  content: string;
  blob: Blob;
  /** What the footer says will come down. */
  parts: string[];
}

/** Produces a semantic start-pose drawing; the UI owns how the Blob is delivered. */
@Injectable({ providedIn: 'root' })
export class DxfExportService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);

  create(options: DxfExportOptions = {}): DxfExportFile {
    const choices = { ...DEFAULT_DXF_EXPORT_OPTIONS, ...options };
    const unit = choices.unit ?? this.settings.lengthUnit.value;
    const stem = fileStem(choices.fileName || DEFAULT_DXF_EXPORT_OPTIONS.fileName);
    const content = this.mechanism.encodeFromStartPose(() =>
      writeDxf(
        buildSemanticDxf({
          joints: this.mechanism.joints,
          links: this.mechanism.links,
          forces: this.mechanism.forces,
          lengthUnit: unit,
          defaultInputClockwise: this.settings.isInputCW.value,
          includeLabels: choices.includeLabels,
          includeKinematicAnnotations: choices.includeKinematicAnnotations,
          includeForces: choices.includeForces,
          includeConstruction: choices.includeConstruction,
          options: { ...choices, unit },
          tracedPaths: choices.includeTracedPaths ? this.tracedPaths() : [],
        })
      )
    );

    const dxfName = `${stem}.dxf`;
    if (choices.dataFile === 'none') {
      const mime = 'application/dxf;charset=utf-8';
      return {
        name: dxfName,
        mime,
        content,
        blob: new Blob([content], { type: mime }),
        parts: [dxfName],
      };
    }

    // Two files means a zip, because a browser download is one file. Said in
    // the footer rather than asked as a question: the reader chose the data,
    // not the packaging.
    const extras =
      choices.dataFile === 'json'
        ? [{ name: `${stem}.json`, text: this.dataJson(unit) }]
        : [
            { name: `${stem}-joints.csv`, text: this.jointCsv(unit) },
            { name: `${stem}-links.csv`, text: this.linkCsv(unit) },
          ];
    const zip = zipStore([
      { name: dxfName, data: utf8(content) },
      ...extras.map((extra) => ({ name: extra.name, data: utf8(extra.text) })),
    ]);
    const mime = 'application/zip';
    return {
      name: `${stem}.zip`,
      mime,
      content,
      blob: new Blob([zip as BlobPart], { type: mime }),
      parts: [dxfName, ...extras.map((extra) => extra.name)],
    };
  }

  /**
   * What the footer says the file will contain.
   *
   * Built from the same builder the export uses, so the numbers are the file's
   * rather than an estimate that could drift from it -- but without the rewind
   * to the start pose, because this runs on every keystroke and a mechanism
   * visibly jumping while somebody types a file name is worse than an extent
   * that is a frame stale. Counts do not depend on the pose at all.
   */
  summarize(options: DxfExportOptions = {}): DxfSummary {
    const choices = { ...DEFAULT_DXF_EXPORT_OPTIONS, ...options };
    const unit = choices.unit ?? this.settings.lengthUnit.value;
    const document = buildSemanticDxf({
      joints: this.mechanism.joints,
      links: this.mechanism.links,
      forces: this.mechanism.forces,
      lengthUnit: unit,
      defaultInputClockwise: this.settings.isInputCW.value,
      includeLabels: choices.includeLabels,
      includeKinematicAnnotations: choices.includeKinematicAnnotations,
      includeForces: choices.includeForces,
      includeConstruction: choices.includeConstruction,
      options: { ...choices, unit },
      tracedPaths: choices.includeTracedPaths ? this.tracedPaths() : [],
    });
    const xs: number[] = [];
    const ys: number[] = [];
    document.entities.forEach((entity) => {
      const points =
        entity.type === 'LINE'
          ? [entity.start, entity.end]
          : entity.type === 'CIRCLE'
            ? [entity.center]
            : entity.type === 'LWPOLYLINE'
              ? entity.points
              : entity.type === 'DIMENSION'
                ? [entity.from, entity.to]
                : [entity.at];
      points.forEach((point) => {
        xs.push(point.x);
        ys.push(point.y);
      });
    });
    // Only the layers something is actually drawn on: a table entry nobody used
    // is not a layer the reader will see in CAD.
    const used = new Set(document.entities.map((entity) => entity.layer));
    return {
      entities: document.entities.length,
      layers: document.layers.filter((layer) => used.has(layer.name)).length,
      width: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
      height: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
      unit: unit === LengthUnit.INCH ? 'in' : unit === LengthUnit.METER ? 'm' : 'cm',
      // The drawing itself, not a picture of a four-bar: the thumbnail is there
      // to catch the two mistakes worth catching -- nothing traced when the
      // reader meant to trace, holes where marks were meant -- and a stylised
      // stand-in catches neither.
      shapes: previewShapes(document.entities, xs, ys),
    };
  }

  /** Whether any joint is set to trace, which is what the paths option needs. */
  hasTracedJoint(): boolean {
    return this.mechanism.joints.some((joint) => (joint as { showCurve?: boolean }).showCurve);
  }

  /** Whether there is anything at all to export. */
  hasGeometry(): boolean {
    return this.mechanism.joints.length > 0;
  }

  /** Whether the drawing carries a load, which is what the forces layer needs. */
  hasForces(): boolean {
    return this.mechanism.forces.length > 0;
  }

  /** The joints a reader may put the origin on. */
  originJointChoices(): { id: string; name: string }[] {
    return this.mechanism.joints.map((joint) => ({ id: joint.id, name: joint.name || joint.id }));
  }

  /** The first grounded joint, which is what "First ground joint" means. */
  firstGroundJointName(): string | undefined {
    const grounded = this.mechanism.joints.find(
      (joint) => joint instanceof RealJoint && joint.ground
    );
    return grounded?.name || grounded?.id;
  }

  /**
   * Every traced joint's coupler curve, in model units.
   *
   * Read off the solved cycle rather than recomputed: it is the same curve the
   * canvas draws, and it is the envelope somebody checks clearance against
   * before committing to a 3D model.
   */
  private tracedPaths(): TracedPath[] {
    // A drawing that has not been solved has no curves to offer, and neither
    // does one whose machines all refuse -- both are ordinary, not an error.
    const solved = (this.mechanism.mechanisms ?? []).filter((machine) =>
      machine.isMechanismValid()
    );
    const paths = new Map<string, { x: number; y: number }[]>();
    solved.forEach((machine) => {
      machine.joints.forEach((frame) => {
        frame.forEach((joint) => {
          if (!(joint as { showCurve?: boolean }).showCurve) return;
          const points = paths.get(joint.id) ?? [];
          points.push({ x: joint.x, y: joint.y });
          paths.set(joint.id, points);
        });
      });
    });
    return [...paths].map(([jointId, points]) => ({ jointId, points }));
  }

  private jointCsv(unit: LengthUnit): string {
    const rows = this.mechanism.joints.map((joint) =>
      [
        joint.id,
        joint.name,
        joint instanceof PrisJoint ? 'prismatic' : 'revolute',
        inUnit(joint.x, unit).toFixed(6),
        inUnit(joint.y, unit).toFixed(6),
        joint instanceof RealJoint && joint.ground ? 'yes' : 'no',
        joint instanceof RealJoint && joint.input ? 'yes' : 'no',
      ].join(',')
    );
    return ['id,name,type,x,y,grounded,input', ...rows].join('\r\n') + '\r\n';
  }

  private linkCsv(unit: LengthUnit): string {
    const rows = this.realLinks().map((link) =>
      [
        link.id,
        link.name,
        link.joints.map((joint) => joint.id).join(' '),
        inUnit(lengthOf(link), unit).toFixed(6),
        link.mass.toFixed(6),
        link.massMoI.toFixed(6),
      ].join(',')
    );
    return ['id,name,joints,length,mass,inertia', ...rows].join('\r\n') + '\r\n';
  }

  private dataJson(unit: LengthUnit): string {
    return JSON.stringify(
      {
        source: 'PMKS+',
        units: unit === LengthUnit.INCH ? 'in' : unit === LengthUnit.METER ? 'm' : 'cm',
        pose: 'start',
        joints: this.mechanism.joints.map((joint) => ({
          id: joint.id,
          name: joint.name,
          type: joint instanceof PrisJoint ? 'prismatic' : 'revolute',
          x: inUnit(joint.x, unit),
          y: inUnit(joint.y, unit),
          grounded: joint instanceof RealJoint && joint.ground,
          input: joint instanceof RealJoint && joint.input,
        })),
        links: this.realLinks().map((link) => ({
          id: link.id,
          name: link.name,
          joints: link.joints.map((joint) => joint.id),
          length: inUnit(lengthOf(link), unit),
          mass: link.mass,
          inertia: link.massMoI,
        })),
      },
      null,
      2
    );
  }

  private realLinks(): RealLink[] {
    return this.mechanism.links.filter((link): link is RealLink => link instanceof RealLink);
  }
}

/** Project the document into the preview box, keeping its proportions. */
function previewShapes(
  entities: readonly DxfEntity[],
  xs: number[],
  ys: number[]
): DxfPreviewShapes {
  const box = { w: 118, h: 88, pad: 6 };
  if (!xs.length) return { strokes: '', holes: [] };
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const scale = Math.min((box.w - box.pad * 2) / spanX, (box.h - box.pad * 2) / spanY);
  const offsetX = (box.w - spanX * scale) / 2;
  const offsetY = (box.h - spanY * scale) / 2;
  // SVG's y grows downward and the drawing's grows up, so the box is flipped.
  const at = (point: { x: number; y: number }) => ({
    x: offsetX + (point.x - minX) * scale,
    y: box.h - (offsetY + (point.y - minY) * scale),
  });
  const strokes: string[] = [];
  const holes: { cx: number; cy: number; r: number }[] = [];
  entities.forEach((entity) => {
    if (entity['type'] === 'LINE') {
      const from = at(entity['start'] as { x: number; y: number });
      const to = at(entity['end'] as { x: number; y: number });
      strokes.push(
        `M${from.x.toFixed(2)} ${from.y.toFixed(2)}L${to.x.toFixed(2)} ${to.y.toFixed(2)}`
      );
    } else if (entity['type'] === 'LWPOLYLINE') {
      const points = (entity['points'] as { x: number; y: number }[]).map(at);
      if (points.length > 1) {
        strokes.push(
          'M' + points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join('L')
        );
      }
    } else if (entity['type'] === 'CIRCLE') {
      const center = at(entity['center'] as { x: number; y: number });
      holes.push({
        cx: center.x,
        cy: center.y,
        r: Math.max(1, (entity['radius'] as number) * scale),
      });
    }
  });
  return { strokes: strokes.join(''), holes };
}

function lengthOf(link: RealLink): number {
  const [a, b] = link.joints;
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
}

function inUnit(model: number, unit: LengthUnit): number {
  const cm = model / MODEL_SCALE;
  if (unit === LengthUnit.INCH) return cm / 2.54;
  if (unit === LengthUnit.METER) return cm / 100;
  return cm;
}

function fileStem(requested: string): string {
  const withoutExtension = requested.trim().replace(/\.(dxf|zip)$/i, '');
  const safe = withoutExtension.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^[._-]+|[._-]+$/g, '');
  return safe || DEFAULT_DXF_EXPORT_OPTIONS.fileName;
}
