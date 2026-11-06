import type { LibraryTemplateID } from '../../app/component/MODALS/templates/template-linkages';
import {
  FIXTURE_GALLERY,
  GalleryEntry,
  PublishedLoading,
  PublishedMasses,
} from './fixture-gallery';

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
  Scotch_Yoke_Rod: 'Scotch yoke on a guided rod',
  Four_Bar: 'Four-bar with a coupler point',
  Locked_Four_Bar: 'Four-bar with fixed lengths',
  Parallelogram: 'Parallelogram',
  Watt_Straight_Line: 'Watt straight-line mechanism',
  Dwell_Six_Bar: 'Six-bar with a dwell',
  Cylinder_Boom: 'Cylinder-driven boom',
  Radial_Engine: 'Radial engine, five cylinders',
  Chebyshev_Straight_Line: 'Chebyshev straight-line linkage',
  Windshield_Wiper: 'Windshield wiper',
  Elliptical_Crank: 'Elliptical crank',
  Jansen_Leg: 'Jansen leg',
  Hydraulic_Crosshead: 'Hydraulic crosshead',
  Offset_Mount_Hatch: 'Offset-mount hatch',
  Scissor_Lift: 'Scissor lift',
  Shaper_Quick_Return: "Shaper's quick-return drive",
  Pedaling_Leg: 'Leg on a bicycle crank',
  Oscillating_Fan: 'Oscillating fan',
  Pumpjack: 'Pumpjack, driven at the crank',
  Punch_Press: 'Punch press',
  Derrick_Crane: 'Derrick crane',
  Toggle_Clamp: 'Toggle clamp, in inches',
  Offset_Load_Rocker: 'Rocker with an offset load',
  Bell_Crank: 'Bell crank',
  Flywheel_Engine: 'Engine with a flywheel',
  Elliptical_Trammel: 'Elliptical trammel, driven',
  Peaucellier: 'Peaucellier-Lipkin linkage',
  Pantograph: 'Pantograph',
  Double_Butterfly: 'Double butterfly linkage',
  Crane_Two_Loads: 'Crane carrying two loads',
  Three_Machines: 'Three machines, three drives',
  Walking_Pair: 'Walking pair',
  Straight_Line_Pair: 'Approximate and exact',
  Pumping_Field: 'Pumping field',
  Reciprocating_Saw: 'Reciprocating saw',
  Slotted_Tool_Drive: 'Slotted tool drive',
  Four_Bar_Inversions: 'Four-bar inversions',
  Slider_Crank_Inversions: 'Slider-crank inversions',
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
  'Reciprocating_Saw',
  'Slotted_Tool_Drive',
  'Punch_Press',
  'Derrick_Crane',
  'Toggle_Clamp',
  'Offset_Load_Rocker',
  // Two loads and a counterweighted jib: the one new template that is about
  // force, so the only new one that keeps the masses its fixture gives it.
  'Crane_Two_Loads',
];

/**
 * How a library template's masses and loads ride its published payload.
 *
 * The force studies used to publish 'as-built', and a reader switching one of
 * them between Static and In-motion saw the same number twice: on the punch
 * press, 399.9 N both ways. The mechanisms are drawn at centimeter scale and
 * turn at 10 RPM, so the inertial term is small -- but what actually hid it was
 * the load. Four hundred newtons applied to links weighing a few grams makes
 * the reaction the load and almost nothing else, and no mass anybody would call
 * reasonable can compete with that: at a hundred times its fixture mass the
 * punch press still split 391 against 393.
 *
 * So both numbers move, and in opposite directions. A hundredfold on the mass
 * puts these links in the hundreds of grams rather than the single grams, which
 * is nearer what a machine this shape would be built from; a hundredth on the
 * load brings the applied force back down to the same order as the weight it is
 * being carried against. The measured split is then about 21%, which is where
 * this mechanism's own inertia-to-weight ratio puts the ceiling at 10 RPM --
 * see `PublishedLoading` for the sweep those two numbers came out of.
 *
 * Not the fixtures themselves, which the MATLAB force specs assert against.
 */
const FORCE_STUDY_SCALING = { mass: 100, load: 0.01 };

/**
 * What each force study publishes its bodies' mass properties as.
 *
 * Mixed on purpose. A reader who opens all five should meet the app's own
 * default, a center of mass that has been moved, and a moment of inertia that
 * has been typed -- because those are the three things the Edit panel offers
 * and a library where every body is identical teaches none of them.
 *
 * The offsets are the ones the machines argue for. A connecting rod carries its
 * big end at the crank pin and is heavier there; a derrick's boom is heaviest
 * at its root; a clamp handle is mostly grip. The rocker is left plain, so
 * there is something to compare the other four against, and the two-load crane
 * keeps both of its custom numbers: its jib is counterweighted, which is the
 * whole subject of that drawing, and a counterweighted jib is exactly the case
 * where the bar formula is the wrong answer.
 */
