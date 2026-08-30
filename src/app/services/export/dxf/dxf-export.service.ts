import { inject, Injectable } from '@angular/core';
import { Joint, PrisJoint, RealJoint } from '../../../model/joint';
import { RealLink } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { MechanismService } from '../../mechanism.service';
import { SettingsService } from '../../settings.service';
import { utf8, zipStore } from '../zip';
import {
  DEFAULT_DXF_EXPORT_OPTIONS,
  DxfExportOptions,
  DxfExportUnit,
  exportUnitOf,
  unitsPerCentimeter,
} from './dxf-options';
import { DxfEntity } from './dxf-model';
import { sealedCylinderStructures } from '../../../model/cylinder';
import { defaultPinDiameter, linkBodyWidth, SlotTravel } from './link-bodies';
import { buildSemanticDxf, TracedPath } from './semantic-dxf';
import { writeDxf } from './dxf-writer';
import { writeSvg } from './svg-writer';

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
    const unit = choices.unit ?? exportUnitOf(this.settings.lengthUnit.value);
    const stem = fileStem(choices.fileName || DEFAULT_DXF_EXPORT_OPTIONS.fileName);
    // The unit, in the name. R12 has no header field for it, and the import
    // dialogs in Fusion and Onshape ask for units anyway -- a student who
    // accepts the default gets a part ten or a hundred times out. The name is
    // in front of them at exactly the moment they are being asked.
    const dxfName = `${stem} (${unitWord(unit)}).${choices.fileFormat === 'svg' ? 'svg' : 'dxf'}`;
    const write = (document: ReturnType<typeof buildSemanticDxf>) =>
      choices.fileFormat === 'svg' ? writeSvg(document, unit) : writeDxf(document);
    const content = this.mechanism.encodeFromStartPose(() =>
      write(
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
          groundGroups: this.groundGroups(),
        })
      )
    );

    if (choices.dataFile === 'none') {
      const mime =
        choices.fileFormat === 'svg'
          ? 'image/svg+xml;charset=utf-8'
          : 'application/dxf;charset=utf-8';
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
    extras.push({
      name: 'README.txt',
      text: handoffNotes(
        unit,
        { ...choices, pinDiameter: this.pinDiameter(options) },
        {
          cylinders: sealedCylinderStructures(this.mechanism.joints).length > 0,
          slots: this.mechanism.joints.some((joint) => joint instanceof PrisJoint),
        }
      ),
    });
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
    const unit = choices.unit ?? exportUnitOf(this.settings.lengthUnit.value);
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
      groundGroups: this.groundGroups(),
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
    const unit = choices.unit ?? exportUnitOf(this.settings.lengthUnit.value);
    const stem = fileStem(choices.fileName || DEFAULT_DXF_EXPORT_OPTIONS.fileName);
    const dxf = `${stem} (${unitWord(unit)}).${choices.fileFormat === 'svg' ? 'svg' : 'dxf'}`;
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
    const unit = choices.unit ?? exportUnitOf(this.settings.lengthUnit.value);
    const bodyWidth = inUnit(linkBodyWidth(), unit);
    const pin = this.pinDiameter(options);
    if (!(bodyWidth > 0) || pin < bodyWidth) return '';
    return (
      `Ø${pin} ${unitWord(unit)} pins are wider than the ${bodyWidth.toFixed(2)} ` +
      `${unitWord(unit)} link bodies — the holes will break out of the parts.`
    );
  }

  /**
   * The hole this export will cut, chosen or derived.
   *
   * Derived means half the width the link bodies are being drawn at, which is
   * the only answer that can be right: a fixed default sits next to bodies of
   * whatever width the canvas happens to be using, and 0.6 beside a 0.13-wide
   * bar is a hole with no part left around it.
   */
  pinDiameter(options: DxfExportOptions = {}): number {
    const choices = { ...DEFAULT_DXF_EXPORT_OPTIONS, ...options };
    const unit = choices.unit ?? exportUnitOf(this.settings.lengthUnit.value);
    return choices.pinDiameter ?? defaultPinDiameter(unitsPerCentimeter(unit) / MODEL_SCALE);
  }

  /** The project's own unit, which an export uses unless told otherwise. */
  projectUnit(): DxfExportUnit {
    return exportUnitOf(this.settings.lengthUnit.value);
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

  /**
   * Which joints belong to which machine.
   *
   * A drawing can hold several mechanisms side by side, and each wants a base
   * plate of its own -- one box round every fixed pin in all of them is a plate
   * the size of the drawing. The partitioner already knows the answer.
   */
  private groundGroups(): string[][] {
    return (this.mechanism.partitions ?? [])
      .map((partition) => (partition.ownJoints ?? []).map((joint: Joint) => joint.id))
      .filter((ids) => ids.length > 0);
  }

  private jointCsv(unit: DxfExportUnit): string {
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

  private linkCsv(unit: DxfExportUnit): string {
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
  private forceCsv(unit: DxfExportUnit): string {
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

  private dataJson(unit: DxfExportUnit): string {
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
export function unitWord(unit: DxfExportUnit): string {
  return unit;
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
  unit: DxfExportUnit,
  choices: {
    linkBodies: string;
    pinDiameter: number;
    jointCircles: string;
    perLinkLayers: boolean;
    includeGroundPlate: boolean;
    dataFile: string;
    fileFormat: string;
  },
  has: { cylinders: boolean; slots: boolean }
): string {
  const word = unitWord(unit);
  const parts = choices.linkBodies === 'outlines';
  const holes = choices.jointCircles === 'holes';
  const tables = choices.dataFile !== 'none';
  return [
    'PMKS+ CAD export',
    '=================',
    '',
    ...(choices.fileFormat === 'svg'
      ? [
          `This drawing is an SVG in ${word}, and it carries its own physical size --`,
          'open it in a laser cutter or a drawing program and it is already the size it',
          'was drawn. Each part is a layer; the closed outlines are what you cut.',
        ]
      : [
          `This drawing is in ${word}. R12 (AC1009) has no header field for units, so`,
          'the unit is in the file name instead -- and every program below asks you to',
          `choose one on import. Choose ${word}, or the parts come out ten or a hundred`,
          'times the wrong size.',
        ]),
    '',
    ...(parts
      ? [
          `Each link is one closed outline${choices.perLinkLayers ? ' on its own layer (PMKS_LINK_*)' : ''},`,
          holes
            ? 'with its pin holes already cut into the same profile.'
            : 'with no holes cut -- you chose centre marks rather than pin holes.',
          ...(choices.includeGroundPlate ? ['PMKS_GROUND_PLATE is the base part.'] : []),
          ...(has.slots
            ? [
                'The slot is cut into the part that carries it; PMKS_SLIDER_BLOCKS is what',
                'slides in it.',
              ]
            : []),
          ...(has.cylinders
            ? [
                'PMKS_CYLINDER_SLEEVES and PMKS_CYLINDER_RODS are the two halves of each',
                'actuator; the sleeve is a tube, so extrude between its two loops.',
              ]
            : []),
        ]
      : [
          'Each link is a centreline on PMKS_LINK_CENTERLINES. A centreline cannot be',
          'extruded -- re-export with "Closed outlines" if you meant to build from this.',
        ]),
    '',
    ...(choices.fileFormat === 'svg'
      ? [
          'Cutting it',
          '----------',
          '1. Open the SVG in your cutter software, Inkscape or Illustrator. It already',
          '   carries its size, so there is no scale to set and nothing to get wrong.',
          '2. Each part is a layer. The closed outlines are the cuts; the circles inside',
          '   them are the holes, and they are already positioned to match between parts.',
          '3. The crosses and triangles are marks rather than cuts -- see below. Delete',
          '   the notes and mark layers before sending it to a machine.',
          '',
          'Into CAD instead',
          '----------------',
          'Fusion (Insert > Insert SVG) and Onshape both take an SVG into a sketch, but',
          'both ask for a scale on the way in and neither reads the layers as separate',
          'sketches. If you are going on to build parts and assemble them, export DXF',
          'instead -- that is what the layer-per-part arrangement is for.',
        ]
      : [
          'In Fusion',
          '---------',
          '1. Insert > Insert DXF. Pick a plane, set the units, and turn on the option to',
          '   make one sketch per layer.',
          '2. Extrude each link sketch a few mm. The holes are already in the profile, so',
          '   each one comes out as a finished body.',
          '3. Assemble the bodies as components, then Assemble > Joint > Revolute, picking',
          tables
            ? '   the two hole centres that share a pin. The joints table beside this file'
            : '   the two hole centres that share a pin. Re-export with a data file if you',
          tables
            ? '   says which links meet at which joint.'
            : '   want a table of which links meet where.',
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
          'In SolidWorks',
          '-------------',
          '1. Open the .dxf directly. The DXF/DWG import wizard runs: choose "Import to a',
          '   new part" as a 2D sketch. Units are on the Document Settings page further on.',
          '2. The wizard lists the layers, with an option to put each on its own sketch.',
          '   Use it -- one layer is one part.',
          '3. Extrude each closed profile a few mm. The holes are in the profile already.',
          '4. In an assembly, mate each shared pin with a Concentric mate between the two',
          '   hole faces, plus a Coincident mate on the flat faces to keep the parts in',
          '   plane. Fix the base part, then drag the input link or add a motor.',
          '',
          'In NX',
          '-----',
          '1. File > Import > AutoCAD DXF/DWG, into a new part as curves. NX imports in',
          `   millimetres or inches, so a ${word} file needs an explicit scale on the way in`,
          ...(word === 'mm'
            ? ['   -- this file is already in millimetres, so no scaling is needed.']
            : [
                `   (${word} to mm is x${unit === 'm' ? '1000' : unit === 'in' ? '25.4' : '10'}) or the part arrives the wrong size.`,
              ]),
          '2. The layers arrive as NX layers. Extrude each closed loop a few mm; select the',
          '   outline and its holes together so the holes come out as holes.',
          '3. In an assembly, add Touch/Align constraints on the faces and a Concentric',
          '   constraint on each shared pair of holes.',
          '4. Fix the base component and drag the input, or set up a Motion simulation',
          '   with revolute joints on the concentric pairs.',
          '',
        ]),
    'Reading the marks',
    '-----------------',
    'A circle is a pin: those two parts turn against each other, and the hole is',
    'where the pin goes. A cross is a weld -- solid, no hole, and the pieces either',
    'side of it are one part. A small triangle marks a joint fixed to the frame.',
    '',
    'What a drawing cannot carry',
    '---------------------------',
    'Joints, mates, motion and mass. Those are in the companion tables beside this',
    'file, and in PMKS+ itself. What the drawing does carry is exact hole positions',
    'shared between mating parts, which is the part that is tedious to redo by hand.',
    'The pairing is the one thing left to say -- the geometry is already lined up',
    'for it.',
    '',
    `Pin holes are ${choices.pinDiameter} ${word} across, which is half the width of`,
    'the link bodies unless you chose otherwise. If your pins are a different size,',
    'change it in the export dialog -- easier than editing every sketch.',
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

function inUnit(model: number, unit: DxfExportUnit): number {
  return (model / MODEL_SCALE) * unitsPerCentimeter(unit);
}

function fileStem(requested: string): string {
  const withoutExtension = requested.trim().replace(/\.(dxf|zip)$/i, '');
  const safe = withoutExtension.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^[._-]+|[._-]+$/g, '');
  return safe || DEFAULT_DXF_EXPORT_OPTIONS.fileName;
}
