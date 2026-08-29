import { inject, Injectable } from '@angular/core';
import { Joint, PrisJoint, RealJoint } from '../../../model/joint';
import { RealLink } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { LengthUnit } from '../../../model/unit-enums';
import { MechanismService } from '../../mechanism.service';
import { SettingsService } from '../../settings.service';
import { utf8, zipStore } from '../zip';
import { DEFAULT_DXF_EXPORT_OPTIONS, DxfExportOptions } from './dxf-options';
import { DxfEntity } from './dxf-model';
import { SlotTravel } from './link-bodies';
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
    // The unit, in the name. R12 has no header field for it, and the import
    // dialogs in Fusion and Onshape ask for units anyway -- a student who
    // accepts the default gets a part ten or a hundred times out. The name is
    // in front of them at exactly the moment they are being asked.
    const dxfName = `${stem} (${unitWord(unit)}).dxf`;
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
          options: { ...choices, unit },
          tracedPaths: choices.includeTracedPaths ? this.tracedPaths() : [],
          slotTravels: this.slotTravels(),
        })
      )
    );

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
            ...(this.mechanism.forces.length
              ? [{ name: `${stem}-forces.csv`, text: this.forceCsv(unit) }]
              : []),
          ];
    extras.push({ name: 'README.txt', text: handoffNotes(unit, choices) });
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
      options: { ...choices, unit },
      tracedPaths: choices.includeTracedPaths ? this.tracedPaths() : [],
      slotTravels: this.slotTravels(),
    });
    const xs: number[] = [];
    const ys: number[] = [];
    document.entities.forEach((entity) => {
      const points =
        entity.type === 'LINE'
          ? [entity.start, entity.end]
          : entity.type === 'CIRCLE'
            ? [entity.center]
            : entity.type === 'POLYLINE'
              ? entity.points
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
      unit: unitWord(unit),
      // The drawing itself, not a picture of a four-bar: the thumbnail is there
      // to catch the two mistakes worth catching -- nothing traced when the
      // reader meant to trace, holes where marks were meant -- and a stylised
      // stand-in catches neither.
      shapes: previewShapes(document.entities, xs, ys),
    };
  }

  /** What the download itself is called: the drawing, or the zip holding it. */
  downloadName(options: DxfExportOptions = {}): string {
    const choices = { ...DEFAULT_DXF_EXPORT_OPTIONS, ...options };
    const names = this.fileNames(options);
    if (names.length === 1) return names[0];
    return `${fileStem(choices.fileName || DEFAULT_DXF_EXPORT_OPTIONS.fileName)}.zip`;
  }

  /** Exactly what will land in the reader's downloads, unit and all. */
  fileNames(options: DxfExportOptions = {}): string[] {
    const choices = { ...DEFAULT_DXF_EXPORT_OPTIONS, ...options };
    const unit = choices.unit ?? this.settings.lengthUnit.value;
    const stem = fileStem(choices.fileName || DEFAULT_DXF_EXPORT_OPTIONS.fileName);
    const dxf = `${stem} (${unitWord(unit)}).dxf`;
    if (choices.dataFile === 'none') return [dxf];
    if (choices.dataFile === 'json') return [dxf, `${stem}.json`, 'README.txt'];
    return [
      dxf,
      `${stem}-joints.csv`,
      `${stem}-links.csv`,
      ...(this.mechanism.forces.length ? [`${stem}-forces.csv`] : []),
      'README.txt',
    ];
  }

  /**
   * A hole wider than the part it is cut in, or nothing.
   *
   * The link bodies are the width the canvas draws them, which is a display
   * convention rather than a fabrication one -- and the default pin is 0.6 of
   * whatever unit the project is in. Put together, the default settings can cut
   * a hole four times wider than the bar holding it, and the file looks
   * perfectly reasonable until somebody tries to extrude it.
   */
  pinWarning(options: DxfExportOptions = {}): string {
    const choices = { ...DEFAULT_DXF_EXPORT_OPTIONS, ...options };
    if (choices.jointCircles !== 'holes' || choices.linkBodies !== 'outlines') return '';
    const unit = choices.unit ?? this.settings.lengthUnit.value;
    // Half the drawn body width: the same number the outline's corner radius is.
    const bodyWidth = inUnit((SettingsService.objectScale / 4) * 2, unit);
    const pin = choices.pinDiameter || DEFAULT_DXF_EXPORT_OPTIONS.pinDiameter;
    if (!(bodyWidth > 0) || pin < bodyWidth) return '';
    return (
      `Ø${pin} ${unitWord(unit)} pins are wider than the ${bodyWidth.toFixed(2)} ` +
      `${unitWord(unit)} link bodies — the holes will break out of the parts.`
    );
  }

  /** The project's own unit, which an export uses unless told otherwise. */
  projectUnit(): LengthUnit {
    return this.settings.lengthUnit.value;
  }

  /** Whether any joint is set to trace, which is what the paths option needs. */
  hasTracedJoint(): boolean {
    // What will actually come out, not what has been asked for. A joint keeps
    // its `showCurve` flag while its machine is unsolvable, and offering the
    // control then produces a ticked box and an empty layer.
    return this.tracedPaths().length > 0;
  }

  /** Whether there is anything at all to export. */
  hasGeometry(): boolean {
    return this.mechanism.joints.length > 0;
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

  /**
   * How far each slot's block actually travels, over the whole cycle.
   *
   * A grounded slot has no length of its own at the start pose -- how long it
   * has to be is a fact about the solved motion. Read off the same solved
   * frames the traced curves come from, so the slot in the file is exactly the
   * stroke the mechanism was solved with rather than a guess a reader has to
   * check afterwards.
   */
  private slotTravels(): SlotTravel[] {
    const solved = (this.mechanism.mechanisms ?? []).filter((machine) =>
      machine.isMechanismValid()
    );
    const seen = new Map<string, { x: number; y: number }[]>();
    solved.forEach((machine) =>
      machine.joints.forEach((frame) =>
        frame.forEach((joint) => {
          if (!(joint instanceof PrisJoint)) return;
          const seenAt = seen.get(joint.id) ?? [];
          seenAt.push({ x: joint.x, y: joint.y });
          seen.set(joint.id, seenAt);
        })
      )
    );
    return [...seen]
      .map(([jointId, at]) => {
        // The two extremes along the slot's own direction, which is the pair
        // furthest apart -- the block only ever moves on one line.
        let from = at[0];
        let to = at[0];
        let widest = 0;
        at.forEach((candidate) => {
          const reach = Math.hypot(candidate.x - at[0].x, candidate.y - at[0].y);
          if (reach > widest) {
            widest = reach;
            to = candidate;
          }
        });
        widest = 0;
        at.forEach((candidate) => {
          const reach = Math.hypot(candidate.x - to.x, candidate.y - to.y);
          if (reach > widest) {
            widest = reach;
            from = candidate;
          }
        });
        return { jointId, from, to };
      })
      .filter((travel) => travel.from !== travel.to);
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
        // Which parts meet here: DXF cannot say that a hole in one layer and a
        // hole in another are the same pin, and that is exactly what somebody
        // checking an assembly against this table needs to know.
        connectedLinks(joint).join(' '),
      ].join(',')
    );
    return ['id,name,type,x,y,grounded,input,links', ...rows].join('\r\n') + '\r\n';
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

  /**
   * The loads, as numbers rather than as arrows.
   *
   * A force arrow in a file somebody is about to extrude is noise: it is not
   * part of any part, and it lands as sketch geometry tangled into the one the
   * load happens to sit on. The magnitude and direction are what a reader
   * actually wants back, and a table is where those belong.
   */
  private forceCsv(unit: LengthUnit): string {
    const rows = this.mechanism.forces.map((force) =>
      [
        force.id,
        force.name,
        force.link?.id ?? '',
        inUnit(force.startCoord.x, unit).toFixed(6),
        inUnit(force.startCoord.y, unit).toFixed(6),
        inUnit(force.endCoord.x, unit).toFixed(6),
        inUnit(force.endCoord.y, unit).toFixed(6),
        String(force.mag),
        force.local ? 'link' : 'global',
      ].join(',')
    );
    return ['id,name,link,x,y,end_x,end_y,magnitude,frame', ...rows].join('\r\n') + '\r\n';
  }

  private dataJson(unit: LengthUnit): string {
    return JSON.stringify(
      {
        source: 'PMKS+',
        units: unitWord(unit),
        pose: 'start',
        joints: this.mechanism.joints.map((joint) => ({
          id: joint.id,
          name: joint.name,
          type: joint instanceof PrisJoint ? 'prismatic' : 'revolute',
          x: inUnit(joint.x, unit),
          y: inUnit(joint.y, unit),
          grounded: joint instanceof RealJoint && joint.ground,
          input: joint instanceof RealJoint && joint.input,
          links: connectedLinks(joint),
        })),
        links: this.realLinks().map((link) => ({
          id: link.id,
          name: link.name,
          joints: link.joints.map((joint) => joint.id),
          length: inUnit(lengthOf(link), unit),
          mass: link.mass,
          inertia: link.massMoI,
        })),
        forces: this.mechanism.forces.map((force) => ({
          id: force.id,
          name: force.name,
          link: force.link?.id,
          at: { x: inUnit(force.startCoord.x, unit), y: inUnit(force.startCoord.y, unit) },
          to: { x: inUnit(force.endCoord.x, unit), y: inUnit(force.endCoord.y, unit) },
          magnitude: force.mag,
          frame: force.local ? 'link' : 'global',
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

/** How a unit is written wherever this export names one. */
export function unitWord(unit: LengthUnit): string {
  if (unit === LengthUnit.INCH) return 'in';
  if (unit === LengthUnit.METER) return 'm';
  return 'cm';
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
    } else if (entity['type'] === 'POLYLINE') {
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

/**
 * What to do with the file, in the file.
 *
 * DXF carries geometry and nothing else -- no joints, no mates, no assembly.
 * Making the holes exact and the parts separable is as far as the format goes,
 * and the last stretch is a handful of steps in whichever program the reader
 * opens next. Written down beside the drawing rather than in the dialog they
 * have already closed by then.
 */
function handoffNotes(
  unit: LengthUnit,
  choices: { linkBodies: string; pinDiameter: number }
): string {
  const word = unitWord(unit);
  const parts = choices.linkBodies === 'outlines';
  return [
    'PMKS+ CAD export',
    '=================',
    '',
    `This drawing is in ${word}. R12 (AC1009) has no header field for units, so the`,
    'unit is in the file name instead -- and Fusion and Onshape both ask you to',
    `choose one on import. Choose ${word}, or the parts come out ten or a hundred`,
    'times the wrong size.',
    '',
    parts
      ? 'Each link is one closed outline on its own layer (PMKS_LINK_*), with its pin'
      : 'Each link is a centreline on PMKS_LINK_CENTERLINES. Centrelines cannot be',
    parts
      ? 'holes already cut. PMKS_GROUND_PLATE is the base part. PMKS_SLOTS and'
      : 'extruded -- re-export with "Closed outlines" if you meant to build from this.',
    parts ? 'PMKS_SLIDER_BLOCKS are the sliding pair, where there is one.' : '',
    '',
    'In Fusion',
    '---------',
    '1. Insert > Insert DXF. Pick a plane, set the units, and turn on the option to',
    '   make one sketch per layer.',
    '2. Extrude each link sketch a few mm. The holes are already in the profile, so',
    '   each one comes out as a finished body.',
    '3. Assemble the bodies as components, then Assemble > Joint > Revolute, picking',
    '   the two hole centres that share a pin. The joints CSV beside this file says',
    '   which links meet at which joint.',
    '4. Ground the base part, then drive the input joint and run a motion study.',
    '',
    'In Onshape',
    '----------',
    '1. Import the DXF into a Part Studio and choose the units when asked.',
    '2. Extrude each closed region a few mm.',
    '3. In an Assembly, insert the parts and add Revolute mates, snapping the mate',
    '   connectors to the hole centres -- Onshape offers a connector at the centre of',
    '   a circular edge, which is why the holes are here rather than centre marks.',
    '4. Fix the base part and drag or drive the input.',
    '',
    'What DXF cannot carry',
    '---------------------',
    'Joints, mates, motion and mass. Those are in the companion tables beside this',
    'file, and in PMKS+ itself. What the drawing does carry is exact hole positions',
    'shared between mating parts, which is the part that is tedious to redo by hand.',
    '',
    `Pin holes are ${choices.pinDiameter} ${word} across. If your pins are a different`,
    'size, change it in the export dialog -- easier than editing every sketch.',
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\r\n')
    .concat('\r\n');
}

/** The links that meet at a joint, by id, in a stable order. */
function connectedLinks(joint: Joint): string[] {
  const links = joint instanceof RealJoint ? joint.links : [];
  return links
    .map((link) => link.id)
    .filter((id, index, all) => all.indexOf(id) === index)
    .sort();
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
