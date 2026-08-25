import type { LibraryTemplateID } from '../../app/component/MODALS/templates/template-linkages';
import { FIXTURE_GALLERY, GalleryEntry, PublishedMasses } from './fixture-gallery';

/**
 * Which verification mechanism each library template ships.
 *
 * The mechanism is named rather than built here, so a template is always one of
 * the mechanisms the suite already asserts on and publishes a link to — there
 * is no way to add a template that nothing tests, and the card and the gallery
 * row cannot come to mean different linkages.
 */
export const LIBRARY_TEMPLATE_SOURCES: Record<LibraryTemplateID, string> = {
  Whitworth_Quick_Return: 'Whitworth proportions',
  Scotch_Yoke: 'Scotch yoke',
  Cylinder_Boom: 'Cylinder-driven boom',
  // The plate-and-rails gripper rather than the counter-rotating levers next to
  // it in the gallery: a cylinder on the centreline pushes a plate, four short
  // links carry that out to two arms, and each arm rides two vertical rails so
  // it stays parallel as it closes. Symmetric, which the levers were not, and
  // the one mechanism in the library no chain of dyads can solve.
  Cylinder_Gripper: 'Cylinder-driven gripper',
  Radial_Engine: 'Radial engine, five cylinders',
  Chebyshev_Straight_Line: 'Chebyshev straight-line linkage',
  Windshield_Wiper: 'Windshield wiper',
  Elliptical_Crank: 'Elliptical crank',
  Jansen_Leg: 'Jansen leg',
  Backhoe_Bucket: 'Backhoe bucket',
  Scissor_Lift: 'Scissor lift',
  Shaper_Quick_Return: "Shaper's quick-return drive",
  Pedaling_Leg: 'Leg on a bicycle crank',
  Oscillating_Fan: 'Oscillating fan',
  Pumpjack: 'Walking-beam pumping unit',
  Punch_Press: 'Punch press',
  Derrick_Crane: 'Derrick crane',
  Toggle_Clamp: 'Toggle clamp',
  Offset_Load_Rocker: 'Rocker with an offset load',
  Drag_Link: 'Drag link',
  Bell_Crank: 'Bell crank',
  Flywheel_Engine: 'Engine with a flywheel',
  Screw_Jack: 'Screw jack',
  Elliptical_Trammel: 'Elliptical trammel, driven',
  Peaucellier: 'Peaucellier-Lipkin linkage',
  Pantograph: 'Pantograph',
  Double_Butterfly: 'Double butterfly linkage',
  Crane_Two_Loads: 'Crane carrying two loads',
  Locked_Four_Bar: 'TeachingLab four-bar, locked except the crank',
  Three_Machines: 'Three machines, three drives',
  Walking_Pair: 'Walking pair',
  Straight_Line_Pair: 'Approximate and exact',
  Pumping_Field: 'Pumping field',
  Loader_Bucket: 'Loader bucket',
  Four_Bar_Inversions: 'Four-bar inversions',
};

/**
 * The templates that are about force, and so publish with the masses and
 * inertias their fixtures give them.
 *
 * Every other template publishes massless. Weight is a load, so a template
 * shipped with mass opens ready for force analysis whether or not force is
 * what it teaches — and a student who opened the Jansen leg to watch it walk
 * was being handed a force problem nobody set. These four are the ones where
 * that reading is the lesson: each carries an external load as well, and the
 * numbers on their links are chosen rather than left at the build default.
 *
 * A new template is massless until it is named here, which is the safe way
 * round: a kinematics example that quietly gained mass is the failure this
 * list exists to prevent.
 */
export const FORCE_STUDY_TEMPLATES: readonly LibraryTemplateID[] = [
  'Punch_Press',
  'Derrick_Crane',
  'Toggle_Clamp',
  'Offset_Load_Rocker',
  // Two loads and a counterweighted jib: the one new template that is about
  // force, so the only new one that keeps the masses its fixture gives it.
  'Crane_Two_Loads',
];

/** How a library template's link masses ride its published payload. */
export function libraryTemplateMasses(id: LibraryTemplateID): PublishedMasses {
  return FORCE_STUDY_TEMPLATES.includes(id) ? 'as-built' : 'zeroed';
}

export function libraryTemplateEntry(id: LibraryTemplateID): GalleryEntry {
  const name = LIBRARY_TEMPLATE_SOURCES[id];
  const entry = FIXTURE_GALLERY.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`No FIXTURE_GALLERY entry named "${name}" for template ${id}`);
  return entry;
}
