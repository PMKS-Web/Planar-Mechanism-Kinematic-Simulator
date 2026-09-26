import { TEMPLATE_LINKAGES, TemplateID } from '../../component/MODALS/templates/template-linkages';
import { machineFactSheets } from '../../model/what-is-this/machine-sheet';
import { decodeDrawing, whatIsThisDrawing } from '../../../test-utils/what-is-this/drawing';
import { LengthUnit } from '../../model/unit-enums';
import { describeDrawing } from './mechanism-facts';

/**
 * The app's fact sheet (model/what-is-this) against the prototype's v9, the
 * one the evaluation measured: the same text, word for word, for every
 * mechanism of round 6, or the evidence no longer speaks for what ships. A
 * background image is left out: the app's sheet also names its file.
 */
const ROUND_6: TemplateID[] = [
  'Hood_Hinge',
  'Aircraft_Landing_Gear',
  'Excavator_Bucket',
  'Car_Steering',
  'Offset_Mount_Hatch',
  'Crane_Two_Loads',
  'Walking_Pair',
  'Pumping_Field',
  'Bell_Crank',
  'Straight_Line_Pair',
  'Hydraulic_Crosshead',
  'Slotted_Tool_Drive',
  'Watt_I',
  'Watt_II',
  'Stephenson_III',
  'Locked_Four_Bar',
  'Elliptical_Crank',
  'Offset_Load_Rocker',
  'Double_Butterfly',
  'Three_Machines',
  'Four_Bar_Inversions',
  'Slider_Crank_Inversions',
];

function prototypeSheets(id: TemplateID) {
  const { target, settings } = decodeDrawing(TEMPLATE_LINKAGES[id]);
  const unit = settings.lengthUnit.value;
  return describeDrawing({
    joints: target.joints,
    links: target.links,
    forces: target.forces,
    lengthUnit: unit === LengthUnit.INCH ? 'in' : unit === LengthUnit.METER ? 'm' : 'cm',
    gravity: settings.isGravity.value,
    defaultRpm: settings.inputSpeed.value,
    defaultLinearSpeed: settings.linearInputSpeed.value,
    defaultClockwise: settings.isInputCW.value,
    relations: true,
    backdrop: false,
    picture: 'v9',
    includeNames: true,
  }).machineSheets;
}

describe('the app’s fact sheet against the evaluated prototype (v9)', () => {
  for (const id of ROUND_6) {
    it(`matches for ${id}`, () => {
      const app = machineFactSheets(whatIsThisDrawing(TEMPLATE_LINKAGES[id]));
      const prototype = prototypeSheets(id);
      expect(app.map((s) => s.index)).toEqual(prototype.map((s) => s.index));
      app.forEach((sheet, i) => {
        expect(sheet.text).toBe(prototype[i].text);
        expect(sheet.gate).toEqual(prototype[i].looksLike);
        expect(sheet.moments).toEqual(prototype[i].machine.frames);
      });
    });
  }
});