const FORCE_STUDY_BODIES: Record<string, Partial<PublishedLoading>> = {
  Punch_Press: { offsetCom: { BC: { between: ['B', 'C'], at: 0.35 } } },
  Derrick_Crane: { offsetCom: { OCT: { between: ['O', 'T'], at: 0.4 } } },
  // Drawn in inches, and its fixture already states pounds and pounds-force:
  // the hundredfold and the hundredth are for the centimeter studies' grams
  // and newtons, and its numbers are those, converted.
  Toggle_Clamp: { mass: 1, load: 1, offsetCom: { HE: { between: ['H', 'E'], at: 0.35 } } },
  Offset_Load_Rocker: {},
  Crane_Two_Loads: { keepMoi: ['OCT'] },
};

/**
 * What each template's machines are called, each name keyed by one of that
 * machine's own joints (its input, here).
 *
 * Unnamed, a template's machine is "Mechanism 1" in the panel and "M1" on its
 * playback row, which says nothing a reader can use; and a card holding four
 * machines is four codes to match against four drawings by eye. So each is
 * named the way an author would name it: the machine itself for one, and what
 * tells the machines apart for several -- the inversions say which bar is
 * grounded, because that is the lesson.
 *
 * A name has no comma, period or apostrophe: the first two are the URL's
 * separators, and the payload sits in single quotes in template-linkages.ts.
 * So it is "Watt linkage", not "Watt's". `template-machine-names.spec.ts` holds
 * every name to the rule a typed one meets.
 */
export const LIBRARY_TEMPLATE_NAMES: Record<LibraryTemplateID, Record<string, string>> = {
  Whitworth_Quick_Return: { A: 'Whitworth quick return' },
  Scotch_Yoke: { A: 'Scotch yoke' },
  Scotch_Yoke_Rod: { A: 'Scotch yoke' },
  Four_Bar: { A: 'Four-bar' },
  Locked_Four_Bar: { A: 'Four-bar' },
  Parallelogram: { A: 'Parallelogram' },
  Watt_Straight_Line: { A: 'Watt linkage' },
  Dwell_Six_Bar: { A: 'Dwell six-bar' },
  Cylinder_Boom: { P: 'Boom' },
  Radial_Engine: { O: 'Radial engine' },
  Chebyshev_Straight_Line: { G: 'Chebyshev linkage' },
  Windshield_Wiper: { O: 'Windshield wiper' },
  Elliptical_Crank: { A: 'Elliptical crank' },
  Jansen_Leg: { O: 'Jansen leg' },
  Hydraulic_Crosshead: { S: 'Hydraulic crosshead' },
  Offset_Mount_Hatch: { S: 'Bracketed hatch' },
  Scissor_Lift: { C: 'Scissor lift' },
  Shaper_Quick_Return: { A: 'Shaper drive' },
  Pedaling_Leg: { K: 'Pedaling leg' },
  Oscillating_Fan: { C: 'Oscillating fan' },
  Pumpjack: { A: 'Pumpjack' },
  Punch_Press: { A: 'Punch press' },
  Derrick_Crane: { G: 'Derrick crane' },
  Toggle_Clamp: { H: 'Toggle clamp' },
  Offset_Load_Rocker: { A: 'Loaded rocker' },
  Bell_Crank: { A: 'Bell crank' },
  Flywheel_Engine: { A: 'Engine' },
  Elliptical_Trammel: { A: 'Elliptical trammel' },
  Peaucellier: { C: 'Peaucellier linkage' },
  Pantograph: { G: 'Pantograph' },
  Double_Butterfly: { A: 'Double butterfly' },
  Crane_Two_Loads: { G: 'Crane' },
  Three_Machines: { A: 'Drag link', E: 'Slider-crank', H: 'Crank-rocker' },
  Walking_Pair: { A: 'Left leg', I: 'Right leg' },
  Straight_Line_Pair: { A: 'Chebyshev (approximate)', H: 'Peaucellier (exact)' },
  Pumping_Field: { A: 'Pumpjack 1', H: 'Pumpjack 2', O: 'Pumpjack 3' },
  Reciprocating_Saw: { A: 'Reciprocating saw' },
  Slotted_Tool_Drive: { A: 'Slotted tool drive' },
  Four_Bar_Inversions: {
    A: 'Crank-rocker (L4 grounded)',
    E: 'Crank-rocker (L2 grounded)',
    I: 'Double crank (L1 grounded)',
    M: 'Double rocker (L3 grounded)',
  },
  Slider_Crank_Inversions: {
    A: 'Engine (L1 grounded)',
    F: 'Quick return (L2 grounded)',
    J: 'Oscillating cylinder (L3 grounded)',
    P: 'Pendulum pump (L4 grounded)',
  },
};

export function libraryTemplateMasses(id: LibraryTemplateID): PublishedMasses {
  if (!FORCE_STUDY_TEMPLATES.includes(id)) return 'zeroed';
  return { ...FORCE_STUDY_SCALING, ...(FORCE_STUDY_BODIES[id] ?? {}) };
}

export function libraryTemplateEntry(id: LibraryTemplateID): GalleryEntry {
  const name = LIBRARY_TEMPLATE_SOURCES[id];
  const entry = FIXTURE_GALLERY.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`No FIXTURE_GALLERY entry named "${name}" for template ${id}`);
  return entry;
}
